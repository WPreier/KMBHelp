import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { enqueueFileLog, flushFileLogs, logError, logFilePath } from './file-log.js';

const previous = process.env.ACTIVITY_LOG_FILE;
const previousEnv = process.env.NODE_ENV;

afterEach(() => {
  if (previous === undefined) delete process.env.ACTIVITY_LOG_FILE;
  else process.env.ACTIVITY_LOG_FILE = previous;
  process.env.NODE_ENV = previousEnv;
});

describe('file log', () => {
  it('writes the three files beside each other without waiting for the caller', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kmbhelp-log-'));
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      ACTIVITY_LOG_FILE: join(directory, 'activity.log'),
    };
    enqueueFileLog('activity', 'page\t/anmelden', env);
    logError('directory.bind_failed: Das Dienstkonto kann nicht suchen.', env);
    enqueueFileLog('mail', 'worker\treply', env);
    enqueueFileLog('ki', 'ollama\tclassify\tkmblmt1\tgemma4:12b', env);
    await flushFileLogs();
    const activity = await readFile(logFilePath('activity', env), 'utf8');
    const error = await readFile(logFilePath('error', env), 'utf8');
    const mail = await readFile(logFilePath('mail', env), 'utf8');
    const model = await readFile(logFilePath('ki', env), 'utf8');
    expect(activity).toContain('page\t/anmelden');
    expect(error).toContain('Das Dienstkonto kann nicht suchen.');
    expect(mail).toContain('worker\treply');
    expect(model).toContain('kmblmt1');
    expect(error).not.toContain('password=');
  });
});
