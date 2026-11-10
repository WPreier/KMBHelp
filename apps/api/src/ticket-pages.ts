import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  category,
  staff,
  ticket,
  ticketEvent,
  ticketFile,
  ticketHistory,
  type Database,
} from '@kmbhelp/db';
import {
  archiveIndexSchema,
  closedTicketListSchema,
  closedTicketPageSchema,
  helpdeskAssigneeEmail,
  impacts,
  isoDateToDisplay,
  isTicketCode,
  priorities,
  publicErrors,
  ticketAssigneeResultSchema,
  ticketAssigneeSchema,
  ticketFileViewSchema,
  ticketMarkdownSchema,
  ticketPageSchema,
  ticketSavedSchema,
  ticketStatuses,
  ticketFileAllowed,
  ticketFileMatchesExtension,
  ticketFilePolicy,
  ticketUploadSchema,
  ticketWorkSchema,
} from '@kmbhelp/shared';
import { assigneeFromEmail } from './assignee.js';
import { localhostAdmin, serviceTokenMatches, staffFromSession, ticketViewer } from './auth.js';
import { mailerFromEnv } from './graph.js';
import { PublicError } from './http.js';
import { publicOriginFromEnv } from './mail-rules.js';
import { renderTextPdf } from './text-pdf.js';
import {
  readArchiveDocument,
  readArchiveFile,
  readArchiveTicket,
  formatTicketHistory,
  safeTicketFileName,
  ticketTexts,
} from './ticket-archive.js';

type Gate = (request: FastifyRequest) => Promise<void>;

