import { appSetting, type Database } from '@kmbhelp/db';
import { inArray } from 'drizzle-orm';
import {
  calendarDate,
  defaultCalendarDelayP1,
  defaultCalendarDelayP2,
  defaultCalendarDelayP3,
  defaultCalendarMinutes,
  defaultFallbackCategory,
  defaultWorkerSchedule,
  resolvePriority,
  type Priority,
} from '@kmbhelp/shared';
import {
  calendarFromEnv,
  calendarWriterFromEnv,
  mailboxFromEnv,
  mailerFromEnv,
  type CalendarReader,
  type CalendarWriter,
  type InboundMail,
  type Mailer,
} from './graph.js';
import {
  calendarBody,
  calendarSubject,
  classifyMail,
  durationMinutes,
  impactForGroup,
  pickAssignee,
  publicOriginFromEnv,
  replyText,
  reopenText,
  staffTicketPath,
} from './mail-rules.js';
import { shouldPollGraph } from './worker-schedule.js';
import {
  drizzleMailStore,
  readWorkerState,
  type MailStore,
  type StoredMailTicket,
} from './mail-store.js';

export type CycleEvent = 'not_configured' | 'polled' | 'waiting' | 'database_down';

const addressPattern = /^[^@\s]+@[^@\s]+$/u;

type IngestDeps = {
  store: MailStore;
  mailer: Mailer;
  calendar: CalendarReader;
  writer: CalendarWriter;
  now: Date;
  origin: string;
  fallbackCategory: string;
  duration: number;
  delays: Record<Priority, number>;
  oncallEmail: string;
  estimatedMinutes: number | null;
};

export { readWorkerState };

export async function runMailCycle(options: {
  database: Database | undefined;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  lastSlot?: string | null;
}): Promise<{ event: CycleEvent; created: number; slot: string }> {
  const now = options.now ?? (() => new Date());
  if (!options.database) return { event: 'database_down', created: 0, slot: '' };
  const store = drizzleMailStore(options.database);
  const fetchImpl = options.fetchImpl ?? fetch;
  const mailbox = mailboxFromEnv(options.env, fetchImpl);
  const mailer = mailerFromEnv(options.env, fetchImpl);
  const at = now();
  const settings = await readCycleSettings(options.database, options.env);
  if (!mailbox.configured) {
    await store.heartbeat('not_configured', at);
    return { event: 'not_configured', created: 0, slot: '' };
  }
  const decision = shouldPollGraph(
    at,
    settings.offset,
    settings.schedule,
    options.lastSlot ?? null,
  );
  if (!decision.poll) {
    await store.heartbeat('polling', at);
    return { event: 'waiting', created: 0, slot: decision.slot };
  }
  const deps: IngestDeps = {
    store,
    mailer,
    calendar: calendarFromEnv(options.env, fetchImpl),
    writer: calendarWriterFromEnv(options.env, fetchImpl),
    now: at,
    origin: publicOriginFromEnv(options.env),
    fallbackCategory: settings.fallbackCategory,
    duration: settings.duration,
    delays: settings.delays,
    oncallEmail: settings.oncallEmail,
    estimatedMinutes: null,
  };
  const mails = await mailbox.listUnread(25);
  let created = 0;
  for (const mail of mails) {
    try {
      const result = await ingestMail(mail, deps);
      if (result === 'created') created += 1;
      if (result !== 'retry') await mailbox.markRead(mail.graphId);
    } catch {
      // Leave the message unread so the next minute can finish the reply.
    }
  }
  await deliverPendingReopens(store, mailer, deps.origin);
  await store.heartbeat('polling', at);
  return { event: 'polled', created, slot: decision.slot };
}

