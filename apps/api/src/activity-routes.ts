import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { staff, type Database } from '@kmbhelp/db';
import {
  activityListSchema,
  activityViewSchema,
  mailReviewRequestSchema,
  mailReviewResponseSchema,
  publicErrors,
} from '@kmbhelp/shared';
import { readActivity, writeActivity } from './activity-log.js';
import { assertCsrf, localhostAdmin, requireStaff, serviceTokenMatches, staffFromSession } from './auth.js';
import { clientAddress, createRateLimiter, databaseDown, PublicError, rateLimited } from './http.js';
import { loadReviewSettings, reviewInboundMail } from './mail-review.js';
import { noteExternal } from './syslog.js';
import { renderTextPdf } from './text-pdf.js';
import { modelProviderFromEnv, unconfiguredModel, type ModelProvider } from '@kmbhelp/ai';

const day = /^\d{4}-\d{2}-\d{2}$/u;

export function activityWindow(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): { from: Date; to: Date } {
  const end = to ? endOfDay(to) : now;
  const start = from ? startOfDay(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new PublicError(422, 'invalid_filter', {
      de: 'Das Datum ist nicht lesbar.',
      en: 'The date cannot be read.',
    });
  }
  return { from: start, to: end };
}

function startOfDay(iso: string): Date {
  if (!day.test(iso)) return new Date(Number.NaN);
  return new Date(`${iso}T00:00:00.000+01:00`);
}

function endOfDay(iso: string): Date {
  if (!day.test(iso)) return new Date(Number.NaN);
  return new Date(`${iso}T23:59:59.999+01:00`);
}

function queryText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function registerActivity(app: FastifyInstance, options: {
  database: Database | undefined;
  testAuthEnabled: boolean;
  now?: (() => Date) | undefined;
  model?: ModelProvider | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}): void {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  const viewLimiter = createRateLimiter(60, 60_000);
  const reviewLimiter = createRateLimiter(30, 60_000);

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  async function actorEmail(request: FastifyRequest): Promise<string> {
    if (localhostAdmin(request, env)) return 'localhost';
    if (serviceTokenMatches(request, env)) return 'service';
    const database = db();
    const session = await staffFromSession(database, request, now());
    if (session && !session.mfaPending) {
      const rows = await database.db
        .select({ email: staff.email })
        .from(staff)
        .where(eq(staff.id, session.staffId))
        .limit(1);
      return rows[0]?.email ?? 'staff';
    }
    return 'anonymous';
  }

  async function requireReader(request: FastifyRequest): Promise<string> {
    if (localhostAdmin(request, env)) return 'localhost';
    if (serviceTokenMatches(request, env)) return 'service';
    const database = db();
    const session = await staffFromSession(database, request, now());
    if (session && !session.mfaPending) {
      assertCsrf(session, request);
      const rows = await database.db
        .select({ email: staff.email })
        .from(staff)
        .where(eq(staff.id, session.staffId))
        .limit(1);
      return rows[0]?.email ?? 'staff';
    }
    const staffSession = await requireStaff(database, request, options.testAuthEnabled, now());
    return staffSession.id;
  }

  app.post('/api/v1/activity', async (request, reply) => {
    if (!viewLimiter.allow(clientAddress(request))) throw rateLimited();
    const parsed = activityViewSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new PublicError(422, 'invalid_path', publicErrors.invalidInput);
    }
    const database = db();
    await writeActivity(database, {
      actor: await actorEmail(request),
      kind: 'page',
      target: parsed.data.path,
      detail: 'page',
      ip: clientAddress(request),
    });
    return reply.code(204).send();
  });

  app.post('/api/v1/mail/review', async (request, reply) => {
    if (!reviewLimiter.allow(clientAddress(request))) throw rateLimited();
    const reader = await requireReader(request);
    const parsed = mailReviewRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(422, 'invalid_mail', publicErrors.invalidInput);
    const database = db();
    const settings = await loadReviewSettings(database, env);
    const people = await database.db
      .select({ email: staff.email })
      .from(staff)
      .where(eq(staff.active, true));
    const provider =
      options.model ??
      (env.NODE_ENV === 'test' ? unconfiguredModel : modelProviderFromEnv(env));
    const verdict = await reviewInboundMail(parsed.data, {
      provider,
      domains: settings.domains,
      prompt: settings.prompt,
      helpdeskMailbox: settings.helpdeskMailbox,
      staffEmails: people.map((person) => person.email),
      providerName: settings.providerName,
      syslog: (category, message) => noteExternal(env, category, message),
    });
    await writeActivity(database, {
      actor: reader,
      kind: 'mail',
      target: parsed.data.fromEmail.slice(0, 200),
      detail: verdict.held
        ? 'decision=held'
        : verdict.excluded
          ? `decision=excluded-${verdict.reason}`
          : verdict.is_support
            ? 'decision=support'
            : 'decision=not-support',
      ip: clientAddress(request),
    });
    return reply.send(mailReviewResponseSchema.parse(verdict));
  });

  app.get('/api/v1/staff/activity', async (request, reply) => {
    await requireReader(request);
    const database = db();
    const query = request.query as Record<string, unknown>;
    const format = queryText(query.format);
    const window = activityWindow(queryText(query.from), queryText(query.to), now());
    const rows = await readActivity(database, {
      from: window.from,
      to: window.to,
      q: queryText(query.q)?.slice(0, 120),
      limit: format ? 5000 : 500,
    });
    if (format === 'txt' || format === 'csv' || format === 'pdf') {
      return sendExport(reply, format, rows);
    }
    return activityListSchema.parse({
      entries: rows.map((row) => ({
        at: row.at.toISOString(),
        actor: row.actor,
        kind: row.kind,
        target: row.target,
        detail: row.detail,
        ip: row.ip,
      })),
    });
  });
}

function sendExport(
  reply: FastifyReply,
  format: 'txt' | 'csv' | 'pdf',
  rows: { at: Date; actor: string; kind: string; target: string; detail: string; ip: string }[],
): FastifyReply {
  const cells = rows.map((row) => [
    row.at.toISOString(),
    row.actor,
    row.kind,
    row.target,
    row.detail,
    row.ip,
  ]);
  if (format === 'pdf') {
    const lines = cells.map((cell) => cell.join(' | '));
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', 'attachment; filename="kmbhelp-protokoll.pdf"')
      .send(renderTextPdf('KMBHelp Protokoll', lines));
  }
  if (format === 'csv') {
    const header = 'at,actor,kind,target,detail,ip';
    const body = [header, ...cells.map((cell) => cell.map(csvCell).join(','))].join('\n');
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="kmbhelp-protokoll.csv"')
      .send(`\uFEFF${body}\n`);
  }
  const text = ['at\tactor\tkind\ttarget\tdetail\tip', ...cells.map((cell) => cell.join('\t'))].join(
    '\n',
  );
  return reply
    .header('content-type', 'text/plain; charset=utf-8')
    .header('content-disposition', 'attachment; filename="kmbhelp-protokoll.txt"')
    .send(`${text}\n`);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}
