import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { fillBlankEnvFromFile, fillBlankEnvFromJson, loadEnvFileIfPresent } from './env.js';

const secretKeys = [
  'GRAPH_CLIENT_SECRET',
  'LDAPS_BIND_PASSWORD',
  'SESSION_SECRET',
  'AI_API_KEY',
  'MCP_SERVICE_TOKEN',
  'LOCAL_ADMIN_PASSWORD',
] as const;

describe('env example', () => {
  it('lists secret names with empty values', () => {
    const text = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
    for (const key of secretKeys) {
      const line = text
        .split('\n')
        .find((entry) => entry.startsWith(`${key}=`))
        ?.replace(/\r$/, '');
      expect(line, key).toBe(`${key}=`);
    }
    expect(text).toContain('postgresql://postgres:replace-me@127.0.0.1:5432/kmbhelp');
    expect(text).not.toContain('kmbhelp-dev-only');
    expect(text).not.toContain('kmbhelp-ci-only');
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

  it('loads a present file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kmbhelp-env-'));
    directories.push(directory);
    const file = join(directory, '.env');
    writeFileSync(file, 'KMBHELP_ENV_PROBE=present\n');
    loadEnvFileIfPresent(pathToFileURL(file));
    expect(process.env.KMBHELP_ENV_PROBE).toBe('present');
  });
});
