import { describe, expect, it } from 'vitest';
import { containsPersonalData, maskPersonalData } from './mask.js';

const now = new Date('2026-10-27T00:00:00.000Z');

describe('maskPersonalData', () => {
  it('hides a social security number, an IBAN, a card and a birth date', () => {
    const masked = maskPersonalData(
      'SVNR 1234 010180, Konto AT61 1904 3002 3457 3201, Karte 4111 1111 1111 1111, geboren 01.01.1980.',
      now,
    );
    expect(masked).not.toContain('1234');
    expect(masked).not.toContain('AT61');
    expect(masked).not.toContain('4111');
    expect(masked).not.toContain('1980');
    expect(masked).toContain('[SVNR]');
    expect(masked).toContain('[IBAN]');
    expect(masked).toContain('[KARTE]');
    expect(masked).toContain('[GEBURTSDATUM]');
  });

  it('leaves a recent appointment date and an invalid number alone', () => {
    const text = 'Termin 27.10.2026, Nummer 1234990180.';
    expect(maskPersonalData(text, now)).toBe(text);
    expect(containsPersonalData(text, now)).toBe(false);
  });
});
