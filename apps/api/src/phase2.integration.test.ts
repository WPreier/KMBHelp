import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createDatabase, faqArticle, seedCatalog, staffSearch, ticket } from '@kmbhelp/db';
import { applyMigrations, createTestResidue, createTestStaff, deleteTestResidue, rememberTicketNumber } from '@kmbhelp/db/testing';
import { loadWorkstationEnv } from '@kmbhelp/shared/env';
import { TEST_STAFF_HEADER } from './auth.js';
import { buildApp } from './app.js';
import { queryHash } from './http.js';

loadWorkstationEnv();
const databaseUrl = process.env.DATABASE_URL?.trim();
const apps: FastifyInstance[] = [];

describe.skipIf(!databaseUrl)('phase 2 against postgres', () => {
  const database = createDatabase(databaseUrl ?? '');
  const residue = createTestResidue();

  afterEach(async () => {
    await deleteTestResidue(database, residue);
  });

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await database.pool.end();
  });

  it('files a ticket and hides the description on the public list', async () => {
    await applyMigrations(database);
    await seedCatalog(database);
    const app = buildApp({
      database,
      testAuthEnabled: true,
      now: () => new Date('2026-03-04T10:00:00.000Z'),
      ticketCreateLimit: 2,
    });
    apps.push(app);
    await app.ready();
    const subject = `Lauf ${randomUUID()}`;
    const created = await request(app.server)
      .post('/api/v1/tickets')
      .set('user-agent', 'a'.repeat(400))
      .send({
        categoryCode: 'payroll_run',
        impact: 'payroll',
        subject,
        body: 'Der Lauf steht.',
        requesterName: 'Melder',
        dueOn: '04.03.2026',
        clientPriority: 'p3',
      });
    expect(created.status).toBe(200);
    await rememberTicketNumber(database, created.body.number, residue);
    expect(created.body.priority).toBe('p1');
    expect(created.body.priorityReason).toBe('deadline_today_or_overdue');
    expect(created.body.secretPath).toBeUndefined();
    expect(JSON.stringify(created.body)).not.toContain(subject);

    const listed = await request(app.server).get('/api/v1/tickets/public');
    expect(listed.status).toBe(200);
    const visible = listed.body.tickets.find(
      (entry: { number: number }) => entry.number === created.body.number,
    );
    expect(visible.categoryCode).toBe('payroll_run');
    expect(visible.priority).toBe('p1');
    expect(visible.subject).toBe(subject);
    expect(visible.dueOn).toBe('2026-03-04');
    expect(JSON.stringify(listed.body)).not.toContain('Der Lauf steht.');
    expect(JSON.stringify(listed.body)).not.toContain('Melder');

    const logged = await database.pool.query<{ path: string; user_agent: string }>(
      `select path, user_agent from access_log where user_agent = $1`,
      ['a'.repeat(160)],
    );
    expect(logged.rows.some((row) => row.path === '/api/v1/tickets')).toBe(true);
    expect(logged.rows.some((row) => row.user_agent === 'a'.repeat(160))).toBe(true);

    const withoutEmail = await request(app.server)
      .post('/api/v1/tickets')
      .send({
        categoryCode: 'scanner',
        impact: 'workplace',
        subject: `Scanner ${randomUUID()}`,
        body: 'staut',
        clientPriority: 'p1',
      });
    expect(withoutEmail.status).toBe(200);
    await rememberTicketNumber(database, withoutEmail.body.number, residue);
    expect(withoutEmail.body.priority).toBe('p2');
    expect(withoutEmail.body.secretPath).toBeUndefined();

    const blocked = await request(app.server).post('/api/v1/tickets').send({
      categoryCode: 'scanner',
      impact: 'workplace',
      subject: 'noch eins',
      body: 'staut',
    });
    expect(blocked.status).toBe(429);
  });

  it('serves the staff list and keeps ticket text out of the public search', async () => {
    await applyMigrations(database);
    await seedCatalog(database);
    const marker = `Xylophonlauf-${randomUUID()}`;
    const email = `staff-${randomUUID()}@example.invalid`;
    const person = await createTestStaff(
      database.db,
      {
        email,
        displayName: 'Test Staff',
      },
      residue,
    );
    const app = buildApp({
      database,
      testAuthEnabled: true,
      explainer: {
        explain: () => ({ de: 'Modellsatz', en: 'Model sentence' }),
      },
    });
    apps.push(app);
    await app.ready();
    const created = await request(app.server).post('/api/v1/tickets').send({
      categoryCode: 'payroll_run',
      impact: 'cosmetic',
      subject: marker,
      body: 'nur ein Test',
    });
    expect(created.status).toBe(200);
    await rememberTicketNumber(database, created.body.number, residue);

    const denied = await request(app.server).get('/api/v1/staff/tickets');
    expect(denied.status).toBe(401);

    const staffList = await request(app.server)
      .get('/api/v1/staff/tickets')
      .set(TEST_STAFF_HEADER, email);
    expect(staffList.status).toBe(200);
    const openHit = staffList.body.open.find(
      (entry: { subject: string }) => entry.subject === marker,
    );
    expect(openHit.durationSeconds).toBeNull();
    expect(staffList.body.recent.length).toBeLessThanOrEqual(10);

    for (let index = 0; index < 11; index += 1) {
      const closedTicket = await database.db
        .insert(ticket)
        .values({
          type: 'incident',
          categoryCode: 'payroll_run',
          status: 'closed',
          impact: 'cosmetic',
          priority: 'p3',
          priorityReason: 'no_deadline',
          source: 'web',
          subject: `geschlossen ${index} ${randomUUID()}`,
          body: 'zu',
          updatedAt: new Date(Date.now() + index),
          closedAt: new Date(Date.now() + index),
        })
        .returning({ id: ticket.id });
      const closedId = closedTicket[0]?.id;
      if (closedId) residue.ticketIds.push(closedId);
    }
    const capped = await request(app.server)
      .get('/api/v1/staff/tickets')
      .set(TEST_STAFF_HEADER, email);
    expect(capped.body.recent).toHaveLength(10);
    expect(capped.body.recent[0].durationSeconds).toEqual(expect.any(Number));

    const publicSearch = await request(app.server).get('/api/v1/search').query({ q: marker });
    expect(publicSearch.status).toBe(200);
    expect(JSON.stringify(publicSearch.body)).not.toContain(marker);
    const storedPublic = await database.db
      .select({ sentenceDe: staffSearch.sentenceDe, queryHash: staffSearch.queryHash })
      .from(staffSearch);
    expect(JSON.stringify(storedPublic)).not.toContain(marker);

    const staffSearchResponse = await request(app.server)
      .get('/api/v1/search')
      .query({ q: marker })
      .set(TEST_STAFF_HEADER, email);
    expect(staffSearchResponse.body.hits[0].sentenceDe).toBe('Modellsatz');
    expect(staffSearchResponse.body.hits[0].titleDe).toBe(marker);
    expect(staffSearchResponse.body.hits[0].href).toBe(`/mitarbeit/ticket/${created.body.number}`);
    expect(staffSearchResponse.body.hits[0].body).toBeUndefined();
    const stored = await database.db
      .select({ queryHash: staffSearch.queryHash, sentenceDe: staffSearch.sentenceDe })
      .from(staffSearch)
      .where(eq(staffSearch.staffId, person.id));
    expect(stored.some((row) => row.queryHash === queryHash(marker))).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(marker);
  });

  it('lists only published guides and a redacted article', async () => {
    await applyMigrations(database);
    await seedCatalog(database);
    const app = buildApp({ database, testAuthEnabled: false });
    apps.push(app);
    await app.ready();
    const empty = await request(app.server).get('/api/v1/faq');
    expect(empty.status).toBe(200);
    expect(empty.body.articles).toEqual([]);
    const hidden = await request(app.server).get('/api/v1/faq/elda');
    expect(hidden.status).toBe(404);

    await database.db
      .update(faqArticle)
      .set({ published: true, bodyDe: '', bodyEn: '' })
      .where(eq(faqArticle.slug, 'elda'));
    try {
      const listed = await request(app.server).get('/api/v1/faq');
      expect(listed.body.articles.map((entry: { slug: string }) => entry.slug)).toContain('elda');
      const article = await request(app.server).get('/api/v1/faq/elda');
      expect(article.body.bodyDe).toBe('');
      const found = await request(app.server).get('/api/v1/search').query({ q: 'ELDA' });
      expect(found.body.hits.some((hit: { href: string }) => hit.href === '/faq/elda')).toBe(true);
      expect(found.body.hits[0].sentenceDe).toBe('Treffer wegen Kategorie/Titel');
    } finally {
      await database.db
        .update(faqArticle)
        .set({ published: false })
        .where(eq(faqArticle.slug, 'elda'));
    }

    const draft = await database.pool.query<{ id: string }>(
      `insert into knowledge_article (title, body, status, redacted)
       values ('Intern', 'Rohtext', 'draft', false) returning id`,
    );
    const published = await database.pool.query<{ id: string }>(
      `insert into knowledge_article (title, body, status, redacted)
       values ('VPN kurz', 'Nur der redigierte Satz.', 'published', true) returning id`,
    );
    try {
      const draftRead = await request(app.server).get(`/api/v1/knowledge/${draft.rows[0]?.id}`);
      expect(draftRead.status).toBe(404);
      const articleRead = await request(app.server).get(
        `/api/v1/knowledge/${published.rows[0]?.id}`,
      );
      expect(articleRead.status).toBe(200);
      expect(articleRead.body.body).toBe('Nur der redigierte Satz.');
    } finally {
      await database.pool.query(`delete from knowledge_article where id = any($1::uuid[])`, [
        [draft.rows[0]?.id, published.rows[0]?.id],
      ]);
    }
  });

  it('expires a past due date, toggles inactive, and keeps a closed ticket closed', async () => {
    await applyMigrations(database);
    await seedCatalog(database);
    const app = buildApp({
      database,
      now: () => new Date('2026-04-10T08:00:00.000Z'),
    });
    apps.push(app);
    await app.ready();
    const overdue = await request(app.server)
      .post('/api/v1/tickets')
      .send({
        categoryCode: 'scanner',
        impact: 'workplace',
        subject: `Frist ${randomUUID()}`,
        body: 'vorbei',
        dueOn: '01.04.2026',
      });
    await rememberTicketNumber(database, overdue.body.number, residue);
    const listed = await request(app.server).get('/api/v1/tickets/public');
    const expired = listed.body.tickets.find(
      (entry: { number: number }) => entry.number === overdue.body.number,
    );
    expect(expired.status).toBe('expired');

    const fresh = await request(app.server)
      .post('/api/v1/tickets')
      .send({
        categoryCode: 'scanner',
        impact: 'cosmetic',
        subject: `Aktiv ${randomUUID()}`,
        body: 'noch da',
      });
    const number = fresh.body.number as number;
    await rememberTicketNumber(database, number, residue);
    const off = await request(app.server)
      .post(`/api/v1/tickets/public/${number}`)
      .send({ action: 'toggle' });
    expect(off.body.status).toBe('inactive');
    const on = await request(app.server)
      .post(`/api/v1/tickets/public/${number}`)
      .send({ action: 'toggle' });
    expect(on.body.status).toBe('open');
    const priority = await request(app.server)
      .post(`/api/v1/tickets/public/${number}`)
      .send({ action: 'priority', priority: 'p1' });
    expect(priority.body.priority).toBe('p1');
    const events = await database.pool.query<{ kind: string }>(
      `select kind from ticket_event where ticket_id = (select id from ticket where number = $1)`,
      [number],
    );
    expect(events.rows.map((row) => row.kind)).toEqual(
      expect.arrayContaining(['deactivated', 'reopened', 'notification', 'priority_changed']),
    );
    const closed = await request(app.server)
      .post(`/api/v1/tickets/public/${number}`)
      .send({ action: 'close' });
    expect(closed.body.status).toBe('closed');
    const again = await request(app.server)
      .post(`/api/v1/tickets/public/${number}`)
      .send({ action: 'toggle' });
    expect(again.status).toBe(409);
  });
});
