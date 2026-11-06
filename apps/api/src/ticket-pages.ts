import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { category, staff, ticket, ticketEvent, ticketFile, type Database } from '@kmbhelp/db';
import {
  allowedTicketFile,
  archiveIndexSchema,
  closedTicketListSchema,
  closedTicketPageSchema,
  impacts,
  isTicketCode,
  maxTicketFileBytes,
  priorities,
  publicErrors,
  ticketFileViewSchema,
  ticketMarkdownSchema,
  ticketPageSchema,
  ticketSavedSchema,
  ticketStatuses,
  ticketUploadSchema,
  ticketWorkSchema,
} from '@kmbhelp/shared';
import { localhostAdmin, serviceTokenMatches, staffFromSession } from './auth.js';
import { PublicError } from './http.js';
import {
  readArchiveDocument,
  readArchiveFile,
  readArchiveTicket,
  safeTicketFileName,
} from './ticket-archive.js';

type Gate = (request: FastifyRequest) => Promise<void>;

export function registerTicketPages(
  app: FastifyInstance,
  options: { db: () => Database; reader: Gate; now: () => Date },
): void {
  app.get('/api/v1/tickets/closed', async () => {
    const rows = await options
      .db()
      .db.select({
        code: ticket.code,
        subject: ticket.subject,
        verdict: ticket.verdict,
      })
      .from(ticket)
      .where(eq(ticket.status, 'closed'))
      .orderBy(desc(ticket.closedAt));
    return closedTicketListSchema.parse({
      tickets: rows.map((row) => ({
        code: row.code,
        subject: row.subject,
        verdict: row.verdict ?? '',
      })),
    });
  });

  app.get<{ Params: { code: string } }>('/api/v1/tickets/closed/:code', async (request) => {
    const row = await one(options.db(), request.params.code);
    if (!row || row.status !== 'closed')
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
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
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
      files: await fileViews(options.db(), row.id),
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

  app.post<{ Params: { code: string } }>('/api/v1/staff/tickets/work/:code', async (request) => {
    await options.reader(request);
    const parsed = ticketMarkdownSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const row = await openRow(options.db(), request.params.code);
    const stamp = await touchTicket(options.db(), request, row.id, options.now(), {
      workingMarkdown: parsed.data.markdown,
    });
    return ticketSavedSchema.parse(stamp);
  });

  app.post<{ Params: { code: string } }>(
    '/api/v1/staff/tickets/work/:code/files',
    async (request) => {
      await options.reader(request);
      const parsed = ticketUploadSchema.safeParse(request.body);
      if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
      if (!allowedTicketFile(parsed.data.name)) {
        throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
      }
      const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
      if (bytes.length < 1 || bytes.length > maxTicketFileBytes) {
        throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
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

async function touchTicket(
  database: Database,
  request: FastifyRequest,
  ticketId: string,
  now: Date,
  extra: { workingMarkdown?: string } = {},
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

async function one(database: Database, code: string) {
  if (!isTicketCode(code)) return null;
  const rows = await database.db
    .select({
      id: ticket.id,
      code: ticket.code,
      subject: ticket.subject,
      impact: ticket.impact,
      priority: ticket.priority,
      dueOn: ticket.dueOn,
      status: ticket.status,
      body: ticket.body,
      workingMarkdown: ticket.workingMarkdown,
      requesterName: ticket.requesterName,
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
