import { describe, expect, it } from 'vitest';
import { digestDue, digestEnabled, digestHour, digestMessage } from './notice-digest.js';

describe('notice digest', () => {
  it('waits until the local hour and sends once that day', () => {
    const before = digestDue(new Date('2026-11-03T05:30:00Z'), '+01:00', null, 7);
    expect(before).toEqual({ due: false, date: '2026-11-03' });
    const first = digestDue(new Date('2026-11-03T06:00:00Z'), '+01:00', null, 7);
    expect(first).toEqual({ due: true, date: '2026-11-03' });
    const again = digestDue(new Date('2026-11-03T15:00:00Z'), '+01:00', '2026-11-03', 7);
    expect(again.due).toBe(false);
  });

  it('lists warnings and errors and skips a quiet day', () => {
    expect(
      digestMessage(
        [{ status: 'informational', code: 'ai.not_configured', textDe: 'Kein Endpunkt.' }],
        '2026-11-03',
      ),
    ).toBeNull();
    const message = digestMessage(
      [
        { status: 'ok', code: 'smtp', textDe: 'Postfix antwortet.' },
        { status: 'warning', code: 'smtp.unreachable', textDe: 'Postfix antwortet nicht.' },
        { status: 'error', code: 'database.unreachable', textDe: 'Die Datenbank fehlt.' },
      ],
      '2026-11-03',
    );
    expect(message?.subject).toBe('KMBHelp: offene Warnungen');
    expect(message?.text).toContain('- smtp.unreachable: Postfix antwortet nicht.');
    expect(message?.text).toContain('- database.unreachable: Die Datenbank fehlt.');
    expect(message?.text).not.toContain('- smtp:');
  });

  it('runs in production and stays quiet on a workstation unless asked', () => {
    expect(digestEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(digestEnabled({ NODE_ENV: 'production', MAIL_NOTICE_DIGEST: 'off' })).toBe(false);
    expect(digestEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(digestEnabled({ NODE_ENV: 'development', MAIL_NOTICE_DIGEST: 'on' })).toBe(true);
    expect(digestHour('7')).toBe(7);
    expect(digestHour('')).toBe(7);
    expect(digestHour('24')).toBe(7);
  });
});
