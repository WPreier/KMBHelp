import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logDirectory } from './file-log.js';

const openRouterModelsUrl = 'https://openrouter.ai/api/v1/models';

export type OpenRouterModelOption = {
  id: string;
  name: string;
  /** USD per 1 million prompt (input) tokens. */
  promptCostPerMillion: number;
};

type CacheFile = {
  fetchedOn: string;
  models: OpenRouterModelOption[];
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function cachePath(env: NodeJS.ProcessEnv): string {
  const directory = logDirectory(env);
  return directory ? join(directory, 'openrouter-models.json') : '';
}

function readCache(env: NodeJS.ProcessEnv): CacheFile | null {
  const path = cachePath(env);
  if (!path || !existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const fetchedOn =
      'fetchedOn' in parsed && typeof parsed.fetchedOn === 'string' ? parsed.fetchedOn : '';
    const models =
      'models' in parsed && Array.isArray(parsed.models)
        ? parsed.models.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return [];
            const id = 'id' in entry && typeof entry.id === 'string' ? entry.id.trim() : '';
            const name = 'name' in entry && typeof entry.name === 'string' ? entry.name.trim() : id;
            const cost =
              'promptCostPerMillion' in entry && typeof entry.promptCostPerMillion === 'number'
                ? entry.promptCostPerMillion
                : Number.NaN;
            if (id === '' || !Number.isFinite(cost)) return [];
            return [{ id, name: name || id, promptCostPerMillion: cost }];
          })
        : [];
    if (fetchedOn === '' || models.length === 0) return null;
    return { fetchedOn, models };
  } catch {
    return null;
  }
}

function writeCache(env: NodeJS.ProcessEnv, models: OpenRouterModelOption[]): void {
  const path = cachePath(env);
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const body: CacheFile = { fetchedOn: todayUtc(), models };
    writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  } catch {
    // Cache is optional; the live list still works for this request.
  }
}

/**
 * Text chat models from OpenRouter, sorted by prompt cost per million tokens.
 * Refreshed at most once per UTC day and stored next to the activity logs.
 */
export async function listOpenRouterTextModels(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  force?: boolean;
}): Promise<OpenRouterModelOption[]> {
  const env = options.env ?? process.env;
  const key = options.apiKey.trim();
  if (key === '') return [];
  if (!options.force) {
    const cached = readCache(env);
    if (cached && cached.fetchedOn === todayUtc()) return cached.models;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const query = new URLSearchParams({
    input_modalities: 'text',
    output_modalities: 'text',
    endpoints: '/api/v1/chat/completions',
    sort: 'pricing-low-to-high',
  });
  const response = await fetchImpl(`${openRouterModelsUrl}?${query}`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`openrouter models http=${response.status}`);
  const body: unknown = await response.json();
  const models = parseOpenRouterModels(body);
  writeCache(env, models);
  return models;
}

export function parseOpenRouterModels(body: unknown): OpenRouterModelOption[] {
  if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
    return [];
  }
  const rows: OpenRouterModelOption[] = [];
  for (const entry of body.data) {
    if (!entry || typeof entry !== 'object') continue;
    const id = 'id' in entry && typeof entry.id === 'string' ? entry.id.trim() : '';
    if (id === '') continue;
    if (!isTextOptimized(entry)) continue;
    const cost = promptCostPerMillion(entry);
    if (cost === null) continue;
    const name =
      'name' in entry && typeof entry.name === 'string' && entry.name.trim() !== ''
        ? entry.name.trim()
        : id;
    rows.push({ id, name, promptCostPerMillion: cost });
  }
  rows.sort(
    (left, right) =>
      left.promptCostPerMillion - right.promptCostPerMillion || left.id.localeCompare(right.id),
  );
  return rows;
}

function isTextOptimized(entry: object): boolean {
  if (!('architecture' in entry) || !entry.architecture || typeof entry.architecture !== 'object') {
    return true;
  }
  const architecture = entry.architecture;
  if ('modality' in architecture && typeof architecture.modality === 'string') {
    const modality = architecture.modality.toLowerCase().replace(/\s+/gu, '');
    if (modality.includes('->') && !/^text(\+[a-z]+)*->text$/u.test(modality)) {
      return false;
    }
  }
  if ('output_modalities' in architecture && Array.isArray(architecture.output_modalities)) {
    if (!architecture.output_modalities.map(String).includes('text')) return false;
  }
  if ('input_modalities' in architecture && Array.isArray(architecture.input_modalities)) {
    if (!architecture.input_modalities.map(String).includes('text')) return false;
  }
  return true;
}

function promptCostPerMillion(entry: object): number | null {
  if (!('pricing' in entry) || !entry.pricing || typeof entry.pricing !== 'object') return null;
  const pricing = entry.pricing;
  if (!('prompt' in pricing)) return null;
  const raw = pricing.prompt;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value < 0) return null;
  // OpenRouter lists prompt price as USD per token; show USD per 1M tokens.
  return value * 1_000_000;
}
