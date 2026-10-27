import { describe, expect, it } from 'vitest';
import { buildDashboard, medianMinutes, periodBounds } from './dashboard.js';

describe('dashboard periods', () => {
  it('uses the Vienna calendar for winter and summer', () => {
    const winter = periodBounds('day', new Date('2026-01-15T10:00:00.000Z'));
    expect(winter.from.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    const summer = periodBounds('day', new Date('2026-07-15T10:00:00.000Z'));
    expect(summer.from.toISOString()).toBe('2026-07-14T22:00:00.000Z');
    const week = periodBounds('week', new Date('2026-10-27T20:00:00.000Z'));
    expect(week.from.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    const quarter = periodBounds('quarter', new Date('2026-11-02T10:00:00.000Z'));
    expect(quarter.from.toISOString()).toBe('2026-09-30T22:00:00.000Z');
  });

  it('keeps an agent on assigned tickets and a lead on the firm', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');
    const tickets = [
      {
        id: 'a',
        number: 1,
        createdAt: new Date('2026-10-27T08:00:00.000Z'),
        closedAt: new Date('2026-10-27T09:00:00.000Z'),
        priority: 'p1',
        status: 'closed',
        source: 'mail',
        assignedStaffId: 'ada',
        effortMinutes: 40,
      },
      {
        id: 'b',
        number: 2,
        createdAt: new Date('2026-10-27T08:30:00.000Z'),
        closedAt: null,
        priority: 'p1',
        status: 'open',
        source: 'phone',
        assignedStaffId: 'bea',
        effortMinutes: null,
      },
    ];
    const events = [
      { ticketId: 'a', kind: 'assigned', at: new Date('2026-10-27T08:20:00.000Z') },
      { ticketId: 'a', kind: 'created', at: new Date('2026-10-27T08:00:00.000Z') },
    ];
    const overrun = {
      number: 9,
      subject: 'Fernwartung',
      status: 'open',
      priority: 'p1' as const,
      categoryCode: 'printer',
      categoryLabelDe: 'Drucker',
      categoryLabelEn: 'Printer',
      windowStart: new Date('2026-10-27T06:00:00.000Z'),
      windowEnd: new Date('2026-10-27T07:00:00.000Z'),
      supplierName: 'Fernwartung GmbH',
      accountName: 'kmb-support',
      assignedStaffId: 'bea',
    };
    const own = buildDashboard({
      range: 'day',
      now,
      staffId: 'ada',
      tickets,
      events,
      overruns: [overrun],
    });
    expect(own.scope).toBe('own');
    expect(own.incoming).toBe(1);
    expect(own.closed).toBe(1);
    expect(own.openP1).toBe(0);
    expect(own.effortMinutes).toBe(40);
    expect(own.medianFirstResponseMinutes).toBe(20);
    expect(own.medianResolutionMinutes).toBe(60);
    expect(own.remoteOverruns).toEqual([]);
    expect(own.slices.find((slice) => slice.key === 'done')).toEqual({ key: 'done', count: 1, percent: 100 });
    expect(own.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
    const firm = buildDashboard({
      range: 'day',
      now,
      staffId: null,
      tickets,
      events,
      overruns: [overrun],
    });
    expect(firm.incoming).toBe(2);
    expect(firm.openP1).toBe(1);
    expect(firm.remoteOverruns).toEqual([
      {
        number: 9,
        subject: 'Fernwartung',
        status: 'open',
        priority: 'p1',
        categoryCode: 'printer',
        categoryLabelDe: 'Drucker',
        categoryLabelEn: 'Printer',
        windowStart: '2026-10-27T06:00:00.000Z',
        windowEnd: '2026-10-27T07:00:00.000Z',
        supplierName: 'Fernwartung GmbH',
        accountName: 'kmb-support',
      },
    ]);
    expect(firm.slices.find((slice) => slice.key === 'done')?.count).toBe(1);
    expect(firm.slices.find((slice) => slice.key === 'p1')?.count).toBe(1);
    expect(firm.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
    expect(medianMinutes([])).toBeNull();
  });
});
