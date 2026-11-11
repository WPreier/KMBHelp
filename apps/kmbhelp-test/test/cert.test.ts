import { describe, expect, it } from 'vitest';
import { evaluateCertificate, parseSan, type CertificateFacts } from '../server/cert';
import { PUBLIC_HOSTNAME, PUBLIC_ORIGIN } from '../server/targets';

const host = PUBLIC_HOSTNAME;

function facts(overrides: Partial<CertificateFacts> = {}): CertificateFacts {
  return {
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    subjectCn: host,
    sanDns: [host],
    identityError: null,
    authorizationError: null,
    ...overrides,
  };
}

describe('certificate', () => {
  const now = new Date('2026-11-11T00:00:00.000Z');

  it('uses the public host kmbhelp, not the mistyped kmhhelp', () => {
    expect(PUBLIC_ORIGIN).toBe('https://kmbhelp.kmbcloud.at');
    expect(PUBLIC_HOSTNAME).toBe('kmbhelp.kmbcloud.at');
    expect(PUBLIC_ORIGIN.includes('kmhhelp')).toBe(false);
  });

  it('passes when the date window and hostname match', () => {
    const verdict = evaluateCertificate(facts(), host, now);
    expect(verdict.ok).toBe(true);
    expect(verdict.reasons).toHaveLength(0);
  });

  it('fails a current certificate when the hostname does not match', () => {
    const verdict = evaluateCertificate(
      facts({
        subjectCn: 'example.invalid',
        sanDns: ['*.example.invalid'],
        identityError: "Hostname does not match certificate's altnames",
      }),
      host,
      now,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.some((reason) => reason.de.includes('Hostname passt nicht'))).toBe(true);
    expect(verdict.reasons.some((reason) => reason.de.includes('Zeitlich gültig'))).toBe(true);
  });

  it('fails an expired certificate', () => {
    const verdict = evaluateCertificate(facts({ validTo: '2020-01-01T00:00:00.000Z' }), host, now);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.some((reason) => reason.de.includes('abgelaufen'))).toBe(true);
  });

  it('parses DNS names from a subject alternative name', () => {
    expect(parseSan('DNS:*.wmd.at, DNS:wmd.at')).toEqual(['*.wmd.at', 'wmd.at']);
  });
});
