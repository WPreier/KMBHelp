import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { category, mailLesson, remoteSupportDetail, staff, supplier, ticket, ticketEvent, type Database } from '@kmbhelp/db';
import {
  calendarDate,
  displayDateToIso,
  isoDateToDisplay,
  publicErrors,
  resolvePriority,
  staffTicketViewSchema,
  ticketPatchSchema,
  ticketQuestionSchema,
  ticketReasonSchema,
  ticketSources,
  unreadMailListSchema,
} from '@kmbhelp/shared';
import { requireStaff, serviceTokenMatches, staffFromSession, localhostAdmin, assertCsrf } from './auth.js';
import { mailboxFromEnv, mailerFromEnv, type Mailbox, type Mailer } from './graph.js';
import { forgetMisreadTicket, questionMail, solvedMail, workingMail } from './handling.js';
import { databaseDown, PublicError } from './http.js';
import { ingestMail, mailIngestDeps } from './mail-cycle.js';
import { noteExternal } from './syslog.js';

export function registerStaffTicket(
  app: FastifyInstance,
  options: {
    database: Database | undefined;
    testAuthEnabled: boolean;
    now?: (() => Date) | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    mailer?: Mailer | undefined;
    mailbox?: Mailbox | undefined;
  },
): void {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  function mailer(): Mailer {
    return options.mailer ?? mailerFromEnv(env);
  }

  function mailbox(): Mailbox {
    return options.mailbox ?? mailboxFromEnv(env);
  }

  async function reader(request: FastifyRequest): Promise<{ id: string | null }> {
    if (localhostAdmin(request, env)) return { id: null };
    if (serviceTokenMatches(request, env)) return { id: null };
    const database = db();
    const session = await staffFromSession(database, request, now());
    if (session && !session.mfaPending) {
      assertCsrf(session, request);
      return { id: session.staffId };
    }
    const signedIn = await requireStaff(database, request, options.testAuthEnabled, now());
    return { id: signedIn.id };
  }

  app.get('/api/v1/staff/tickets/:number', async (request) => {
    await reader(request);
    return loadTicket(db(), readNumber(request.params));
  });

  app.patch('/api/v1/staff/tickets/:number', async (request) => {
    const actor = await reader(request);
    const parsed = ticketPatchSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const current = await loadRow(database, readNumber(request.params));
    if (current.status === 'closed') {
      throw new PublicError(422, 'cannot_reopen', publicErrors.cannotReopen);
    }
    const dueOn = parsed.data.dueOn ? displayDateToIso(parsed.data.dueOn) : null;
    if (parsed.data.dueOn && !dueOn) {
      throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    }
    const email = parsed.data.requesterEmail?.trim() ?? '';
    if (email !== '' && !email.includes('@')) {
      throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    }
    const ruled = resolvePriority({
      impact: parsed.data.impact,
      dueOn,
      today: calendarDate(now()),
      clientPriority: null,
    });
    const rank = { p1: 1, p2: 2, p3: 3 };
    if (rank[parsed.data.priority] > rank[ruled.priority] && !parsed.data.priorityReason?.trim()) {
      throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    }
    if (parsed.data.assignedStaffId) {
      const people = await database.db
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.id, parsed.data.assignedStaffId), eq(staff.active, true)))
        .limit(1);
      if (!people[0]) throw new PublicError(422, 'inactive_staff', publicErrors.inactiveStaff);
    }
    await database.db
      .update(ticket)
      .set({
        subject: parsed.data.subject,
        body: parsed.data.body,
        categoryCode: parsed.data.categoryCode,
        impact: parsed.data.impact,
        priority: parsed.data.priority,
        priorityReason: parsed.data.priorityReason?.trim() || ruled.reason,
        dueOn,
        requesterName: parsed.data.requesterName,
        requesterEmail: email || null,
        explanation: parsed.data.explanation,
        assignedStaffId: parsed.data.assignedStaffId,
        updatedAt: now(),
      })
      .where(eq(ticket.id, current.id));
    await database.db.insert(ticketEvent).values({
      ticketId: current.id,
      kind: 'edited',
      actorStaffId: actor.id,
      payload: { explanation: parsed.data.explanation.length > 0 },
    });
    return loadTicket(database, current.number);
  });

  app.post('/api/v1/staff/tickets/:number/done', async (request) => {
    const actor = await reader(request);
    const database = db();
    const current = await loadRow(database, readNumber(request.params));
    if (current.status === 'closed') return loadTicket(database, current.number);
    await sendToRequester(mailer(), current, solvedMail(current.number));
    await database.db
      .update(ticket)
      .set({ status: 'closed', closedAt: now(), updatedAt: now() })
      .where(eq(ticket.id, current.id));
    await database.db.insert(ticketEvent).values({
      ticketId: current.id,
      kind: 'closed',
      actorStaffId: actor.id,
      payload: { mailed: Boolean(current.requesterEmail) },
    });
    return loadTicket(database, current.number);
  });

  app.post('/api/v1/staff/tickets/:number/working', async (request) => {
    const actor = await reader(request);
    const database = db();
    const current = await loadRow(database, readNumber(request.params));
    await sendToRequester(mailer(), current, workingMail(current.number));
    await database.db.insert(ticketEvent).values({
      ticketId: current.id,
      kind: 'working',
      actorStaffId: actor.id,
      payload: {},
    });
    return { ok: true };
  });

  app.post('/api/v1/staff/tickets/:number/question', async (request) => {
    const actor = await reader(request);
    const parsed = ticketQuestionSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const current = await loadRow(database, readNumber(request.params));
    await sendToRequester(mailer(), current, questionMail(current.number, parsed.data.text));
    await database.db.insert(ticketEvent).values({
      ticketId: current.id,
      kind: 'question',
      actorStaffId: actor.id,
      payload: { text: parsed.data.text },
    });
    return { ok: true };
  });

  app.post('/api/v1/staff/tickets/:number/misread', async (request) => {
    await reader(request);
    const parsed = ticketReasonSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const current = await loadRow(database, readNumber(request.params));
    if (!current.internetMessageId) {
      throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    }
    await database.db
      .insert(mailLesson)
      .values({
        internetMessageId: current.internetMessageId,
        outcome: 'rejected',
        reason: parsed.data.reason,
      })
      .onConflictDoUpdate({
        target: mailLesson.internetMessageId,
        set: { outcome: 'rejected', reason: parsed.data.reason },
      });
    await forgetMisreadTicket(database, current.id);
    return { ok: true };
  });

  app.get('/api/v1/staff/mailbox', async (request) => {
    await reader(request);
    const box = mailbox();
    if (!box.configured) {
      throw new PublicError(503, 'mail_not_connected', publicErrors.mailNotConnected);
    }
    const database = db();
    const mails = await box.listUnread(25);
    const visible = [];
    for (const mail of mails) {
      if (!mail.internetMessageId) continue;
      const known = await database.db
        .select({ id: ticket.id })
        .from(ticket)
        .where(eq(ticket.internetMessageId, mail.internetMessageId))
        .limit(1);
      if (known[0]) continue;
      const lesson = await database.db
        .select({ outcome: mailLesson.outcome })
        .from(mailLesson)
        .where(eq(mailLesson.internetMessageId, mail.internetMessageId))
        .limit(1);
      if (lesson[0]?.outcome === 'rejected') continue;
      visible.push({
        graphId: mail.graphId,
        subject: mail.subject,
        fromEmail: mail.fromEmail,
        fromName: mail.fromName,
      });
    }
    return unreadMailListSchema.parse({ mails: visible });
  });

  app.post('/api/v1/staff/mailbox/:graphId/accept', async (request) => {
    await reader(request);
    const parsed = ticketReasonSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    const box = mailbox();
    if (!box.configured) {
      throw new PublicError(503, 'mail_not_connected', publicErrors.mailNotConnected);
    }
    const graphId = readGraphId(request.params);
    const mail = (await box.listUnread(25)).find((item) => item.graphId === graphId);
    if (!mail) throw new PublicError(404, 'not_found', publicErrors.notFound);
    const database = db();
    const deps = await mailIngestDeps(database, env, now());
    if (options.mailer) deps.mailer = options.mailer;
    const result = await ingestMail(mail, deps, { reason: parsed.data.reason });
    if (result === 'blocked') throw new PublicError(422, 'invalid_input', publicErrors.invalidInput);
    if (result === 'retry') throw new PublicError(503, 'mail_not_connected', publicErrors.mailNotConnected);
    if (result === 'created' || result === 'duplicate' || result === 'declined') {
      await box.markRead(mail.graphId);
    }
    const stored = await database.db
      .select({ number: ticket.number })
      .from(ticket)
      .where(eq(ticket.internetMessageId, mail.internetMessageId))
      .limit(1);
    return { number: stored[0]?.number ?? null, result };
  });
}

