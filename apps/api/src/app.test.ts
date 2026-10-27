import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type BuildAppOptions } from './app.js';
import { readPort } from './port.js';

const apps: FastifyInstance[] = [];

async function start(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = buildApp(options);
  apps.push(app);
  await app.ready();
  return app;
}

describe('GET /api/health', () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('reports the database as down when no check is configured', async () => {
    const app = await start();
    const response = await request(app.server).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'degraded',
      service: 'kmbhelp-api',
      database: 'down',
      worker: 'down',
    });
  });

  it('reports ok when the database check succeeds', async () => {
    const app = await start({ checkDatabase: async () => true });
    const response = await request(app.server).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.database).toBe('up');
    expect(response.body.worker).toBe('down');
    expect(response.body.status).toBe('ok');
  });

  it('serves the OpenAPI document', async () => {
    const app = await start();
    const response = await request(app.server).get('/api/docs');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(response.body.paths['/api/health']).toBeTruthy();
  });

  it('returns German and English text and hides the exception', async () => {
    const app = buildApp();
    apps.push(app);
    app.get('/__test/boom', async () => {
      throw new Error('secret stack detail');
    });
    await app.ready();
    const response = await request(app.server).get('/__test/boom');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'internal_error',
      message: {
        de: 'Die Anfrage konnte nicht verarbeitet werden.',
        en: 'The request could not be processed.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret stack detail');
  });

  it('translates an unknown address', async () => {
    const app = await start();
    const response = await request(app.server).get('/api/missing');
    expect(response.status).toBe(404);
    expect(response.body.message.de).toContain('nicht');
    expect(response.body.message.en).toContain('does not exist');
  });
});

describe('readPort', () => {
  it('uses the fallback and rejects junk', () => {
    expect(readPort(undefined, 3000)).toBe(3000);
    expect(readPort('  ', 3000)).toBe(3000);
    expect(readPort('3001', 3000)).toBe(3001);
    expect(() => readPort('0', 3000)).toThrow('API_PORT');
    expect(() => readPort('abc', 3000)).toThrow('API_PORT');
  });
});
