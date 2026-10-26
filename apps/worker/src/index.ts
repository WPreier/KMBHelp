import { loadEnvFileIfPresent } from '@kmbhelp/shared/env';
import { workerStartupEvent } from './worker.js';

loadEnvFileIfPresent(new URL('../../../.env', import.meta.url));

const event = workerStartupEvent(process.env);
process.stdout.write(`${JSON.stringify({ level: 'info', component: 'kmbhelp-worker', event })}\n`);

setInterval(() => {
  // Mail polling arrives in phase 4. The process stays up so systemd does not restart it.
}, 60_000);
