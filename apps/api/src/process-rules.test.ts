import { describe, expect, it } from 'vitest';
import {
  certificateBands,
  dateInFreeze,
  deadline72h,
  procurementRoute,
  reviewDue,
  supplierCanSupport,
} from './process-rules.js';

const payrollWindow = {
  active: true,
  dayOfMonthFrom: 1,
  dayOfMonthTo: 5,
  weekdaysOnly: true,
  onDate: null,
};

describe('process rules', () => {
  it('routes procurement by the configured limits', () => {
    expect(procurementRoute(99.99, 100, 500)).toBe('direct');
    expect(procurementRoute(100, 100, 500)).toBe('token');
    expect(procurementRoute(500, 100, 500)).toBe('token');
    expect(procurementRoute(500.01, 100, 500)).toBe('manual');
  });

  it('blocks a weekday inside the payroll freeze and allows a Sunday on the first', () => {
    expect(dateInFreeze('2026-03-02', [payrollWindow])).toBe(true);
    expect(dateInFreeze('2026-03-01', [payrollWindow])).toBe(false);
    expect(dateInFreeze('2026-03-08', [payrollWindow])).toBe(false);
    expect(
      dateInFreeze('2026-03-08', [
        { ...payrollWindow, dayOfMonthFrom: null, dayOfMonthTo: null, onDate: '2026-03-08' },
      ]),
    ).toBe(true);
  });

  it('refuses remote support until both dates exist and the supplier is approved', () => {
    expect(
      supplierCanSupport({ status: 'draft', avvOn: '2026-01-01', confidentialityOn: '2026-01-01' }),
    ).toBe(false);
    expect(
      supplierCanSupport({ status: 'approved', avvOn: null, confidentialityOn: '2026-01-01' }),
    ).toBe(false);
    expect(
      supplierCanSupport({
        status: 'approved',
        avvOn: '2026-01-01',
        confidentialityOn: '2026-01-02',
      }),
    ).toBe(true);
  });

  it('sets the 72-hour deadline and both certificate reminders', () => {
    expect(deadline72h(new Date('2026-10-27T08:00:00.000Z')).toISOString()).toBe(
      '2026-10-30T08:00:00.000Z',
    );
    expect(certificateBands(31)).toEqual([]);
    expect(certificateBands(30)).toEqual([30]);
    expect(certificateBands(7)).toEqual([30, 7]);
    expect(certificateBands(-1)).toEqual([30, 7]);
  });

  it('opens a review when the last one is missing or older than the interval', () => {
    expect(reviewDue(null, 180, '2026-10-27')).toBe(true);
    expect(reviewDue('2026-10-01', 180, '2026-10-27')).toBe(false);
    expect(reviewDue('2026-01-01', 180, '2026-10-27')).toBe(true);
  });
});
