import { describe, expect, it } from 'vitest';
import { redact, scrubExcerpt } from '../server/redact';

describe('redaction', () => {
  it('removes a password from a message', () => {
    const message = redact('fill failed for example-not-real in the field', ['example-not-real']);
    expect(message).not.toContain('example-not-real');
    expect(message).toContain('[redacted]');
  });

  it('does not blank a message with a very short secret', () => {
    expect(redact('Anmeldung fehlgeschlagen', ['ab'])).toBe('Anmeldung fehlgeschlagen');
  });

  it('scrubs long numbers and mail addresses from excerpts', () => {
    const text = scrubExcerpt('Kontakt dev@example.com Nummer 1234567890');
    expect(text).not.toContain('dev@example.com');
    expect(text).not.toContain('1234567890');
  });
});
