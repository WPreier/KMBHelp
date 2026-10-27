import { describe, expect, it } from 'vitest';
import { localhostSkipsSignIn } from './auth.js';
import { ldapFilterEscape } from './directory.js';
import { ipAllowed, withDevelopmentLoopback } from './network.js';
import { decodeBase32, encodeBase32, randomTotpSecret, totpCode, totpMatches } from './totp.js';

describe('phase 3 helpers', () => {
  it('accepts the current one-time code and keeps the secret reversible', () => {
    const secret = randomTotpSecret();
    const at = Date.parse('2026-10-26T18:00:00.000Z');
    expect(totpMatches(secret, totpCode(secret, at), at)).toBe(true);
    expect(totpMatches(secret, '000000', at)).toBe(totpCode(secret, at) === '000000');
    expect(decodeBase32(encodeBase32(secret)).equals(secret)).toBe(true);
  });

  it('allows only listed admin addresses', () => {
    expect(ipAllowed('127.0.0.1', '127.0.0.1/32')).toBe(true);
    expect(ipAllowed('::ffff:127.0.0.1', '127.0.0.1/32')).toBe(true);
    expect(ipAllowed('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipAllowed('192.168.1.4', '10.0.0.0/8')).toBe(false);
    expect(ipAllowed('127.0.0.1', '')).toBe(false);
    const office = '192.168.36.0/24,192.168.191.0/24';
    expect(ipAllowed('192.168.36.20', office)).toBe(true);
    expect(ipAllowed('192.168.191.4', office)).toBe(true);
    expect(ipAllowed('127.0.0.1', office)).toBe(false);
    expect(ipAllowed('127.0.0.1', '127.0.0.0/8')).toBe(true);
    expect(ipAllowed('127.255.0.2', '127.0.0.0/8')).toBe(true);
    expect(ipAllowed('192.168.36.1', '127.0.0.0/8')).toBe(false);
    const development = withDevelopmentLoopback(office, true);
    expect(ipAllowed('127.0.0.1', development)).toBe(true);
    expect(ipAllowed('192.168.36.20', development)).toBe(true);
    expect(withDevelopmentLoopback(office, false)).toBe(office);
    expect(withDevelopmentLoopback(`${office},127.0.0.0/8`, true)).toBe(`${office},127.0.0.0/8`);
    expect(localhostSkipsSignIn('127.0.0.1', '', { NODE_ENV: 'development' })).toBe(true);
    expect(localhostSkipsSignIn('127.8.0.1', '', {})).toBe(true);
    expect(localhostSkipsSignIn('192.168.36.20', '', { NODE_ENV: 'development' })).toBe(false);
    expect(localhostSkipsSignIn('127.0.0.1', '192.168.36.20', { NODE_ENV: 'development' })).toBe(
      false,
    );
    expect(localhostSkipsSignIn('10.0.0.1', '127.0.0.1', { NODE_ENV: 'development' })).toBe(false);
    expect(localhostSkipsSignIn('127.0.0.1', '127.0.0.2', { NODE_ENV: 'production' })).toBe(true);
    expect(localhostSkipsSignIn('127.0.0.1', '', { NODE_ENV: 'production' })).toBe(false);
    expect(localhostSkipsSignIn('127.0.0.1', '', { NODE_ENV: 'test' })).toBe(false);
  });

  it('escapes ldap filter characters', () => {
    expect(ldapFilterEscape('a*b(c)')).toBe('a\\2ab\\28c\\29');
  });
});
