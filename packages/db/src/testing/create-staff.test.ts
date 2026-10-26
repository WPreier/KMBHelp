import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client.js';
import { applyMigrations } from './apply-migrations.js';
import { createTestStaff } from './create-staff.js';

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('createTestStaff', () => {
  it('is refused in production and is not imported by the API', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        createTestStaff({} as never, {
          email: 'unused@example.invalid',
          displayName: 'Unused',
        }),
      ).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = previous;
    }

    const apiSource = fileURLToPath(new URL('../../../../apps/api/src', import.meta.url));
    const combined = sourceFiles(apiSource)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(combined).not.toContain('@kmbhelp/db/testing');
    expect(combined).not.toContain('createTestStaff');
  });
});

const databaseUrl = process.env.DATABASE_URL?.trim();

describe.skipIf(!databaseUrl)('createTestStaff against postgres', () => {
  it('inserts a staff row outside production', async () => {
    const database = createDatabase(databaseUrl ?? '');
    const email = `factory-${Date.now()}@example.invalid`;
    try {
      await applyMigrations(database);
      const created = await createTestStaff(database.db, {
        email,
        displayName: 'Factory Tester',
        role: 'agent',
      });
      const found = await database.pool.query<{ email: string }>(
        'select email from staff where id = $1',
        [created.id],
      );
      expect(found.rows[0]?.email).toBe(email);
      await database.pool.query('delete from staff where id = $1', [created.id]);
    } finally {
      await database.pool.end();
    }
  });
});
