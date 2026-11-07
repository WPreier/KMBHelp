import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { configFields } from './config-fields.js';
import {
  fillBlankEnvFromFile,
  fillBlankEnvFromJson,
  loadEnvFileIfPresent,
  loadProjectEnv,
} from './env.js';

function assignmentKeys(text: string): string[] {
  return text
    .split('\n')
    .map((entry) => entry.replace(/\r$/, ''))
    .filter((entry) => entry !== '' && !entry.startsWith('#'))
    .map((entry) => entry.slice(0, entry.indexOf('=')));
}

describe('env example', () => {
  it('lists every configuration name once and keeps secrets empty', () => {
    const text = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
    const keys = assignmentKeys(text);
    expect(keys).toEqual([...keys].sort((left, right) => left.localeCompare(right, 'en')));
    expect(new Set(keys).size).toBe(keys.length);
    for (const field of configFields) {
      expect(keys).toContain(field.key);
      if (!field.secret || field.key === 'DATABASE_URL') continue;
      const line = text
        .split('\n')
        .find((entry) => entry.startsWith(`${field.key}=`))
        ?.replace(/\r$/, '');
      expect(line, field.key).toBe(`${field.key}=`);
    }
    expect(keys).toContain('ACTIVITY_LOG_FILE');
    expect(text).toContain('postgresql://postgres:replace-me@127.0.0.1:5432/kmbhelp');
    expect(text).toContain('API_HOST=127.0.0.1');
    expect(text).toContain('PUBLIC_ORIGIN=http://127.0.0.1:5173');
    expect(text).not.toContain('kmbhelp-dev-only');
    expect(text).not.toContain('kmbhelp-ci-only');
    const server = readFileSync(new URL('../../../infra/kmbhelp.env.example', import.meta.url), 'utf8');
    expect(assignmentKeys(server)).toEqual(keys);
    expect(server).toContain('API_HOST=192.0.2.10');
    expect(server).toContain('PUBLIC_ORIGIN=https://helpdesk.kmbcloud.at');
    expect(server).toContain('ACTIVITY_LOG_FILE=/var/lib/kmbhelp/activity.log');
    expect(server).not.toContain('BEGIN CERTIFICATE');
  });
});

describe('loadEnvFileIfPresent', () => {
  const directories: string[] = [];

  afterEach(() => {
    delete process.env.KMBHELP_ENV_PROBE;
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does nothing when the file is absent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kmbhelp-env-'));
    directories.push(directory);
    expect(() => loadEnvFileIfPresent(pathToFileURL(join(directory, 'missing.env')))).not.toThrow();
  });

  it('fills only blank keys from a present file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kmbhelp-env-'));
    directories.push(directory);
    const file = join(directory, 'dev.env');
    writeFileSync(file, 'KMBHELP_ENV_PROBE=from-file\nKEPT=from-file\n');
    process.env.KEPT = 'already';
    fillBlankEnvFromFile(pathToFileURL(file));
    expect(process.env.KMBHELP_ENV_PROBE).toBe('from-file');
    expect(process.env.KEPT).toBe('already');
    delete process.env.KEPT;
  });

  it('fills blank keys from json and keeps an existing value', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kmbhelp-env-'));
    directories.push(directory);
    const file = join(directory, 'secrets.json');
    writeFileSync(file, '{"KMBHELP_ENV_PROBE":"from-json","KEPT":"from-json"}\n');
    process.env.KEPT = 'already';
    fillBlankEnvFromJson(pathToFileURL(file));
    expect(process.env.KMBHELP_ENV_PROBE).toBe('from-json');
    expect(process.env.KEPT).toBe('already');
    delete process.env.KEPT;
  });

  it('fills a blank database url from the server file and keeps a project value', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kmbhelp-env-'));
    directories.push(directory);
    const project = join(directory, '.env');
    const server = join(directory, 'kmbhelp.env');
    writeFileSync(project, 'PUBLIC_ORIGIN=https://helpdesk.kmbcloud.at\n');
    writeFileSync(server, 'DATABASE_URL=from-server\nPUBLIC_ORIGIN=from-server\n');
    delete process.env.DATABASE_URL;
    delete process.env.PUBLIC_ORIGIN;
    loadProjectEnv(pathToFileURL(project), server);
    expect(process.env.DATABASE_URL).toBe('from-server');
    expect(process.env.PUBLIC_ORIGIN).toBe('https://helpdesk.kmbcloud.at');
    delete process.env.DATABASE_URL;
    delete process.env.PUBLIC_ORIGIN;
  });

  it('loads a present file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kmbhelp-env-'));
    directories.push(directory);
    const file = join(directory, '.env');
    writeFileSync(file, 'KMBHELP_ENV_PROBE=present\n');
    loadEnvFileIfPresent(pathToFileURL(file));
    expect(process.env.KMBHELP_ENV_PROBE).toBe('present');
  });
});