export function registerTicketPages(
  app: FastifyInstance,
  options: { db: () => Database; reader: Gate; now: () => Date },
): void {
  app.get('/api/v1/tickets/closed', async (request) => {
    const viewer = await ticketViewer(options.db(), request, options.now(), false);
    if (viewer.audience === 'anonymous') return closedTicketListSchema.parse({ tickets: [] });
    const rows = await options
      .db()
      .db.select({
        code: ticket.code,
        subject: ticket.subject,
        assigneeEmail: ticket.assigneeEmail,
        verdict: ticket.verdict,
        requesterEmail: ticket.requesterEmail,
      })
      .from(ticket)
      .where(eq(ticket.status, 'closed'))
      .orderBy(desc(ticket.closedAt));
    const visible = rows.filter(
      (row) =>
        viewer.audience !== 'user' ||
        (row.requesterEmail ?? '').toLowerCase() === (viewer.email ?? ''),
    );
    return closedTicketListSchema.parse({
      tickets: visible.map((row) => ({
        code: row.code,
        subject: row.subject,
        assigneeEmail: row.assigneeEmail,
        verdict: row.verdict ?? '',
      })),
    });
  });

  app.get<{ Params: { code: string } }>('/api/v1/tickets/closed/:code', async (request) => {
    const row = await one(options.db(), request.params.code);
    if (!row || row.status !== 'closed' || !(await owns(options, request, row.requesterEmail)))
      throw new PublicError(404, 'not_found', publicErrors.notFound);
    return closedTicketPageSchema.parse({
      code: row.code,
      subject: row.subject,
      summary: row.summary ?? '',
      verdict: row.verdict ?? '',
    });
  });

  app.get<{ Params: { code: string } }>('/api/v1/tickets/page/:code', async (request) => {
    const row = await one(options.db(), request.params.code);
    if (!row || !(await owns(options, request, row.requesterEmail))) {
      throw new PublicError(404, 'not_found', publicErrors.notFound);
    }
    return ticketPageSchema.parse({
      code: row.code,
      categoryLabelDe: row.categoryLabelDe,
      categoryLabelEn: row.categoryLabelEn,
      impact: impacts.find((value) => value === row.impact) ?? 'workplace',
      subject: row.subject,
      dueOn: row.dueOn,
      priority: priorities.find((value) => value === row.priority) ?? 'p3',
      status: ticketStatuses.find((value) => value === row.status) ?? 'open',
      closeRequested: row.closeRequestedAt !== null,
      frozen: row.status === 'closed' || row.closeRequestedAt !== null,
      assigneeEmail: row.assigneeEmail,
      number: row.number,
    });
  });

  app.get<{ Params: { code: string } }>('/api/v1/staff/tickets/work/:code', async (request) => {
    await options.reader(request);
    const row = await one(options.db(), request.params.code);
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    return ticketWorkSchema.parse({
      body: row.body,
      workingMarkdown: row.workingMarkdown ?? row.body,
      requesterName: row.requesterName,
      updatedAt: row.updatedAt.toISOString(),
      lastEditor: row.lastEditor,
      history: await historyText(options.db(), row),
      files: await fileViews(options.db(), row.id),
      ...filePolicy(),
    });
  });

  app.get<{ Params: { code: string } }>('/api/v1/staff/tickets/archive/:code', async (request) => {
    await options.reader(request);
    const row = await one(options.db(), request.params.code);
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    const stored = await readArchiveTicket(process.env, row.code);
    if (stored) {
      return archiveIndexSchema.parse({ code: row.code, archived: true, ...stored });
    }
    const files = await fileViews(options.db(), row.id);
    return archiveIndexSchema.parse({
      code: row.code,
      archived: false,
      markdown: row.workingMarkdown ?? row.body,
      files: files.map((file) => ({
        name: file.name,
        bytes: file.bytes,
        modifiedAt: file.createdAt,
      })),
    });
  });

  app.get<{ Params: { code: string; name: string } }>(
    '/api/v1/staff/tickets/archive/:code/:name',
    async (request, reply) => {
      await options.reader(request);
      const document = await readArchiveDocument(
        process.env,
        request.params.code,
        request.params.name,
      );
      if (!document) throw new PublicError(404, 'not_found', publicErrors.notFound);
      return sendFile(reply, request.params.name, document.mediaType, document.bytes);
    },
  );

  app.get<{ Params: { code: string; name: string } }>(
    '/api/v1/staff/tickets/archive/:code/dateien/:name',
    async (request, reply) => {
      await options.reader(request);
      const bytes = await readArchiveFile(process.env, request.params.code, request.params.name);
      if (!bytes) throw new PublicError(404, 'not_found', publicErrors.notFound);
      return sendFile(reply, request.params.name, 'application/octet-stream', bytes);
    },
  );

  app.post<{ Params: { code: string } }>(
    '/api/v1/staff/tickets/work/:code/assignee',
    async (request) => {
      await options.reader(request);
      const parsed = ticketAssigneeSchema.safeParse(request.body);
      if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
      const database = options.db();
      const row = await openRow(database, request.params.code);
      const chosen = await assigneeFromEmail(database.db, parsed.data.assigneeEmail);
      const allowed = await database.db
        .select({ email: staff.email })
        .from(staff)
        .where(and(eq(staff.active, true), eq(staff.isLocalAdmin, false)));
      const known = new Set(allowed.map((person) => person.email.toLowerCase()));
      known.add(helpdeskAssigneeEmail);
      if (!known.has(chosen.email.toLowerCase())) {
        throw new PublicError(400, 'inactive_staff', publicErrors.inactiveStaff);
      }
      const changed = chosen.email.toLowerCase() !== row.assigneeEmail.toLowerCase();
      if (changed) {
        await database.db
          .update(ticket)
          .set({
            assigneeEmail: chosen.email,
            assignedStaffId: chosen.staffId,
            updatedAt: options.now(),
          })
          .where(eq(ticket.id, row.id));
        await database.db.insert(ticketEvent).values({
          ticketId: row.id,
          kind: 'assigned',
          payload: { email: chosen.email },
        });
      }
      const mailed = changed
        ? await sendTransferMail(database, row, chosen.email, options.now())
        : false;
      return ticketAssigneeResultSchema.parse({ assigneeEmail: chosen.email, mailed });
    },
  );

  app.get<{ Params: { code: string } }>(
    '/api/v1/staff/tickets/work/:code/pdf',
    async (request, reply) => {
      await options.reader(request);
      const row = await one(options.db(), request.params.code);
      if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
      const files = await fileViews(options.db(), row.id);
      const history = await historyText(options.db(), row);
      const text = ticketTexts({
        code: row.code,
        subject: row.subject,
        category: row.categoryLabelDe,
        impact: row.impact,
        priority: row.priority,
        dueOn: row.dueOn,
        requesterName: row.requesterName,
        body: row.body,
        workingMarkdown: row.workingMarkdown,
        files: files.map((file) => file.name),
        history,
      });
      const pdf = renderTextPdf(`Ticket ${row.code}`, text.markdown.split('\n'));
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${row.code}.pdf"`)
        .send(pdf);
    },
  );

  app.get<{ Params: { code: string } }>(
    '/api/v1/staff/tickets/work/:code/csv',
    async (request, reply) => {
      await options.reader(request);
      const row = await one(options.db(), request.params.code);
      if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
      const history = await historyText(options.db(), row);
      const lines = [
        ['kind', 'at', 'actor', 'text'],
        ['ticket', row.code, row.requesterName ?? '', row.subject],
        ['category', '', row.categoryLabelDe, ''],
        ['description', '', '', row.body],
        ['history', '', '', history],
      ];
      const body = lines.map((line) => line.map(csvCell).join(',')).join('\n');
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${row.code}.csv"`)
        .send(`\uFEFF${body}\n`);
    },
  );

  app.post<{ Params: { code: string } }>('/api/v1/staff/tickets/work/:code', async (request) => {
    await options.reader(request);
    const parsed = ticketMarkdownSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const row = await openRow(options.db(), request.params.code);
    const previous = row.workingMarkdown ?? row.body;
    const stamp = await touchTicket(options.db(), request, row.id, options.now(), {
      workingMarkdown: parsed.data.markdown,
    });
    if (parsed.data.markdown !== previous) {
      await options.db().db.insert(ticketHistory).values({
        ticketId: row.id,
        at: options.now(),
        actor: stamp.lastEditor,
        body: parsed.data.markdown,
      });
    }
    return ticketSavedSchema.parse({
      ...stamp,
      assigneeEmail: row.assigneeEmail,
      history: await historyText(options.db(), row),
    });
  });

  app.post<{ Params: { code: string } }>(
    '/api/v1/staff/tickets/work/:code/files',
    async (request) => {
      await options.reader(request);
      const parsed = ticketUploadSchema.safeParse(request.body);
      if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
      const policy = ticketFilePolicy(process.env);
      if (!ticketFileAllowed(parsed.data.name, policy.extensions)) {
        throw new PublicError(400, 'file_type', publicErrors.fileType);
      }
      const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
      if (bytes.length < 1 || bytes.length > policy.maxBytes) {
        throw new PublicError(400, 'file_too_big', publicErrors.fileTooBig);
      }
      if (!ticketFileMatchesExtension(parsed.data.name, bytes)) {
        throw new PublicError(400, 'file_content', publicErrors.fileContent);
      }
      const row = await openRow(options.db(), request.params.code);
      const inserted = await options
        .db()
        .db.insert(ticketFile)
        .values({
          ticketId: row.id,
          name: parsed.data.name,
          mediaType: parsed.data.mediaType,
          contentBase64: parsed.data.contentBase64,
        })
        .returning({
          id: ticketFile.id,
          name: ticketFile.name,
          mediaType: ticketFile.mediaType,
          createdAt: ticketFile.createdAt,
        });
      const file = inserted[0];
      if (!file) throw new Error('ticket file insert returned no row');
      await touchTicket(options.db(), request, row.id, options.now());
      await options
        .db()
        .db.insert(ticketEvent)
        .values({
          ticketId: row.id,
          kind: 'file_added',
          payload: { name: file.name, bytes: bytes.length },
        });
      return ticketFileViewSchema.parse({
        id: file.id,
        name: file.name,
        mediaType: file.mediaType,
        bytes: bytes.length,
        createdAt: file.createdAt.toISOString(),
      });
    },
  );

  app.get<{ Params: { code: string; id: string } }>(
    '/api/v1/staff/tickets/work/:code/files/:id',
    async (request, reply) => {
      await options.reader(request);
      const row = await one(options.db(), request.params.code);
      if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
      const files = await options
        .db()
        .db.select({
          name: ticketFile.name,
          mediaType: ticketFile.mediaType,
          contentBase64: ticketFile.contentBase64,
        })
        .from(ticketFile)
        .where(and(eq(ticketFile.id, request.params.id), eq(ticketFile.ticketId, row.id)));
      const file = files[0];
      if (!file) throw new PublicError(404, 'not_found', publicErrors.notFound);
      return sendFile(reply, file.name, file.mediaType, Buffer.from(file.contentBase64, 'base64'));
    },
  );

  app.delete<{ Params: { code: string; id: string } }>(
    '/api/v1/staff/tickets/work/:code/files/:id',
    async (request) => {
      await options.reader(request);
      const row = await openRow(options.db(), request.params.code);
      const removed = await options
        .db()
        .db.delete(ticketFile)
        .where(and(eq(ticketFile.id, request.params.id), eq(ticketFile.ticketId, row.id)))
        .returning({ name: ticketFile.name });
      const file = removed[0];
      if (!file) throw new PublicError(404, 'not_found', publicErrors.notFound);
      await touchTicket(options.db(), request, row.id, options.now());
      await options
        .db()
        .db.insert(ticketEvent)
        .values({
          ticketId: row.id,
          kind: 'file_removed',
          payload: { name: file.name },
        });
      return { ok: true };
    },
  );
}

