/* global process, URL */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const envFile = process.env.KMBHELP_ENV_FILE || '/etc/kmbhelp/kmbhelp.env';
const backupDir = process.env.KMBHELP_BACKUP_DIR || '/var/backups/kmbhelp';
const retentionMs = 7 * 24 * 60 * 60 * 1000;

function databaseUrlFrom(text) {
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('DATABASE_URL=')) continue;
    return trimmed.slice('DATABASE_URL='.length).replace(/^["']|["']$/gu, '');
  }
  return '';
}

const url = databaseUrlFrom(readFileSync(envFile, 'utf8'));
if (!url) {
  process.stderr.write('DATABASE_URL fehlt.\n');
  process.exit(1);
}

const parsed = new URL(url);
const user = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);
const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
if (!user || !password || !database) {
  process.stderr.write('DATABASE_URL unvollständig.\n');
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });
const now = new Date();
const pad = (value) => String(value).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}`;
const target = join(backupDir, `kmbhelp-${stamp}.backup`);
const result = spawnSync(
  'pg_dump',
  [
    '-h',
    parsed.hostname,
    '-p',
    parsed.port || '5432',
    '-U',
    user,
    '-d',
    database,
    '--format=custom',
    `--file=${target}`,
    '--no-password',
  ],
  { env: { ...process.env, PGPASSWORD: password }, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const cutoff = Date.now() - retentionMs;
for (const entry of readdirSync(backupDir)) {
  if (!/^kmbhelp-\d{8}-\d{2}\.backup$/u.test(entry)) continue;
  const path = join(backupDir, entry);
  if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
}
process.stdout.write(`backup ok ${stamp}\n`);
