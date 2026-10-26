import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, faqArticle, seedCatalog, staffSearch, ticket } from '@kmbhelp/db';
import { applyMigrations, createTestStaff } from '@kmbhelp/db/testing';
import { TEST_STAFF_HEADER } from './auth.js';
import { buildApp } from './app.js';
import { queryHash } from './http.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const apps: FastifyInstance[] = [];

describe.skipIf(!databaseUrl)('phase 2 against postgres', () => {
  const database = createDatabase(databaseUrl ?? '');

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await database.pool.end();
  });

  it('files a ticket, hides the public text, and opens the secret link', async () => {
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
        requesterEmail: 'melder@example.invalid',
        requesterName: 'Melder',
        dueOn: '2026-03-04',
        clientPriority: 'p3',
      });
    expect(created.status).toBe(200);
    expect(created.body.priority).toBe('p1');
    expect(created.body.priorityReason).toBe('deadline_today_or_overdue');
    expect(created.body.secretPath).toMatch(/^\/t\/[A-Za-z0-9_-]{43,}$/);
    expect(JSON.stringify(created.body)).not.toContain(subject);

    const listed = await request(app.server).get('/api/v1/tickets/public');
    expect(listed.status).toBe(200);
    const visible = listed.body.tickets.find(
      (entry: { number: number }) => entry.number === created.body.number,
    );
    expect(visible.categoryCode).toBe('payroll_run');
    expect(visible.priority).toBe('p1');
    expect(Object.keys(visible).sort()).toEqual([
      'ageSeconds',
      'categoryCode',
      'categoryLabelDe',
      'categoryLabelEn',
      'groupCode',
      'groupLabelDe',
      'groupLabelEn',
      'number',
      'priority',
      'status',
    ]);
    expect(JSON.stringify(listed.body)).not.toContain(subject);
    expect(JSON.stringify(listed.body)).not.toContain('melder@example.invalid');

    const token = String(created.body.secretPath).slice(3);
    const secret = await request(app.server).get(`/api/v1/tickets/by-token/${token}`);
    expect(secret.status).toBe(200);
    expect(secret.body.subject).toBe(subject);
    expect(secret.body.body).toBe('Der Lauf steht.');
    expect(secret.body.requesterEmail).toBeUndefined();
    expect(JSON.stringify(secret.body)).not.toContain('melder@example.invalid');

    const logged = await database.pool.query<{ path: string; user_agent: string }>(
      `select path, user_agent from access_log where path like '%by-token%' or user_agent = $1`,
      ['a'.repeat(160)],
    );
    expect(logged.rows.some((row) => row.path === '/api/v1/tickets/by-token/:token')).toBe(true);
    expect(logged.rows.some((row) => row.path.includes(token))).toBe(false);
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
    expect(withoutEmail.body.priority).toBe('p2');
    expect(withoutEmail.body.secretPath).toBeNull();

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
    const person = await createTestStaff(database.db, {
      email,
      displayName: 'Test Staff',
    });
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
      requesterEmail: 'melder@example.invalid',
    });
    expect(created.status).toBe(200);

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
      await database.db.insert(ticket).values({
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
      });
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
    expect(staffSearchResponse.body.hits[0].href).toBeNull();
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
});
