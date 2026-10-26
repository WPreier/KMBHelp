export const ticketTypes = [
  'incident',
  'request',
  'access',
  'remote_support',
  'change',
  'backup_test',
  'security_incident',
  'asset',
  'data_exchange',
  'retention',
  'supplier',
  'knowledge',
  'procurement',
] as const;

export type TicketType = (typeof ticketTypes)[number];

export const impacts = ['filing', 'payroll', 'workplace', 'cosmetic'] as const;

export type Impact = (typeof impacts)[number];

export const priorities = ['p1', 'p2', 'p3'] as const;

export type Priority = (typeof priorities)[number];

export const ticketSources = ['mail', 'web', 'app', 'phone', 'walkin', 'api'] as const;

export type TicketSource = (typeof ticketSources)[number];

export const ticketStatuses = [
  'open',
  'in_progress',
  'waiting_approval',
  'manual',
  'closed',
] as const;

export type TicketStatus = (typeof ticketStatuses)[number];

export const staffRoles = ['agent', 'lead', 'admin'] as const;

export type StaffRole = (typeof staffRoles)[number];

export type ChecklistItem = {
  code: string;
  labelDe: string;
  labelEn: string;
};

export const BUSINESS_TIME_ZONE = 'Europe/Vienna';

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function calendarDate(now: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (!calendarDatePattern.test(formatted)) {
    throw new Error('calendar date could not be formatted');
  }
  return formatted;
}
