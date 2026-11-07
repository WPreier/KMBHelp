import { databaseReachable, type Database } from '@kmbhelp/db';
import type { ServiceReport, ServiceRow } from '@kmbhelp/shared';
import { readWorkerState } from './mail-store.js';
import { defaultOllamaUrl } from './ollama-mail.js';
import { tcpOpen, ldapsHost, type TcpResult } from './probes.js';
import { directoryCertificate, ldapsConfigFromEnv, serviceBindWorks } from './directory.js';
import { smtpSettingsFromEnv } from './smtp.js';
import { readSyslogTarget } from './syslog-settings.js';

export type DirectoryState =
  'ok' | 'missing' | 'missing-cert' | 'unreadable' | 'expired' | 'closed' | 'bind';

export type ServiceFacts = {
  database: boolean;
  worker: 'up' | 'down' | 'not_configured';
  smtp: TcpResult;
  directory: DirectoryState;
  directoryDays: number | null;
  mailbox: 'ok' | 'missing' | 'rejected' | 'down';
  ollama: 'ok' | 'bad' | 'down';
  syslogHost: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<{ ok: boolean }>;

export function serviceRows(facts: ServiceFacts): ServiceReport {
  return {
    services: [
      databaseRow(facts.database),
      workerRow(facts.worker),
      smtpRow(facts.smtp),
      directoryRow(facts.directory, facts.directoryDays),
      mailboxRow(facts.mailbox),
      ollamaRow(facts.ollama),
      syslogRow(facts.syslogHost),
    ],
  };
}

export async function readServiceStatus(input: {
  database: Database | undefined;
  env: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike | undefined;
  tcp?: ((host: string, port: number, timeoutMs?: number) => Promise<TcpResult>) | undefined;
  bind?: typeof serviceBindWorks | undefined;
}): Promise<ServiceReport> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tcp = input.tcp ?? tcpOpen;
  const bind = input.bind ?? serviceBindWorks;
  const [database, worker, smtp, directory, mailbox, ollama, syslog] = await Promise.all([
    probeDatabase(input.database),
    probeWorker(input.database),
    probeSmtp(input.env, tcp),
    probeDirectory(input.env, tcp, bind),
    probeMailbox(input.env, fetchImpl),
    probeOllama(input.env, fetchImpl),
    probeSyslog(input.database, input.env),
  ]);
  return serviceRows({
    database,
    worker,
    smtp,
    directory: directory.state,
    directoryDays: directory.days,
    mailbox,
    ollama,
    syslogHost: syslog,
  });
}

export async function readOneService(
  input: {
    database: Database | undefined;
    env: NodeJS.ProcessEnv;
    fetchImpl?: FetchLike | undefined;
    tcp?: ((host: string, port: number, timeoutMs?: number) => Promise<TcpResult>) | undefined;
    bind?: typeof serviceBindWorks | undefined;
  },
  code: string,
): Promise<ServiceRow | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tcp = input.tcp ?? tcpOpen;
  const bind = input.bind ?? serviceBindWorks;
  if (code === 'database') return databaseRow(await probeDatabase(input.database));
  if (code === 'worker') return workerRow(await probeWorker(input.database));
  if (code === 'smtp') return smtpRow(await probeSmtp(input.env, tcp));
  if (code === 'directory') {
    const directory = await probeDirectory(input.env, tcp, bind);
    return directoryRow(directory.state, directory.days);
  }
  if (code === 'mailbox') return mailboxRow(await probeMailbox(input.env, fetchImpl));
  if (code === 'ollama') return ollamaRow(await probeOllama(input.env, fetchImpl));
  if (code === 'syslog') return syslogRow(await probeSyslog(input.database, input.env));
  return null;
}

async function probeDatabase(database: Database | undefined): Promise<boolean> {
  if (!database) return false;
  try {
    return await withTimeout(databaseReachable(database.pool), 2000, false);
  } catch {
    return false;
  }
}

async function probeWorker(
  database: Database | undefined,
): Promise<'up' | 'down' | 'not_configured'> {
  try {
    return await withTimeout(readWorkerState(database), 2000, 'down');
  } catch {
    return 'down';
  }
}

async function probeSmtp(
  env: NodeJS.ProcessEnv,
  tcp: (host: string, port: number, timeoutMs?: number) => Promise<TcpResult>,
): Promise<TcpResult> {
  const settings = smtpSettingsFromEnv(env);
  try {
    return await tcp(settings.host, settings.port, 1500);
  } catch {
    return 'closed';
  }
}

async function probeDirectory(
  env: NodeJS.ProcessEnv,
  tcp: (host: string, port: number, timeoutMs?: number) => Promise<TcpResult>,
  bind: typeof serviceBindWorks,
): Promise<{ state: DirectoryState; days: number | null }> {
  const config = ldapsConfigFromEnv(env);
  if (!config) return { state: 'missing', days: null };
  let expires = Number.NaN;
  try {
    const certificate = directoryCertificate(config);
    if (!certificate) return { state: 'missing-cert', days: null };
    expires = Date.parse(certificate.validTo);
  } catch {
    return { state: 'unreadable', days: null };
  }
  if (!Number.isFinite(expires) || expires < Date.now()) return { state: 'expired', days: null };
  const target = ldapsHost(config.url);
  const open = await tcp(target.host, target.port, 1500).catch(() => 'closed' as const);
  if (open !== 'open') return { state: 'closed', days: null };
  const bound = await withTimeout(bind(config), 4000, false);
  if (!bound) return { state: 'bind', days: null };
  return { state: 'ok', days: Math.floor((expires - Date.now()) / 86_400_000) };
}

