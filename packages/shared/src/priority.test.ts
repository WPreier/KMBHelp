import { describe, expect, it } from 'vitest';
import { calendarDate } from './domain.js';
import { resolvePriority } from './priority.js';

describe('resolvePriority', () => {
  it('forces P1 for payroll due today even when the client sends P3', () => {
    expect(
      resolvePriority({
        impact: 'payroll',
        dueOn: '2026-10-26',
        today: '2026-10-26',
        clientPriority: 'p3',
      }),
    ).toEqual({ priority: 'p1', reason: 'deadline_today_or_overdue' });
  });

  it('forces P1 for a filing that is already overdue', () => {
    expect(
      resolvePriority({
        impact: 'filing',
        dueOn: '2026-10-25',
        today: '2026-10-26',
        clientPriority: 'p3',
      }).priority,
    ).toBe('p1');
  });

  it('keeps a later payroll deadline at P2', () => {
    expect(
      resolvePriority({
        impact: 'payroll',
        dueOn: '2026-10-27',
        today: '2026-10-26',
        clientPriority: 'p1',
      }),
    ).toEqual({ priority: 'p2', reason: 'deadline_later' });
  });

  it('does not treat a workplace or a cosmetic request as P1 because of the tone', () => {
    expect(
      resolvePriority({
        impact: 'workplace',
        dueOn: '2026-10-03',
        today: '2026-10-26',
        clientPriority: 'p1',
      }),
    ).toEqual({ priority: 'p2', reason: 'single_workplace' });
    expect(
      resolvePriority({
        impact: 'cosmetic',
        today: '2026-10-26',
        clientPriority: 'p1',
      }),
    ).toEqual({ priority: 'p3', reason: 'no_deadline' });
  });

  it('rejects a date that is not a calendar day', () => {
    expect(() =>
      resolvePriority({ impact: 'payroll', dueOn: 'today', today: '2026-10-26' }),
    ).toThrow('dueOn');
  });
});

describe('calendarDate', () => {
  it('uses the Vienna calendar day', () => {
    expect(calendarDate(new Date('2026-01-15T23:30:00.000Z'))).toBe('2026-01-16');
  });
});
