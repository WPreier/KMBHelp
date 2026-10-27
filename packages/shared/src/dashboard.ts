import { z } from 'zod';
import { BUSINESS_TIME_ZONE, calendarDate } from './domain.js';

export const dashboardRanges = ['day', 'week', 'month', 'quarter', 'year'] as const;

export type DashboardRange = (typeof dashboardRanges)[number];

export const dashboardQuerySchema = z.object({
  range: z.enum(dashboardRanges).default('month'),
});

export const pieSliceKeys = ['mail', 'web', 'done', 'p1', 'p2', 'p3'] as const;

export type PieSliceKey = (typeof pieSliceKeys)[number];

const remoteOverrunSchema = z.object({
  number: z.number().int(),
  subject: z.string(),
  status: z.string(),
  priority: z.enum(['p1', 'p2', 'p3']),
  categoryCode: z.string(),
  categoryLabelDe: z.string(),
  categoryLabelEn: z.string(),
  windowStart: z.string().nullable(),
  windowEnd: z.string(),
  supplierName: z.string(),
  accountName: z.string().nullable(),
});

export const dashboardSchema = z.object({
  range: z.enum(dashboardRanges),
  scope: z.enum(['own', 'firm']),
  from: z.string(),
  to: z.string(),
  incoming: z.number().int(),
  closed: z.number().int(),
  openP1: z.number().int(),
  medianFirstResponseMinutes: z.number().int().nullable(),
  medianResolutionMinutes: z.number().int().nullable(),
  effortMinutes: z.number().int(),
  slices: z.array(
    z.object({
      key: z.enum(pieSliceKeys),
      count: z.number().int().nonnegative(),
      percent: z.number().int().min(0).max(100),
    }),
  ),
  remoteOverruns: z.array(remoteOverrunSchema),
});

export type DashboardReport = z.infer<typeof dashboardSchema>;

const reactionKinds = new Set(['assigned', 'reply', 'closed', 'priority_changed']);

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zoneParts(date: Date, timeZone: string): ZoneParts {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((part) => part.type === type)?.value ?? '0');
  const hour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
    second: read('second'),
  };
}

export function zonedDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  timeZone = BUSINESS_TIME_ZONE,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const date = new Date(utc);
    const parts = zoneParts(date, timeZone);
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    if (seen === wanted) return date;
    utc += wanted - seen;
  }
  return new Date(utc);
}

function shiftDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekdayMondayIndex(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name);
  return index < 0 ? 0 : index;
}

export function periodBounds(
  range: DashboardRange,
  now: Date,
  timeZone = BUSINESS_TIME_ZONE,
): { from: Date; to: Date } {
  const today = calendarDate(now, timeZone);
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  if (range === 'day') return { from: zonedDateTime(year, month, day, 0, 0, timeZone), to: now };
  if (range === 'week') {
    const index = weekdayMondayIndex(zonedDateTime(year, month, day, 12, 0, timeZone), timeZone);
    const monday = shiftDate(today, -index);
    const [mondayYear, mondayMonth, mondayDay] = monday.split('-').map(Number) as [number, number, number];
    return { from: zonedDateTime(mondayYear, mondayMonth, mondayDay, 0, 0, timeZone), to: now };
  }
  if (range === 'month') return { from: zonedDateTime(year, month, 1, 0, 0, timeZone), to: now };
  if (range === 'quarter') {
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return { from: zonedDateTime(year, quarterMonth, 1, 0, 0, timeZone), to: now };
  }
  return { from: zonedDateTime(year, 1, 1, 0, 0, timeZone), to: now };
}

export function medianMinutes(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return Math.round(raw);
}

export type DashboardTicket = {
  id: string;
  number: number;
  createdAt: Date;
  closedAt: Date | null;
  priority: string;
  status: string;
  source: string;
  assignedStaffId: string | null;
  effortMinutes: number | null;
};

export type DashboardEvent = { ticketId: string; kind: string; at: Date };

export type RemoteOverrun = {
  number: number;
  subject: string;
  status: string;
  priority: 'p1' | 'p2' | 'p3';
  categoryCode: string;
  categoryLabelDe: string;
  categoryLabelEn: string;
  windowStart: Date | null;
  windowEnd: Date;
  supplierName: string;
  accountName: string | null;
  assignedStaffId: string | null;
};