async function sendToRequester(
  mailer: Mailer,
  current: { number: number; requesterEmail: string | null },
  message: { subject: string; text: string },
): Promise<void> {
  if (!current.requesterEmail) return;
  if (!mailer.configured) {
    throw new PublicError(503, 'mail_not_connected', publicErrors.mailNotConnected);
  }
  await mailer.send({ to: current.requesterEmail, subject: message.subject, text: message.text });
  await noteExternal(process.env, 'informational', 'external graph staff-mail');
}

async function loadRow(database: Database, number: number) {
  const rows = await database.db
    .select({
      id: ticket.id,
      number: ticket.number,
      status: ticket.status,
      requesterEmail: ticket.requesterEmail,
      internetMessageId: ticket.internetMessageId,
    })
    .from(ticket)
    .where(eq(ticket.number, number))
    .limit(1);
  const row = rows[0];
  if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
  return row;
}

async function loadTicket(database: Database, number: number) {
  const rows = await database.db
    .select({
      number: ticket.number,
      subject: ticket.subject,
      body: ticket.body,
      status: ticket.status,
      priority: ticket.priority,
      source: ticket.source,
      categoryCode: ticket.categoryCode,
      categoryLabelDe: category.labelDe,
      categoryLabelEn: category.labelEn,
      requesterName: ticket.requesterName,
      requesterEmail: ticket.requesterEmail,
      explanation: ticket.explanation,
      satisfaction: ticket.satisfaction,
      impact: ticket.impact,
      dueOn: ticket.dueOn,
      assignedStaffId: ticket.assignedStaffId,
      assignedName: staff.displayName,
      internetMessageId: ticket.internetMessageId,
      createdAt: ticket.createdAt,
      closedAt: ticket.closedAt,
      supplierName: supplier.name,
      windowStart: remoteSupportDetail.windowStart,
      windowEnd: remoteSupportDetail.windowEnd,
      accountName: remoteSupportDetail.accountName,
      endedAt: remoteSupportDetail.endedAt,
    })
    .from(ticket)
    .innerJoin(category, eq(category.code, ticket.categoryCode))
    .leftJoin(staff, eq(staff.id, ticket.assignedStaffId))
    .leftJoin(remoteSupportDetail, eq(remoteSupportDetail.ticketId, ticket.id))
    .leftJoin(supplier, eq(supplier.id, remoteSupportDetail.supplierId))
    .where(eq(ticket.number, number))
    .limit(1);
  const row = rows[0];
  if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
  const priority = row.priority === 'p1' || row.priority === 'p2' || row.priority === 'p3' ? row.priority : null;
  const source = (ticketSources as readonly string[]).includes(row.source) ? row.source : null;
  const impact =
    row.impact === 'filing' || row.impact === 'payroll' || row.impact === 'workplace' || row.impact === 'cosmetic'
      ? row.impact
      : null;
  const satisfaction =
    row.satisfaction === 'satisfied' || row.satisfaction === 'neutral' || row.satisfaction === 'dissatisfied'
      ? row.satisfaction
      : null;
  if (!priority || !source || !impact) throw new PublicError(404, 'not_found', publicErrors.notFound);
  return staffTicketViewSchema.parse({
    number: row.number,
    subject: row.subject,
    body: row.body,
    status: row.status,
    priority,
    source,
    categoryCode: row.categoryCode,
    categoryLabelDe: row.categoryLabelDe,
    categoryLabelEn: row.categoryLabelEn,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    explanation: row.explanation,
    satisfaction,
    impact,
    dueOn: row.dueOn ? isoDateToDisplay(row.dueOn) : null,
    assignedStaffId: row.assignedStaffId,
    assignedName: row.assignedName,
    fromMail: Boolean(row.internetMessageId),
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    remote: row.supplierName
      ? {
          supplierName: row.supplierName,
          windowStart: row.windowStart ? row.windowStart.toISOString() : null,
          windowEnd: row.windowEnd ? row.windowEnd.toISOString() : null,
          accountName: row.accountName,
          endedAt: row.endedAt ? row.endedAt.toISOString() : null,
        }
      : null,
  });
}

function readNumber(params: unknown): number {
  const value =
    params && typeof params === 'object' && 'number' in params && typeof params.number === 'string'
      ? Number(params.number)
      : Number.NaN;
  if (!Number.isInteger(value) || value < 1) {
    throw new PublicError(404, 'not_found', publicErrors.notFound);
  }
  return value;
}

function readGraphId(params: unknown): string {
  const value =
    params && typeof params === 'object' && 'graphId' in params && typeof params.graphId === 'string'
      ? params.graphId
      : '';
  if (value.trim() === '') throw new PublicError(404, 'not_found', publicErrors.notFound);
  return value;
}
