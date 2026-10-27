import { inArray, sql } from 'drizzle-orm';
import { appSetting, type Database } from '@kmbhelp/db';
import {
  syslogFacilitySetting,
  syslogHostSetting,
  syslogNameSetting,
  syslogOffsetSetting,
  syslogFacilities,
  syslogPortSetting,
} from '@kmbhelp/shared';
import { syslogAppName, syslogFacility, syslogOffset, syslogTarget } from './syslog.js';

export type StoredSyslog = {
  host: string;
  port: number;
  appName: string;
  facility: (typeof syslogFacilities)[number];
  offset: string;
};

export async function readSyslogTarget(
  database: Database | undefined,
  env: NodeJS.ProcessEnv,
): Promise<StoredSyslog> {
  const fallback = syslogTarget(env);
  if (!database) return fallback;
  try {
    const rows = await database.db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting)
      .where(
        inArray(appSetting.key, [
          syslogHostSetting,
          syslogPortSetting,
          syslogNameSetting,
          syslogFacilitySetting,
          syslogOffsetSetting,
        ]),
      );
    const stored = (key: string) => rows.find((row) => row.key === key)?.value.trim() ?? '';
    const host = stored(syslogHostSetting);
    const port = Number(stored(syslogPortSetting));
    const appName = stored(syslogNameSetting);
    const facility = stored(syslogFacilitySetting);
    const offset = stored(syslogOffsetSetting);
    return {
      host: host !== '' ? host : fallback.host,
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback.port,
      appName: appName !== '' ? syslogAppName(appName) : fallback.appName,
      facility: facility !== '' ? syslogFacility(facility) : fallback.facility,
      offset: offset !== '' ? syslogOffset(offset) : fallback.offset,
    };
  } catch {
    return fallback;
  }
}

export async function writeSyslogTarget(database: Database, target: StoredSyslog): Promise<void> {
  await database.db
    .insert(appSetting)
    .values([
      { key: syslogHostSetting, value: target.host },
      { key: syslogPortSetting, value: String(target.port) },
      { key: syslogNameSetting, value: target.appName },
      { key: syslogFacilitySetting, value: target.facility },
      { key: syslogOffsetSetting, value: target.offset },
    ])
    .onConflictDoUpdate({ target: appSetting.key, set: { value: sql`excluded.value` } });
}
