import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { readRuntimeAuth, TEST_STAFF_HEADER } from './auth.js';
import { buildApp } from './app.js';
import { categoryTitleExplainer } from './explain.js';
import { accessLogPath, createRateLimiter, createSecretToken, loggedRequestUrl } from './http.js';

describe('readRuntimeAuth', () => {
  it('refuses the test flag in production and ignores the header otherwise', () => {
    expect(() => readRuntimeAuth({ NODE_ENV: 'production', ALLOW_TEST_AUTH: '1' })).toThrow(
      /production/,
    );
    expect(readRuntimeAuth({ NODE_ENV: 'production' }).testAuthEnabled).toBe(false);
    expect(readRuntimeAuth({ NODE_ENV: 'development', ALLOW_TEST_AUTH: '1' }).testAuthEnabled).toBe(
      true,
    );
    expect(readRuntimeAuth({ NODE_ENV: 'test', ALLOW_TEST_AUTH: 'yes' }).testAuthEnabled).toBe(
      false,
    );
  });
});

describe('phase 2 helpers', () => {
  it('limits a key, hides the secret token in the access path, and uses 32 bytes', () => {
    const limiter = createRateLimiter(2, 60_000);
    expect(limiter.allow('a', 1_000)).toBe(true);
    expect(limiter.allow('a', 1_000)).toBe(true);
    expect(limiter.allow('a', 1_000)).toBe(false);
    expect(limiter.allow('a', 61_000)).toBe(true);
    expect(accessLogPath('/api/v1/tickets/by-token/abc?q=secret')).toBe(
      '/api/v1/tickets/by-token/:token',
    );
    expect(accessLogPath('/api/v1/search?q=ELDA')).toBe('/api/v1/search');
    expect(loggedRequestUrl('/api/v1/search?q=ELDA')).toBe('/api/v1/search');
    expect(loggedRequestUrl('/api/v1/tickets/public?status=open')).toBe(
      '/api/v1/tickets/public?status=open',
    );
    const token = createSecretToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).not.toMatch(/[+/=]/);
  });

  it('explains a hit with the category or title sentence', () => {
    expect(categoryTitleExplainer.explain({ kind: 'faq', title: 'ELDA' })).toEqual({
      de: 'Treffer wegen Kategorie/Titel',
      en: 'Match because of category or title',
    });
  });

  it('ignores the test header when test auth is off', async () => {
    const app = buildApp({ testAuthEnabled: false });
    await app.ready();
    const response = await request(app.server)
      .get('/api/v1/staff/tickets')
      .set(TEST_STAFF_HEADER, 'person@example.invalid');
    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain('example.invalid');
    await app.close();
  });
});
