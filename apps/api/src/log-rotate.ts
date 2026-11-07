import { rename, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { appSetting, type Database } from '@kmbhelp/db';
import { enqueueFileLog, flushFileLogs, logDirectory, logFilePath, type LogFile } from './file-log.js';
import { noteExternal, syslogOffset } from './syslog.js';

const files: LogFile[] = ['activity', 'error', 'mail', 'ki'];
const stampName = 'rotate.on';

export function offsetDate(at: Date, offset: string): { iso: string; tag: string } {
  const chosen = syslogOffset(offset);
  const sign = chosen.startsWith('-') ? -1 : 1;
  const [hours, minutes] = chosen.slice(1).split(':');
  const shift = sign * ((Number(hours) || 0) * 60 + (Number(minutes) || 0)) * 60_000;
  const local = new Date(at.getTime() + shift);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  return { iso: `${year}-${month}-${day}`, tag: `${day}${month}${year}` };
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function rotateDays(value: string | undefined): number {
  const days = Number((value ?? '').trim() || '30');
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : 30;
}

export async function maybeRotateLogs(options: {
  env?: NodeJS.ProcessEnv | undefined;
  now?: Date | undefined;
  database?: Database | undefined;
}): Promise<'wait' | 'armed' | 'rotated'> {
  const env = options.env ?? process.env;
  const directory = logDirectory(env);
  if (!directory) return 'wait';
  const today = offsetDate(options.now ?? new Date(), env.SYSLOG_UTC_OFFSET ?? '');
  const stampPath = join(directory, stampName);
  const last = await readStamp(stampPath);
  if (!last) {
    await writeFile(stampPath, `${today.iso}\n`, 'utf8');
    return 'armed';
  }
  const days = rotateDays(await storedDays(options.database, env));
  if (daysBetween(last, today.iso) < days) return 'wait';
  await flushFileLogs();
  for (const file of files) {
    const path = logFilePath(file, env);
    if (!path) continue;
    await moveLog(path, `${path}_${today.tag}`);
  }
  await writeFile(stampPath, `${today.iso}\n`, 'utf8');
  enqueueFileLog(
    'activity',
    `${new Date().toISOString()}\tworker\tpage\tlog-rotate\tProtokolldateien nach _${today.tag} verschoben.\t`,
    env,
  );
  void noteExternal(env, 'informational', `Protokolldateien nach _${today.tag} verschoben.`);
  return 'rotated';
}

async function storedDays(
  database: Database | undefined,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (!database) return env.LOG_ROTATE_DAYS;
  try {
    const rows = await database.db
      .select({ value: appSetting.value })
      .from(appSetting)
      .where(eq(appSetting.key, 'config.LOG_ROTATE_DAYS'));
    return rows[0]?.value || env.LOG_ROTATE_DAYS;
  } catch {
    return env.LOG_ROTATE_DAYS;
  }
}

async function readStamp(path: string): Promise<string | null> {
  try {
    const text = (await readFile(path, 'utf8')).trim();
    return /^\d{4}-\d{2}-\d{2}$/u.test(text) ? text : null;
  } catch {
    return null;
  }
}

async function moveLog(path: string, target: string): Promise<void> {
  let dest = target;
  for (let copy = 2; copy < 100; copy += 1) {
    try {
      await rename(path, dest);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      if (code !== 'EEXIST') throw error;
      dest = `${target}_${copy}`;
    }
  }
}
