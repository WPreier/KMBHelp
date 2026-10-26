import { describe, expect, it } from 'vitest';
import { displayDateToIso, isoDateToDisplay } from './dates.js';

describe('display dates', () => {
  it('converts dd.MM.yyyy and rejects a day that does not exist', () => {
    expect(displayDateToIso('26.10.2026')).toBe('2026-10-26');
    expect(displayDateToIso('31.02.2026')).toBeNull();
    expect(displayDateToIso('2026-10-26')).toBeNull();
    expect(isoDateToDisplay('2026-10-26')).toBe('26.10.2026');
  });
});
