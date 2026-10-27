import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, seedCatalog } from '@kmbhelp/db';
import { applyMigrations, createTestStaff } from '@kmbhelp/db/testing';
import { loadWorkstationEnv } from '@kmbhelp/shared/env';
import { TEST_STAFF_HEADER } from './auth.js';
import { buildApp } from './app.js';

loadWorkstationEnv();
const databaseUrl = process.env.DATABASE_URL?.trim();
const apps: FastifyInstance[] = [];

describe.skipIf(!databaseUrl)('phase 5 against postgres', () => {
  const database = createDatabase(databaseUrl ?? '');

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await database.pool.end();
  });

  async function staffApp() {
    await applyMigrations(database);
    await seedCatalog(database);
    const email = `phase5-${randomUUID()}@example.com`;
    await createTestStaff(database.db, { email, displayName: 'Phase 5' });
    const app = buildApp({
      database,
      testAuthEnabled: true,
      now: () => new Date('2026-03-02T10:00:00.000Z'),
    });
    apps.push(app);
    await app.ready();
    return { app, email };
  }

  it('rejects a freeze-window change without a reason and accepts one with a reason', async () => {
    const { app, email } = await staffApp();
    const denied = await request(app.server)
      .post('/api/v1/staff/changes')
      .set(TEST_STAFF_HEADER, email)
      .send({ summary: 'BMD Update', scheduledFor: '02.03.2026' });
    expect(denied.status).toBe(422);
    const allowed = await request(app.server)
      .post('/api/v1/staff/changes')
      .set(TEST_STAFF_HEADER, email)
      .send({
        summary: 'BMD Update',
        scheduledFor: '02.03.2026',
        fallbackText: 'Snapshot zurück',
        exceptionReason: 'Lohnlauf ist verschoben',
      });
    expect(allowed.status).toBe(200);
    const bare = await request(app.server)
      .post(`/api/v1/staff/changes/${allowed.body.number}/approve`)
      .set(TEST_STAFF_HEADER, email)
      .send({});
    expect(bare.status).toBe(200);
  });

  it('routes procurement and hides the ticket text from the supervisor', async () => {
    const { app, email } = await staffApp();
    const direct = await request(app.server)
      .post('/api/v1/staff/procurement')
      .set(TEST_STAFF_HEADER, email)
      .send({ article: 'Kabel', reason: 'Ersatz', amountNet: 40 });
    expect(direct.status).toBe(200);
    expect(direct.body.route).toBe('direct');
    const token = await request(app.server)
      .post('/api/v1/staff/procurement')
      .set(TEST_STAFF_HEADER, email)
      .send({
        article: 'Monitor',
        reason: 'Interner Grund',
        amountNet: 250,
        supervisorEmail: 'lead@example.com',
      });
    expect(token.status).toBe(200);
    expect(token.body.route).toBe('token');
    const secret = String(token.body.decisionPath).split('/').pop();
    const view = await request(app.server)
      .post('/api/v1/procurement/decision')
      .send({ token: secret });
    expect(view.status).toBe(200);
    expect(view.body.article).toBe('Monitor');
    expect(view.body.reason).toBeUndefined();
    expect(JSON.stringify(view.body)).not.toContain('Interner Grund');
    const manual = await request(app.server)
      .post('/api/v1/staff/procurement')
      .set(TEST_STAFF_HEADER, email)
      .send({ article: 'Server', reason: 'Ersatz', amountNet: 900 });
    expect(manual.body.route).toBe('manual');
  });

  it('refuses remote support until the supplier is approved with both dates', async () => {
    const { app, email } = await staffApp();
    const draft = await request(app.server)
      .post('/api/v1/staff/suppliers')
      .set(TEST_STAFF_HEADER, email)
      .send({
        name: 'Scan AG',
        purpose: 'Scan',
        countryCode: 'AT',
        subprocessorsKnown: false,
      });
    expect(draft.status).toBe(200);
    const blocked = await request(app.server)
      .post('/api/v1/staff/remote-support')
      .set(TEST_STAFF_HEADER, email)
      .send({
        supplierId: draft.body.id,
        windowStart: '2026-03-02T09:00:00.000Z',
        windowEnd: '2026-03-02T10:00:00.000Z',
        accountName: 'scan-admin',
      });
    expect(blocked.status).toBe(422);
    const approve = await request(app.server)
      .post(`/api/v1/staff/suppliers/${draft.body.id}/approve`)
      .set(TEST_STAFF_HEADER, email)
      .send({});
    expect(approve.status).toBe(422);
  });

  it('rejects a backup close without the restore answer and an offboarding without a date', async () => {
    const { app, email } = await staffApp();
    const opened = await request(app.server)
      .post('/api/v1/staff/backup-tests')
      .set(TEST_STAFF_HEADER, email)
      .send({ systemName: 'Lohn', backupTakenOn: '01.03.2026' });
    const closed = await request(app.server)
      .post(`/api/v1/staff/backup-tests/${opened.body.number}/close`)
      .set(TEST_STAFF_HEADER, email)
      .send({ restoredTo: 'Testsystem', resultText: 'offen', durationMinutes: 30 });
    expect(closed.status).toBe(422);
    const done = await request(app.server)
      .post(`/api/v1/staff/backup-tests/${opened.body.number}/close`)
      .set(TEST_STAFF_HEADER, email)
      .send({
        restored: true,
        restoredTo: 'Testsystem',
        resultText: 'Lohnstand lesbar',
        durationMinutes: 40,
      });
    expect(done.status).toBe(200);
    expect(done.body.dueOn).toBe('2026-05-31');
    const offboarding = await request(app.server)
      .post('/api/v1/staff/offboarding')
      .set(TEST_STAFF_HEADER, email)
      .send({ subject: 'Austritt', body: 'Checkliste' });
    expect(offboarding.status).toBe(422);
  });

  it('starts a security incident as P1 with a 72 hour deadline', async () => {
    const { app, email } = await staffApp();
    const created = await request(app.server)
      .post('/api/v1/staff/security-incidents')
      .set(TEST_STAFF_HEADER, email)
      .send({
        detectedAt: '2026-03-02T08:00:00.000Z',
        affected: 'Mailpostfach, keine Namensliste',
      });
    expect(created.status).toBe(200);
    expect(created.body.priority).toBe('p1');
    expect(created.body.deadlineAt).toBe('2026-03-05T08:00:00.000Z');
    const lowered = await request(app.server)
      .post(`/api/v1/staff/security-incidents/${created.body.number}/priority`)
      .set(TEST_STAFF_HEADER, email)
      .send({ priority: 'p3' });
    expect(lowered.status).toBe(422);
  });
});
