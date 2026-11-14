import {
  autoReplyAllowlist,
  autoReplyGate,
  inputHash,
  modelProviderFromEnv,
  type ModelProvider,
} from '@kmbhelp/ai';
import { appSetting, type Database } from '@kmbhelp/db';
import { legacyConfigNames } from '@kmbhelp/shared/env';
import { eq, inArray } from 'drizzle-orm';
import {
  calendarDate,
  defaultCalendarDelayP1,
  defaultCalendarDelayP2,
  defaultCalendarDelayP3,
  defaultCalendarMinutes,
  defaultFallbackCategory,
  defaultWorkerSchedule,
  resolveMailcheckModel,
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
  type Mailbox,
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
  replySubject,
  replyText,
  reopenText,
  staffTicketPath,
} from './mail-rules.js';
import { formatMailSource } from './ollama-mail.js';
import { writeActivity } from './activity-log.js';
import { logError } from './file-log.js';
import { safeErrorText } from './http.js';
import { maybeNoticeDigest } from './notice-digest.js';
import { sendSmtp, smtpSettingsFromEnv, type SmtpSettings } from './smtp.js';
import {
  askOllama,
  defaultMailErrorTo,
  defaultOllamaModel,
  defaultOllamaUrl,
  mailcheckAiActive,
  type LocalMailResult,
  type MailAsk,
} from './ollama-mail.js';
import { noteExternal } from './syslog.js';
import { shouldPollGraph } from './worker-schedule.js';
import {
  drizzleMailStore,
  readWorkerState,
  type MailStore,
  type StoredMailTicket,
} from './mail-store.js';

export type CycleEvent = 'not_configured' | 'polled' | 'waiting' | 'database_down' | 'observed';

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
  model?: ModelProvider | undefined;
  autoReplyCategories?: readonly string[] | undefined;
  askMail?: ((mail: InboundMail) => Promise<MailAsk>) | undefined;
  mailErrorTo?: string | undefined;
  smtp?: SmtpSettings | undefined;
  sendErrorSmtp?: ((message: { subject: string; text: string }) => Promise<void>) | undefined;
  record?:
    | ((entry: {
        actor: string;
        kind: 'page' | 'mail';
        target: string;
        detail: string;
        ip: string;
      }) => Promise<void>)
    | undefined;
  syslog?: ((category: 'informational' | 'warning', message: string) => Promise<void>) | undefined;
  ticketsOnly?: boolean | undefined;
  mailbox?: Mailbox | undefined;
};

/** Graph fileAttachment limit for a simple draft create. */
const draftAttachmentMaxBytes = 3 * 1024 * 1024;
const originalMailFileName = 'original.eml';

export { readWorkerState };

