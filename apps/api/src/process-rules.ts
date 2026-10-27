export type FreezeWindow = {
  active: boolean;
  dayOfMonthFrom: number | null;
  dayOfMonthTo: number | null;
  weekdaysOnly: boolean;
  onDate: string | null;
};

export type ProcurementRoute = 'direct' | 'token' | 'manual';

export const offboardingSteps = [
  'ad_m365',
  'vpn',
  'practice_software',
  'portals',
  'finanzonline_user',
  'mail_forwarding',
  'notebook',
  'token',
  'smartcard',
] as const;

export const certificateReminderDays = [30, 7] as const;
export const accessReviewDays = 180;
export const retentionReviewDays = 365;
export const backupFollowUpDays = 90;
export const supervisorTokenDays = 7;
export const defaultAccessLogDays = 90;

export function procurementRoute(
  amount: number,
  directBelow: number,
  tokenUntil: number,
): ProcurementRoute {
  if (amount < directBelow) return 'direct';
  if (amount <= tokenUntil) return 'token';
  return 'manual';
}

export function dateInFreeze(isoDate: string, windows: readonly FreezeWindow[]): boolean {
  const civil = civilDate(isoDate);
  if (!civil) return false;
  return windows.some((window) => {
    if (!window.active) return false;
    if (window.onDate && window.onDate === isoDate) return true;
    if (window.dayOfMonthFrom === null || window.dayOfMonthTo === null) return false;
    if (civil.day < window.dayOfMonthFrom || civil.day > window.dayOfMonthTo) return false;
    if (window.weekdaysOnly && (civil.weekday === 0 || civil.weekday === 6)) return false;
    return true;
  });
}

export function supplierCanSupport(input: {
  status: string;
  avvOn: string | null;
  confidentialityOn: string | null;
}): boolean {
  return input.status === 'approved' && Boolean(input.avvOn) && Boolean(input.confidentialityOn);
}

export function deadline72h(detectedAt: Date): Date {
  return new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000);
}

export function certificateBands(
  daysUntilExpiry: number,
): Array<(typeof certificateReminderDays)[number]> {
  return certificateReminderDays.filter((band) => daysUntilExpiry <= band);
}

export function reviewDue(lastOn: string | null, intervalDays: number, today: string): boolean {
  if (!lastOn) return true;
  const start = civilDate(lastOn);
  const end = civilDate(today);
  if (!start || !end) return false;
  const elapsed = Math.round((end.utc - start.utc) / 86_400_000);
  return elapsed >= intervalDays;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const civil = civilDate(isoDate);
  if (!civil) return isoDate;
  const next = new Date(civil.utc + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

export function daysUntil(expiresOn: string, today: string): number | null {
  const end = civilDate(expiresOn);
  const start = civilDate(today);
  if (!end || !start) return null;
  return Math.round((end.utc - start.utc) / 86_400_000);
}

function civilDate(isoDate: string): { day: number; weekday: number; utc: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, weekday: date.getUTCDay(), utc };
}
