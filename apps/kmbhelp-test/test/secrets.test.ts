import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertOutsideGit, saveCredentials } from '../server/secrets';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('credentials file', () => {
  it('writes mode 0600 outside a git checkout and does not echo the password', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kmbhelp-secret-'));
    directories.push(root);
    const gitRoot = path.join(root, 'repo');
    const file = path.join(root, 'credentials');
    await saveCredentials(
      { username: 'dev-user', password: 'example-not-real' },
      { file, gitRoot },
    );
    const info = await stat(file);
    expect(info.mode & 0o777).toBe(0o600);
    const directory = await stat(path.dirname(file));
    expect(directory.mode & 0o777).toBe(0o700);
  });

  it('refuses a path inside the checkout', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kmbhelp-repo-'));
    directories.push(root);
    await writeFile(path.join(root, '.git'), 'gitdir: /tmp/nope\n');
    const inside = path.join(root, 'credentials');
    await expect(saveCredentials({ username: 'dev-user', password: 'example-not-real' }, { file: inside, gitRoot: root })).rejects.toThrow(
      /checkout/,
    );
    await expect(stat(inside)).rejects.toThrow();
  });

  it('rejects an inside path before writing', () => {
    expect(() => assertOutsideGit('/repo/apps/kmbhelp-test/.secrets/credentials', '/repo')).toThrow(/checkout/);
  });
});