async function probeMailbox(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<'ok' | 'missing' | 'rejected' | 'down'> {
  const mailbox = env.GRAPH_MAILBOX?.trim() ?? '';
  const tenant = env.GRAPH_TENANT_ID?.trim() ?? '';
  const clientId = env.GRAPH_CLIENT_ID?.trim() ?? '';
  const secret = env.GRAPH_CLIENT_SECRET ?? '';
  if (!mailbox.includes('@') || tenant === '' || clientId === '' || secret.trim() === '') {
    return 'missing';
  }
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
      scope: 'https://graph.microsoft.com/.default',
    });
    const response = await fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(4000),
      },
    );
    return response.ok ? 'ok' : 'rejected';
  } catch {
    return 'down';
  }
}

async function probeOllama(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<'ok' | 'bad' | 'down'> {
  const raw = env.MAILCHECK_KI_URL?.trim() || defaultOllamaUrl;
  let address: URL;
  try {
    address = new URL('/api/tags', raw);
  } catch {
    return 'bad';
  }
  try {
    const response = await fetchImpl(address.toString(), { signal: AbortSignal.timeout(2000) });
    return response.ok ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

async function probeSyslog(
  database: Database | undefined,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  try {
    const target = await withTimeout(readSyslogTarget(database, env), 2000, null);
    return target?.host.trim() ?? '';
  } catch {
    return '';
  }
}

function databaseRow(up: boolean): ServiceRow {
  return up
    ? row('database', 'ok', 'Die Datenbank antwortet.', 'The database answers.')
    : row(
        'database',
        'error',
        'Die Datenbank ist nicht erreichbar.',
        'The database cannot be reached.',
      );
}

function workerRow(state: ServiceFacts['worker']): ServiceRow {
  if (state === 'up') {
    return row('worker', 'ok', 'Der Mail-Worker meldet sich.', 'The mail worker checks in.');
  }
  if (state === 'not_configured') {
    return row(
      'worker',
      'error',
      'Der Mail-Worker läuft, die Mailbox ist nicht eingerichtet.',
      'The mail worker is running, and the mailbox is not set up.',
    );
  }
  return row(
    'worker',
    'error',
    'Der Mail-Worker meldet sich nicht.',
    'The mail worker does not check in.',
  );
}

function smtpRow(result: TcpResult): ServiceRow {
  return result === 'open'
    ? row('smtp', 'ok', 'Postfix nimmt Verbindungen an.', 'Postfix accepts connections.')
    : row('smtp', 'error', 'Postfix ist nicht erreichbar.', 'Postfix cannot be reached.');
}

function directoryRow(state: DirectoryState, days: number | null): ServiceRow {
  if (state === 'ok') {
    return row(
      'directory',
      'ok',
      `Das Verzeichnis antwortet. Das Zertifikat gilt noch ${days ?? 0} Tage.`,
      `The directory answers. The certificate remains valid for ${days ?? 0} days.`,
    );
  }
  const text = {
    missing: ['Das Verzeichnis ist nicht eingerichtet.', 'The directory is not set up.'],
    'missing-cert': ['Es ist kein Zertifikat hinterlegt.', 'No certificate is stored.'],
    unreadable: ['Das Zertifikat lässt sich nicht lesen.', 'The certificate cannot be read.'],
    expired: ['Das Zertifikat ist abgelaufen.', 'The certificate has expired.'],
    closed: ['Das Verzeichnis ist nicht erreichbar.', 'The directory cannot be reached.'],
    bind: ['Das Dienstkonto kann nicht suchen.', 'The service account cannot search.'],
  }[state];
  return row('directory', 'error', text[0] ?? '', text[1] ?? '');
}

function mailboxRow(state: ServiceFacts['mailbox']): ServiceRow {
  if (state === 'ok') {
    return row(
      'mailbox',
      'ok',
      'Die Helpdesk-Mailbox nimmt die Anmeldung an.',
      'The helpdesk mailbox accepts the sign-in.',
    );
  }
  const text = {
    missing: [
      'Die Helpdesk-Mailbox ist nicht eingerichtet.',
      'The helpdesk mailbox is not set up.',
    ],
    rejected: [
      'Die Helpdesk-Mailbox lehnt die Anmeldung ab.',
      'The helpdesk mailbox rejects the sign-in.',
    ],
    down: ['Die Helpdesk-Mailbox ist nicht erreichbar.', 'The helpdesk mailbox cannot be reached.'],
  }[state];
  return row('mailbox', 'error', text[0] ?? '', text[1] ?? '');
}

function ollamaRow(state: ServiceFacts['ollama']): ServiceRow {
  if (state === 'ok') return row('ollama', 'ok', 'Ollama antwortet.', 'Ollama answers.');
  if (state === 'bad')
    return row('ollama', 'error', 'MAILCHECK_KI_URL ist ungültig.', 'MAILCHECK_KI_URL is invalid.');
  return row('ollama', 'error', 'Ollama ist nicht erreichbar.', 'Ollama cannot be reached.');
}

function syslogRow(host: string): ServiceRow {
  return host
    ? row(
        'syslog',
        'ok',
        'Das Syslog-Ziel ist gesetzt. UDP bestätigt den Empfang nicht.',
        'The syslog target is set. UDP does not confirm delivery.',
      )
    : row('syslog', 'error', 'Das Syslog-Ziel fehlt.', 'The syslog target is missing.');
}

function row(code: string, status: 'ok' | 'error', textDe: string, textEn: string): ServiceRow {
  return { code, status, textDe, textEn };
}

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