export async function mailIngestDeps(
  database: Database,
  env: NodeJS.ProcessEnv,
  at: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<IngestDeps> {
  const store = drizzleMailStore(database);
  const settings = await readCycleSettings(database, env);
  const mailbox = mailboxFromEnv(env, fetchImpl);
  return {
    store,
    mailer: mailerFromEnv(env, fetchImpl),
    calendar: calendarFromEnv(env, fetchImpl),
    writer: calendarWriterFromEnv(env, fetchImpl),
    now: at,
    origin: publicOriginFromEnv(env),
    fallbackCategory: settings.fallbackCategory,
    duration: settings.duration,
    delays: settings.delays,
    oncallEmail: settings.oncallEmail,
    estimatedMinutes: null,
    model: modelProviderFromEnv(env, fetchImpl),
    autoReplyCategories: autoReplyAllowlist(settings.autoReplyCategories),
    askMail: async (mail) => {
      if (!(await readMailcheckAiActive(database, env))) return 'unreachable';
      const openRouterKey = env.OPENROUTER_API_KEY?.trim() ?? '';
      const openRouterModel = settings.openRouterModel;
      const useOpenRouter = openRouterKey !== '' && openRouterModel !== '';
      return askOllama({
        baseUrl: settings.ollamaUrl,
        model: useOpenRouter ? openRouterModel : settings.ollamaModel,
        openRouterApiKey: useOpenRouter ? openRouterKey : undefined,
        mail,
        fetchImpl,
        env,
        continueWhen: () => readMailcheckAiActive(database, env),
      });
    },
    mailErrorTo: settings.mailErrorTo,
    smtp: settings.smtp,
    syslog: (category, message) => noteExternal(env, category, message),
    record: (entry) => writeActivity(database, entry, env),
    mailbox,
  };
}

export async function runMailCycle(options: {
  database: Database | undefined;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  lastSlot?: string | null;
}): Promise<{ event: CycleEvent; created: number; slot: string }> {
  const now = options.now ?? (() => new Date());
  const database = options.database;
  if (!database) return { event: 'database_down', created: 0, slot: '' };
  const store = drizzleMailStore(database);
  const fetchImpl = options.fetchImpl ?? fetch;
  const mailbox = mailboxFromEnv(options.env, fetchImpl);
  const mailer = mailerFromEnv(options.env, fetchImpl);
  const at = now();
  const settings = await readCycleSettings(database, options.env);
  try {
    await maybeNoticeDigest({
      database,
      env: { ...options.env, MAIL_NOTICE_DIGEST: settings.digestFlag },
      now: at,
      offset: settings.offset,
      hourText: settings.digestHour,
      to: settings.mailErrorTo,
      smtp: settings.smtp,
    });
  } catch (error) {
    logError(`mail digest: ${safeErrorText(error)}`, options.env);
    await noteExternal(options.env, 'warning', 'notice digest skipped');
  }
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
  const mails = await mailbox.listUnread(options.env.NODE_ENV === 'production' ? 50 : 25);
  await noteExternal(options.env, 'informational', `external graph list unread=${mails.length}`);
  if (options.env.NODE_ENV !== 'production') {
    await store.heartbeat('polling', at);
    return { event: 'observed', created: 0, slot: decision.slot };
  }
  const deps = await mailIngestDeps(database, options.env, at, fetchImpl);
  deps.ticketsOnly = true;
  let created = 0;
  if (!settings.ollamaActive) {
    await noteExternal(options.env, 'informational', 'mailcheck ai inactive');
  } else {
    for (const mail of mails) {
      try {
        if (!(await readMailcheckAiActive(database, options.env))) {
          await noteExternal(options.env, 'informational', 'mailcheck ai stopped');
          break;
        }
        if ((await deps.store.lesson(mail.internetMessageId)) === 'ignored') continue;
        const result = await ingestMail(mail, deps);
        if (result === 'created') created += 1;
        if (result === 'created' || result === 'duplicate') {
          await mailbox.moveToInboxChild(mail.graphId, 'Tickets');
          await noteExternal(options.env, 'informational', 'external graph move tickets');
          await noteMail(deps, mail, 'In den Ordner Tickets verschoben.');
          continue;
        }
        if ((result === 'declined' || result === 'skip') && mail.internetMessageId.trim() !== '') {
          await deps.store.rememberLesson({
            internetMessageId: mail.internetMessageId,
            outcome: 'ignored',
            reason: result,
          });
        }
      } catch (error) {
        logError(`mail ingest: ${safeErrorText(error)}`, options.env);
      }
    }
  }
  await deliverPendingReopens(store, mailer, deps.origin, async (number) => {
    await writeActivity(database, {
      actor: 'worker',
      kind: 'mail',
      target: `Ticket ${number}`,
      detail: 'Das Ticket ist wieder offen. Der Hinweis liegt bereit.',
      ip: '',
    });
  });
  await store.heartbeat('polling', at);
  return { event: 'polled', created, slot: decision.slot };
}

export function replyTicketNumber(subject: string): number | null {
  const match = /(?:^|\b)(?:re|aw|wg|fw)\s*:\s*ticket\s+(\d+)\b/iu.exec(subject.trim());
  const number = Number(match?.[1] ?? '');
  return Number.isInteger(number) && number > 0 ? number : null;
}

export async function ingestMail(
  mail: InboundMail,
  deps: IngestDeps,
  manual?: { reason: string },
): Promise<'created' | 'duplicate' | 'skip' | 'declined' | 'blocked' | 'retry'> {
  if (!addressPattern.test(mail.fromEmail) || mail.internetMessageId.trim() === '') {
    await noteMail(deps, mail, 'Übersprungen. Absender oder Kennung fehlt.');
    return 'skip';
  }
  if ((await deps.store.lesson(mail.internetMessageId)) === 'rejected') return 'blocked';
  const existing = await deps.store.byMessageId(mail.internetMessageId);
  if (existing) {
    await ensureCalendar(existing, deps, null);
    await ensureReply(existing, deps, mail);
    await notifyAssignee(existing, mail, deps);
    await noteMail(deps, mail, `Gehört schon zu Ticket ${existing.number}.`);
    return 'duplicate';
  }
  const categories = await deps.store.categories();
  const text = `${mail.subject}\n${mail.body}`;
  const asked = manual ? null : await askLocal(mail, deps);
  if (asked === 'retry' || asked === 'declined') return asked;
  const timeout = asked === 'timeout';
  const support = asked && asked !== 'timeout' ? asked : null;
  let chosen = categories.find((category) => category.code === deps.fallbackCategory) ?? null;
  let modelName = 'manual';
  let verdictReason = manual?.reason ?? 'support';
  if (timeout) {
    modelName = 'ollama';
    verdictReason = 'timeout';
  } else if (support) {
    modelName = support.model;
    verdictReason = 'support';
    const named = support.category ? await deps.store.ensureCategory(support.category) : null;
    chosen = named ?? chosen;
  } else {
    const ruled = classifyMail(text, categories, deps.fallbackCategory);
    chosen = categories.find((category) => category.code === ruled) ?? chosen;
  }
  if (!chosen) {
    await noteMail(deps, mail, 'Wird beim nächsten Durchlauf erneut geprüft.');
    return 'retry';
  }
  const impact = impactForGroup(chosen.groupCode);
  const ruledPriority = resolvePriority({
    impact,
    dueOn: null,
    today: calendarDate(deps.now),
    clientPriority: null,
  });
  const priority = timeout ? 'p3' : (support?.priority ?? ruledPriority.priority);
  const priorityReason = timeout
    ? 'model_timeout'
    : support?.priority
      ? 'model'
      : ruledPriority.reason;
  const skillCode = chosen.defaultSkillCode;
  const subject = mail.subject.trim() || 'Ohne Betreff';
  const body = mail.body.trim() || subject;
  const created = await deps.store.insertTicket({
    type: 'incident',
    categoryCode: chosen.code,
    impact,
    priority,
    priorityReason,
    subject,
    body,
    requesterEmail: mail.fromEmail,
    requesterName: mail.fromName.trim() || null,
    internetMessageId: mail.internetMessageId,
    assignedStaffId: null,
  });
  if (manual) {
    await deps.store.rememberLesson({
      internetMessageId: mail.internetMessageId,
      outcome: 'accepted',
      reason: manual.reason,
    });
  }
  if (!created) {
    const raced = await deps.store.byMessageId(mail.internetMessageId);
    if (!raced) return 'retry';
    await ensureCalendar(raced, deps, null);
    await ensureReply(raced, deps, mail);
    await notifyAssignee(raced, mail, deps);
    await noteMail(deps, mail, `Gehört schon zu Ticket ${raced.number}.`);
    return 'duplicate';
  }
  await deps.store.addEvent(created.id, 'created', {
    source: 'mail',
    priority,
    reason: priorityReason,
  });
  await noteMail(deps, mail, `Ticket ${created.number} angelegt.`);
  const auto = await maybeAutoReply(created, mail, text, null, deps);
  await deps.store.addEvent(created.id, 'model_decision', {
    model: modelName,
    inputHash: inputHash(text),
    output: {
      is_support: true,
      reason: verdictReason,
      priority,
    },
    autoReplied: auto,
  });
  if (timeout) await notifyModelTimeout(mail, deps);
  if (auto) return 'created';
  const people = await deps.store.candidates(skillCode, chosen.code);
  const busy = new Map<string, { start: string; end: string }[] | null>();
  if (!deps.calendar.configured) {
    for (const person of people) busy.set(person.email, null);
  } else {
    for (const person of people) {
      try {
        busy.set(person.email, await deps.calendar.availability(person.email, deps.now));
      } catch (error) {
        logError(`mail calendar-read: ${safeErrorText(error)}`, process.env);
      }
    }
  }
  const length = durationMinutes(deps.estimatedMinutes, deps.duration);
  const startAt = new Date(deps.now.getTime() + deps.delays[priority] * 60_000);
  const assignee = pickAssignee(people, busy, startAt, length);
  let stored = created;
  if (assignee) {
    await deps.store.assign(created.id, assignee.id);
    await deps.store.addEvent(created.id, 'assigned', { staffId: assignee.id });
    stored = { ...created, assignedStaffId: assignee.id, assigneeEmail: assignee.email };
    await ensureCalendar(stored, deps, assignee.slot);
  }
  await ensureReply(stored, deps, mail);
  await notifyAssignee(stored, mail, deps);
  await notifyOnCall(stored, deps, priority);
  return 'created';
}

async function askLocal(
  mail: InboundMail,
  deps: IngestDeps,
): Promise<LocalMailResult | 'timeout' | 'retry' | 'declined'> {
  if (!deps.askMail) return 'retry';
  const asked = await deps.askMail(mail);
  const level = asked === 'timeout' || asked === 'unreachable' ? 'warning' : 'informational';
  if (asked === 'unreachable') {
    await tellMail(
      deps,
      mail,
      'Die Prüfung war nicht erreichbar. Die Mail bleibt im Posteingang.',
      level,
    );
    return 'retry';
  }
  if (asked === 'timeout') {
    await tellMail(deps, mail, 'Die Prüfung hat das Zeitlimit erreicht.', level);
    return 'timeout';
  }
  if (asked === 'unclear' || asked.kind === 'spam' || asked.kind === 'foreign') {
    await tellMail(deps, mail, 'Kein Ticket. Die Mail bleibt ungelesen im Posteingang.', level);
    return 'declined';
  }
  if (deps.ticketsOnly && (asked.kind === 'reply' || asked.kind === 'close')) {
    const word = asked.kind === 'reply' ? 'eine Antwort' : 'ein Abschluss';
    await tellMail(
      deps,
      mail,
      `Die Prüfung erkennt ${word}. Es wird nur ein neues Ticket angelegt. Die Mail bleibt im Posteingang.`,
      level,
    );
    return 'declined';
  }
  if (asked.kind === 'reply') {
    await tellMail(deps, mail, 'Als Antwort erkannt.', level);
    await attachReply(mail, deps);
    return 'declined';
  }
  if (asked.kind === 'close') {
    await tellMail(deps, mail, 'Als Abschluss erkannt.', level);
    await closeFromSender(mail, deps);
    return 'declined';
  }
  await tellMail(deps, mail, 'Als Ticket erkannt.', level);
  return asked;
}

async function attachReply(mail: InboundMail, deps: IngestDeps): Promise<void> {
  const numbered = replyTicketNumber(mail.subject);
  const byNumber = numbered ? await deps.store.ticketByNumber(numbered) : null;
  const referenced = byNumber ? null : await referencedTicket(mail, deps);
  const target = byNumber ?? referenced;
  if (!target) {
    await noteMail(deps, mail, 'Als Antwort erkannt, aber kein passendes Ticket gefunden.');
    return;
  }
  const noteText = `${mail.fromName} <${mail.fromEmail}>\n${mail.subject}\n${mail.body}`.slice(
    0,
    8000,
  );
  await deps.store.appendReply(target.id, noteText);
  await noteMail(deps, mail, `Antwort an Ticket ${target.number} gehängt.`);
}

async function referencedTicket(
  mail: InboundMail,
  deps: IngestDeps,
): Promise<{ id: string; number: number } | null> {
  const ids = `${mail.inReplyTo ?? ''} ${mail.references ?? ''}`
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter((item) => item !== '');
  for (const id of ids) {
    const row = await deps.store.byMessageId(id);
    if (row) return { id: row.id, number: row.number };
  }
  return null;
}

async function closeFromSender(mail: InboundMail, deps: IngestDeps): Promise<void> {
  const target = await deps.store.latestOpenFrom(mail.fromEmail);
  if (!target) {
    await noteMail(deps, mail, 'Als Abschluss erkannt, aber kein passendes Ticket gefunden.');
    return;
  }
  await deps.store.closeTicket(target.id);
  await deps.store.addEvent(target.id, 'closed', { source: 'mail' });
  await noteMail(deps, mail, `Ticket ${target.number} geschlossen.`);
}

async function notifyModelTimeout(mail: InboundMail, deps: IngestDeps): Promise<void> {
  const to = deps.mailErrorTo ?? defaultMailErrorTo;
  const subject = 'KMBHelp: Die KI-Prüfung hat zu lange gedauert';
  const text = `Eine Mail an das Helpdesk hat das Limit von 5 Minuten überschritten.\nSie wurde als Ticket mit niedriger Wichtigkeit und der Standardkategorie angelegt.\nMessage-ID: ${mail.internetMessageId.slice(0, 200)}\n`;
  if (addressPattern.test(to) && deps.mailer.deliver) {
    try {
      await deps.mailer.deliver({ to, subject, text });
      await deps.syslog?.('informational', 'local ollama timeout notice sent');
      await noteMail(deps, mail, 'Hinweis zur Zeitüberschreitung verschickt.');
      return;
    } catch (error) {
      logError(`mail timeout-graph: ${safeErrorText(error)}`, process.env);
      await deps.syslog?.('warning', 'local ollama timeout notice graph failed');
    }
  }
  try {
    if (deps.sendErrorSmtp) await deps.sendErrorSmtp({ subject, text });
    else await sendSmtp(deps.smtp ?? smtpSettingsFromEnv(process.env), { subject, text });
    await deps.syslog?.('informational', 'local ollama timeout notice smtp');
    await noteMail(
      deps,
      mail,
      'Hinweis zur Zeitüberschreitung über den lokalen Mailserver verschickt.',
    );
  } catch (error) {
    logError(`mail timeout-smtp: ${safeErrorText(error)}`, process.env);
    await deps.syslog?.('warning', 'local ollama timeout notice failed');
    await noteMail(deps, mail, 'Hinweis zur Zeitüberschreitung konnte nicht verschickt werden.');
  }
}

async function maybeAutoReply(
  stored: StoredMailTicket,
  mail: InboundMail,
  text: string,
  modelResult: Awaited<ReturnType<ModelProvider['classify']>>,
  deps: IngestDeps,
): Promise<boolean> {
  if (!modelResult || !deps.mailer.configured || !addressPattern.test(mail.fromEmail)) return false;
  const faqs = await deps.store.publishedFaqs();
  const gate = autoReplyGate({
    decision: modelResult.decision,
    allowlist: deps.autoReplyCategories ?? [],
    publishedFaqSlugs: faqs.map((faq) => faq.slug),
    text,
    now: deps.now,
  });
  const faq = faqs.find((entry) => entry.slug === modelResult.decision.faq_slug);
  if (!gate.close || !faq) return false;
  const eml = await resolveOriginalEml(mail, deps);
  await deps.mailer.send({
    to: mail.fromEmail,
    subject: replySubject(stored.code, stored.subject),
    text: `${replyFields(stored, deps)}\n${faq.bodyDe}\n`,
    attachments: emlAttachment(eml),
  });
  await deps.store.addEvent(stored.id, 'reply', { auto: true });
  await deps.store.closeTicket(stored.id);
  await noteMail(deps, mail, `Ticket ${stored.number} automatisch beantwortet und geschlossen.`);
  return true;
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
    await note(
      deps,
      `Ticket ${stored.number}`,
      `Kalendereintrag für ${stored.assigneeEmail} angelegt. Betreff: ${stored.subject}.`,
    );
  } catch (error) {
    logError(`mail calendar: ${safeErrorText(error)}`, process.env);
    await deps.store.addEvent(stored.id, 'calendar_failed', {});
    await note(
      deps,
      `Ticket ${stored.number}`,
      `Kalendereintrag für ${stored.assigneeEmail} konnte nicht angelegt werden. Betreff: ${stored.subject}.`,
    );
  }
}

