import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logDirectory } from './file-log.js';

/** Slightly above the mail query limit so a crashed holder does not block forever. */
const staleMs = 6 * 60 * 1000;
const waitMs = 250;

let chain: Promise<unknown> = Promise.resolve();

/**
 * Runs at most one Ollama job at a time across API and worker (shared lock file)
 * and within one process (promise chain). Callers wait until the previous job ends.
 */
export function withOllamaJob<T>(
  fn: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const run = chain.then(
    () => withFileLock(fn, env),
    () => withFileLock(fn, env),
  );
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function withFileLock<T>(fn: () => Promise<T>, env: NodeJS.ProcessEnv): Promise<T> {
  const directory = logDirectory(env);
  if (!directory) return fn();
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'ollama.lock');
  const release = await acquireLock(path);
  try {
    return await fn();
  } finally {
    release();
  }
}

async function acquireLock(path: string): Promise<() => void> {
  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      try {
        writeFileSync(fd, `${process.pid}\n${Date.now()}`);
      } catch {
        try {
          closeSync(fd);
        } catch {
          // ignore
        }
        try {
          unlinkSync(path);
        } catch {
          // ignore
        }
        throw new Error('lock write failed');
      }
      return () => {
        try {
          closeSync(fd);
        } catch {
          // ignore
        }
        try {
          unlinkSync(path);
        } catch {
          // ignore
        }
      };
    } catch {
      tryClearStale(path);
      await sleep(waitMs);
    }
  }
}

function tryClearStale(path: string): void {
  try {
    const raw = readFileSync(path, 'utf8');
    const [pidText, startedText] = raw.split(/\r?\n/u);
    const pid = Number(pidText);
    const started = Number(startedText);
    const dead = !pidAlive(pid);
    const old = Number.isFinite(started) && Date.now() - started > staleMs;
    if (dead || old) unlinkSync(path);
  } catch {
    // lock gone or unreadable — next loop retries
  }
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
