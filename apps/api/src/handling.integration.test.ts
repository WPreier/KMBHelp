import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createDatabase, mailLesson, seedCatalog, ticket } from '@kmbhelp/db';
import { applyMigrations, createTestResidue, createTestStaff, deleteTestResidue } from '@kmbhelp/db/testing';
import { eq } from 'drizzle-orm';
import { loadWorkstationEnv } from '@kmbhelp/shared/env';
import { buildApp } from './app.js';
import { TEST_STAFF_HEADER } from './auth.js';
import type { Mailer } from './graph.js';

loadWorkstationEnv();
const databaseUrl = process.env.DATABASE_URL?.trim();

describe.skipIf(!databaseUrl)('phase 9 against postgres', () => {
  const database = createDatabase(databaseUrl ?? '');
  const residue = createTestResidue();
  const sent: { to: string; subject: string; text: string }[] = [];
  let connected = false;
  const mailer: Mailer = {
    get configured() {
      return connected;
    },
    async send(mail) {
      sent.push(mail);
    },
  };

  afterEach(async () => {
    await deleteTestResidue(database, residue);
    sent.length = 0;
    connected = false;
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it('closes with the solved mail and refuses satisfaction from staff', async () => {
    await applyMigrations(database);
    await seedCatalog(database);
    const email = `phase9-${randomUUID()}@example.com`;
    await createTestStaff(database.db, { email, displayName: 'Phase 9' }, residue);
    const messageId = `<${randomUUID()}@example.com>`;
    const created = await database.db
      .insert(ticket)
      .values({
        type: 'incident',
        categoryCode: 'printer',
        status: 'open',
        impact: 'workplace',
        priority: 'p2',
        priorityReason: 'workplace',
        source: 'mail',
        subject: `Drucker ${randomUUID()}`,
        body: 'kein Papier',
        requesterEmail: 'user@example.com',
        internetMessageId: messageId,
      })
      .returning({ id: ticket.id, number: ticket.number });
    const row = created[0];
    if (!row) throw new Error('ticket missing');
    residue.ticketIds.push(row.id);
    const app = buildApp({ database, testAuthEnabled: true, mailer });
    await app.ready();
    const forbidden = await request(app.server)
      .patch(`/api/v1/staff/tickets/${row.number}`)
      .set(TEST_STAFF_HEADER, email)
      .send({
        subject: 'Drucker',
        body: 'kein Papier',
        categoryCode: 'printer',
        impact: 'workplace',
        priority: 'p2',
        dueOn: null,
        requesterName: null,
        requesterEmail: 'user@example.com',
        explanation: 'Hinweis',
        assignedStaffId: null,
        satisfaction: 'satisfied',
      });
    expect(forbidden.status).toBe(422);
    const blocked = await request(app.server)
      .post(`/api/v1/staff/tickets/${row.number}/done`)
      .set(TEST_STAFF_HEADER, email);
    expect(blocked.status).toBe(503);
    const still = await database.db.select({ status: ticket.status }).from(ticket).where(eq(ticket.id, row.id));
    expect(still[0]?.status).toBe('open');

    connected = true;
    const closed = await request(app.server)
      .post(`/api/v1/staff/tickets/${row.number}/done`)
      .set(TEST_STAFF_HEADER, email);
    expect(closed.status).toBe(200);
    expect(closed.body.satisfaction).toBeNull();
    expect(sent[0]?.subject).toBe(`Ticket ${row.number}`);
    expect(sent[0]?.text).toContain('zur Zufriedenheit');

    const other = await database.db
      .insert(ticket)
      .values({
        type: 'incident',
        categoryCode: 'printer',
        status: 'open',
        impact: 'workplace',
        priority: 'p3',
        priorityReason: 'no_deadline',
        source: 'mail',
        subject: `Falsch ${randomUUID()}`,
        body: 'kein Ticket',
        internetMessageId: `<${randomUUID()}@example.com>`,
      })
      .returning({ id: ticket.id, number: ticket.number, internetMessageId: ticket.internetMessageId });
    const wrong = other[0];
    if (!wrong?.internetMessageId) throw new Error('ticket missing');
    residue.ticketIds.push(wrong.id);
    const removed = await request(app.server)
      .post(`/api/v1/staff/tickets/${wrong.number}/misread`)
      .set(TEST_STAFF_HEADER, email)
      .send({ reason: 'Newsletter' });
    expect(removed.status).toBe(200);
    const gone = await database.db.select({ id: ticket.id }).from(ticket).where(eq(ticket.id, wrong.id));
    expect(gone).toHaveLength(0);
    const lesson = await database.db
      .select({ outcome: mailLesson.outcome, reason: mailLesson.reason })
      .from(mailLesson)
      .where(eq(mailLesson.internetMessageId, wrong.internetMessageId));
    expect(lesson[0]).toEqual({ outcome: 'rejected', reason: 'Newsletter' });
    await database.db.delete(mailLesson).where(eq(mailLesson.internetMessageId, wrong.internetMessageId));
    await app.close();
  });
});
