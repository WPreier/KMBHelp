import { createDatabase, databaseReachable, type Database } from '@kmbhelp/db';
import { healthResponseSchema, publicErrors } from '@kmbhelp/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { SearchExplainer } from './explain.js';
import { PublicError } from './http.js';
import { openApiDocument } from './openapi.js';
import { registerPhase2 } from './phase2.js';

export type BuildAppOptions = {
  databaseUrl?: string | undefined;
  database?: Database | undefined;
  checkDatabase?: (() => Promise<boolean>) | undefined;
  logger?: boolean | undefined;
  testAuthEnabled?: boolean | undefined;
  now?: (() => Date) | undefined;
  explainer?: SearchExplainer | undefined;
  ticketCreateLimit?: number | undefined;
  searchLimit?: number | undefined;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-kmbhelp-test-staff"]',
            'req.query',
          ],
        }
      : false,
  });

  let database = options.database;
  let ownsDatabase = false;
  if (!database && options.databaseUrl?.trim()) {
    database = createDatabase(options.databaseUrl.trim());
    ownsDatabase = true;
  }
  const checkDatabase =
    options.checkDatabase ??
    (async () => {
      if (!database) return false;
      return databaseReachable(database.pool);
    });

  app.addHook('onClose', async () => {
    if (ownsDatabase) await database?.pool.end();
  });

  async function healthPayload() {
    const up = await checkDatabase();
    return {
      code: up ? (200 as const) : (503 as const),
      body: healthResponseSchema.parse({
        status: up ? 'ok' : 'degraded',
        service: 'kmbhelp-api',
        database: up ? 'up' : 'down',
      }),
    };
  }
  app.get('/api/health', async (_request, reply) => {
    const payload = await healthPayload();
    return reply.code(payload.code).send(payload.body);
  });
  app.get('/api/v1/health', async (_request, reply) => {
    const payload = await healthPayload();
    return reply.code(payload.code).send(payload.body);
  });

  registerPhase2(app, {
    database,
    testAuthEnabled: options.testAuthEnabled ?? false,
    now: options.now,
    explainer: options.explainer,
    ticketCreateLimit: options.ticketCreateLimit,
    searchLimit: options.searchLimit,
  });

  app.get('/api/docs', async () => openApiDocument);

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: 'not_found',
      message: publicErrors.notFound,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof PublicError) {
      return reply.code(error.statusCode).send({ error: error.error, message: error.text });
    }
    request.log.error({ err: error }, 'request failed');
    return reply.code(500).send({
      error: 'internal_error',
      message: publicErrors.internal,
    });
  });

  return app;
}
