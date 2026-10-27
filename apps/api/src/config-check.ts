import { createDatabase } from '@kmbhelp/db';
import { configField, describeConfig } from '@kmbhelp/shared';
import { directoryCertificate, ldapsConfigFromEnv, serviceBindWorks } from './directory.js';
import { ldapsHost, peerFingerprint, tcpOpen } from './probes.js';
import { formatSyslog, sendSyslog, syslogTarget } from './syslog.js';

type Check = {
  code: string;
  status: 'ok' | 'informational' | 'warning' | 'error';
  textDe: string;
  textEn: string;
};

function line(code: string, status: Check['status'], textDe: string, textEn: string): Check {
  return { code, status, textDe, textEn };
}

function withValue(
  env: NodeJS.ProcessEnv,
  key: string,
  value: string | undefined,
): NodeJS.ProcessEnv {
  if (value == null || value.trim() === '') return env;
  return { ...env, [key]: value };
}

export async function checkConfigField(
  env: NodeJS.ProcessEnv,
  key: string,
  candidate?: string,
): Promise<Check> {
  const field = configField(key);
  if (!field) {
    return line(key, 'warning', 'Dieses Feld ist unbekannt.', 'This field is unknown.');
  }
  const next = withValue(env, key, candidate);
  const value = (next[key] ?? '').trim();
  if (key === 'DATABASE_URL') {
    if (!value) return line(key, 'error', 'DATABASE_URL fehlt.', 'DATABASE_URL is missing.');
    const database = createDatabase(value);
    try {
      const version = await database.pool.query<{ server_version: string }>('show server_version');
      const server = version.rows[0]?.server_version ?? '';
      return line(
        key,
        'ok',
        `PostgreSQL antwortet, Version ${server}.`,
        `PostgreSQL answers, version ${server}.`,
      );
    } catch {
      return line(key, 'error', 'PostgreSQL antwortet nicht.', 'PostgreSQL does not answer.');
    } finally {
      await database.pool.end();
    }
  }
  if (key === 'SESSION_SECRET') {
    return value.length >= 16
      ? line(
          key,
          'ok',
          'Der Sitzungsschlüssel ist lang genug.',
          'The session secret is long enough.',
        )
      : line(
          key,
          'warning',
          'Der Sitzungsschlüssel fehlt oder ist kürzer als 16 Zeichen.',
          'The session secret is missing or shorter than 16 characters.',
        );
  }
  if (key === 'ALLOW_TEST_AUTH') {
    if (next.NODE_ENV === 'production' && value !== '') {
      return line(
        key,
        'error',
        'ALLOW_TEST_AUTH darf in Produktion nicht gesetzt sein.',
        'ALLOW_TEST_AUTH must not be set in production.',
      );
    }
    return line(
      key,
      'ok',
      'Die Test-Anmeldung ist so erlaubt.',
      'Test sign-in is allowed like this.',
    );
  }
  if (key === 'API_PORT') {
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port < 65536
      ? line(key, 'ok', `Port ${port} ist eine gültige Zahl.`, `Port ${port} is a valid number.`)
      : line(
          key,
          'warning',
          'Der API-Port ist keine gültige Zahl.',
          'The API port is not a valid number.',
        );
  }
  if (key === 'LDAPS_URL') {
    const target = ldapsHost(value || undefined);
    const open = await tcpOpen(target.host, target.port);
    return open === 'open'
      ? line(
          key,
          'ok',
          `${target.host}:${target.port} ist erreichbar.`,
          `${target.host}:${target.port} is reachable.`,
        )
      : line(
          key,
          'error',
          `${target.host}:${target.port} ist nicht erreichbar (${open}).`,
          `${target.host}:${target.port} is not reachable (${open}).`,
        );
  }
  if (
    key === 'LDAPS_BIND_PASSWORD' ||
    key === 'LDAPS_BIND_DN' ||
    key === 'LDAPS_GROUP_DN' ||
    key === 'LDAPS_BASE_DN'
  ) {
    const config = ldapsConfigFromEnv(next);
    if (!config) {
      return line(
        key,
        'warning',
        'LDAPS ist noch nicht vollständig. Url, Konto, Passwort, Basis und Gruppe werden gemeinsam gebraucht.',
        'LDAPS is not complete yet. Url, account, password, base and group are needed together.',
      );
    }
    if (key !== 'LDAPS_BIND_PASSWORD' && key !== 'LDAPS_BIND_DN') {
      return value
        ? line(key, 'ok', 'Der Wert ist gesetzt.', 'The value is set.')
        : line(key, 'warning', 'Der Wert fehlt.', 'The value is missing.');
    }
    const bound = await serviceBindWorks(config);
    return bound
      ? line(key, 'ok', 'Das Dienstkonto kann suchen.', 'The service account can search.')
      : line(
          key,
          'error',
          'Das Dienstkonto kann nicht suchen.',
          'The service account cannot search.',
        );
  }
  if (key === 'LDAPS_CA_PEM' || key === 'LDAPS_CA_FILE') {
    try {
      const certificate = directoryCertificate({
        caFile: next.LDAPS_CA_FILE,
        caPem: next.LDAPS_CA_PEM,
      });
      if (!certificate) {
        return line(
          key,
          'warning',
          'Es ist kein Zertifikat hinterlegt.',
          'No certificate is stored.',
        );
      }
      const days = Math.floor((new Date(certificate.validTo).getTime() - Date.now()) / 86_400_000);
      if (days < 0)
        return line(key, 'error', 'Das Zertifikat ist abgelaufen.', 'The certificate has expired.');
      const target = ldapsHost(next.LDAPS_URL);
      const peer = await peerFingerprint(target.host, target.port);
      if (peer && peer === certificate.fingerprint256) {
        return line(
          key,
          'ok',
          `Das Zertifikat gilt noch ${days} Tage und entspricht dem Server.`,
          `The certificate is valid for ${days} more days and matches the server.`,
        );
      }
      return line(
        key,
        days < 30 ? 'warning' : 'ok',
        `Das Zertifikat gilt noch ${days} Tage.`,
        `The certificate is valid for ${days} more days.`,
      );
    } catch {
      return line(
        key,
        'error',
        'Das Zertifikat lässt sich nicht lesen.',
        'The certificate cannot be read.',
      );
    }
  }
  if (key === 'SYSLOG_UTC_OFFSET' && value !== '' && !/^[+-](?:0\d|1[0-4]):[0-5]\d$/u.test(value)) {
    return line(
      key,
      'warning',
      'Die Abweichung hat die Form +01:00. Winterzeit der Kanzlei ist +01:00, Sommerzeit +02:00.',
      'The offset looks like +01:00. The firm’s winter time is +01:00, summer time is +02:00.',
    );
  }
  if (key.startsWith('SYSLOG_')) {
    const target = syslogTarget(next);
    try {
      await sendSyslog(
        target.host,
        target.port,
        formatSyslog('informational', 'KMBHelp syslog check', new Date(), target),
      );
      return line(
        key,
        'ok',
        `Das Datagramm wurde als ${target.appName} mit ${target.facility} an ${target.host}:${target.port} übergeben.`,
        `The datagram was handed to ${target.host}:${target.port} as ${target.appName} with ${target.facility}.`,
      );
    } catch {
      return line(
        key,
        'warning',
        `Das Datagramm an ${target.host}:${target.port} wurde nicht übergeben.`,
        `The datagram to ${target.host}:${target.port} was not handed over.`,
      );
    }
  }
  if (key === 'GRAPH_TENANT_ID' || key === 'GRAPH_CLIENT_ID' || key === 'GRAPH_CLIENT_SECRET') {
    const ready = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'].every(
      (name) => (next[name] ?? '').trim() !== '',
    );
    if (!ready) {
      return line(
        key,
        'warning',
        'Microsoft 365 ist nicht vollständig.',
        'Microsoft 365 is not complete.',
      );
    }
    const open = await tcpOpen('login.microsoftonline.com', 443);
    return open === 'open'
      ? line(
          key,
          'ok',
          'login.microsoftonline.com ist erreichbar.',
          'login.microsoftonline.com is reachable.',
        )
      : line(
          key,
          'error',
          'login.microsoftonline.com ist nicht erreichbar.',
          'login.microsoftonline.com is not reachable.',
        );
  }
  if (key === 'WEBAUTHN_RP_ID' || key === 'WEBAUTHN_ORIGIN') {
    const origin = (next.WEBAUTHN_ORIGIN ?? '').trim();
    const rpId = (next.WEBAUTHN_RP_ID ?? '').trim();
    if (!origin || !rpId) {
      return line(
        key,
        'ok',
        'Leer benutzt die Vorgabe: lokal 127.0.0.1, in Produktion helpdesk.kmbcloud.at.',
        'Empty uses the default: 127.0.0.1 locally, helpdesk.kmbcloud.at in production.',
      );
    }
    try {
      const host = new URL(origin).hostname;
      return host === rpId
        ? line(key, 'ok', 'WebAuthn-Host und Origin passen.', 'The WebAuthn host and origin match.')
        : line(
            key,
            'warning',
            'WebAuthn-Host und Origin passen nicht.',
            'The WebAuthn host and origin do not match.',
          );
    } catch {
      return line(
        key,
        'warning',
        'Die Origin ist keine gültige Adresse.',
        'The origin is not a valid address.',
      );
    }
  }
  if (key === 'ADMIN_IP_ALLOWLIST') {
    if (!value) {
      return line(
        key,
        'warning',
        'Die Liste ist leer. In Produktion verweigert das jede Verwaltung.',
        'The list is empty. In production that refuses every administration page.',
      );
    }
    const rules = value.split(',').map((entry) => entry.trim());
    const valid = rules.every((entry) => /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/u.test(entry));
    return valid
      ? line(key, 'ok', 'Die Adressliste ist lesbar.', 'The address list can be read.')
      : line(
          key,
          'warning',
          'Mindestens ein Eintrag ist keine IPv4-Adresse.',
          'At least one entry is not an IPv4 address.',
        );
  }
  if (key === 'GRAPH_MAILBOX') {
    return value.includes('@')
      ? line(
          key,
          'ok',
          'Das Postfach hat die Form einer E-Mail-Adresse.',
          'The mailbox looks like an email address.',
        )
      : line(
          key,
          'warning',
          'Das Postfach fehlt oder ist keine E-Mail-Adresse.',
          'The mailbox is missing or is not an email address.',
        );
  }
  if (key.startsWith('VITE_PUBLIC_URL_')) {
    if (!value) return line(key, 'warning', 'Der Link ist leer.', 'The link is empty.');
    try {
      const url = new URL(value);
      return line(
        key,
        'ok',
        `Der Link zeigt auf ${url.hostname}.`,
        `The link points at ${url.hostname}.`,
      );
    } catch {
      return line(key, 'warning', 'Das ist keine gültige Adresse.', 'This is not a valid address.');
    }
  }
  if (!value && field.secret) {
    return line(key, 'warning', 'Der Wert ist nicht hinterlegt.', 'The value is not stored.');
  }
  if (!value) return line(key, 'warning', 'Der Wert fehlt.', 'The value is missing.');
  const shown = describeConfig(next).find((entry) => entry.key === key);
  if (shown?.secret) {
    return line(
      key,
      'ok',
      'Der Wert ist hinterlegt und wird nicht angezeigt.',
      'The value is stored and is not shown.',
    );
  }
  return line(key, 'ok', 'Der Wert ist gesetzt.', 'The value is set.');
}
