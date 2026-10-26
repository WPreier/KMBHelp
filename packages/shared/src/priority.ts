import type { Impact, Priority } from './domain.js';

export type PriorityReason =
  | 'deadline_today_or_overdue'
  | 'deadline_later'
  | 'impact_without_date'
  | 'single_workplace'
  | 'no_deadline';

export type PriorityInput = {
  impact: Impact;
  dueOn?: string | null;
  today: string;
  clientPriority?: Priority | null;
};

export type PriorityDecision = {
  priority: Priority;
  reason: PriorityReason;
};

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function assertCalendarDate(value: string, label: string): void {
  if (!calendarDatePattern.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

export function resolvePriority(input: PriorityInput): PriorityDecision {
  assertCalendarDate(input.today, 'today');
  if (input.dueOn) assertCalendarDate(input.dueOn, 'dueOn');

  if (input.impact === 'filing' || input.impact === 'payroll') {
    if (!input.dueOn) return { priority: 'p2', reason: 'impact_without_date' };
    if (input.dueOn <= input.today) return { priority: 'p1', reason: 'deadline_today_or_overdue' };
    return { priority: 'p2', reason: 'deadline_later' };
  }
  if (input.impact === 'workplace') return { priority: 'p2', reason: 'single_workplace' };
  return { priority: 'p3', reason: 'no_deadline' };
}
