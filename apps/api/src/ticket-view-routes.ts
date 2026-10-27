import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { category, remoteSupportDetail, supplier, ticket, type Database } from '@kmbhelp/db';
import { publicErrors, staffTicketViewSchema, ticketSources } from '@kmbhelp/shared';
import { requireStaff, serviceTokenMatches, staffFromSession, localhostAdmin, assertCsrf } from './auth.js';
import { databaseDown, PublicError } from './http.js';

export function registerStaffTicket(
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

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  async function reader(request: FastifyRequest): Promise<void> {
    if (localhostAdmin(request, env)) return;
    if (serviceTokenMatches(request, env)) return;
    const database = db();
    const session = await staffFromSession(database, request, now());
    if (session && !session.mfaPending) {
      assertCsrf(session, request);
      return;
    }
    await requireStaff(database, request, options.testAuthEnabled, now());
  }

  app.get('/api/v1/staff/tickets/:number', async (request) => {
    await reader(request);
    const number = readNumber(request.params);
    const database = db();
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
      .leftJoin(remoteSupportDetail, eq(remoteSupportDetail.ticketId, ticket.id))
      .leftJoin(supplier, eq(supplier.id, remoteSupportDetail.supplierId))
      .where(eq(ticket.number, number))
      .limit(1);
    const row = rows[0];
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    const priority = row.priority === 'p1' || row.priority === 'p2' || row.priority === 'p3' ? row.priority : null;
    const source = (ticketSources as readonly string[]).includes(row.source) ? row.source : null;
    if (!priority || !source) throw new PublicError(404, 'not_found', publicErrors.notFound);
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
