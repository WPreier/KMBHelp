import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const CredentialInput = z
  .object({
    username: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(1024),
  })
  .strict();

export type Credentials = z.infer<typeof CredentialInput>;

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

export function defaultCredentialsPath(): string {
  return path.join(homedir(), '.config', 'kmbhelp-test', 'credentials');
}

export function credentialsPath(): string {
  return process.env.KMBHELP_TEST_SECRET_FILE ?? defaultCredentialsPath();
}

export async function findGitRoot(start: string): Promise<string> {
  let dir = path.resolve(start);
  for (let hop = 0; hop < 8; hop += 1) {
    try {
      const info = await stat(path.join(dir, '.git'));
      if (info.isDirectory() || info.isFile()) return dir;
    } catch {
      // keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start);
}

export function appDir(): string {
  return fileURLToPath(new URL('..', import.meta.url));
}

export function assertOutsideGit(file: string, gitRoot: string): void {
  const resolved = path.resolve(file);
  const root = path.resolve(gitRoot);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Refusing to store credentials inside the git checkout.');
  }
}

function modeOf(value: number): number {
  return value & 0o777;
}

export async function saveCredentials(input: unknown, options?: { file?: string; gitRoot?: string }): Promise<string> {
  const parsed = CredentialInput.safeParse(input);
  if (!parsed.success || /[\r\n]/.test(parsed.data.username)) {
    throw new Error('Username or password was rejected.');
  }
  const file = options?.file ?? credentialsPath();
  const gitRoot = options?.gitRoot ?? (await findGitRoot(appDir()));
  assertOutsideGit(file, gitRoot);
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: DIR_MODE });
  await chmod(directory, DIR_MODE);
  const body = `${JSON.stringify({ username: parsed.data.username, password: parsed.data.password })}\n`;
  await writeFile(file, body, { mode: FILE_MODE });
  await chmod(file, FILE_MODE);
  const info = await stat(file);
  if (modeOf(info.mode) !== FILE_MODE) {
    throw new Error('Credentials file is not mode 0600.');
  }
  return file;
}

export async function readCredentials(options?: { file?: string; gitRoot?: string }): Promise<Credentials | null> {
  const file = options?.file ?? credentialsPath();
  const gitRoot = options?.gitRoot ?? (await findGitRoot(appDir()));
  assertOutsideGit(file, gitRoot);
  let raw: string;
  try {
    const info = await stat(file);
    if (modeOf(info.mode) !== FILE_MODE) {
      await chmod(file, FILE_MODE);
    }
    raw = await readFile(file, 'utf8');
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') return null;
    throw new Error('Credentials file is unreadable.');
  }
  try {
    const parsed = CredentialInput.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error('invalid');
    return parsed.data;
  } catch {
    throw new Error('Credentials file is invalid.');
  }
}

export async function credentialsConfigured(): Promise<boolean> {
  const credentials = await readCredentials();
  return credentials !== null;
}
