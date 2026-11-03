import { randomBytes } from 'node:crypto';
import { modelProviderFromEnv, unconfiguredModel, type ModelProvider } from '@kmbhelp/ai';
import { createDatabase, databaseReachable, type Database } from '@kmbhelp/db';
import { healthResponseSchema, publicErrors } from '@kmbhelp/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { directoryFromEnv, type Directory } from './directory.js';
import type { SearchExplainer } from './explain.js';
import { writeActivity } from './activity-log.js';
import { logError } from './file-log.js';
import { clientAddress, loggedRequestUrl, PublicError, safeErrorText } from './http.js';
import { withDevelopmentLoopback } from './network.js';
import { openApiDocument } from './openapi.js';
import { readWorkerState } from './mail-cycle.js';
import { tcpOpen } from './probes.js';
import { registerPhase2 } from './phase2.js';
import { registerOperations } from './operations.js';
import { registerPhase3 } from './phase3.js';
import { registerPhase5 } from './phase5.js';
import { registerActivity } from './activity-routes.js';
import { registerDashboard } from './dashboard-routes.js';
import { registerStaffTicket } from './ticket-view-routes.js';
import type { Mailbox, Mailer } from './graph.js';

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
  directory?: Directory | undefined;
  sessionSecret?: string | undefined;
  adminAllowlist?: string | undefined;
  webauthnRpId?: string | undefined;
  webauthnOrigin?: string | undefined;
  worker?: 'up' | 'down' | 'not_configured' | undefined;
  smtp?: 'up' | 'down' | undefined;
  model?: ModelProvider | undefined;
  mailer?: Mailer | undefined;
  mailbox?: Mailbox | undefined;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-kmbhelp-test-staff"]',
            'req.headers["x-kmbhelp-csrf"]',
            'req.body.password',
            'req.body.currentPassword',
            'req.body.newPassword',
            'req.body.code',
            'req.body.token',
            'req.query',
          ],
          serializers: {
            req(request) {
              return {
                method: request.method,
                url: loggedRequestUrl(request.url),
                host: request.host,
                remoteAddress: request.ip,
                remotePort: request.socket?.remotePort,
              };
            },
          },
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

  let smtpCache: { at: number; value: 'up' | 'down' } | null = null;
  async function smtpState(): Promise<'up' | 'down'> {
    if (options.smtp) return options.smtp;
    if (process.env.NODE_ENV === 'test') return 'down';
    const nowMs = Date.now();
    if (smtpCache && nowMs - smtpCache.at < 30_000) return smtpCache.value;
    const host = process.env.SMTP_SERVER?.trim() || '127.0.0.1';
    const port = Number(process.env.SMTP_PORT?.trim() || '25');
    const open =
      Number.isInteger(port) && port >= 1 && port <= 65535
        ? (await tcpOpen(host, port, 1500)) === 'open'
        : false;
    const value = open ? 'up' : 'down';
    smtpCache = { at: nowMs, value };
    return value;
  }

  async function healthPayload() {
    const up = await checkDatabase();
    const smtp = await smtpState();
    return {
      code: up ? (200 as const) : (503 as const),
      body: healthResponseSchema.parse({
        status: up ? 'ok' : 'degraded',
        service: 'kmbhelp-api',
        database: up ? 'up' : 'down',
        worker: up ? (options.worker ?? (await readWorkerState(database))) : 'down',
        smtp,
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

  const webauthn = webauthnFromEnv(process.env);
  const adminAllowlist = withDevelopmentLoopback(
    options.adminAllowlist ?? process.env.ADMIN_IP_ALLOWLIST ?? '',
    options.adminAllowlist === undefined && process.env.NODE_ENV !== 'production',
  );
  const model =
    options.model ??
    (process.env.NODE_ENV === 'test' ? unconfiguredModel : modelProviderFromEnv(process.env));
  registerPhase2(app, {
    database,
    testAuthEnabled: options.testAuthEnabled ?? false,
    now: options.now,
    explainer: options.explainer,
    ticketCreateLimit: options.ticketCreateLimit,
    searchLimit: options.searchLimit,
    model,
  });
  registerPhase3(app, {
    database,
    directory: options.directory ?? directoryFromEnv(process.env),
    sessionSecret: resolveSessionSecret(options.sessionSecret, process.env),
    adminAllowlist,
    mfaSkipAllowlist: options.adminAllowlist ?? process.env.ADMIN_IP_ALLOWLIST ?? '',
    apiHost: process.env.API_HOST?.trim() ?? '',
    rpId: options.webauthnRpId ?? webauthn.rpId,
    origin: options.webauthnOrigin ?? webauthn.origin,
    now: options.now,
    model,
  });
  registerOperations(app, {
    database,
    adminAllowlist,
    now: options.now,
  });
  registerPhase5(app, {
    database,
    testAuthEnabled: options.testAuthEnabled ?? false,
    adminAllowlist,
    now: options.now,
  });
  registerActivity(app, {
    database,
    testAuthEnabled: options.testAuthEnabled ?? false,
    now: options.now,
  });
  registerDashboard(app, {
    database,
    testAuthEnabled: options.testAuthEnabled ?? false,
    now: options.now,
  });
  registerStaffTicket(app, {
    database,
    testAuthEnabled: options.testAuthEnabled ?? false,
    now: options.now,
    mailer: options.mailer,
    mailbox: options.mailbox,
  });

  app.get('/api/docs', async () => openApiDocument);

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: 'not_found',
      message: publicErrors.notFound,
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const path = (request.url ?? '').split('?')[0]?.slice(0, 160) ?? '';
    const detail =
      error instanceof PublicError
        ? `${error.statusCode} ${error.error}: ${error.text.de}`
        : `500 internal_error: ${safeErrorText(error)}`;
    logError(`${request.method} ${path}: ${detail}`);
    if (database) {
      void writeActivity(
        database,
        {
          actor: 'api',
          kind: 'page',
          target: `${request.method} ${path}`,
          detail,
          ip: clientAddress(request),
        },
        process.env,
        false,
      ).catch(() => undefined);
    }
    if (!(error instanceof PublicError)) {
      request.log.error({ message: safeErrorText(error) }, 'request failed');
    }
    if (error instanceof PublicError) {
      return reply.code(error.statusCode).send({ error: error.error, message: error.text });
    }
    return reply.code(500).send({
      error: 'internal_error',
      message: publicErrors.internal,
    });
  });

  return app;
}

const ephemeralSessionSecret = randomBytes(32).toString('base64url');

function resolveSessionSecret(override: string | undefined, env: NodeJS.ProcessEnv): string {
  const given = (override ?? env.SESSION_SECRET ?? '').trim();
  if (given.length >= 16) return given;
  if (env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set in production');
  return ephemeralSessionSecret;
}

function webauthnFromEnv(env: NodeJS.ProcessEnv): { rpId: string; origin: string } {
  const production = env.NODE_ENV === 'production';
  return {
    rpId: env.WEBAUTHN_RP_ID?.trim() || (production ? 'helpdesk.kmbcloud.at' : '127.0.0.1'),
    origin:
      env.WEBAUTHN_ORIGIN?.trim() ||
      (production ? 'https://helpdesk.kmbcloud.at' : 'http://127.0.0.1:5173'),
  };
}
