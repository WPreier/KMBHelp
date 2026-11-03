import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readLogFile } from './log-files.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('readLogFile', () => {
  it('keeps lines inside the Vienna day and the search text', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kmbhelp-log-'));
    directories.push(directory);
    const env = { ACTIVITY_LOG_FILE: join(directory, 'activity.log') };
    await writeFile(
      env.ACTIVITY_LOG_FILE,
      [
        '2026-10-01T10:00:00.000Z\talt\tpage\t/\tzu alt\t192.0.2.1',
        '2026-11-02T23:30:00.000Z\tanna\tpage\t/tickets\tGrenze\t192.0.2.2',
        '2026-11-03T10:00:00.000Z\tanna\tpage\t/tickets\tSuche Treffer\t192.0.2.2',
        '2026-11-03T11:00:00.000Z\tanna\tpage\t/tickets\tanderer Text\t192.0.2.2',
        'kaputt',
      ].join('\n'),
      'utf8',
    );
    const rows = await readLogFile({
      file: 'activity',
      from: new Date('2026-11-03T00:00:00.000+01:00'),
      to: new Date('2026-11-03T23:59:59.999+01:00'),
      q: 'treffer',
      limit: 10,
      env,
    });
    expect(rows.map((row) => row.detail)).toEqual(['Suche Treffer']);
    const day = await readLogFile({
      file: 'activity',
      from: new Date('2026-11-03T00:00:00.000+01:00'),
      to: new Date('2026-11-03T23:59:59.999+01:00'),
      q: '',
      limit: 10,
      env,
    });
    expect(day.map((row) => row.detail)).toEqual(['Grenze', 'Suche Treffer', 'anderer Text']);
  });

  it('reads an error line as text and returns nothing for a missing file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kmbhelp-log-'));
    directories.push(directory);
    const env = { ACTIVITY_LOG_FILE: join(directory, 'activity.log') };
    await writeFile(
      join(directory, 'error.log'),
      '2026-11-03T10:00:00.000Z\tcertificate.missing: Das Zertifikat lässt sich nicht lesen.\n',
      'utf8',
    );
    const rows = await readLogFile({
      file: 'error',
      from: new Date('2026-11-03T00:00:00.000+01:00'),
      to: new Date('2026-11-03T23:59:59.999+01:00'),
      q: '',
      limit: 10,
      env,
    });
    expect(rows[0]?.detail).toBe('certificate.missing: Das Zertifikat lässt sich nicht lesen.');
    await expect(
      readLogFile({
        file: 'mail',
        from: new Date('2026-11-03T00:00:00.000+01:00'),
        to: new Date('2026-11-03T23:59:59.999+01:00'),
        q: '',
        limit: 10,
        env,
      }),
    ).resolves.toEqual([]);
  });
});
