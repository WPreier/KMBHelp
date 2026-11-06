import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type LogFile = 'activity' | 'error' | 'mail' | 'ki';

type Job = { file: LogFile; line: string; env: NodeJS.ProcessEnv };

const pending: Job[] = [];
const ready = new Set<string>();
let dropped = 0;
let chain: Promise<void> = Promise.resolve();
let scheduled = false;
const limit = 2000;

export function logDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const chosen = env.ACTIVITY_LOG_FILE?.trim();
  if (chosen) return dirname(chosen);
  const root = env.LOCALAPPDATA?.trim() || env.HOME?.trim() || '';
  return root ? join(root, 'kmbhelp') : '';
}

export function logFilePath(file: LogFile, env: NodeJS.ProcessEnv = process.env): string {
  const directory = logDirectory(env);
  return directory ? join(directory, `${file}.log`) : '';
}

export function enqueueFileLog(
  file: LogFile,
  line: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'test' && !env.ACTIVITY_LOG_FILE?.trim()) return;
  if (!logDirectory(env)) return;
  const cap = file === 'ki' ? 20_000 : 500;
  const clean = line.replace(/[\r\n]/gu, ' ').slice(0, cap);
  if (pending.length >= limit) {
    dropped += 1;
    return;
  }
  pending.push({ file, line: clean, env });
  schedule();
}

export function logError(text: string, env: NodeJS.ProcessEnv = process.env): void {
  enqueueFileLog('error', `${new Date().toISOString()}\t${text}`, env);
}

export function flushFileLogs(): Promise<void> {
  return drain();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setImmediate(() => {
    scheduled = false;
    void drain();
  });
}

function drain(): Promise<void> {
  const run = chain.then(writePending);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function writePending(): Promise<void> {
  if (pending.length === 0 && dropped === 0) return;
  const batch = pending.splice(0, 100);
  const missed = dropped;
  dropped = 0;
  if (missed > 0) {
    batch.push({
      file: 'error',
      line: `${new Date().toISOString()}\t${missed} Protokollzeilen wurden verworfen, die Warteschlange war voll.`,
      env: batch[0]?.env ?? process.env,
    });
  }
  const groups = new Map<string, string[]>();
  for (const job of batch) {
    const path = logFilePath(job.file, job.env);
    if (!path) continue;
    const lines = groups.get(path) ?? [];
    lines.push(job.line);
    groups.set(path, lines);
  }
  try {
    await Promise.all(
      [...groups.entries()].map(async ([path, lines]) => {
        if (!ready.has(path)) {
          await mkdir(dirname(path), { recursive: true });
          ready.add(path);
        }
        await appendFile(path, `${lines.join('\n')}\n`, 'utf8');
      }),
    );
  } catch {
    pending.unshift(...batch);
    if (pending.length > limit) pending.length = limit;
    setTimeout(() => {
      void drain();
    }, 1000).unref?.();
    return;
  }
  if (pending.length > 0 || dropped > 0) await writePending();
}
