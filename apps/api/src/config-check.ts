import { regionAllowsProcessing, endpointAllowsProcessing } from '@kmbhelp/ai';
import { createDatabase } from '@kmbhelp/db';
import { configField, describeConfig } from '@kmbhelp/shared';
import { directoryCertificate, ldapsConfigFromEnv, serviceBindWorks } from './directory.js';
import { parseWorkerSchedule } from './worker-schedule.js';
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
  if (key === 'ONCALL_EMAIL') {
    if (!value) {
      return line(
        key,
        'ok',
        'Keine Bereitschaftsadresse hinterlegt.',
        'No on-call address is stored.',
      );
    }
    return value.includes('@') && !/\s/u.test(value)
      ? line(key, 'ok', 'Die Bereitschaftsadresse ist lesbar.', 'The on-call address can be read.')
      : line(
          key,
          'warning',
          'Die Bereitschaftsadresse ist keine E-Mail-Adresse.',
          'The on-call address is not an email address.',
        );
  }
  if (key === 'FALLBACK_CATEGORY') {
    return /^[a-z0-9_]+$/u.test(value)
      ? line(
          key,
          'ok',
          `Nicht erkannte Mails werden ${value}.`,
          `Unrecognised mail becomes ${value}.`,
        )
      : line(
          key,
          'warning',
          'Der Code besteht aus Kleinbuchstaben, Ziffern und Unterstrich.',
          'The code uses lower case, digits and underscore.',
        );
  }
  if (
    key === 'CALENDAR_DEFAULT_MINUTES' ||
    key === 'CALENDAR_DELAY_P1' ||
    key === 'CALENDAR_DELAY_P2' ||
    key === 'CALENDAR_DELAY_P3'
  ) {
    return /^\d+$/u.test(value) && Number(value) <= 1440
      ? line(key, 'ok', `${value} Minuten.`, `${value} minutes.`)
      : line(
          key,
          'warning',
          'Eine ganze Zahl Minuten, höchstens 1440.',
          'A whole number of minutes, at most 1440.',
        );
  }
  if (key === 'ACCESS_LOG_RETENTION_DAYS') {
    return /^\d+$/u.test(value) && Number(value) >= 1 && Number(value) <= 3650
      ? line(
          key,
          'ok',
          `${value} Tage, danach werden die IP-Zeilen gelöscht.`,
          `${value} days, then the IP rows are deleted.`,
        )
      : line(key, 'warning', 'Eine ganze Zahl von 1 bis 3650.', 'A whole number from 1 to 3650.');
  }
  if (key === 'WORKER_SCHEDULE') {
    return parseWorkerSchedule(value)
      ? line(key, 'ok', 'Der Zeitplan ist lesbar.', 'The schedule can be read.')
      : line(
          key,
          'warning',
          'Jeder Abschnitt hat die Form 08:00-12:00=10. 0 Minuten bedeutet Pause.',
          'Each part looks like 08:00-12:00=10. 0 minutes means a pause.',
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
  if (key === 'AI_PROVIDER') {
    const name = value.trim().toLowerCase();
    return !name || ['grok', 'gemini', 'deepseek', 'other'].includes(name)
      ? line(
          key,
          'ok',
          name ? `Der Anbieter heißt ${name}. Die Adresse bleibt AI_ENDPOINT.` : 'Ohne Namen gilt grok. Die Adresse bleibt AI_ENDPOINT.',
          name
            ? `The provider is named ${name}. The address stays AI_ENDPOINT.`
            : 'Without a name, grok applies. The address stays AI_ENDPOINT.',
        )
      : line(
          key,
          'warning',
          'Erlaubt sind grok, gemini, deepseek oder other.',
          'Allowed names are grok, gemini, deepseek or other.',
        );
  }
  if (key === 'INTERNAL_MAIL_DOMAINS') {
    if (!value.trim()) {
      return line(
        key,
        'ok',
        'Leer verwendet kmb-steuerberatung.at, ght.at und koller-rohrschach.at.',
        'Empty uses kmb-steuerberatung.at, ght.at and koller-rohrschach.at.',
      );
    }
    const domains = value
      .split(/[\s,;]+/u)
      .map((entry) => entry.trim().toLowerCase().replace(/^@/u, ''))
      .filter((entry) => entry !== '');
    return domains.every((entry) => /^[a-z0-9.-]+\.[a-z]{2,}$/u.test(entry))
      ? line(key, 'ok', 'Die Domänen sind lesbar.', 'The domains can be read.')
      : line(
          key,
          'warning',
          'Jede Domäne braucht einen Punkt und keine Adresse davor.',
          'Each domain needs a dot and no address in front of it.',
        );
  }
  if (key === 'AI_MAIL_PROMPT') {
    if (!value.trim()) {
      return line(
        key,
        'ok',
        'Leer verwendet den eingebauten Auftrag mit JA und NEIN.',
        'Empty uses the built-in instruction with JA and NEIN.',
      );
    }
    const upper = value.toUpperCase();
    return upper.includes('JA') && upper.includes('NEIN')
      ? line(key, 'ok', 'Der Auftrag nennt JA und NEIN.', 'The instruction names JA and NEIN.')
      : line(
          key,
          'warning',
          'Der Auftrag soll JA und NEIN enthalten.',
          'The instruction should contain JA and NEIN.',
        );
  }
  if (key === 'AI_ENDPOINT') {
    if (!value) {
      return line(
        key,
        'informational',
        'Kein Modell. Helpdesk-Mails bleiben ungelesen. Die Suche bleibt beim Satz aus Phase 2.',
        'No model. Helpdesk mail stays unread. Search keeps the phase 2 sentence.',
      );
    }
    return endpointAllowsProcessing(value)
      ? line(key, 'ok', 'Die Adresse ist https.', 'The address is https.')
      : line(
          key,
          'warning',
          'Die Adresse muss https sein und darf kein Passwort enthalten.',
          'The address must be https and must not contain a password.',
        );
  }
  if (key === 'AI_REGION') {
    if (!value) {
      return line(key, 'informational', 'Keine Region hinterlegt.', 'No region is stored.');
    }
    return regionAllowsProcessing(value)
      ? line(key, 'ok', 'Die Region liegt in der EU.', 'The region is in the EU.')
      : line(
          key,
          'warning',
          'Die Region ist nicht als EU-Verarbeitung erkennbar.',
          'The region is not recognisable as EU processing.',
        );
  }
  if (key === 'AI_AVV_REFERENCE') {
    return value
      ? line(key, 'ok', 'Ein Vertragsverweis ist hinterlegt.', 'A contract reference is stored.')
      : line(
          key,
          'informational',
          'Ohne Vertragsverweis geht kein Text an ein Modell.',
          'Without a contract reference no text goes to a model.',
        );
  }
  if (key === 'AI_AUTO_REPLY_CATEGORIES') {
    if (!value) {
      return line(
        key,
        'ok',
        'Keine Kategorie wird automatisch geschlossen.',
        'No category is closed automatically.',
      );
    }
    const codes = value.split(',').map((entry) => entry.trim());
    return codes.every((entry) => /^[a-z0-9_]+$/u.test(entry))
      ? line(key, 'ok', 'Die Codes sind lesbar.', 'The codes can be read.')
      : line(
          key,
          'warning',
          'Codes aus Kleinbuchstaben, Ziffern und Unterstrich, getrennt durch Komma.',
          'Codes of lower case, digits and underscore, separated by commas.',
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
