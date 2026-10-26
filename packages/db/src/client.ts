import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Database = {
  db: NodePgDatabase;
  pool: Pool;
};

export function createDatabase(connectionString: string): Database {
  const url = connectionString.trim();
  if (!url) {
    throw new Error('DATABASE_URL is empty');
  }
  const pool = new Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 3_000,
  });
  return { db: drizzle(pool), pool };
}

export async function databaseReachable(pool: Pool): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}
