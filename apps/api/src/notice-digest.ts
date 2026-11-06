import { appSetting, type Database } from '@kmbhelp/db';
import { eq, sql } from 'drizzle-orm';
import { writeActivity } from './activity-log.js';
import { inspectConfiguration, type Check } from './configuration.js';
import { mailerFromEnv } from './graph.js';
import { sendSmtp, type SmtpSettings } from './smtp.js';
import { noteExternal } from './syslog.js';
import { localClock } from './worker-schedule.js';

export const digestSentKey = 'notice.digest_on';

const addressPattern = /^[^@\s]+@[^@\s]+$/u;

export function digestEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = env.MAIL_NOTICE_DIGEST?.trim().toLowerCase();
  if (flag === 'off') return false;
  if (flag === 'on') return true;
  return env.NODE_ENV === 'production';
}

export function digestHour(text: string | undefined): number {
  if (text === undefined || text.trim() === '') return 7;
  if (!/^\d{1,2}$/u.test(text.trim())) return 7;
  const hour = Number(text.trim());
  return hour >= 0 && hour <= 23 ? hour : 7;
}

export function digestDue(
  now: Date,
  offset: string,
  lastSent: string | null,
  hour: number,
): { due: boolean; date: string } {
  const clock = localClock(now, offset || '+01:00');
  const date = clock.slot.slice(0, 10);
  const currentHour = Math.floor(clock.minuteOfDay / 60);
  return { due: currentHour >= hour && lastSent !== date, date };
}

export function digestMessage(
  checks: readonly Pick<Check, 'status' | 'code' | 'textDe'>[],
  date: string,
): { subject: string; text: string } | null {
  const open = checks
    .filter((item) => item.status === 'warning' || item.status === 'error')
    .slice(0, 40);
  if (open.length === 0) return null;
  const lines = open.map((item) => {
    const text = item.textDe.replace(/[\r\n]+/gu, ' ').slice(0, 200);
    return `- ${item.code}: ${text}`;
  });
  return {
    subject: 'KMBHelp: offene Warnungen',
    text: `Stand ${date}.\n\n${lines.join('\n')}\n\nDie Meldungen stehen unter /verwaltung/meldungen.\nDas ist die tägliche Zusammenfassung.\n`,
  };
}

export async function deliverOpsMail(input: {
  env: NodeJS.ProcessEnv;
  to: string;
  smtp: SmtpSettings;
  subject: string;
  text: string;
  deliver?: ((mail: { to: string; subject: string; text: string }) => Promise<void>) | undefined;
}): Promise<'graph' | 'smtp'> {
  const deliver = input.deliver ?? mailerFromEnv(input.env).deliver;
  if (addressPattern.test(input.to) && deliver) {
    try {
      await deliver({ to: input.to, subject: input.subject, text: input.text });
      return 'graph';
    } catch {
      // Graph did not accept the mail. The local SMTP server is the fallback.
    }
  }
  await sendSmtp(input.smtp, { subject: input.subject, text: input.text });
  return 'smtp';
}

export async function maybeNoticeDigest(input: {
  database: Database;
  env: NodeJS.ProcessEnv;
  now: Date;
  offset: string;
  hourText: string | undefined;
  to: string;
  smtp: SmtpSettings;
  inspect?: (() => Promise<readonly Pick<Check, 'status' | 'code' | 'textDe'>[]>) | undefined;
  deliver?: ((mail: { to: string; subject: string; text: string }) => Promise<void>) | undefined;
}): Promise<void> {
  if (!digestEnabled(input.env)) return;
  const decision = digestDue(
    input.now,
    input.offset,
    await readDigestDate(input.database),
    digestHour(input.hourText),
  );
  if (!decision.due) return;
  const checks = input.inspect
    ? await input.inspect()
    : (await inspectConfiguration(input.env)).checks;
  const message = digestMessage(checks, decision.date);
  let detail = 'digest-clear';
  if (message) {
    try {
      const via = await deliverOpsMail({
        env: input.env,
        to: input.to,
        smtp: input.smtp,
        subject: message.subject,
        text: message.text,
        deliver: input.deliver,
      });
      detail = via === 'smtp' ? 'digest-smtp' : 'digest';
      await noteExternal(input.env, 'informational', `notice digest ${via}`);
    } catch {
      detail = 'digest-failed';
      await noteExternal(input.env, 'warning', 'notice digest failed');
    }
  }
  await rememberDigestDate(input.database, decision.date);
  await writeActivity(
    input.database,
    { actor: 'worker', kind: 'mail', target: 'digest', detail, ip: 'local' },
    input.env,
  );
}

async function readDigestDate(database: Database): Promise<string | null> {
  try {
    const rows = await database.db
      .select({ value: appSetting.value })
      .from(appSetting)
      .where(eq(appSetting.key, digestSentKey));
    const value = rows[0]?.value.trim() ?? '';
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function rememberDigestDate(database: Database, date: string): Promise<void> {
  await database.db
    .insert(appSetting)
    .values({ key: digestSentKey, value: date })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: sql`excluded.value` } });
}
