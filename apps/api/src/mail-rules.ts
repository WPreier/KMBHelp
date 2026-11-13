import type { Impact } from '@kmbhelp/shared';

export const fallbackCategoryCode = 'printer';
export const staffTicketPath = '/mitarbeit/ticket';

export type MailCategory = {
  code: string;
  groupCode: string;
  labelDe: string;
  labelEn: string;
  defaultSkillCode: string;
};

export type MailCandidate = {
  id: string;
  email: string;
  displayName: string;
};

export type BusyWindow = { start: string; end: string };

export type TimeSlot = { start: string; end: string };

const originPattern = /^https?:\/\/[A-Za-z0-9.:-]+$/u;

export function classifyMail(
  text: string,
  categories: readonly MailCategory[],
  fallback = fallbackCategoryCode,
): string {
  const haystack = text.toLocaleLowerCase('de-AT');
  let best: { code: string; length: number } | null = null;
  for (const category of categories) {
    for (const label of [category.labelDe, category.labelEn]) {
      const needle = label.trim().toLocaleLowerCase('de-AT');
      if (needle.length < 3 || !haystack.includes(needle)) continue;
      if (!best || needle.length > best.length)
        best = { code: category.code, length: needle.length };
    }
  }
  const known = categories.some((category) => category.code === fallback);
  return best?.code ?? (known ? fallback : fallbackCategoryCode);
}

export function durationMinutes(estimate: number | null | undefined, fallback: number): number {
  if (
    typeof estimate === 'number' &&
    Number.isInteger(estimate) &&
    estimate >= 5 &&
    estimate <= 480
  ) {
    return estimate;
  }
  return fallback;
}

export function impactForGroup(groupCode: string): Impact {
  if (groupCode === 'payroll') return 'payroll';
  if (groupCode === 'tax') return 'filing';
  if (groupCode === 'procurement') return 'cosmetic';
  return 'workplace';
}

export function publicOriginFromEnv(env: NodeJS.ProcessEnv): string {
  const configured = env.PUBLIC_ORIGIN?.trim() ?? '';
  if (originPattern.test(configured)) return configured.replace(/\/$/u, '');
  if (env.NODE_ENV === 'production') return 'https://helpdesk.kmbcloud.at';
  return 'http://127.0.0.1:5173';
}

export function ticketLink(number: number, origin: string): string {
  return `${origin}${staffTicketPath}/${number}`;
}

export type ReplyMailFields = {
  code: string;
  number: number;
  origin: string;
  subject: string;
  body: string;
  priority: 'p1' | 'p2' | 'p3';
  categoryLabel: string;
  requesterEmail: string;
  requesterName: string | null;
  createdAt: Date;
};

export function replySubject(code: string, mailSubject: string): string {
  const id = code.trim() || '—';
  const clip = mailSubject.trim().slice(0, 50);
  const tail = clip === '' ? '' : ` (${clip})`;
  return `KMBHelp Ticket "${id}"${tail}`.slice(0, 200);
}

export function replyText(fields: ReplyMailFields): string {
  const id = fields.code.trim() || String(fields.number);
  const who = fields.requesterName?.trim()
    ? `${fields.requesterName.trim()} <${fields.requesterEmail}>`
    : fields.requesterEmail;
  return [
    'Hallo,',
    '',
    'Sie haben dem helpdesk ein Email geschrieben dass von dieser KI gesteuerten App in ein IT Ticket unter https://helpdesk.kmbcloud.at eingetragen wurde.',
    '',
    'mit freundlichen Grüßen Ihr KMB Helpdesk',
    '',
    `Ticket ID: ${id}`,
    `Ticket Link: ${ticketLink(fields.number, fields.origin)}`,
    `Datum: ${formatReplyDate(fields.createdAt)}`,
    `Wichtigkeit: ${priorityLabelDe(fields.priority)}`,
    `Kategorie: ${fields.categoryLabel.trim() || '—'}`,
    `Absender: ${who}`,
    `Betreff: ${fields.subject.trim() || 'Ohne Betreff'}`,
    '',
    'Zusammenfassung des Tickets',
    fields.body.trim(),
  ].join('\n');
}

function priorityLabelDe(priority: 'p1' | 'p2' | 'p3'): string {
  if (priority === 'p1') return 'Sehr wichtig';
  if (priority === 'p2') return 'wichtig';
  return 'bei Gelegenheit';
}

function formatReplyDate(at: Date): string {
  const parts = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('day')}.${read('month')}.${read('year')} ${read('hour')}:${read('minute')}`;
}

export function reopenText(number: number, origin: string): string {
  return `Ticket ${number} ist wieder offen.\n\n${ticketLink(number, origin)}\n`;
}

export function calendarSubject(mailSubject: string): string {
  const subject = mailSubject.trim() || 'Ohne Betreff';
  return `Neues Ticket ${subject}`.slice(0, 200);
}

export function calendarBody(
  number: number,
  origin: string,
  fromName: string,
  fromEmail: string,
  mailSubject: string,
  mailBody: string,
): string {
  const who = fromName.trim() ? `${fromName.trim()} <${fromEmail}>` : fromEmail;
  return `Link: ${origin}${staffTicketPath}/${number}\n\nVon: ${who}\nBetreff: ${mailSubject}\n\n${mailBody}`;
}

export function firstFreeSlot(
  start: Date,
  lengthMinutes: number,
  busy: readonly BusyWindow[],
): TimeSlot | null {
  const step = 30 * 60 * 1000;
  const duration = Math.max(15, lengthMinutes) * 60 * 1000;
  let startMs = start.getTime();
  const windows = busy
    .map((window) => ({ start: Date.parse(window.start), end: Date.parse(window.end) }))
    .filter((window) => Number.isFinite(window.start) && Number.isFinite(window.end));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const endMs = startMs + duration;
    const overlaps = windows.some((window) => startMs < window.end && endMs > window.start);
    if (!overlaps) {
      return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
    }
    startMs += step;
  }
  return null;
}

export function pickAssignee(
  candidates: readonly MailCandidate[],
  busyByEmail: ReadonlyMap<string, readonly BusyWindow[] | null>,
  start: Date,
  lengthMinutes: number,
): { id: string; email: string; slot: TimeSlot | null } | null {
  const ordered = [...candidates].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, 'de'),
  );
  for (const person of ordered) {
    if (!busyByEmail.has(person.email)) continue;
    const busy = busyByEmail.get(person.email);
    if (busy === null) return { id: person.id, email: person.email, slot: null };
    const slot = firstFreeSlot(start, lengthMinutes, busy ?? []);
    if (slot) return { id: person.id, email: person.email, slot };
  }
  return null;
}
