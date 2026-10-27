import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { and, desc, gte, ilike, lte, or, type SQL } from 'drizzle-orm';
import { activityLog, type Database } from '@kmbhelp/db';

export type ActivityEntry = {
  actor: string;
  kind: 'page' | 'mail';
  target: string;
  detail: string;
  ip: string;
};

export type ActivityRow = ActivityEntry & { at: Date };

export function activityLogPath(env: NodeJS.ProcessEnv = process.env): string {
  const chosen = env.ACTIVITY_LOG_FILE?.trim();
  if (chosen) return chosen;
  const root = env.LOCALAPPDATA?.trim() || env.HOME?.trim() || '';
  return root ? join(root, 'kmbhelp', 'activity.log') : '';
}

export function activityLine(entry: ActivityRow): string {
  const fields = [
    entry.at.toISOString(),
    entry.actor,
    entry.kind,
    entry.target,
    entry.detail,
    entry.ip,
  ].map((field) => field.replace(/[\t\r\n]/gu, ' ').slice(0, 300));
  return fields.join('\t');
}

export function appendActivityFile(entry: ActivityRow, env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'test' && !env.ACTIVITY_LOG_FILE?.trim()) return;
  const path = activityLogPath(env);
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${activityLine(entry)}\n`, 'utf8');
}

export async function writeActivity(
  database: Database,
  entry: ActivityEntry,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const row: ActivityRow = { ...entry, at: new Date() };
  await database.db.insert(activityLog).values({
    actor: entry.actor.slice(0, 200),
    kind: entry.kind,
    target: entry.target.slice(0, 200),
    detail: entry.detail.slice(0, 300),
    ip: entry.ip.slice(0, 80),
  });
  try {
    appendActivityFile(row, env);
  } catch {
    // The database row remains. A full disk must not hide the access.
  }
}

export async function readActivity(
  database: Database,
  filter: { from?: Date | undefined; to?: Date | undefined; q?: string | undefined; limit: number },
): Promise<ActivityRow[]> {
  const terms: SQL[] = [];
  if (filter.from) terms.push(gte(activityLog.at, filter.from));
  if (filter.to) terms.push(lte(activityLog.at, filter.to));
  const query = filter.q?.trim();
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/gu, (character) => `\\${character}`)}%`;
    const match = or(
      ilike(activityLog.actor, pattern),
      ilike(activityLog.kind, pattern),
      ilike(activityLog.target, pattern),
      ilike(activityLog.detail, pattern),
    );
    if (match) terms.push(match);
  }
  const rows = await database.db
    .select({
      at: activityLog.at,
      actor: activityLog.actor,
      kind: activityLog.kind,
      target: activityLog.target,
      detail: activityLog.detail,
      ip: activityLog.ip,
    })
    .from(activityLog)
    .where(terms.length > 0 ? and(...terms) : undefined)
    .orderBy(desc(activityLog.at))
    .limit(filter.limit);
  return rows.map((row) => ({ ...row, kind: row.kind === 'mail' ? 'mail' : 'page' }));
}
