import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../src/version';

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('version 0.1.patch', () => {
  it('keeps VERSION, package.json and the UI constant on the same patch', () => {
    const file = read('VERSION').trim();
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(file).toMatch(/^0\.1\.\d+$/);
    expect(pkg.version).toBe(file);
    expect(APP_VERSION).toBe(file);
    expect(read('CHANGELOG.md')).toContain(`## ${file}`);
    expect(read('docs/nachweis.md')).toContain(`Version ${file}`);
  });
});