import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  appSetting,
  category,
  staff,
  staffCategory,
  staffSkill,
  ticket,
  ticketEvent,
  type Database,
} from '@kmbhelp/db';
import type { MailCategory, MailCandidate } from './mail-rules.js';

export const workerSeenKey = 'worker.seen_at';
export const workerStateKey = 'worker.state';
export const workerStaleMs = 180_000;

export type WorkerState = 'not_configured' | 'polling';

export type StoredMailTicket = {
  id: string;
  number: number;
  internetMessageId: string;
  assignedStaffId: string | null;
  assigneeEmail: string | null;
  requesterEmail: string;
  requesterName: string | null;
  subject: string;
  categoryLabel: string;
  body: string;
};

export type MailStore = {
  categories(): Promise<MailCategory[]>;
  candidates(skillCode: string, categoryCode: string): Promise<MailCandidate[]>;
  byMessageId(internetMessageId: string): Promise<StoredMailTicket | null>;
  insertTicket(values: {
    type: 'incident';
    categoryCode: string;
    impact: 'filing' | 'payroll' | 'workplace' | 'cosmetic';
    priority: 'p1' | 'p2' | 'p3';
    priorityReason: string;
    subject: string;
    body: string;
    requesterEmail: string;
    requesterName: string | null;
    internetMessageId: string;
    assignedStaffId: string | null;
  }): Promise<StoredMailTicket | null>;
  assign(ticketId: string, staffId: string): Promise<void>;
  addEvent(ticketId: string, kind: string, payload: Record<string, unknown>): Promise<string>;
  hasEvent(ticketId: string, kind: string): Promise<boolean>;
  activeStaffEmails(): Promise<string[]>;
  pendingReopens(): Promise<{ eventId: string; ticketId: string; number: number }[]>;
  heartbeat(state: WorkerState, at: Date): Promise<void>;
};

export function drizzleMailStore(database: Database): MailStore {
  return {
    async categories() {
      const rows = await database.db
        .select({
          code: category.code,
          groupCode: category.groupCode,
          labelDe: category.labelDe,
          labelEn: category.labelEn,
          defaultSkillCode: category.defaultSkillCode,
        })
        .from(category);
      return rows;
    },
    async candidates(skillCode, categoryCode) {
      const people = await database.db
        .select({ id: staff.id, email: staff.email, displayName: staff.displayName })
        .from(staff)
        .where(and(eq(staff.active, true), eq(staff.isLocalAdmin, false)))
        .orderBy(asc(staff.displayName));
      const skills = await database.db
        .select({ staffId: staffSkill.staffId })
        .from(staffSkill)
        .where(eq(staffSkill.skillCode, skillCode));
      const categories = await database.db
        .select({ staffId: staffCategory.staffId })
        .from(staffCategory)
        .where(eq(staffCategory.categoryCode, categoryCode));
      const allowed = new Set([
        ...skills.map((row) => row.staffId),
        ...categories.map((row) => row.staffId),
      ]);
      return people.filter((person) => allowed.has(person.id));
    },
    async byMessageId(internetMessageId) {
      const rows = await database.db
        .select({
          id: ticket.id,
          number: ticket.number,
          internetMessageId: ticket.internetMessageId,
          assignedStaffId: ticket.assignedStaffId,
          assigneeEmail: staff.email,
          requesterEmail: ticket.requesterEmail,
          requesterName: ticket.requesterName,
          subject: ticket.subject,
          categoryLabel: category.labelDe,
          body: ticket.body,
        })
        .from(ticket)
        .innerJoin(category, eq(ticket.categoryCode, category.code))
        .leftJoin(staff, eq(ticket.assignedStaffId, staff.id))
        .where(eq(ticket.internetMessageId, internetMessageId));
      const row = rows[0];
      if (!row?.internetMessageId) return null;
      return {
        ...row,
        internetMessageId: row.internetMessageId,
        requesterEmail: row.requesterEmail ?? '',
        requesterName: row.requesterName,
        subject: row.subject,
      };
    },
    async insertTicket(values) {
      const inserted = await database.db
        .insert(ticket)
        .values({
          ...values,
          status: 'open',
          source: 'mail',
        })
        .onConflictDoNothing({ target: ticket.internetMessageId })
        .returning({ id: ticket.id });
      const row = inserted[0];
      if (!row) return null;
      return this.byMessageId(values.internetMessageId);
    },
    async assign(ticketId, staffId) {
      await database.db
        .update(ticket)
        .set({ assignedStaffId: staffId, updatedAt: new Date() })
        .where(eq(ticket.id, ticketId));
    },
    async addEvent(ticketId, kind, payload) {
      const rows = await database.db
        .insert(ticketEvent)
        .values({ ticketId, kind, payload })
        .returning({ id: ticketEvent.id });
      const row = rows[0];
      if (!row) throw new Error('ticket event insert returned no row');
      return row.id;
    },
    hasEvent(ticketId, kind) {
      return database.db
        .select({ id: ticketEvent.id })
        .from(ticketEvent)
        .where(and(eq(ticketEvent.ticketId, ticketId), eq(ticketEvent.kind, kind)))
        .limit(1)
        .then((rows) => Boolean(rows[0]));
    },
    async activeStaffEmails() {
      const rows = await database.db
        .select({ email: staff.email })
        .from(staff)
        .where(and(eq(staff.active, true), eq(staff.isLocalAdmin, false)))
        .orderBy(asc(staff.displayName));
      return rows.map((row) => row.email);
    },
    async pendingReopens() {
      const notices = await database.db
        .select({
          id: ticketEvent.id,
          ticketId: ticketEvent.ticketId,
          payload: ticketEvent.payload,
          number: ticket.number,
        })
        .from(ticketEvent)
        .innerJoin(ticket, eq(ticket.id, ticketEvent.ticketId))
        .where(eq(ticketEvent.kind, 'notification'));
      const sent = await database.db
        .select({ payload: ticketEvent.payload })
        .from(ticketEvent)
        .where(eq(ticketEvent.kind, 'notification_sent'));
      const done = new Set(
        sent.map((row) =>
          typeof row.payload.sourceEventId === 'string' ? row.payload.sourceEventId : '',
        ),
      );
      return notices
        .filter((row) => row.payload.audience === 'all' && !done.has(row.id))
        .map((row) => ({ eventId: row.id, ticketId: row.ticketId, number: row.number }));
    },
    async heartbeat(state, at) {
      await database.db
        .insert(appSetting)
        .values([
          { key: workerSeenKey, value: at.toISOString() },
          { key: workerStateKey, value: state },
        ])
        .onConflictDoUpdate({ target: appSetting.key, set: { value: sql`excluded.value` } });
    },
  };
}

export async function readWorkerState(
  database: Database | undefined,
  now = new Date(),
): Promise<'up' | 'down' | 'not_configured'> {
  if (!database) return 'down';
  try {
    const rows = await database.db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting)
      .where(inArray(appSetting.key, [workerSeenKey, workerStateKey]));
    const seen = rows.find((row) => row.key === workerSeenKey)?.value;
    const state = rows.find((row) => row.key === workerStateKey)?.value;
    const at = seen ? Date.parse(seen) : Number.NaN;
    if (!Number.isFinite(at) || now.getTime() - at > workerStaleMs) return 'down';
    if (state === 'not_configured') return 'not_configured';
    if (state === 'polling') return 'up';
    return 'down';
  } catch {
    return 'down';
  }
}