async function sendTransferMail(
  database: Database,
  row: {
    code: string;
    subject: string;
    body: string;
    workingMarkdown: string | null;
    priority: string;
    dueOn: string | null;
    createdAt: Date;
  },
  email: string,
  now: Date,
): Promise<boolean> {
  const mailer = mailerFromEnv(process.env);
  if (!mailer.configured) return false;
  const people = await database.db
    .select({ displayName: staff.displayName })
    .from(staff)
    .where(sql`lower(${staff.email}) = ${email.toLowerCase()}`)
    .limit(1);
  const name = people[0]?.displayName.trim() || email;
  const text = row.body.trim() || row.workingMarkdown?.trim() || '';
  const priority =
    row.priority === 'p1'
      ? 'Sehr wichtig'
      : row.priority === 'p2'
        ? 'bitte heute noch'
        : 'bei Gelegenheit';
  const created = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(row.createdAt);
  const age = ageLabel(Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 1000)));
  const due = row.dueOn ? isoDateToDisplay(row.dueOn) : 'kein Datum';
  const origin = publicOriginFromEnv(process.env);
  try {
    await mailer.send({
      to: email,
      subject: `Ticket ${row.code}`,
      text: [
        `Ticket an ${name} übertragen.`,
        '',
        `Ticket-ID: ${row.code}`,
        `Betreff: ${row.subject}`,
        `Text: ${text}`,
        `Anlagedatum: ${created}`,
        `Priorität: ${priority}`,
        `Ablauf bis: ${due}`,
        `Alter: ${age}`,
        `Link: ${origin}/ticket/${row.code}`,
      ].join('\n'),
    });
    return true;
  } catch {
    return false;
  }
}

function ageLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} Stunden`;
  return `${Math.floor(hours / 24)} Tage`;
}

async function historyText(
  database: Database,
  row: { id: string; createdAt: Date; requesterName: string | null; body: string },
): Promise<string> {
  const changes = await database.db
    .select({ at: ticketHistory.at, actor: ticketHistory.actor, text: ticketHistory.body })
    .from(ticketHistory)
    .where(eq(ticketHistory.ticketId, row.id))
    .orderBy(asc(ticketHistory.at));
  return formatTicketHistory({
    createdAt: row.createdAt,
    requester: row.requesterName ?? '',
    description: row.body,
    changes,
  });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function filePolicy(): { fileTypes: string[]; maxFileBytes: number } {
  const policy = ticketFilePolicy(process.env);
  return { fileTypes: [...policy.extensions], maxFileBytes: policy.maxBytes };
}

async function touchTicket(
  database: Database,
  request: FastifyRequest,
  ticketId: string,
  now: Date,
  extra: { workingMarkdown?: string; assigneeEmail?: string; assignedStaffId?: string | null } = {},
): Promise<{ updatedAt: string; lastEditor: string }> {
  const lastEditor = await editorLabel(database, request, now);
  await database.db
    .update(ticket)
    .set({ ...extra, lastEditor, updatedAt: now })
    .where(eq(ticket.id, ticketId));
  return { updatedAt: now.toISOString(), lastEditor };
}

async function editorLabel(
  database: Database,
  request: FastifyRequest,
  now: Date,
): Promise<string> {
  if (serviceTokenMatches(request)) return 'Dienst';
  if (localhostAdmin(request)) return 'Interner Admin';
  const session = await staffFromSession(database, request, now);
  if (!session) return 'Helpdesk';
  const rows = await database.db
    .select({ displayName: staff.displayName })
    .from(staff)
    .where(eq(staff.id, session.staffId));
  return rows[0]?.displayName ?? 'Helpdesk';
}

function sendFile(reply: FastifyReply, name: string, mediaType: string, bytes: Buffer) {
  const filename = safeTicketFileName(name).replace(/"/gu, '');
  return reply
    .header('content-type', mediaType || 'application/octet-stream')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .send(bytes);
}

async function fileViews(database: Database, ticketId: string) {
  const files = await database.db
    .select({
      id: ticketFile.id,
      name: ticketFile.name,
      mediaType: ticketFile.mediaType,
      bytes: sql<number>`octet_length(decode(${ticketFile.contentBase64}, 'base64'))`.mapWith(
        Number,
      ),
      createdAt: ticketFile.createdAt,
    })
    .from(ticketFile)
    .where(eq(ticketFile.ticketId, ticketId));
  return files.map((file) =>
    ticketFileViewSchema.parse({
      id: file.id,
      name: file.name,
      mediaType: file.mediaType,
      bytes: file.bytes,
      createdAt: file.createdAt.toISOString(),
    }),
  );
}

async function owns(
  options: { db: () => Database; now: () => Date },
  request: FastifyRequest,
  requesterEmail: string | null,
): Promise<boolean> {
  const viewer = await ticketViewer(options.db(), request, options.now(), false);
  if (viewer.audience === 'administrator') return true;
  if (viewer.audience !== 'user') return false;
  return (requesterEmail ?? '').toLowerCase() === (viewer.email ?? '');
}

async function one(database: Database, code: string) {
  if (!isTicketCode(code)) return null;
  const rows = await database.db
    .select({
      id: ticket.id,
      code: ticket.code,
      number: ticket.number,
      createdAt: ticket.createdAt,
      subject: ticket.subject,
      impact: ticket.impact,
      priority: ticket.priority,
      dueOn: ticket.dueOn,
      status: ticket.status,
      body: ticket.body,
      workingMarkdown: ticket.workingMarkdown,
      requesterName: ticket.requesterName,
      requesterEmail: ticket.requesterEmail,
      assigneeEmail: ticket.assigneeEmail,
      updatedAt: ticket.updatedAt,
      lastEditor: ticket.lastEditor,
      summary: ticket.summary,
      verdict: ticket.verdict,
      closeRequestedAt: ticket.closeRequestedAt,
      archivedAt: ticket.archivedAt,
      categoryLabelDe: category.labelDe,
      categoryLabelEn: category.labelEn,
    })
    .from(ticket)
    .innerJoin(category, eq(ticket.categoryCode, category.code))
    .where(eq(ticket.code, code));
  return rows[0] ?? null;
}

async function openRow(database: Database, code: string) {
  const row = await one(database, code);
  if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
  if (row.status === 'closed' || row.closeRequestedAt) {
    throw new PublicError(409, 'cannot_reopen', publicErrors.cannotReopen);
  }
  return row;
}
