import type { FastifyInstance, FastifyRequest } from 'fastify';
import { noticeSetting, type Database } from '@kmbhelp/db';
import {
  configurationSchema,
  noticeListSchema,
  noticeUpdateSchema,
  publicErrors,
} from '@kmbhelp/shared';
import { assertCsrf, staffFromSession, type StaffSession } from './auth.js';
import { inspectConfiguration, type Check } from './configuration.js';
import { clientAddress, databaseDown, PublicError } from './http.js';
import { ipAllowed } from './network.js';
import { emitNotice, noticeByCode, noticeCatalog, noticeState } from './notices.js';
import type { NoticeCategory } from './syslog.js';

export type OperationsOptions = {
  database: Database | undefined;
  adminAllowlist: string;
  env?: NodeJS.ProcessEnv | undefined;
  now?: (() => Date) | undefined;
};

export function noticeCodeFor(check: Check): { code: string; detail: string } | null {
  if (check.status === 'ok') return null;
  if (check.status === 'informational' && !noticeByCode(check.code)) return null;
  if (check.code === 'directory.short' || check.code === 'directory.fqdn') {
    return { code: 'directory.unreachable', detail: check.textEn };
  }
  if (!noticeByCode(check.code)) return null;
  return { code: check.code, detail: check.textEn };
}

export async function reportChecks(input: {
  database: Database | undefined;
  env: NodeJS.ProcessEnv;
  checks: Check[];
  log: (category: NoticeCategory, text: string) => void;
}): Promise<void> {
  for (const check of input.checks) {
    const notice = noticeCodeFor(check);
    if (!notice) continue;
    await emitNotice({
      database: input.database,
      env: input.env,
      code: notice.code,
      detail: notice.detail,
      log: input.log,
    });
  }
}

export function registerOperations(app: FastifyInstance, options: OperationsOptions): void {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  async function admin(request: FastifyRequest): Promise<StaffSession> {
    if (!ipAllowed(clientAddress(request), options.adminAllowlist)) {
      throw new PublicError(403, 'network_denied', publicErrors.networkDenied);
    }
    const current = await staffFromSession(db(), request, now());
    if (!current || current.mfaPending || !current.isLocalAdmin) {
      throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
    }
    return current;
  }

  app.get('/api/v1/admin/notices', async (request) => {
    const database = db();
    await admin(request);
    const notices = [];
    for (const entry of noticeCatalog) {
      const state = await noticeState(database, entry.code);
      notices.push({
        code: entry.code,
        category: state?.category ?? entry.category,
        enabled: state?.enabled ?? true,
        textDe: entry.textDe,
        textEn: entry.textEn,
      });
    }
    return noticeListSchema.parse({ notices });
  });

  app.patch('/api/v1/admin/notices/:code', async (request) => {
    const current = await admin(request);
    assertCsrf(current, request);
    const code = (request.params as { code?: string }).code ?? '';
    if (!noticeByCode(code)) throw new PublicError(404, 'not_found', publicErrors.notFound);
    const parsed = noticeUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    await database.db
      .insert(noticeSetting)
      .values({
        code,
        category: parsed.data.category,
        enabled: parsed.data.enabled,
        updatedAt: now(),
      })
      .onConflictDoUpdate({
        target: noticeSetting.code,
        set: { category: parsed.data.category, enabled: parsed.data.enabled, updatedAt: now() },
      });
    return { ok: true };
  });

  app.get('/api/v1/admin/configuration', async (request) => {
    await admin(request);
    return configurationSchema.parse(await inspectConfiguration(env));
  });

  app.post('/api/v1/admin/configuration/check', async (request) => {
    const current = await admin(request);
    assertCsrf(current, request);
    const report = await inspectConfiguration(env);
    await reportChecks({
      database: options.database,
      env,
      checks: report.checks,
      log: (category, text) => {
        if (category === 'error') request.log.error(text);
        else if (category === 'warning') request.log.warn(text);
        else request.log.info(text);
      },
    });
    return configurationSchema.parse(report);
  });
}
