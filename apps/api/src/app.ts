import { createDatabase, databaseReachable, type Database } from '@kmbhelp/db';
import { healthResponseSchema, publicErrors } from '@kmbhelp/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { openApiDocument } from './openapi.js';

export type BuildAppOptions = {
  databaseUrl?: string | undefined;
  checkDatabase?: (() => Promise<boolean>) | undefined;
  logger?: boolean | undefined;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
  });

  let database: Database | undefined;
  const checkDatabase =
    options.checkDatabase ??
    (async () => {
      const url = options.databaseUrl?.trim();
      if (!url) return false;
      database ??= createDatabase(url);
      return databaseReachable(database.pool);
    });

  app.addHook('onClose', async () => {
    await database?.pool.end();
  });

  app.get('/api/health', async (_request, reply) => {
    const up = await checkDatabase();
    const body = healthResponseSchema.parse({
      status: up ? 'ok' : 'degraded',
      service: 'kmbhelp-api',
      database: up ? 'up' : 'down',
    });
    return reply.code(up ? 200 : 503).send(body);
  });

  app.get('/api/docs', async () => openApiDocument);

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: 'not_found',
      message: publicErrors.notFound,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    return reply.code(500).send({
      error: 'internal_error',
      message: publicErrors.internal,
    });
  });

  return app;
}
