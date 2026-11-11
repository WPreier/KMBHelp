import tls from 'node:tls';
import type { Localized } from '../src/types';

export type CertificateFacts = {
  validFrom: string;
  validTo: string;
  subjectCn: string;
  sanDns: string[];
  identityError: string | null;
  authorizationError: string | null;
};

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseSan(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('DNS:'))
    .map((part) => part.slice(4));
}

function isHostnameError(message: string): boolean {
  return /hostname|altname|does not match certificate/i.test(message);
}

export function evaluateCertificate(
  facts: CertificateFacts,
  host: string,
  now: Date,
): { ok: boolean; reasons: Localized[] } {
  const reasons: Localized[] = [];
  const from = new Date(facts.validFrom);
  const to = new Date(facts.validTo);
  const datesOk = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && now >= from && now <= to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    reasons.push({
      de: 'Die Gültigkeitsdaten des Zertifikats sind nicht lesbar.',
      en: 'The certificate validity dates are unreadable.',
    });
  } else if (now < from) {
    reasons.push({
      de: `Das Zertifikat ist noch nicht gültig (ab ${iso(from)}).`,
      en: `The certificate is not valid yet (from ${iso(from)}).`,
    });
  } else if (now > to) {
    reasons.push({
      de: `Das Zertifikat ist abgelaufen (bis ${iso(to)}).`,
      en: `The certificate has expired (until ${iso(to)}).`,
    });
  }

  const presented = `CN=${facts.subjectCn || '—'}${facts.sanDns.length ? `, SAN: ${facts.sanDns.join(', ')}` : ''}`;
  const window = datesOk ? `Zeitlich gültig von ${iso(from)} bis ${iso(to)}. ` : '';
  const windowEn = datesOk ? `Valid from ${iso(from)} until ${iso(to)}. ` : '';
  if (facts.identityError || (facts.authorizationError && isHostnameError(facts.authorizationError))) {
    const detail = facts.identityError ?? facts.authorizationError ?? '';
    reasons.push({
      de: `${window}Der Hostname passt nicht. Erwartet: ${host}. Ausgestellt für ${presented}. ${detail}`,
      en: `${windowEn}The hostname does not match. Expected: ${host}. Issued for ${presented}. ${detail}`,
    });
  }
  if (facts.authorizationError && !isHostnameError(facts.authorizationError)) {
    reasons.push({
      de: `Die Zertifikatskette ist nicht vertrauenswürdig: ${facts.authorizationError}`,
      en: `The certificate chain is not trusted: ${facts.authorizationError}`,
    });
  }

  return { ok: reasons.length === 0, reasons };
}

export function readCertificate(host: string): Promise<CertificateFacts> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          socket.end();
          reject(new Error('The server presented no certificate.'));
          return;
        }
        const identity = tls.checkServerIdentity(host, cert);
        const authorization = socket.authorizationError;
        const commonName = cert.subject?.CN;
        resolve({
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          subjectCn: Array.isArray(commonName) ? (commonName[0] ?? '') : (commonName ?? ''),
          sanDns: parseSan(cert.subjectaltname),
          identityError: identity ? identity.message : null,
          authorizationError: authorization ? String(authorization) : null,
        });
        socket.end();
      },
    );
    socket.setTimeout(10000, () => {
      socket.destroy(new Error('timeout'));
    });
    socket.on('error', (error) => {
      reject(error instanceof Error ? error : new Error('certificate connection failed'));
    });
  });
}
