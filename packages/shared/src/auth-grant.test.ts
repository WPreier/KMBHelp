import { describe, expect, it } from 'vitest';
import { authDomains, emailDomainAllowed, grantIsStale } from './auth-grant.js';

describe('auth domains', () => {
  it('uses the firm domains when the setting is empty', () => {
    const domains = authDomains('  ');
    expect(emailDomainAllowed('a@kmbcloud.at', domains)).toBe(true);
    expect(emailDomainAllowed('a@kmb-steuerberatung.at', domains)).toBe(true);
    expect(emailDomainAllowed('a@krottendorfer.com', domains)).toBe(true);
    expect(emailDomainAllowed('a@ght.at', domains)).toBe(true);
    expect(emailDomainAllowed('a@example.com', domains)).toBe(false);
  });

  it('renews a grant once it is a day old', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    expect(grantIsStale(new Date('2026-11-07T11:00:00Z'), now)).toBe(false);
    expect(grantIsStale(new Date('2026-11-06T12:00:00Z'), now)).toBe(true);
  });
});
