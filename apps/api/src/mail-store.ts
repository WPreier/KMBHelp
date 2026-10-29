import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  appSetting,
  category,
  mailLesson,
  faqArticle,
  skill,
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
  closeTicket(ticketId: string): Promise<void>;
  publishedFaqs(): Promise<{ slug: string; bodyDe: string }[]>;
  activeStaffEmails(): Promise<string[]>;
  pendingReopens(): Promise<{ eventId: string; ticketId: string; number: number }[]>;
  heartbeat(state: WorkerState, at: Date): Promise<void>;
  lesson(internetMessageId: string): Promise<'accepted' | 'rejected' | null>;
  rememberLesson(input: {
    internetMessageId: string;
    outcome: 'accepted' | 'rejected';
    reason: string;
  }): Promise<void>;
  recentLessons(): Promise<{ outcome: 'accepted' | 'rejected'; reason: string }[]>;
  ticketByNumber(number: number): Promise<{
    id: string;
    number: number;
    status: string;
    requesterEmail: string;
  } | null>;
  setSatisfaction(
    ticketId: string,
    satisfaction: 'satisfied' | 'neutral' | 'dissatisfied',
    reply: string,
  ): Promise<void>;
  ensureCategory(label: string): Promise<MailCategory | null>;
  latestOpenFrom(email: string): Promise<{ id: string; number: number } | null>;
  appendReply(ticketId: string, text: string): Promise<void>;
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
    async closeTicket(ticketId) {
      await database.db
        .update(ticket)
        .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(ticket.id, ticketId));
    },
    async publishedFaqs() {
      const rows = await database.db
        .select({ slug: faqArticle.slug, bodyDe: faqArticle.bodyDe })
        .from(faqArticle)
        .where(eq(faqArticle.published, true));
      return rows.filter((row) => row.bodyDe.trim() !== '');
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
    async lesson(internetMessageId) {
      const rows = await database.db
        .select({ outcome: mailLesson.outcome })
        .from(mailLesson)
        .where(eq(mailLesson.internetMessageId, internetMessageId))
        .limit(1);
      const outcome = rows[0]?.outcome;
      return outcome === 'accepted' || outcome === 'rejected' ? outcome : null;
    },
    async rememberLesson(input) {
      await database.db
        .insert(mailLesson)
        .values(input)
        .onConflictDoUpdate({
          target: mailLesson.internetMessageId,
          set: { outcome: input.outcome, reason: input.reason },
        });
    },
    async recentLessons() {
      const rows = await database.db
        .select({ outcome: mailLesson.outcome, reason: mailLesson.reason })
        .from(mailLesson)
        .orderBy(desc(mailLesson.createdAt))
        .limit(20);
      return rows.flatMap((row) =>
        row.outcome === 'accepted' || row.outcome === 'rejected'
          ? [{ outcome: row.outcome, reason: row.reason }]
          : [],
      );
    },
    async ticketByNumber(number) {
      const rows = await database.db
        .select({
          id: ticket.id,
          number: ticket.number,
          status: ticket.status,
          requesterEmail: ticket.requesterEmail,
        })
        .from(ticket)
        .where(eq(ticket.number, number))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { ...row, requesterEmail: row.requesterEmail ?? '' };
    },
    async ensureCategory(label) {
      const text = label.trim().slice(0, 80);
      if (!/\p{L}/u.test(text)) return null;
      const known = await this.categories();
      const folded = text.toLowerCase();
      const code = termCode(text);
      const found = known.find(
        (item) =>
          item.labelDe.toLowerCase() === folded ||
          item.labelEn.toLowerCase() === folded ||
          item.code === code,
      );
      if (found) return found;
      if (!code) return null;
      const skills = await database.db
        .select({ code: skill.code })
        .from(skill)
        .orderBy(asc(skill.code))
        .limit(1);
      const skillCode = skills[0]?.code;
      if (!skillCode) return null;
      await database.db
        .insert(category)
        .values({
          code,
          groupCode: 'manual',
          labelDe: text,
          labelEn: text,
          defaultSkillCode: skillCode,
        })
        .onConflictDoNothing();
      const again = await this.categories();
      return again.find((item) => item.code === code) ?? null;
    },
    async latestOpenFrom(email) {
      const rows = await database.db
        .select({ id: ticket.id, number: ticket.number })
        .from(ticket)
        .where(
          and(
            sql`lower(${ticket.requesterEmail}) = ${email.trim().toLowerCase()}`,
            sql`${ticket.status} not in ('closed', 'expired')`,
          ),
        )
        .orderBy(desc(ticket.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },
    async appendReply(ticketId, text) {
      const rows = await database.db
        .select({ body: ticket.body })
        .from(ticket)
        .where(eq(ticket.id, ticketId))
        .limit(1);
      const current = rows[0]?.body ?? '';
      await database.db
        .update(ticket)
        .set({ body: `${current}\n\n---\n${text}`.slice(0, 20_000), updatedAt: new Date() })
        .where(eq(ticket.id, ticketId));
      await this.addEvent(ticketId, 'mail_reply', { bytes: text.length });
    },
    async setSatisfaction(ticketId, satisfaction, reply) {
      await database.db
        .update(ticket)
        .set({ satisfaction, updatedAt: new Date() })
        .where(eq(ticket.id, ticketId));
      await database.db.insert(ticketEvent).values({
        ticketId,
        kind: 'satisfaction',
        payload: { satisfaction, reply: reply.slice(0, 4000) },
      });
    },
  };
}

function termCode(text: string): string {
  const folded = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return folded
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
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