async function notifyAssignee(
  stored: StoredMailTicket,
  mail: InboundMail,
  deps: IngestDeps,
): Promise<void> {
  if (!stored.assigneeEmail || !deps.mailer.configured) return;
  if (await deps.store.hasEvent(stored.id, 'assignee_mail')) return;
  try {
    const eml = await archiveOriginalMail(stored, mail, deps);
    await deps.mailer.send({
      to: stored.assigneeEmail,
      subject: replySubject(stored.code, stored.subject),
      text: `Ticket ${stored.code || stored.number}\n${stored.subject}\n${stored.requesterName ?? ''} ${stored.requesterEmail}\n${deps.origin}${staffTicketPath}/${stored.number}\n\n${stored.body}\n`,
      attachments: emlAttachment(eml),
    });
    await deps.store.addEvent(stored.id, 'assignee_mail', {});
    await deps.syslog?.('informational', 'external graph assignee-mail');
    await noteMail(
      deps,
      mail,
      `Entwurf an ${stored.assigneeEmail} für Ticket ${stored.number} angelegt.`,
    );
  } catch (error) {
    logError(`mail assignee: ${safeErrorText(error)}`, process.env);
  }
}

async function ensureReply(
  stored: StoredMailTicket,
  deps: IngestDeps,
  mail?: InboundMail,
): Promise<void> {
  if (await deps.store.hasEvent(stored.id, 'reply')) return;
  if (!deps.mailer.configured || !addressPattern.test(stored.requesterEmail)) return;
  const eml = mail ? await archiveOriginalMail(stored, mail, deps) : null;
  await deps.mailer.send({
    to: stored.requesterEmail,
    subject: replySubject(stored.code, stored.subject),
    text: replyFields(stored, deps),
    attachments: emlAttachment(eml),
  });
  await deps.store.addEvent(stored.id, 'reply', {});
  await note(
    deps,
    `von Helpdesk an ${stored.requesterEmail}`,
    `Betreff: ${replySubject(stored.code, stored.subject)}. Antwortentwurf an den Melder angelegt.`,
  );
}

