import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { staff, type Database } from '@kmbhelp/db';
import {
  activityListSchema,
  activityViewSchema,
  logNames,
  logReportSchema,
  publicErrors,
  type LogName,
} from '@kmbhelp/shared';
import { readActivity, writeActivity } from './activity-log.js';
import { noteExternal } from './syslog.js';
import { readLogFile } from './log-files.js';
import {
  assertCsrf,
  localhostAdmin,
  requireStaff,
  serviceTokenMatches,
  staffFromSession,
} from './auth.js';
import {
  clientAddress,
  createRateLimiter,
  databaseDown,
  PublicError,
  rateLimited,
} from './http.js';
import { renderTextPdf } from './text-pdf.js';

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

export function registerActivity(
  app: FastifyInstance,
  options: {
    database: Database | undefined;
    testAuthEnabled: boolean;
    now?: (() => Date) | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  },
): void {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  const viewLimiter = createRateLimiter(60, 60_000);

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
    const actor = await actorEmail(request);
    await writeActivity(database, {
      actor,
      kind: 'page',
      target: parsed.data.path,
      detail: pageLabel(parsed.data.path),
      ip: clientAddress(request),
    });
    if (parsed.data.path === '/anmelden' || parsed.data.path.startsWith('/anmelden/')) {
      void noteExternal(env, 'informational', `Anmeldeseite ${parsed.data.path} ${actor}`);
    }
    return reply.code(204).send();
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

  app.get('/api/v1/staff/logs', async (request, reply) => {
    await requireReader(request);
    const query = request.query as Record<string, unknown>;
    const file = queryText(query.file);
    if (!file || !(logNames as readonly string[]).includes(file)) {
      throw new PublicError(422, 'invalid_filter', publicErrors.invalidInput);
    }
    const today = viennaToday(now());
    const window = activityWindow(
      queryText(query.from) ?? shiftIso(today, -7),
      queryText(query.to) ?? today,
      now(),
    );
    const format = queryText(query.format);
    const lines = await readLogFile({
      file: file as LogName,
      from: window.from,
      to: window.to,
      q: queryText(query.q)?.slice(0, 120) ?? '',
      limit: format === 'csv' || format === 'pdf' ? 5000 : 500,
      env,
    });
    if (format === 'csv' || format === 'pdf')
      return sendLogExport(reply, file as LogName, format, lines);
    return logReportSchema.parse({ file, lines });
  });
}

function pageLabel(path: string): string {
  if (path === '/') return 'Ticket erfassen';
  if (path === '/offen') return 'Alle offenen Tickets';
  if (path === '/meine') return 'Meine offenen Tickets';
  if (path === '/abgeschlossen') return 'Abgeschlossene Tickets';
  if (path.startsWith('/abgeschlossen/')) return 'Abschluss';
  if (path.startsWith('/ticket/')) return 'Ticket';
  if (path.startsWith('/archiv/')) return 'Archiv';
  if (path === '/faq' || path.startsWith('/faq/')) return 'Anleitungen';
  if (path.startsWith('/wissen/')) return 'Wissen';
  if (path === '/suche') return 'Suche';
  if (path === '/anmelden' || path.startsWith('/anmelden/')) return 'Anmeldung';
  if (path === '/verwaltung') return 'Verwaltung';
  if (path === '/verwaltung/kenntnisse') return 'Kenntnisse';
  if (path === '/verwaltung/kategorien') return 'Kategorien';
  if (path === '/verwaltung/meldungen') return 'Meldungen';
  if (path === '/verwaltung/konfiguration') return 'Konfiguration';
  if (path === '/verwaltung/protokoll') return 'Protokoll';
  if (path === '/verwaltung/tests') return 'Tests';
  if (path === '/verwaltung/ki-mailtest') return 'KI-Mailtest';
  if (path === '/verwaltung/mailbox') return 'Helpdesk-Mailbox';
  if (path === '/mitarbeit/dashboard') return 'Dashboard';
  if (path.startsWith('/mitarbeit/ticket/')) return 'Ticketbearbeitung';
  if (path.startsWith('/beschaffung/')) return 'Beschaffung';
  return 'Seite';
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
  const text = [
    'at\tactor\tkind\ttarget\tdetail\tip',
    ...cells.map((cell) => cell.join('\t')),
  ].join('\n');
  return reply
    .header('content-type', 'text/plain; charset=utf-8')
    .header('content-disposition', 'attachment; filename="kmbhelp-protokoll.txt"')
    .send(`${text}\n`);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

const logTitle: Record<LogName, string> = {
  activity: 'Aktivität',
  error: 'Fehler',
  mail: 'Mail',
  ki: 'KI',
};

function sendLogExport(
  reply: FastifyReply,
  file: LogName,
  format: 'csv' | 'pdf',
  rows: {
    at: string;
    actor: string;
    kind: string;
    target: string;
    detail: string;
    seconds: string;
    request: string;
    answer: string;
  }[],
): FastifyReply {
  const ki = file === 'ki';
  const cells = rows.map((row) =>
    ki
      ? [row.at, row.seconds, row.actor, row.kind, row.target, row.request, row.answer]
      : [row.at, row.actor, row.kind, row.target, row.detail],
  );
  if (format === 'pdf') {
    const lines = cells.map((cell) => cell.join(' | ').slice(0, 180));
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="kmbhelp-${file}.pdf"`)
      .send(renderTextPdf(logTitle[file], lines));
  }
  const header = ki ? 'at,seconds,actor,kind,target,request,answer' : 'at,actor,kind,target,detail';
  const body = [header, ...cells.map((cell) => cell.map(csvCell).join(','))].join('\n');
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="kmbhelp-${file}.csv"`)
    .send(`\uFEFF${body}\n`);
}

function viennaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shiftIso(iso: string, days: number): string {
  const [year, month, dayNumber] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, dayNumber ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
