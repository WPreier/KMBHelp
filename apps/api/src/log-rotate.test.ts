import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { daysBetween, maybeRotateLogs, offsetDate } from './log-rotate.js';

const dirs: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('log rotation', () => {
  it('names the local day as ddMMyyyy', () => {
    expect(offsetDate(new Date('2026-11-07T00:10:00Z'), '+01:00')).toEqual({
      iso: '2026-11-07',
      tag: '07112026',
    });
    expect(daysBetween('2026-10-01', '2026-11-07')).toBe(37);
  });

  it('keeps the files until the configured number of days has passed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kmbhelp-log-'));
    dirs.push(dir);
    const activity = join(dir, 'activity.log');
    await writeFile(activity, 'old\n');
    await writeFile(join(dir, 'rotate.on'), '2026-11-01\n');
    const env = {
      ACTIVITY_LOG_FILE: activity,
      LOG_ROTATE_DAYS: '30',
      SYSLOG_UTC_OFFSET: '+01:00',
      NODE_ENV: 'test',
    };
    const early = await maybeRotateLogs({ env, now: new Date('2026-11-07T00:10:00Z') });
    expect(early).toBe('wait');
    expect(await readFile(activity, 'utf8')).toBe('old\n');
  });

  it('moves every log to the dated name and starts the clock on the first check', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kmbhelp-log-'));
    dirs.push(dir);
    const activity = join(dir, 'activity.log');
    await writeFile(activity, 'old\n');
    await writeFile(join(dir, 'error.log'), 'error\n');
    const env = {
      ACTIVITY_LOG_FILE: activity,
      LOG_ROTATE_DAYS: '30',
      SYSLOG_UTC_OFFSET: '+01:00',
      NODE_ENV: 'test',
    };
    const armed = await maybeRotateLogs({ env, now: new Date('2026-11-07T00:10:00Z') });
    expect(armed).toBe('armed');
    expect(await readFile(activity, 'utf8')).toBe('old\n');
    await writeFile(join(dir, 'rotate.on'), '2026-10-01\n');
    const rotated = await maybeRotateLogs({ env, now: new Date('2026-11-07T00:10:00Z') });
    expect(rotated).toBe('rotated');
    expect(await readFile(join(dir, 'activity.log_07112026'), 'utf8')).toBe('old\n');
    expect(await readFile(join(dir, 'error.log_07112026'), 'utf8')).toBe('error\n');
    expect((await readFile(join(dir, 'rotate.on'), 'utf8')).trim()).toBe('2026-11-07');
  });
});
