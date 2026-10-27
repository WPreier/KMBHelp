import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { appSetting, createDatabase, type Database } from '@kmbhelp/db';
import {
  configField,
  isSecretConfig,
  syslogFacilitySetting,
  syslogHostSetting,
  syslogNameSetting,
  syslogOffsetSetting,
  syslogPortSetting,
} from '@kmbhelp/shared';
import { syslogAppName, syslogFacility, syslogOffset } from './syslog.js';

const syslogSettingFor: Record<string, string> = {
  SYSLOG_HOST: syslogHostSetting,
  SYSLOG_PORT: syslogPortSetting,
  SYSLOG_NAME: syslogNameSetting,
  SYSLOG_FACILITY: syslogFacilitySetting,
  SYSLOG_UTC_OFFSET: syslogOffsetSetting,
};

export function updateEnvAssignment(text: string, key: string, value: string): string {
  const line = `${key}=${value.replace(/[\r\n]/gu, '')}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, () => line);
  const body = text.endsWith('\n') || text === '' ? text : `${text}\n`;
  return `${body}${line}\n`;
}

function envFileUrl(): URL {
  return new URL('../../../.env', import.meta.url);
}

function secretsFile(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const root = process.env.LOCALAPPDATA?.trim();
  if (!root) return null;
  return join(root, 'kmbhelp', 'secrets.json');
}

async function remember(database: Database, key: string, value: string): Promise<void> {
  const stored = syslogSettingFor[key] ? syslogStoredValue(key, value) : value;
  const rows = [{ key: `config.${key}`, value: stored }];
  const syslogKey = syslogSettingFor[key];
  if (syslogKey) rows.push({ key: syslogKey, value: stored });
  await database.db
    .insert(appSetting)
    .values(rows)
    .onConflictDoUpdate({ target: appSetting.key, set: { value: sql`excluded.value` } });
}

function syslogStoredValue(key: string, value: string): string {
  if (key === 'SYSLOG_NAME') return syslogAppName(value);
  if (key === 'SYSLOG_FACILITY') return syslogFacility(value);
  if (key === 'SYSLOG_UTC_OFFSET') return syslogOffset(value);
  return value;
}

export async function saveConfigValue(
  database: Database,
  key: string,
  value: string,
): Promise<void> {
  const field = configField(key);
  if (!field) throw new Error('unknown config field');
  const trimmed = value.trim();
  if (field.secret && trimmed === '') return;
  if (field.secret) {
    const path = secretsFile();
    if (!path || !existsSync(path)) throw new Error('secrets file missing');
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('secrets file missing');
    }
    (parsed as Record<string, unknown>)[key] = value;
    writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    process.env[key] = value;
    return;
  }
  const stored = syslogStoredValue(key, trimmed);
  process.env[key] = stored;
  await remember(database, key, stored);
  const file = envFileUrl();
  if (existsSync(file)) {
    const current = readFileSync(file, 'utf8');
    writeFileSync(file, updateEnvAssignment(current, key, stored), 'utf8');
  }
}

export async function applyStoredConfig(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  const database = createDatabase(url);
  try {
    const rows = await database.db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting);
    for (const row of rows) {
      if (!row.key.startsWith('config.')) continue;
      const key = row.key.slice('config.'.length);
      if (!configField(key) || isSecretConfig(key) || row.value.trim() === '') continue;
      process.env[key] = row.value;
    }
  } catch {
    // The table is absent until the first migration.
  } finally {
    await database.pool.end();
  }
}
