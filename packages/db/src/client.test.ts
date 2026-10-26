import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';
import { applyMigrations } from './testing/apply-migrations.js';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

describe('migration journal', () => {
  it('keeps the phase 0 migration empty and adds the phase 1 tables later', () => {
    const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
      entries: { tag: string }[];
    };
    expect(journal.entries[0]?.tag).toBe('0000_empty');
    const empty = readFileSync(`${migrationsFolder}/0000_empty.sql`, 'utf8');
    expect(empty.toLowerCase()).not.toContain('create table');
    const later = journal.entries
      .slice(1)
      .map((entry) => readFileSync(`${migrationsFolder}/${entry.tag}.sql`, 'utf8'))
      .join('\n')
      .toLowerCase();
    expect(later).toContain('create table');
    expect(later).toContain('ticket_event');
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
      await applyMigrations(database);
      const result = await database.pool.query<{ ok: number }>('select 1 as ok');
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await database.pool.end();
    }
  });
});
