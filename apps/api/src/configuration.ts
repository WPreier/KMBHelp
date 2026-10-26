import { createDatabase } from '@kmbhelp/db';
import type { ConfigurationReport } from '@kmbhelp/shared';
import { directoryCertificate, serviceBindWorks, type LdapsConfig } from './directory.js';
import { ldapsHost, peerFingerprint, tcpOpen, type TcpResult } from './probes.js';
import { formatSyslog, sendSyslog } from './syslog.js';

const secretKeys = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'LDAPS_BIND_PASSWORD',
  'LDAPS_CA_PEM',
  'GRAPH_CLIENT_SECRET',
  'AI_API_KEY',
  'LOCAL_ADMIN_PASSWORD',
];

const shownKeys = [
  'LDAPS_URL',
  'LDAPS_BIND_DN',
  'LDAPS_BASE_DN',
  'LDAPS_GROUP_DN',
  'LDAPS_CA_FILE',
  'ADMIN_IP_ALLOWLIST',
  'SYSLOG_HOST',
  'SYSLOG_PORT',
  'GRAPH_TENANT_ID',
  'GRAPH_CLIENT_ID',
  'GRAPH_MAILBOX',
  'WEBAUTHN_RP_ID',
  'WEBAUTHN_ORIGIN',
  'AI_ENDPOINT',
  'AI_REGION',
];

export type Check = ConfigurationReport['checks'][number];

type Probes = {
  tcp: (host: string, port: number) => Promise<TcpResult>;
  fingerprint: (host: string, port: number) => Promise<string | null>;
  bind: (config: LdapsConfig) => Promise<boolean>;
  database: (url: string) => Promise<{ ok: boolean; version: string; admins: number }>;
  graphDns: () => Promise<boolean>;
  syslog: (host: string, port: number) => Promise<boolean>;
};

const liveProbes: Probes = {
  tcp: tcpOpen,
  fingerprint: peerFingerprint,
  bind: serviceBindWorks,
  database: readDatabase,
  graphDns: async () => (await tcpOpen('login.microsoftonline.com', 443)) === 'open',
  syslog: async (host, port) => {
    try {
      await sendSyslog(host, port, formatSyslog('informational', 'KMBHelp syslog check'));
      return true;
    } catch {
      return false;
    }
  },
};

function present(env: NodeJS.ProcessEnv, key: string): boolean {
  return (env[key] ?? '').trim() !== '';
}

function valuesOf(env: NodeJS.ProcessEnv): ConfigurationReport['values'] {
  const secret = secretKeys.map((key) => ({
    key,
    state: present(env, key) ? ('set' as const) : ('missing' as const),
    value: '',
  }));
  const shown = shownKeys.map((key) => ({
    key,
    state: present(env, key) ? ('shown' as const) : ('missing' as const),
    value: present(env, key) ? (env[key] ?? '').trim() : '',
  }));
  return [...secret, ...shown];
}

function check(code: string, status: Check['status'], textDe: string, textEn: string): Check {
  return { code, status, textDe, textEn };
}

function ldapsConfig(env: NodeJS.ProcessEnv): LdapsConfig | null {
  const url = env.LDAPS_URL?.trim() ?? '';
  const bindDn = env.LDAPS_BIND_DN?.trim() ?? '';
  const bindPassword = env.LDAPS_BIND_PASSWORD ?? '';
  const baseDn = env.LDAPS_BASE_DN?.trim() ?? '';
  const groupDn = env.LDAPS_GROUP_DN?.trim() ?? '';
  if (!url || !bindDn || bindPassword.trim() === '' || !baseDn || !groupDn) return null;
  return {
    url,
    bindDn,
    bindPassword,
    baseDn,
    groupDn,
    caFile: env.LDAPS_CA_FILE?.trim() || undefined,
    caPem: env.LDAPS_CA_PEM?.trim() || undefined,
  };
}

async function readDatabase(
  url: string,
): Promise<{ ok: boolean; version: string; admins: number }> {
  const database = createDatabase(url);
  try {
    const version = await database.pool.query<{ server_version: string }>('show server_version');
    const admins = await database.pool.query<{ count: string }>(
      'select count(*)::text as count from staff where is_local_admin',
    );
    return {
      ok: true,
      version: version.rows[0]?.server_version ?? '',
      admins: Number(admins.rows[0]?.count ?? '0'),
    };
  } finally {
    await database.pool.end();
  }
}

