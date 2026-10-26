import type { messages } from '@kmbhelp/shared';
import type { PriorityReason } from '@kmbhelp/shared';

type Copy = { [Key in keyof (typeof messages)['de']]: string };

export function formatAge(seconds: number, copy: Copy): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} ${copy.minutes}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${copy.hours}`;
  return `${Math.floor(hours / 24)} ${copy.days}`;
}

export function statusLabel(status: string, copy: Copy): string {
  if (status === 'open') return copy.statusOpen;
  if (status === 'in_progress') return copy.statusInProgress;
  if (status === 'waiting_approval') return copy.statusWaiting;
  if (status === 'manual') return copy.statusManual;
  if (status === 'closed') return copy.statusClosed;
  return status;
}

export function reasonLabel(reason: PriorityReason, copy: Copy): string {
  if (reason === 'deadline_today_or_overdue') return copy.reasonDeadlineToday;
  if (reason === 'deadline_later') return copy.reasonDeadlineLater;
  if (reason === 'impact_without_date') return copy.reasonImpactWithoutDate;
  if (reason === 'single_workplace') return copy.reasonWorkplace;
  return copy.reasonCosmetic;
}
