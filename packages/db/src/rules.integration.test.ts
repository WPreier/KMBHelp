import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';
import { seedCatalog } from './seed.js';
import { applyMigrations } from './testing/apply-migrations.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

describe.skipIf(!databaseUrl)('phase 1 database rules', () => {
  it('stores one ticket per internet message id and keeps events append-only', async () => {
    const database = createDatabase(databaseUrl ?? '');
    const client = await database.pool.connect();
    const messageId = `<${randomUUID()}@example.invalid>`;
    try {
      await applyMigrations(database);
      await seedCatalog(database);
      await seedCatalog(database);
      await client.query('begin');
      const inserted = await client.query<{ id: string }>(
        `insert into ticket (
          type, category_code, status, impact, priority, priority_reason, source, subject, body, internet_message_id
        ) values (
          'incident', 'payroll_run', 'open', 'payroll', 'p1', 'deadline_today_or_overdue', 'mail', 'Lauf', 'steht', $1
        ) returning id`,
        [messageId],
      );
      const ticketId = inserted.rows[0]?.id;
      expect(ticketId).toBeTruthy();
      await expect(
        client.query(
          `insert into ticket (
            type, category_code, status, impact, priority, priority_reason, source, subject, body, internet_message_id
          ) values (
            'incident', 'payroll_run', 'open', 'payroll', 'p1', 'deadline_today_or_overdue', 'mail', 'Lauf', 'nochmal', $1
          )`,
          [messageId],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);

      await client.query('rollback');
      await client.query('begin');
      const second = await client.query<{ id: string }>(
        `insert into ticket (
          type, category_code, status, impact, priority, priority_reason, source, subject, body
        ) values (
          'incident', 'payroll_run', 'open', 'cosmetic', 'p3', 'no_deadline', 'web', 'Signatur', 'bitte'
        ) returning id`,
      );
      const event = await client.query<{ id: string }>(
        `insert into ticket_event (ticket_id, kind, payload) values ($1, 'created', '{}'::jsonb) returning id`,
        [second.rows[0]?.id],
      );
      await expect(
        client.query(`update ticket_event set kind = 'edited' where id = $1`, [event.rows[0]?.id]),
      ).rejects.toThrow(/append-only/);
      await client.query('rollback');
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
      await database.pool.end();
    }
  });
});
