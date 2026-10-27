import { eq } from 'drizzle-orm';
import { noticeSetting, type Database } from '@kmbhelp/db';
import { readSyslogTarget } from './syslog-settings.js';
import { formatSyslog, sendSyslog, type NoticeCategory } from './syslog.js';

export type NoticeDefinition = {
  code: string;
  category: NoticeCategory;
  textDe: string;
  textEn: string;
};

export const noticeCatalog: readonly NoticeDefinition[] = [
  {
    code: 'directory.unreachable',
    category: 'error',
    textDe: 'Ein Domänencontroller ist nicht erreichbar.',
    textEn: 'A domain controller is not reachable.',
  },
  {
    code: 'database.unreachable',
    category: 'error',
    textDe: 'Der Datenbankserver ist nicht erreichbar.',
    textEn: 'The database server is not reachable.',
  },
  {
    code: 'syslog.unreachable',
    category: 'warning',
    textDe: 'Der Syslog-Server nimmt keine Meldung an.',
    textEn: 'The syslog server did not accept a message.',
  },
  {
    code: 'mail.not_configured',
    category: 'warning',
    textDe: 'Der Mailversand ist nicht konfiguriert.',
    textEn: 'Mail sending is not configured.',
  },
  {
    code: 'graph.not_configured',
    category: 'warning',
    textDe: 'Microsoft 365 ist nicht konfiguriert.',
    textEn: 'Microsoft 365 is not configured.',
  },
  {
    code: 'session_secret.weak',
    category: 'warning',
    textDe: 'Der Sitzungsschlüssel fehlt oder ist zu kurz.',
    textEn: 'The session secret is missing or too short.',
  },
  {
    code: 'allowlist.empty',
    category: 'warning',
    textDe: 'Die Admin-Adressliste ist leer.',
    textEn: 'The admin address list is empty.',
  },
  {
    code: 'certificate.missing',
    category: 'warning',
    textDe: 'Das Zertifikat des Domänencontrollers fehlt.',
    textEn: 'The domain controller certificate is missing.',
  },
  {
    code: 'certificate.expired',
    category: 'error',
    textDe: 'Das Zertifikat des Domänencontrollers ist abgelaufen.',
    textEn: 'The domain controller certificate has expired.',
  },
  {
    code: 'certificate.expiring',
    category: 'warning',
    textDe: 'Das Zertifikat des Domänencontrollers läuft in weniger als 30 Tagen ab.',
    textEn: 'The domain controller certificate expires in less than 30 days.',
  },
  {
    code: 'certificate.mismatch',
    category: 'error',
    textDe: 'Das Zertifikat des Domänencontrollers stimmt nicht mit dem Server überein.',
    textEn: 'The domain controller certificate does not match the server.',
  },
  {
    code: 'directory.bind_failed',
    category: 'error',
    textDe: 'Das Dienstkonto konnte sich am Domänencontroller nicht anmelden.',
    textEn: 'The service account could not sign in to the domain controller.',
  },
  {
    code: 'webauthn.mismatch',
    category: 'warning',
    textDe: 'WebAuthn-Host und Origin passen nicht zusammen.',
    textEn: 'The WebAuthn host and origin do not match.',
  },
  {
    code: 'local_admin.missing',
    category: 'warning',
    textDe: 'Es gibt keinen lokalen Admin.',
    textEn: 'There is no local admin.',
  },
  {
    code: 'ai.not_configured',
    category: 'informational',
    textDe:
      'Der KI-Anbieter ist nicht konfiguriert. Helpdesk-Mails bleiben ungelesen und werden kein Ticket.',
    textEn:
      'The model provider is not configured. Helpdesk mail stays unread and does not become a ticket.',
  },
];

export function noticeByCode(code: string): NoticeDefinition | undefined {
  return noticeCatalog.find((entry) => entry.code === code);
}

export async function noticeState(
  database: Database | undefined,
  code: string,
): Promise<{ category: NoticeCategory; enabled: boolean } | null> {
  const fallback = noticeByCode(code);
  if (!fallback) return null;
  if (!database) return { category: fallback.category, enabled: true };
  try {
    const rows = await database.db
      .select({ category: noticeSetting.category, enabled: noticeSetting.enabled })
      .from(noticeSetting)
      .where(eq(noticeSetting.code, code));
    const row = rows[0];
    if (!row) return { category: fallback.category, enabled: true };
    if (
      row.category !== 'informational' &&
      row.category !== 'warning' &&
      row.category !== 'error'
    ) {
      return { category: fallback.category, enabled: row.enabled };
    }
    return { category: row.category, enabled: row.enabled };
  } catch {
    return { category: fallback.category, enabled: true };
  }
}

export async function emitNotice(input: {
  database?: Database | undefined;
  env: NodeJS.ProcessEnv;
  code: string;
  detail?: string | undefined;
  log: (category: NoticeCategory, text: string) => void;
  send?: ((host: string, port: number, line: string) => Promise<void>) | undefined;
}): Promise<boolean> {
  const definition = noticeByCode(input.code);
  const state = await noticeState(input.database, input.code);
  if (!definition || !state?.enabled) return false;
  const detail = input.detail?.replace(/[\r\n]+/gu, ' ').slice(0, 240) ?? '';
  const text = `${definition.textDe} ${definition.textEn}${detail ? ` (${detail})` : ''}`;
  input.log(state.category, text);
  if (input.code === 'syslog.unreachable') return true;
  const target = await readSyslogTarget(input.database, input.env);
  const send = input.send ?? sendSyslog;
  try {
    await send(
      target.host,
      target.port,
      formatSyslog(state.category, text, new Date(), {
        appName: target.appName,
        facility: target.facility,
      }),
    );
    return true;
  } catch {
    input.log(
      'warning',
      `${noticeByCode('syslog.unreachable')?.textDe ?? ''} ${target.host}:${target.port}`,
    );
    return true;
  }
}
