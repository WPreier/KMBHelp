import { loadEnvFileIfPresent } from '@kmbhelp/shared/env';
import { readRuntimeAuth } from './auth.js';
import { buildApp } from './app.js';
import { readPort } from './port.js';

loadEnvFileIfPresent(new URL('../../../.env', import.meta.url));

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
