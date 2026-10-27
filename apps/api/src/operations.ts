import type { FastifyInstance, FastifyRequest } from 'fastify';
import { noticeSetting, type Database } from '@kmbhelp/db';
import {
  configField,
  configFieldResultSchema,
  configValueSchema,
  configurationSchema,
  describeConfig,
  noticeListSchema,
  noticeUpdateSchema,
  publicErrors,
  syslogTargetSchema,
  syslogTestSchema,
} from '@kmbhelp/shared';
import { assertCsrf, localhostAdmin, staffFromSession, type StaffSession } from './auth.js';
import { checkConfigField } from './config-check.js';
import { saveConfigValue } from './config-store.js';
import { inspectConfiguration, type Check } from './configuration.js';
import { clientAddress, databaseDown, PublicError } from './http.js';
import { ipAllowed } from './network.js';
import { emitNotice, noticeByCode, noticeCatalog, noticeState } from './notices.js';
import { readSyslogTarget, writeSyslogTarget } from './syslog-settings.js';
import { formatSyslog, sendSyslog, type NoticeCategory } from './syslog.js';

export type OperationsOptions = {
  database: Database | undefined;
  adminAllowlist: string;
  env?: NodeJS.ProcessEnv | undefined;
  now?: (() => Date) | undefined;
};

export function noticeCodeFor(check: Check): { code: string; detail: string } | null {
  if (check.status === 'ok') return null;
  if (check.status === 'informational' && !noticeByCode(check.code)) return null;
  if (check.code === 'directory.fqdn') {
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

  async function loadReport() {
    const syslog = await readSyslogTarget(options.database, env);
    return inspectConfiguration(env, undefined, syslog);
  }

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  async function admin(request: FastifyRequest): Promise<StaffSession> {
    const local = localhostAdmin(request, env);
    if (local) return local;
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
    return configurationSchema.parse(await loadReport());
  });

  app.post('/api/v1/admin/configuration/syslog', async (request) => {
    const current = await admin(request);
    assertCsrf(current, request);
    const parsed = syslogTargetSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    await writeSyslogTarget(db(), parsed.data);
    process.env.SYSLOG_HOST = parsed.data.host;
    process.env.SYSLOG_PORT = String(parsed.data.port);
    process.env.SYSLOG_NAME = parsed.data.appName;
    process.env.SYSLOG_FACILITY = parsed.data.facility;
    process.env.SYSLOG_UTC_OFFSET = parsed.data.offset;
    return configurationSchema.parse(await loadReport());
  });

  app.post('/api/v1/admin/configuration/syslog/test', async (request) => {
    const current = await admin(request);
    assertCsrf(current, request);
    const parsed = syslogTargetSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    try {
      await sendSyslog(
        parsed.data.host,
        parsed.data.port,
        formatSyslog('informational', 'KMBHelp syslog check', new Date(), parsed.data),
      );
      return syslogTestSchema.parse({ ok: true });
    } catch {
      return syslogTestSchema.parse({ ok: false });
    }
  });

  async function fieldResult(key: string, candidate?: string) {
    const syslog = await readSyslogTarget(options.database, env);
    const check = await checkConfigField(env, key, candidate);
    const entry = describeConfig(env).find((item) => item.key === key);
    if (!entry) throw new PublicError(404, 'not_found', publicErrors.notFound);
    return configFieldResultSchema.parse({ entry, check, syslog });
  }

  app.post('/api/v1/admin/configuration/value', async (request) => {
    const current = await admin(request);
    assertCsrf(current, request);
    const parsed = configValueSchema.safeParse(request.body);
    if (!parsed.success || !configField(parsed.data.key)) {
      throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    }
    try {
      await saveConfigValue(db(), parsed.data.key, parsed.data.value);
    } catch {
      throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    }
    return fieldResult(parsed.data.key);
  });

  app.post('/api/v1/admin/configuration/value/check', async (request) => {
    const current = await admin(request);
    assertCsrf(current, request);
    const parsed = configValueSchema.safeParse(request.body);
    if (!parsed.success || !configField(parsed.data.key)) {
      throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    }
    return fieldResult(parsed.data.key, parsed.data.value);
  });

  app.post('/api/v1/admin/configuration/check', async (request) => {
    const current = await admin(request);
    assertCsrf(current, request);
    const report = await loadReport();
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