function replyFields(stored: StoredMailTicket, deps: IngestDeps): string {
  return replyText({
    code: stored.code,
    number: stored.number,
    origin: deps.origin,
    subject: stored.subject,
    body: stored.body,
    priority: stored.priority,
    categoryLabel: stored.categoryLabel,
    requesterEmail: stored.requesterEmail,
    requesterName: stored.requesterName,
    createdAt: stored.createdAt,
  });
}

async function archiveOriginalMail(
  stored: StoredMailTicket,
  mail: InboundMail,
  deps: IngestDeps,
): Promise<Uint8Array | null> {
  const eml = await resolveOriginalEml(mail, deps);
  if (!eml) return null;
  try {
    if (!(await deps.store.hasFile(stored.id, originalMailFileName))) {
      await deps.store.saveFile({
        ticketId: stored.id,
        name: originalMailFileName,
        mediaType: 'message/rfc822',
        contentBase64: Buffer.from(eml).toString('base64'),
      });
      await noteMail(deps, mail, `Originalmail als ${originalMailFileName} am Ticket gespeichert.`);
    }
  } catch (error) {
    logError(`mail archive eml: ${safeErrorText(error)}`, process.env);
  }
  return eml;
}

async function resolveOriginalEml(mail: InboundMail, deps: IngestDeps): Promise<Uint8Array | null> {
  if (deps.mailbox?.configured) {
    try {
      const raw = await deps.mailbox.rawMime(mail.graphId);
      if (raw && raw.length > 0) return raw;
    } catch (error) {
      logError(`mail mime: ${safeErrorText(error)}`, process.env);
    }
  }
  const fallback = formatMailSource(mail);
  return fallback.trim() === '' ? null : new TextEncoder().encode(fallback);
}

