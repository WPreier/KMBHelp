import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { scriptedModel } from '@kmbhelp/ai';
import { createDatabase, faqArticle, seedCatalog } from '@kmbhelp/db';
import { applyMigrations, createTestStaff } from '@kmbhelp/db/testing';
import { loadWorkstationEnv } from '@kmbhelp/shared/env';
import { TEST_STAFF_HEADER } from './auth.js';
import { buildApp } from './app.js';

loadWorkstationEnv();
const databaseUrl = process.env.DATABASE_URL?.trim();
const apps: FastifyInstance[] = [];

describe.skipIf(!databaseUrl)('phase 6 against postgres', () => {
  const database = createDatabase(databaseUrl ?? '');

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await database.pool.end();
  });

  it('explains staff search with the model and leaves public search on the phase 2 sentence', async () => {
    await applyMigrations(database);
    await seedCatalog(database);
    const email = `phase6-${randomUUID()}@example.com`;
    await createTestStaff(database.db, { email, displayName: 'Phase 6' });
    let explains = 0;
    const app = buildApp({
      database,
      testAuthEnabled: true,
      model: scriptedModel({
        sentence: { de: 'Passende Anleitung.', en: 'Matching guide.' },
        onExplain: () => {
          explains += 1;
        },
      }),
    });
    apps.push(app);
    await app.ready();
    const slug = `phase6-${randomUUID()}`;
    await database.db.insert(faqArticle).values({
      slug,
      titleDe: 'Phase Sechs Anleitung',
      titleEn: 'Phase six guide',
      bodyDe: 'Kurzanleitung',
      bodyEn: 'Short guide',
      published: true,
    });
    try {
      const created = await request(app.server)
        .post('/api/v1/tickets')
        .send({
          categoryCode: 'payroll_run',
          impact: 'workplace',
          subject: `Modellsuche ${randomUUID()}`,
          body: 'nur ein Test',
        });
      const publicSearch = await request(app.server)
        .get('/api/v1/search')
        .query({ q: 'Phase Sechs' });
      expect(publicSearch.status).toBe(200);
      expect(publicSearch.body.hits[0].sentenceDe).toBe('Treffer wegen Kategorie/Titel');
      expect(explains).toBe(0);

      const staffSearch = await request(app.server)
        .get('/api/v1/search')
        .query({ q: 'Phase Sechs' })
        .set(TEST_STAFF_HEADER, email);
      expect(staffSearch.body.hits[0].sentenceDe).toBe('Passende Anleitung.');
      expect(
        staffSearch.body.hits.some((hit: { href: string }) => hit.href === `/faq/${slug}`),
      ).toBe(true);
      expect(explains).toBe(1);

      const ticketSearch = await request(app.server)
        .get('/api/v1/search')
        .query({ q: 'Modellsuche' })
        .set(TEST_STAFF_HEADER, email);
      const ticketHit = ticketSearch.body.hits.find((hit: { href: string | null }) =>
        String(hit.href).startsWith('/mitarbeit/ticket/'),
      );
      expect(ticketHit.href).toBe(`/mitarbeit/ticket/${created.body.number}`);
    } finally {
      await database.db.delete(faqArticle).where(eq(faqArticle.slug, slug));
      await database.db
        .update(faqArticle)
        .set({ published: false, bodyDe: '', bodyEn: '' })
        .where(eq(faqArticle.slug, 'elda'));
    }
  });
});