export async function ingestMail(
  mail: InboundMail,
  deps: IngestDeps,
): Promise<'created' | 'duplicate' | 'skip' | 'retry'> {
  if (!addressPattern.test(mail.fromEmail) || mail.internetMessageId.trim() === '') return 'skip';
  const existing = await deps.store.byMessageId(mail.internetMessageId);
  if (existing) {
    await ensureCalendar(existing, deps, null);
    await ensureReply(existing, deps);
    return 'duplicate';
  }
  const categories = await deps.store.categories();
  const chosen = categories.find(
    (category) =>
      category.code ===
      classifyMail(`${mail.subject}\n${mail.body}`, categories, deps.fallbackCategory),
  );
  if (!chosen) return 'retry';
  const impact = impactForGroup(chosen.groupCode);
  const decision = resolvePriority({
    impact,
    dueOn: null,
    today: calendarDate(deps.now),
    clientPriority: null,
  });
  const subject = mail.subject.trim() || 'Ohne Betreff';
  const body = mail.body.trim() || subject;
  const created = await deps.store.insertTicket({
    type: 'incident',
    categoryCode: chosen.code,
    impact,
    priority: decision.priority,
    priorityReason: decision.reason,
    subject,
    body,
    requesterEmail: mail.fromEmail,
    requesterName: mail.fromName.trim() || null,
    internetMessageId: mail.internetMessageId,
    assignedStaffId: null,
  });
  if (!created) {
    const raced = await deps.store.byMessageId(mail.internetMessageId);
    if (!raced) return 'retry';
    await ensureCalendar(raced, deps, null);
    await ensureReply(raced, deps);
    return 'duplicate';
  }
  await deps.store.addEvent(created.id, 'created', {
    source: 'mail',
    priority: decision.priority,
    reason: decision.reason,
  });
  const people = await deps.store.candidates(chosen.defaultSkillCode, chosen.code);
  const busy = new Map<string, { start: string; end: string }[] | null>();
  if (!deps.calendar.configured) {
    for (const person of people) busy.set(person.email, null);
  } else {
    for (const person of people) {
      try {
        busy.set(person.email, await deps.calendar.availability(person.email, deps.now));
      } catch {
        // A calendar that cannot be read is not a free window.
      }
    }
  }
  const length = durationMinutes(deps.estimatedMinutes, deps.duration);
  const startAt = new Date(deps.now.getTime() + deps.delays[decision.priority] * 60_000);
  const assignee = pickAssignee(people, busy, startAt, length);
  let stored = created;
  if (assignee) {
    await deps.store.assign(created.id, assignee.id);
    await deps.store.addEvent(created.id, 'assigned', { staffId: assignee.id });
    stored = { ...created, assignedStaffId: assignee.id, assigneeEmail: assignee.email };
    await ensureCalendar(stored, deps, assignee.slot);
  }
  await ensureReply(stored, deps);
  await notifyOnCall(stored, deps, decision.priority);
  return 'created';
}

async function ensureCalendar(
  stored: StoredMailTicket,
  deps: IngestDeps,
  slot: { start: string; end: string } | null,
): Promise<void> {
  if (!stored.assigneeEmail || !deps.writer.configured) return;
  if (await deps.store.hasEvent(stored.id, 'calendar')) return;
  if (await deps.store.hasEvent(stored.id, 'calendar_failed')) return;
  const start = slot?.start ?? deps.now.toISOString();
  const end = slot?.end ?? new Date(deps.now.getTime() + 30 * 60 * 1000).toISOString();
  try {
    const event = await deps.writer.createEvent(stored.assigneeEmail, {
      subject: calendarSubject(stored.subject),
      body: calendarBody(
        stored.number,
        deps.origin,
        stored.requesterName ?? '',
        stored.requesterEmail,
        stored.subject,
        stored.body,
      ),
      start,
      end,
    });
    await deps.store.addEvent(stored.id, 'calendar', { id: event.id });
  } catch {
    await deps.store.addEvent(stored.id, 'calendar_failed', {});
  }
}

async function ensureReply(stored: StoredMailTicket, deps: IngestDeps): Promise<void> {
  if (await deps.store.hasEvent(stored.id, 'reply')) return;
  if (!deps.mailer.configured || !addressPattern.test(stored.requesterEmail)) return;
  await deps.mailer.send({
    to: stored.requesterEmail,
    subject: `Ticket ${stored.number}`,
    text: replyText(stored.number, deps.origin),
  });
  await deps.store.addEvent(stored.id, 'reply', {});
}

