import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

describe('migration journal', () => {
  it('ships one migration and no tables yet', () => {
    const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
      entries: { tag: string }[];
    };
    expect(journal.entries).toHaveLength(1);
    const tag = journal.entries[0]?.tag;
    expect(tag).toBeTruthy();
    const sql = readFileSync(`${migrationsFolder}/${tag}.sql`, 'utf8');
    expect(sql.toLowerCase()).not.toContain('create table');
  });
});

describe('createDatabase', () => {
  it('refuses an empty connection string', () => {
    expect(() => createDatabase('   ')).toThrow('DATABASE_URL is empty');
  });
});

const databaseUrl = process.env.DATABASE_URL?.trim();

describe.skipIf(!databaseUrl)('postgres', () => {
  it('applies the empty migration', async () => {
    const database = createDatabase(databaseUrl ?? '');
    try {
      await migrate(database.db, { migrationsFolder });
      const result = await database.pool.query<{ ok: number }>('select 1 as ok');
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await database.pool.end();
    }
  });
});
