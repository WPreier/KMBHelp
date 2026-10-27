import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, remoteSupportDetail, seedCatalog, supplier, ticket, ticketEvent } from '@kmbhelp/db';
import { applyMigrations, createTestStaff } from '@kmbhelp/db/testing';
import { loadWorkstationEnv } from '@kmbhelp/shared/env';
import { TEST_STAFF_HEADER } from './auth.js';
import { buildApp } from './app.js';

loadWorkstationEnv();
const databaseUrl = process.env.DATABASE_URL?.trim();
const apps: FastifyInstance[] = [];

describe.skipIf(!databaseUrl)('phase 7 against postgres', () => {
  const database = createDatabase(databaseUrl ?? '');

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await database.pool.end();
  });

  it('shows an agent only assigned tickets and a lead the firm', async () => {
    await applyMigrations(database);
    await seedCatalog(database);
    const suffix = randomUUID();
    const agent = await createTestStaff(database.db, {
      email: `dash-agent-${suffix}@example.com`,
      displayName: 'Dash Agent',
      role: 'agent',
    });
    const lead = await createTestStaff(database.db, {
      email: `dash-lead-${suffix}@example.com`,
      displayName: 'Dash Lead',
      role: 'lead',
    });
    const other = await createTestStaff(database.db, {
      email: `dash-other-${suffix}@example.com`,
      displayName: 'Dash Other',
      role: 'agent',
    });
    const created = await database.db
      .insert(ticket)
      .values([
        {
          type: 'incident',
          categoryCode: 'printer',
          status: 'closed',
          impact: 'workplace',
          priority: 'p3',
          priorityReason: 'test',
          source: 'web',
          subject: 'Eigenes Ticket',
          body: 'bleibt intern',
          assignedStaffId: agent.id,
          createdAt: new Date('2026-10-27T08:00:00.000Z'),
          closedAt: new Date('2026-10-27T09:00:00.000Z'),
          effortMinutes: 25,
        },
        {
          type: 'incident',
          categoryCode: 'printer',
          status: 'open',
          impact: 'workplace',
          priority: 'p1',
          priorityReason: 'test',
          source: 'web',
          subject: `Fremdes Ticket ${suffix}`,
          body: 'bleibt intern',
          assignedStaffId: other.id,
          createdAt: new Date('2026-10-27T08:10:00.000Z'),
        },
      ])
      .returning({ id: ticket.id, number: ticket.number, assignedStaffId: ticket.assignedStaffId });
    const own = created.find((row) => row.assignedStaffId === agent.id);
    if (!own) throw new Error('ticket missing');
    await database.db.insert(ticketEvent).values({
      ticketId: own.id,
      kind: 'assigned',
      at: new Date('2026-10-27T08:15:00.000Z'),
      payload: {},
    });
    const vendor = await database.db
      .insert(supplier)
      .values({
        name: `Dash ${suffix}`,
        purpose: 'Test',
        countryCode: 'AT',
        subprocessorsKnown: false,
      })
      .returning({ id: supplier.id });
    const foreign = created.find((row) => row.assignedStaffId === other.id);
    if (!foreign || !vendor[0]) throw new Error('row missing');
    await database.db.insert(remoteSupportDetail).values({
      ticketId: foreign.id,
      supplierId: vendor[0].id,
      windowEnd: new Date('2026-10-27T07:00:00.000Z'),
    });
    const app = buildApp({
      database,
      testAuthEnabled: true,
      now: () => new Date('2026-10-27T12:00:00.000Z'),
    });
    apps.push(app);
    await app.ready();
    const denied = await request(app.server).get('/api/v1/staff/dashboard');
    expect(denied.status).toBe(401);
    const agentView = await request(app.server)
      .get('/api/v1/staff/dashboard?range=day')
      .set(TEST_STAFF_HEADER, `dash-agent-${suffix}@example.com`);
    expect(agentView.status).toBe(200);
    expect(agentView.body.scope).toBe('own');
    expect(agentView.body.incoming).toBe(1);
    expect(agentView.body.closed).toBe(1);
    expect(agentView.body.openP1).toBe(0);
    expect(agentView.body.effortMinutes).toBe(25);
    expect(agentView.body.medianFirstResponseMinutes).toBe(15);
    expect(agentView.body.remoteOverruns).toEqual([]);
    expect(agentView.body.slices.reduce((sum: number, slice: { percent: number }) => sum + slice.percent, 0)).toBe(
      100,
    );
    expect(agentView.body.subject).toBeUndefined();
    const leadView = await request(app.server)
      .get('/api/v1/staff/dashboard?range=day')
      .set(TEST_STAFF_HEADER, `dash-lead-${suffix}@example.com`);
    expect(leadView.status).toBe(200);
    expect(leadView.body.scope).toBe('firm');
    expect(leadView.body.incoming).toBeGreaterThanOrEqual(2);
    expect(leadView.body.openP1).toBeGreaterThanOrEqual(1);
    const overrun = leadView.body.remoteOverruns.find(
      (row: { subject: string }) => row.subject === `Fremdes Ticket ${suffix}`,
    );
    expect(overrun?.supplierName).toBe(`Dash ${suffix}`);
    expect(overrun?.categoryCode).toBe('printer');
    expect(leadView.body.slices.reduce((sum: number, slice: { percent: number }) => sum + slice.percent, 0)).toBe(
      100,
    );
    expect(JSON.stringify(leadView.body)).not.toContain('bleibt intern');
    const hidden = await request(app.server).get(`/api/v1/staff/tickets/${foreign.number}`);
    expect(hidden.status).toBe(401);
    const opened = await request(app.server)
      .get(`/api/v1/staff/tickets/${foreign.number}`)
      .set(TEST_STAFF_HEADER, `dash-agent-${suffix}@example.com`);
    expect(opened.status).toBe(200);
    expect(opened.body.subject).toBe(`Fremdes Ticket ${suffix}`);
    expect(opened.body.body).toBe('bleibt intern');
    expect(opened.body.remote.supplierName).toBe(`Dash ${suffix}`);
  });
});
