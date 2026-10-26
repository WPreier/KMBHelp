import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function loadEnvFileIfPresent(fileUrl: URL): void {
  const path = fileURLToPath(fileUrl);
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}

export function fillBlankEnvFromFile(fileUrl: URL): void {
  const path = fileURLToPath(fileUrl);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1);
    if (key === '' || value.trim() === '') continue;
    if ((process.env[key] ?? '').trim() !== '') continue;
    process.env[key] = value;
  }
}

export function fillBlankEnvFromJson(fileUrl: URL): void {
  const path = fileURLToPath(fileUrl);
  if (!existsSync(path)) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    process.stderr.write('secrets.json is not readable\n');
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    if ((process.env[key] ?? '').trim() !== '') continue;
    process.env[key] = value;
  }
}

export function loadWorkstationEnv(): void {
  if (process.env.NODE_ENV === 'production') return;
  const root = process.env.LOCALAPPDATA?.trim();
  if (!root) return;
  const directory = join(root, 'kmbhelp');
  fillBlankEnvFromFile(pathToFileURL(join(directory, 'dev.env')));
  fillBlankEnvFromJson(pathToFileURL(join(directory, 'secrets.json')));
}
