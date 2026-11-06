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

export const legacyConfigNames: Readonly<Record<string, string>> = {
  OLLAMA_URL: 'MAILCHECK_KI_URL',
  OLLAMA_MODEL: 'MAILCHECK_KI_MODEL',
  SMTP_SERVER: 'MAIL_SMTP_SERVER',
  SMTP_PORT: 'MAIL_SMTP_PORT',
  SMTP_USER: 'MAIL_SMTP_USER',
  SMTP_PASSWD: 'MAIL_SMTP_PASSWD',
  SMTP_LOGIN: 'MAIL_SMTP_LOGIN',
  SMTP_TO: 'MAIL_SMTP_TO',
  NOTICE_DIGEST: 'MAIL_NOTICE_DIGEST',
  NOTICE_DIGEST_HOUR: 'MAIL_NOTICE_DIGEST_HOUR',
  AI_MAIL_PROMPT: 'MAIL_AI_PROMPT',
  AI_PROVIDER: 'SEARCH_AI_PROVIDER',
  AI_ENDPOINT: 'SEARCH_AI_ENDPOINT',
  AI_REGION: 'SEARCH_AI_REGION',
  AI_API_KEY: 'SEARCH_AI_API_KEY',
  AI_AVV_REFERENCE: 'SEARCH_AI_AVV_REFERENCE',
  AI_AUTO_REPLY_CATEGORIES: 'SEARCH_AI_AUTO_REPLY_CATEGORIES',
};

export function adoptLegacyConfig(env: NodeJS.ProcessEnv = process.env): void {
  for (const [previous, current] of Object.entries(legacyConfigNames)) {
    if ((env[current] ?? '').trim() !== '') continue;
    const value = env[previous];
    if (value === undefined || value.trim() === '') continue;
    env[current] = value;
  }
}

export function loadProjectEnv(projectEnv: URL, serverEnv = '/etc/kmbhelp/kmbhelp.env'): void {
  loadEnvFileIfPresent(projectEnv);
  fillBlankEnvFromFile(pathToFileURL(serverEnv));
  adoptLegacyConfig();
}

export function loadWorkstationEnv(): void {
  if (process.env.NODE_ENV === 'production') return;
  const root = process.env.LOCALAPPDATA?.trim();
  if (!root) return;
  const directory = join(root, 'kmbhelp');
  fillBlankEnvFromFile(pathToFileURL(join(directory, 'dev.env')));
  fillBlankEnvFromJson(pathToFileURL(join(directory, 'secrets.json')));
  adoptLegacyConfig();
}