export function pieSliceKey(
  ticket: { status: string; source: string; priority: string; closedAt: Date | null },
  from: Date,
  to: Date,
): PieSliceKey | null {
  if (ticket.status === 'closed') {
    if (!ticket.closedAt || !inPeriod(ticket.closedAt, from, to)) return null;
    return 'done';
  }
  if (ticket.source === 'mail') return 'mail';
  if (ticket.source === 'web' || ticket.source === 'app') return 'web';
  if (ticket.priority === 'p1') return 'p1';
  if (ticket.priority === 'p2') return 'p2';
  return 'p3';
}

function sharePercents(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((count) => (count * 100) / total);
  const floors = exact.map((value) => Math.floor(value));
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((leftItem, rightItem) => rightItem.fraction - leftItem.fraction || leftItem.index - rightItem.index);
  for (const item of order) {
    if (left <= 0) break;
    const current = floors[item.index] ?? 0;
    floors[item.index] = current + 1;
    left -= 1;
  }
  return floors;
}

function inPeriod(at: Date, from: Date, to: Date): boolean {
  return at.getTime() >= from.getTime() && at.getTime() <= to.getTime();
}

export function buildDashboard(input: {
  range: DashboardRange;
  now: Date;
  staffId: string | null;
  tickets: readonly DashboardTicket[];
  events: readonly DashboardEvent[];
  overruns: readonly RemoteOverrun[];
}): DashboardReport {
  const bounds = periodBounds(input.range, input.now);
  const own = input.staffId;
  const tickets = input.tickets.filter((ticket) => own === null || ticket.assignedStaffId === own);
  const ids = new Set(tickets.map((ticket) => ticket.id));
  const firstResponse = new Map<string, Date>();
  for (const event of input.events) {
    if (!ids.has(event.ticketId) || !reactionKinds.has(event.kind)) continue;
    const current = firstResponse.get(event.ticketId);
    if (!current || event.at < current) firstResponse.set(event.ticketId, event.at);
  }
  const responseMinutes: number[] = [];
  const resolutionMinutes: number[] = [];
  let incoming = 0;
  let closed = 0;
  let openP1 = 0;
  let effortMinutes = 0;
  for (const ticket of tickets) {
    if (inPeriod(ticket.createdAt, bounds.from, bounds.to)) {
      incoming += 1;
      const reaction = firstResponse.get(ticket.id);
      if (reaction && reaction >= ticket.createdAt) {
        responseMinutes.push((reaction.getTime() - ticket.createdAt.getTime()) / 60_000);
      }
    }
    if (ticket.closedAt && inPeriod(ticket.closedAt, bounds.from, bounds.to)) {
      closed += 1;
      resolutionMinutes.push((ticket.closedAt.getTime() - ticket.createdAt.getTime()) / 60_000);
      effortMinutes += ticket.effortMinutes ?? 0;
    }
    if (ticket.priority === 'p1' && ticket.status !== 'closed') openP1 += 1;
  }
  const counts = new Map<PieSliceKey, number>(pieSliceKeys.map((key) => [key, 0]));
  for (const ticket of tickets) {
    const key = pieSliceKey(ticket, bounds.from, bounds.to);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const countList = pieSliceKeys.map((key) => counts.get(key) ?? 0);
  const percents = sharePercents(countList);
  const slices = pieSliceKeys.map((key, index) => ({
    key,
    count: countList[index] ?? 0,
    percent: percents[index] ?? 0,
  }));
  const remoteOverruns = input.overruns
    .filter((row) => own === null || row.assignedStaffId === own)
    .slice(0, 20)
    .map((row) => ({
      number: row.number,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      categoryCode: row.categoryCode,
      categoryLabelDe: row.categoryLabelDe,
      categoryLabelEn: row.categoryLabelEn,
      windowStart: row.windowStart ? row.windowStart.toISOString() : null,
      windowEnd: row.windowEnd.toISOString(),
      supplierName: row.supplierName,
      accountName: row.accountName,
    }));
  return dashboardSchema.parse({
    range: input.range,
    scope: own === null ? 'firm' : 'own',
    from: bounds.from.toISOString(),
    to: bounds.to.toISOString(),
    incoming,
    closed,
    openP1,
    medianFirstResponseMinutes: medianMinutes(responseMinutes),
    medianResolutionMinutes: medianMinutes(resolutionMinutes),
    effortMinutes,
    slices,
    remoteOverruns,
  });
}
