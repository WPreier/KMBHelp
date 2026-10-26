import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createDatabase } from '@kmbhelp/db';
import { loadEnvFileIfPresent } from '@kmbhelp/shared/env';
import { createLocalAdmin } from '../apps/api/src/local-admin.js';

loadEnvFileIfPresent(new URL('../.env', import.meta.url));

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL fehlt.\nDATABASE_URL is missing.\n');
  process.exit(1);
}

const username = await readSetting('LOCAL_ADMIN_USERNAME', 'Lokaler Admin, Benutzername: ');
const password = await readSetting('LOCAL_ADMIN_PASSWORD', 'Lokaler Admin, Passwort: ');
const database = createDatabase(databaseUrl);

try {
  await createLocalAdmin(database, username, password);
  process.stdout.write('Lokaler Admin angelegt.\nLocal admin created.\n');
} catch (error) {
  const message = error instanceof Error ? error.message : 'local admin was not created';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await database.pool.end();
}

async function readSetting(envName: string, prompt: string): Promise<string> {
  const fromEnv = process.env[envName]?.trim() ?? '';
  if (fromEnv) return fromEnv;
  if (!stdin.isTTY) {
    process.stderr.write(`${envName} fehlt.\n${envName} is missing.\n`);
    process.exit(1);
  }
  const input = createInterface({ input: stdin, output: stdout });
  try {
    return (await input.question(prompt)).trim();
  } finally {
    input.close();
  }
}