function emlAttachment(
  eml: Uint8Array | null,
): { name: string; contentType: string; contentBase64: string }[] | undefined {
  if (!eml || eml.length === 0 || eml.length > draftAttachmentMaxBytes) return undefined;
  return [
    {
      name: originalMailFileName,
      contentType: 'message/rfc822',
      contentBase64: Buffer.from(eml).toString('base64'),
    },
  ];
}

export async function deliverReopen(
  database: Database,
  mailer: Mailer,
  input: { ticketId: string; sourceEventId: string; number: number; origin: string },
): Promise<void> {
  if (!mailer.configured) return;
  await sendReopen(drizzleMailStore(database), mailer, input, async () => {
    await writeActivity(database, {
      actor: 'worker',
      kind: 'mail',
      target: `Ticket ${input.number}`,
      detail: 'Das Ticket ist wieder offen. Der Hinweis liegt bereit.',
      ip: '',
    });
  });
}

async function deliverPendingReopens(
  store: MailStore,
  mailer: Mailer,
  origin: string,
  onSent?: (number: number) => Promise<void>,
): Promise<void> {
  if (!mailer.configured) return;
  const pending = await store.pendingReopens();
  for (const notice of pending) {
    await sendReopen(
      store,
      mailer,
      {
        ticketId: notice.ticketId,
        sourceEventId: notice.eventId,
        number: notice.number,
        origin,
      },
      onSent ? () => onSent(notice.number) : undefined,
    );
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
    await note(
      deps,
      `von Helpdesk an ${deps.oncallEmail}`,
      `Betreff: Ticket ${stored.number}. Die Bereitschaft wurde informiert.`,
    );
  } catch (error) {
    logError(`mail oncall: ${safeErrorText(error)}`, process.env);
  }
}

