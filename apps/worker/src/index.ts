import { createDatabase } from '@kmbhelp/db';
import { loadEnvFileIfPresent, loadWorkstationEnv } from '@kmbhelp/shared/env';
import { runMailCycle } from '@kmbhelp/api/mail-cycle';
import { workerStartupEvent } from './worker.js';

loadEnvFileIfPresent(new URL('../../../.env', import.meta.url));
loadWorkstationEnv();

const database = process.env.DATABASE_URL?.trim()
  ? createDatabase(process.env.DATABASE_URL)
  : undefined;

process.stdout.write(
  `${JSON.stringify({ level: 'info', component: 'kmbhelp-worker', event: workerStartupEvent(process.env) })}\n`,
);

let running = false;
let lastSlot: string | null = null;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await runMailCycle({ database, env: process.env, lastSlot });
    if (result.slot) lastSlot = result.slot;
  } catch {
    process.stderr.write(
      `${JSON.stringify({ level: 'error', component: 'kmbhelp-worker', event: 'cycle_failed' })}\n`,
    );
  } finally {
    running = false;
  }
}

void tick();
setInterval(() => {
  void tick();
}, 60_000);
