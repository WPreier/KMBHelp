import { describe, expect, it } from 'vitest';
import { allowedTicketFile, formatTicketCode, isTicketCode } from './ticket-code.js';

describe('ticket codes', () => {
  it('starts each year at the two-digit year and four digits', () => {
    expect(formatTicketCode(2026, 1)).toBe('26-0001');
    expect(formatTicketCode(2026, 91)).toBe('26-0091');
    expect(formatTicketCode(2027, 9999)).toBe('27-9999');
    expect(isTicketCode('26-0091')).toBe(true);
    expect(isTicketCode('26-91')).toBe(false);
  });

  it('stops at 9999 in one year', () => {
    expect(() => formatTicketCode(2026, 10000)).toThrow('ticket code range');
  });

  it('accepts images, office files, pdf and plain tables', () => {
    expect(allowedTicketFile('bild.PNG')).toBe(true);
    expect(allowedTicketFile('liste.xlsx')).toBe(true);
    expect(allowedTicketFile('notiz.md')).toBe(true);
    expect(allowedTicketFile('makro.exe')).toBe(false);
    expect(allowedTicketFile('seite.html')).toBe(false);
  });
});