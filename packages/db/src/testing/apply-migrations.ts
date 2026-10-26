import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from '../client.js';

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));
const migrationLock = 814271;

export async function applyMigrations(database: Database): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [migrationLock]);
    await migrate(database.db, { migrationsFolder });
  } finally {
    await client.query('select pg_advisory_unlock($1)', [migrationLock]).catch(() => undefined);
    client.release();
  }
}