export async function inspectConfiguration(
  env: NodeJS.ProcessEnv,
  probes: Probes = liveProbes,
): Promise<ConfigurationReport> {
  const checks: Check[] = [];
  const short = await probes.tcp('MADC1.kmbcloud', 636);
  checks.push(
    short === 'open'
      ? check(
          'directory.short',
          'ok',
          'MADC1.kmbcloud nimmt LDAPS an.',
          'MADC1.kmbcloud accepts LDAPS.',
        )
      : check(
          'directory.short',
          'error',
          `MADC1.kmbcloud ist nicht erreichbar (${short}).`,
          `MADC1.kmbcloud is not reachable (${short}).`,
        ),
  );

  const target = ldapsHost(env.LDAPS_URL);
  const fqdn = await probes.tcp(target.host, target.port);
  checks.push(
    fqdn === 'open'
      ? check(
          'directory.fqdn',
          'ok',
          `${target.host}:${target.port} ist erreichbar.`,
          `${target.host}:${target.port} is reachable.`,
        )
      : check(
          'directory.fqdn',
          'error',
          `${target.host}:${target.port} ist nicht erreichbar (${fqdn}).`,
          `${target.host}:${target.port} is not reachable (${fqdn}).`,
        ),
  );

  if (env.DATABASE_URL?.trim()) {
    try {
      const database = await probes.database(env.DATABASE_URL);
      checks.push(
        check(
          'database',
          database.ok ? 'ok' : 'error',
          database.ok
            ? `PostgreSQL antwortet, Version ${database.version}.`
            : 'PostgreSQL antwortet nicht.',
          database.ok
            ? `PostgreSQL answers, version ${database.version}.`
            : 'PostgreSQL does not answer.',
        ),
      );
      checks.push(
        database.admins === 1
          ? check(
              'local_admin',
              'ok',
              'Genau ein lokaler Admin ist angelegt.',
              'Exactly one local admin exists.',
            )
          : check(
              'local_admin.missing',
              'warning',
              `Lokale Admins: ${database.admins}. Erwartet wird einer.`,
              `Local admins: ${database.admins}. One is expected.`,
            ),
      );
    } catch {
      checks.push(
        check(
          'database.unreachable',
          'error',
          'PostgreSQL antwortet nicht.',
          'PostgreSQL does not answer.',
        ),
      );
    }
  } else {
    checks.push(
      check('database.unreachable', 'error', 'DATABASE_URL fehlt.', 'DATABASE_URL is missing.'),
    );
  }

  let certificate: ReturnType<typeof directoryCertificate> = null;
  let certificateUnreadable = false;
  try {
    certificate = directoryCertificate({
      caFile: env.LDAPS_CA_FILE,
      caPem: env.LDAPS_CA_PEM,
    });
  } catch {
    certificate = null;
    certificateUnreadable = true;
    checks.push(
      check(
        'certificate.missing',
        'error',
        'Das Zertifikat lässt sich nicht lesen.',
        'The certificate cannot be read.',
      ),
    );
  }
  if (certificateUnreadable) {
    // already reported
  } else if (!certificate) {
    checks.push(
      check(
        'certificate.missing',
        'warning',
        'Es ist kein Domänencontroller-Zertifikat hinterlegt.',
        'No domain controller certificate is stored.',
      ),
    );
  } else {
    const expires = new Date(certificate.validTo);
    const days = Math.floor((expires.getTime() - Date.now()) / 86_400_000);
    if (days < 0) {
      checks.push(
        check(
          'certificate.expired',
          'error',
          'Das Zertifikat ist abgelaufen.',
          'The certificate has expired.',
        ),
      );
    } else if (days < 30) {
      checks.push(
        check(
          'certificate.expiring',
          'warning',
          `Das Zertifikat läuft in ${days} Tagen ab.`,
          `The certificate expires in ${days} days.`,
        ),
      );
    } else {
      checks.push(
        check(
          'certificate',
          'ok',
          `Zertifikat ${certificate.subject} gilt noch ${days} Tage.`,
          `Certificate ${certificate.subject} is valid for ${days} more days.`,
        ),
      );
    }
    if (fqdn === 'open') {
      const peer = await probes.fingerprint(target.host, target.port);
      checks.push(
        peer && peer === certificate.fingerprint256
          ? check(
              'certificate.pin',
              'ok',
              'Das hinterlegte Zertifikat entspricht dem Server.',
              'The stored certificate matches the server.',
            )
          : check(
              'certificate.mismatch',
              'error',
              'Das hinterlegte Zertifikat entspricht dem Server nicht.',
              'The stored certificate does not match the server.',
            ),
      );
    }
  }

  const directory = ldapsConfig(env);
  if (!directory) {
    checks.push(
      check(
        'directory.bind_failed',
        'warning',
        'LDAPS ist nicht vollständig konfiguriert.',
        'LDAPS is not fully configured.',
      ),
    );
  } else if (fqdn === 'open') {
    const bound = await probes.bind(directory);
    checks.push(
      bound
        ? check(
            'directory.bind',
            'ok',
            'Das Dienstkonto kann suchen.',
            'The service account can search.',
          )
        : check(
            'directory.bind_failed',
            'error',
            'Das Dienstkonto kann nicht suchen.',
            'The service account cannot search.',
          ),
    );
  }

  checks.push(
    (env.ADMIN_IP_ALLOWLIST ?? '').trim()
      ? check(
          'allowlist',
          'ok',
          'Die Admin-Adressliste ist gesetzt.',
          'The admin address list is set.',
        )
      : check(
          'allowlist.empty',
          'warning',
          'Die Admin-Adressliste ist leer.',
          'The admin address list is empty.',
        ),
  );

  checks.push(
    (env.SESSION_SECRET ?? '').trim().length >= 16
      ? check(
          'session_secret',
          'ok',
          'Der Sitzungsschlüssel ist gesetzt.',
          'The session secret is set.',
        )
      : check(
          'session_secret.weak',
          'warning',
          'Der Sitzungsschlüssel fehlt oder ist kürzer als 16 Zeichen.',
          'The session secret is missing or shorter than 16 characters.',
        ),
  );

  const mailReady = [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
    'GRAPH_MAILBOX',
  ].every((key) => present(env, key));
  checks.push(
    mailReady
      ? check(
          'mail',
          'ok',
          'Die Mail-Werte sind gesetzt. Der Versand folgt in Phase 4.',
          'The mail values are set. Sending follows in phase 4.',
        )
      : check(
          'mail.not_configured',
          'warning',
          'Der Mailversand ist nicht konfiguriert.',
          'Mail sending is not configured.',
        ),
  );

  const graphReady = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'].every((key) =>
    present(env, key),
  );
  if (!graphReady) {
    checks.push(
      check(
        'graph.not_configured',
        'warning',
        'Microsoft 365 ist nicht konfiguriert.',
        'Microsoft 365 is not configured.',
      ),
    );
  } else {
    const reach = await probes.graphDns();
    checks.push(
      reach
        ? check(
            'graph',
            'ok',
            'login.microsoftonline.com ist erreichbar. Ein Token wird noch nicht geholt.',
            'login.microsoftonline.com is reachable. No token is requested yet.',
          )
        : check(
            'graph.not_configured',
            'error',
            'login.microsoftonline.com ist nicht erreichbar.',
            'login.microsoftonline.com is not reachable.',
          ),
    );
  }

  const syslogHost = env.SYSLOG_HOST?.trim() || '127.0.0.1';
  const syslogPort = Number(env.SYSLOG_PORT?.trim() || '514');
  const syslog = await probes.syslog(syslogHost, Number.isInteger(syslogPort) ? syslogPort : 514);
  checks.push(
    check(
      syslog ? 'syslog' : 'syslog.unreachable',
      syslog ? 'ok' : 'warning',
      syslog
        ? `Das Syslog-Datagramm wurde an ${syslogHost}:${syslogPort} übergeben. UDP bestätigt den Empfang nicht.`
        : `Das Syslog-Datagramm an ${syslogHost}:${syslogPort} wurde nicht übergeben.`,
      syslog
        ? `The syslog datagram was handed to ${syslogHost}:${syslogPort}. UDP does not confirm delivery.`
        : `The syslog datagram to ${syslogHost}:${syslogPort} was not handed over.`,
    ),
  );

  const origin = env.WEBAUTHN_ORIGIN?.trim() ?? '';
  const rpId = env.WEBAUTHN_RP_ID?.trim() ?? '';
  if (origin && rpId) {
    let host = '';
    try {
      host = new URL(origin).hostname;
    } catch {
      host = '';
    }
    checks.push(
      host === rpId
        ? check(
            'webauthn',
            'ok',
            'WebAuthn-Host und Origin passen.',
            'The WebAuthn host and origin match.',
          )
        : check(
            'webauthn.mismatch',
            'warning',
            'WebAuthn-Host und Origin passen nicht.',
            'The WebAuthn host and origin do not match.',
          ),
    );
  }

  checks.push(
    present(env, 'AI_ENDPOINT')
      ? check(
          'ai',
          'ok',
          'Ein KI-Endpunkt ist gesetzt. Aufrufe folgen in Phase 6.',
          'A model endpoint is set. Calls follow in phase 6.',
        )
      : check(
          'ai.not_configured',
          'informational',
          'Der KI-Anbieter ist nicht konfiguriert.',
          'The model provider is not configured.',
        ),
  );

  const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');
  checks.push(
    nodeMajor === 22
      ? check('node', 'ok', 'Node 22 ist aktiv.', 'Node 22 is running.')
      : check(
          'node',
          'warning',
          `Node ${process.versions.node} ist aktiv. Erwartet wird 22.`,
          `Node ${process.versions.node} is running. 22 is expected.`,
        ),
  );

  return { values: valuesOf(env), checks };
}
