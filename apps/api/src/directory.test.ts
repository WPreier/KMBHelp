import { describe, expect, it } from 'vitest';
import { directoryCertificate } from './directory.js';
import { safeErrorText } from './http.js';

describe('directory certificate', () => {
  it('reads certificate text from the file field instead of opening it as a path', () => {
    expect(() =>
      directoryCertificate({
        caFile: '-----BEGIN CERTIFICATE-----\nnot a path\n-----END CERTIFICATE-----',
      }),
    ).toThrow(/certificate|UNABLE|error|invalid/iu);
    try {
      directoryCertificate({
        caFile: '-----BEGIN CERTIFICATE-----\nnot a path\n-----END CERTIFICATE-----',
      });
    } catch (error) {
      expect(safeErrorText(error)).not.toContain('ENOENT');
      expect(safeErrorText(error)).not.toContain('BEGIN CERTIFICATE');
    }
  });
});

describe('safeErrorText', () => {
  it('drops certificates, database urls and passwords', () => {
    const error = new Error(
      "ENOENT open '-----BEGIN CERTIFICATE-----\nSECRET\n-----END CERTIFICATE-----' postgresql://user:secret@127.0.0.1/kmbhelp password=hidden",
    );
    const text = safeErrorText(error);
    expect(text).toContain('[certificate]');
    expect(text).toContain('[database]');
    expect(text).toContain('password=[redacted]');
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('hidden');
  });
});