async function tellMail(
  deps: IngestDeps,
  mail: InboundMail,
  happened: string,
  level: 'warning' | 'informational',
): Promise<void> {
  await noteMail(deps, mail, happened);
  await deps.syslog?.(level, happened);
}

async function noteMail(deps: IngestDeps, mail: InboundMail, happened: string): Promise<void> {
  const from = mail.fromEmail.trim() || 'unbekannt';
  const to = mail.to?.trim() || 'Helpdesk';
  const subject = mail.subject.trim() || '(ohne Betreff)';
  await note(deps, `von ${from} an ${to}`, `Betreff: ${subject}. ${happened}`);
}

async function note(deps: IngestDeps, target: string, detail: string): Promise<void> {
  await deps.record?.({
    actor: 'worker',
    kind: 'mail',
    target: target.slice(0, 200),
    detail: detail.slice(0, 300),
    ip: '',
  });
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
    'SEARCH_AI_AUTO_REPLY_CATEGORIES',
    'MAILCHECK_AI_URL',
    'MAILCHECK_AI_MODEL',
    'MAILCHECK_AI_ACTIVE',
    'OPENROUTER_MODEL',
    'MAIL_ERROR_TO',
    'MAIL_SMTP_SERVER',
    'MAIL_SMTP_PORT',
    'MAIL_SMTP_USER',
    'MAIL_SMTP_LOGIN',
    'MAIL_SMTP_TO',
    'MAIL_NOTICE_DIGEST',
    'MAIL_NOTICE_DIGEST_HOUR',
    ...Object.keys(legacyConfigNames),
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
    const older = new Map<string, string>();
    for (const row of rows) {
      const raw = row.key.slice('config.'.length);
      const current = legacyConfigNames[raw];
      if (current) older.set(current, row.value.trim());
      else stored.set(raw, row.value.trim());
    }
    for (const [key, value] of older) {
      if ((stored.get(key) ?? '') === '' && value !== '') stored.set(key, value);
    }
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
    autoReplyCategories: value('SEARCH_AI_AUTO_REPLY_CATEGORIES', ''),
    ollamaUrl: value('MAILCHECK_AI_URL', defaultOllamaUrl),
    ollamaModel: resolveMailcheckModel(value('MAILCHECK_AI_MODEL', defaultOllamaModel)),
    ollamaActive: mailcheckAiActive(value('MAILCHECK_AI_ACTIVE', 'on')),
    openRouterModel: value('OPENROUTER_MODEL', ''),
    mailErrorTo: value('MAIL_ERROR_TO', defaultMailErrorTo),
    digestFlag: value('MAIL_NOTICE_DIGEST', ''),
    digestHour: value('MAIL_NOTICE_DIGEST_HOUR', '7'),
    smtp: smtpSettingsFromEnv({
      ...env,
      MAIL_SMTP_SERVER: value('MAIL_SMTP_SERVER', '127.0.0.1'),
      MAIL_SMTP_PORT: value('MAIL_SMTP_PORT', '25'),
      MAIL_SMTP_USER: value('MAIL_SMTP_USER', ''),
      MAIL_SMTP_LOGIN: value('MAIL_SMTP_LOGIN', 'none'),
      MAIL_SMTP_TO: value('MAIL_SMTP_TO', defaultMailErrorTo),
      MAIL_SMTP_PASSWD: env.MAIL_SMTP_PASSWD ?? '',
    }),
  };
}

function boundedMinutes(text: string, fallback: number, min: number, max: number): number {
  if (!/^\d+$/u.test(text)) return fallback;
  const parsed = Number(text);
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

async function readMailcheckAiActive(
  database: Database,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  try {
    const rows = await database.db
      .select({ value: appSetting.value })
      .from(appSetting)
      .where(eq(appSetting.key, 'config.MAILCHECK_AI_ACTIVE'))
      .limit(1);
    const stored = rows[0]?.value?.trim();
    if (stored !== undefined && stored !== '') return mailcheckAiActive(stored);
  } catch {
    // Missing table uses the environment and the default.
  }
  return mailcheckAiActive(env.MAILCHECK_AI_ACTIVE);
}

async function sendReopen(
  store: MailStore,
  mailer: Mailer,
  input: { ticketId: string; sourceEventId: string; number: number; origin: string },
  onSent?: () => Promise<void>,
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
    } catch (error) {
      logError(`mail reopen: ${safeErrorText(error)}`, process.env);
    }
  }
  if (sent === 0) return;
  await store.addEvent(input.ticketId, 'notification_sent', { sourceEventId: input.sourceEventId });
  await onSent?.();
}
