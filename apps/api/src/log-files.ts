import { open, readFile, stat } from 'node:fs/promises';
import type { LogLine, LogName } from '@kmbhelp/shared';
import { logFilePath } from './file-log.js';

const stamp = /^\d{4}-\d{2}-\d{2}T/u;
const tailBytes = 8_000_000;

export async function readLogFile(input: {
  file: LogName;
  from: Date;
  to: Date;
  q: string;
  limit: number;
  env: NodeJS.ProcessEnv;
}): Promise<LogLine[]> {
  const path = logFilePath(input.file, input.env);
  if (!path) return [];
  const text = await readTail(path);
  if (text === null) return [];
  const needle = input.q.trim().toLocaleLowerCase('de');
  const matches: LogLine[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = parseLine(input.file, raw);
    if (!line) continue;
    const at = Date.parse(line.at);
    if (!Number.isFinite(at) || at < input.from.getTime() || at > input.to.getTime()) continue;
    if (needle && !haystack(line).includes(needle)) continue;
    matches.push(line);
  }
  return matches.slice(-input.limit);
}

async function readTail(path: string): Promise<string | null> {
  const info = await stat(path).catch(() => null);
  if (!info || !info.isFile()) return null;
  if (info.size <= tailBytes) return readFile(path, 'utf8');
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(tailBytes);
    await handle.read(buffer, 0, tailBytes, info.size - tailBytes);
    const text = buffer.toString('utf8');
    const breakAt = text.indexOf('\n');
    return breakAt >= 0 ? text.slice(breakAt + 1) : text;
  } finally {
    await handle.close();
  }
}

function parseLine(file: LogName, raw: string): LogLine | null {
  const line = raw.trim();
  if (!stamp.test(line)) return null;
  const parts = line.split('\t');
  const at = parts[0] ?? '';
  if (file === 'error') {
    return { at, actor: '', kind: '', target: '', detail: parts.slice(1).join('\t') };
  }
  const detail = parts.length > 5 ? parts.slice(4, -1).join('\t') : (parts[4] ?? '');
  return {
    at,
    actor: parts[1] ?? '',
    kind: parts[2] ?? '',
    target: parts[3] ?? '',
    detail,
  };
}

function haystack(line: LogLine): string {
  return `${line.at} ${line.actor} ${line.kind} ${line.target} ${line.detail}`.toLocaleLowerCase(
    'de',
  );
}
