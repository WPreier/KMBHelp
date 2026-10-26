import { loadEnvFileIfPresent } from '@kmbhelp/shared/env';
import { buildApp } from './app.js';
import { readPort } from './port.js';

loadEnvFileIfPresent(new URL('../../../.env', import.meta.url));

const app = buildApp({
  databaseUrl: process.env.DATABASE_URL,
  logger: true,
});

const port = readPort(process.env.API_PORT, 3000);
const host = process.env.API_HOST?.trim() || '127.0.0.1';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error({ err: error }, 'api failed to start');
  process.exit(1);
}
