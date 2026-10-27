import { and, eq, isNull, lt, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { category, remoteSupportDetail, staff, supplier, ticket, ticketEvent, type Database } from '@kmbhelp/db';
import {
  buildDashboard,
  dashboardRanges,
  dashboardSchema,
  type DashboardRange,
  type StaffRole,
} from '@kmbhelp/shared';
import { assertCsrf, localhostAdmin, requireStaff, serviceTokenMatches, staffFromSession } from './auth.js';
import { databaseDown } from './http.js';

export function registerDashboard(
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

  async function reader(request: FastifyRequest): Promise<{ staffId: string | null }> {
    if (localhostAdmin(request, env)) return { staffId: null };
    if (serviceTokenMatches(request, env)) return { staffId: null };
    const database = db();
    const session = await staffFromSession(database, request, now());
    if (session && !session.mfaPending) {
      assertCsrf(session, request);
      return { staffId: await scopeFor(database, session.staffId) };
    }
    const signedIn = await requireStaff(database, request, options.testAuthEnabled, now());
    return { staffId: await scopeFor(database, signedIn.id) };
  }

  app.get('/api/v1/staff/dashboard', async (request) => {
    const scope = await reader(request);
    const database = db();
    const range = readRange(request.query);
    const at = now();
    const [tickets, events, overruns] = await Promise.all([
      database.db
        .select({
          id: ticket.id,
          number: ticket.number,
          createdAt: ticket.createdAt,
          closedAt: ticket.closedAt,
          priority: ticket.priority,
          status: ticket.status,
          source: ticket.source,
          assignedStaffId: ticket.assignedStaffId,
          effortMinutes: ticket.effortMinutes,
        })
        .from(ticket),
      database.db
        .select({ ticketId: ticketEvent.ticketId, kind: ticketEvent.kind, at: ticketEvent.at })
        .from(ticketEvent),
      database.db
        .select({
          number: ticket.number,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          categoryCode: ticket.categoryCode,
          categoryLabelDe: category.labelDe,
          categoryLabelEn: category.labelEn,
          assignedStaffId: ticket.assignedStaffId,
          windowStart: remoteSupportDetail.windowStart,
          windowEnd: remoteSupportDetail.windowEnd,
          accountName: remoteSupportDetail.accountName,
          supplierName: supplier.name,
        })
        .from(remoteSupportDetail)
        .innerJoin(ticket, eq(ticket.id, remoteSupportDetail.ticketId))
        .innerJoin(supplier, eq(supplier.id, remoteSupportDetail.supplierId))
        .innerJoin(category, eq(category.code, ticket.categoryCode))
        .where(
          and(
            ne(ticket.status, 'closed'),
            isNull(remoteSupportDetail.endedAt),
            lt(remoteSupportDetail.windowEnd, at),
          ),
        ),
    ]);
    return dashboardSchema.parse(
      buildDashboard({
        range,
        now: at,
        staffId: scope.staffId,
        tickets,
        events,
        overruns: overruns.flatMap((row) =>
          row.windowEnd
            ? [
                {
                  number: row.number,
                  subject: row.subject,
                  status: row.status,
                  priority: asPriority(row.priority),
                  categoryCode: row.categoryCode,
                  categoryLabelDe: row.categoryLabelDe,
                  categoryLabelEn: row.categoryLabelEn,
                  windowStart: row.windowStart,
                  windowEnd: row.windowEnd,
                  supplierName: row.supplierName,
                  accountName: row.accountName,
                  assignedStaffId: row.assignedStaffId,
                },
              ]
            : [],
        ),
      }),
    );
  });
}

async function scopeFor(database: Database, staffId: string): Promise<string | null> {
  const rows = await database.db
    .select({ role: staff.role, isLocalAdmin: staff.isLocalAdmin })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);
  const row = rows[0];
  if (!row) return staffId;
  const role = row.role as StaffRole;
  if (row.isLocalAdmin || role === 'lead' || role === 'admin') return null;
  return staffId;
}

function asPriority(value: string): 'p1' | 'p2' | 'p3' {
  if (value === 'p1' || value === 'p2' || value === 'p3') return value;
  return 'p3';
}

function readRange(query: unknown): DashboardRange {
  const value =
    query && typeof query === 'object' && 'range' in query && typeof query.range === 'string'
      ? query.range
      : 'month';
  if ((dashboardRanges as readonly string[]).includes(value)) return value as DashboardRange;
  return 'month';
}
