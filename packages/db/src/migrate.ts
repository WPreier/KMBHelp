import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from '@kmbhelp/shared/env';
import { createDatabase } from './client.js';

loadProjectEnv(new URL('../../../.env', import.meta.url));

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  process.stderr.write('DATABASE_URL is not set.\n');
  process.exit(1);
}

const database = createDatabase(connectionString);
try {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
  process.stdout.write('migrations applied\n');
} finally {
  await database.pool.end();
}
