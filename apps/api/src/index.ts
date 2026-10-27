import { createDatabase } from '@kmbhelp/db';
import { loadEnvFileIfPresent, loadWorkstationEnv } from '@kmbhelp/shared/env';
import { readRuntimeAuth } from './auth.js';
import { buildApp } from './app.js';
import { inspectConfiguration } from './configuration.js';
import { reportChecks } from './operations.js';
import { readPort } from './port.js';
import { applyStoredConfig } from './config-store.js';
import { readSyslogTarget } from './syslog-settings.js';

loadEnvFileIfPresent(new URL('../../../.env', import.meta.url));
loadWorkstationEnv();
await applyStoredConfig();

let testAuthEnabled = false;
try {
  testAuthEnabled = readRuntimeAuth(process.env).testAuthEnabled;
} catch {
  process.stderr.write('ALLOW_TEST_AUTH must not be set in production\n');
  process.exit(1);
}

const app = buildApp({
  databaseUrl: process.env.DATABASE_URL,
  logger: true,
  testAuthEnabled,
});

const port = readPort(process.env.API_PORT, 3000);
const host = process.env.API_HOST?.trim() || '127.0.0.1';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error({ err: error }, 'api failed to start');
  process.exit(1);
}

const startupDatabase = process.env.DATABASE_URL?.trim()
  ? createDatabase(process.env.DATABASE_URL)
  : undefined;
try {
  const syslog = await readSyslogTarget(startupDatabase, process.env);
  const report = await inspectConfiguration(process.env, undefined, syslog);
  await reportChecks({
    database: startupDatabase,
    env: process.env,
    checks: report.checks,
    log: (category, text) => {
      if (category === 'error') app.log.error(text);
      else if (category === 'warning') app.log.warn(text);
      else app.log.info(text);
    },
  });
} catch (error) {
  app.log.error({ err: error }, 'startup checks failed');
} finally {
  await startupDatabase?.pool.end();
}