export async function deliverReopen(
  database: Database,
  mailer: Mailer,
  input: { ticketId: string; sourceEventId: string; number: number; origin: string },
): Promise<void> {
  if (!mailer.configured) return;
  await sendReopen(drizzleMailStore(database), mailer, input);
}

async function deliverPendingReopens(
  store: MailStore,
  mailer: Mailer,
  origin: string,
): Promise<void> {
  if (!mailer.configured) return;
  const pending = await store.pendingReopens();
  for (const notice of pending) {
    await sendReopen(store, mailer, {
      ticketId: notice.ticketId,
      sourceEventId: notice.eventId,
      number: notice.number,
      origin,
    });
  }
}

async function notifyOnCall(
  stored: StoredMailTicket,
  deps: IngestDeps,
  priority: Priority,
): Promise<void> {
  if (priority !== 'p1' || !deps.mailer.configured || !addressPattern.test(deps.oncallEmail))
    return;
  if (await deps.store.hasEvent(stored.id, 'oncall')) return;
  try {
    await deps.mailer.send({
      to: deps.oncallEmail,
      subject: `Ticket ${stored.number}`,
      text: `Neues Ticket ${stored.number}\n\n${stored.subject}\n${deps.origin}${staffTicketPath}/${stored.number}\n`,
    });
    await deps.store.addEvent(stored.id, 'oncall', {});
  } catch {
    // The ticket stays. A later run can send the on-call mail once Graph accepts it.
  }
}

async function readCycleSettings(database: Database, env: NodeJS.ProcessEnv) {
  const names = [
    'SYSLOG_UTC_OFFSET',
    'WORKER_SCHEDULE',
    'FALLBACK_CATEGORY',
    'CALENDAR_DEFAULT_MINUTES',
    'CALENDAR_DELAY_P1',
    'CALENDAR_DELAY_P2',
    'CALENDAR_DELAY_P3',
    'ONCALL_EMAIL',
  ];
  const stored = new Map<string, string>();
  try {
    const rows = await database.db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting)
      .where(
        inArray(
          appSetting.key,
          names.map((name) => `config.${name}`),
        ),
      );
    for (const row of rows) stored.set(row.key.slice('config.'.length), row.value.trim());
  } catch {
    // Missing table uses the environment and the defaults.
  }
  const value = (key: string, fallback: string) => stored.get(key) || env[key]?.trim() || fallback;
  return {
    offset: value('SYSLOG_UTC_OFFSET', '+01:00'),
    schedule: value('WORKER_SCHEDULE', defaultWorkerSchedule),
    fallbackCategory: value('FALLBACK_CATEGORY', defaultFallbackCategory),
    duration: boundedMinutes(value('CALENDAR_DEFAULT_MINUTES', defaultCalendarMinutes), 30, 5, 480),
    delays: {
      p1: boundedMinutes(value('CALENDAR_DELAY_P1', defaultCalendarDelayP1), 0, 0, 1440),
      p2: boundedMinutes(value('CALENDAR_DELAY_P2', defaultCalendarDelayP2), 60, 0, 1440),
      p3: boundedMinutes(value('CALENDAR_DELAY_P3', defaultCalendarDelayP3), 240, 0, 1440),
    },
    oncallEmail: value('ONCALL_EMAIL', ''),
  };
}

function boundedMinutes(text: string, fallback: number, min: number, max: number): number {
  if (!/^\d+$/u.test(text)) return fallback;
  const parsed = Number(text);
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

async function sendReopen(
  store: MailStore,
  mailer: Mailer,
  input: { ticketId: string; sourceEventId: string; number: number; origin: string },
): Promise<void> {
  const emails = await store.activeStaffEmails();
  let sent = 0;
  for (const email of emails) {
    if (!addressPattern.test(email)) continue;
    try {
      await mailer.send({
        to: email,
        subject: `Ticket ${input.number}`,
        text: reopenText(input.number, input.origin),
      });
      sent += 1;
    } catch {
      // One mailbox can fail without stopping the others.
    }
  }
  if (sent === 0) return;
  await store.addEvent(input.ticketId, 'notification_sent', { sourceEventId: input.sourceEventId });
}
