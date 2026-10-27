import { describe, expect, it } from 'vitest';
import { defaultWorkerSchedule } from '@kmbhelp/shared';
import { parseWorkerSchedule, shouldPollGraph } from './worker-schedule.js';

describe('worker schedule', () => {
  it('keeps the office windows and pauses at lunch', () => {
    const windows = parseWorkerSchedule(defaultWorkerSchedule);
    expect(windows?.map((window) => window.everyMinutes)).toEqual([30, 10, 0, 10, 30]);
    const night = new Date('2026-10-27T01:00:00.000Z');
    const first = shouldPollGraph(night, '+01:00', defaultWorkerSchedule, null);
    expect(first.poll).toBe(true);
    const again = shouldPollGraph(night, '+01:00', defaultWorkerSchedule, first.slot);
    expect(again.poll).toBe(false);
    const lunch = new Date('2026-10-27T11:10:00.000Z');
    expect(shouldPollGraph(lunch, '+01:00', defaultWorkerSchedule, null).poll).toBe(false);
    const afternoon = new Date('2026-10-27T11:30:00.000Z');
    expect(shouldPollGraph(afternoon, '+01:00', defaultWorkerSchedule, null).poll).toBe(true);
  });
});
