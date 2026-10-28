import { createHash } from 'node:crypto';
import { modelDecisionJsonSchema, modelDecisionSchema, type ModelDecision } from './decision.js';
import { maskPersonalData } from './mask.js';

export type ExplainHit = { kind: string; title: string };

export type ModelResult = { decision: ModelDecision; model: string };

export type MailReview = { answer: string; model: string };

export type Satisfaction = 'satisfied' | 'neutral' | 'dissatisfied';

export function parseSatisfaction(answer: string): Satisfaction | null {
  const text = answer.toLowerCase();
  if (text.includes('unzufrieden') || text.includes('dissatisfied')) return 'dissatisfied';
  if (text.includes('neutral')) return 'neutral';
  if (text.includes('zufrieden') || text.includes('satisfied')) return 'satisfied';
  return null;
}

export type ModelProvider = {
  readonly configured: boolean;
  readonly name: string;
  classify(text: string): Promise<ModelResult | null>;
  explain(query: string, hits: readonly ExplainHit[]): Promise<{ de: string; en: string } | null>;
  review(prompt: string, text: string): Promise<MailReview | null>;
  satisfaction(text: string): Promise<Satisfaction | null>;
};

export const unconfiguredModel: ModelProvider = {
  configured: false,
  name: 'none',
  async classify() {
    return null;
  },
  async explain() {
    return null;
  },
  async review() {
    return null;
  },
  async satisfaction() {
    return null;
  },
};

const usRegion =
  /eastus|westus|centralus|usgov|unitedstates|northcentralus|southcentralus|(?:^|[^a-z])us-(?:east|west|central)/iu;

export function regionAllowsProcessing(region: string): boolean {
  const value = region.trim().toLowerCase();
  if (!value || usRegion.test(value)) return false;
  return /(?:^|[^a-z])eu(?:[^a-z]|$)|europe|germany|france|netherlands|sweden|poland|italy|spain|finland|austria|belgium|ireland|denmark/u.test(
    value,
  );
}

export function endpointAllowsProcessing(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function inputHash(text: string): string {
  return createHash('sha256').update(maskPersonalData(text)).digest('hex');
}

export function modelProviderFromEnv(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): ModelProvider {
  const endpoint = env.AI_ENDPOINT?.trim() ?? '';
  const region = env.AI_REGION?.trim() ?? '';
  const key = env.AI_API_KEY?.trim() ?? '';
  const avv = env.AI_AVV_REFERENCE?.trim() ?? '';
  const providerName = env.AI_PROVIDER?.trim() || 'grok';
  if (!endpoint || !region || !key || !avv) return unconfiguredModel;
  if (!endpointAllowsProcessing(endpoint) || !regionAllowsProcessing(region))
    return unconfiguredModel;
  return httpModelProvider({ endpoint, apiKey: key, providerName, fetchImpl });
}

export function httpModelProvider(options: {
  endpoint: string;
  apiKey: string;
  providerName?: string;
  fetchImpl?: typeof fetch;
}): ModelProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const providerName = options.providerName?.trim() || 'grok';
  return {
    configured: true,
    name: providerName,
    async classify(text) {
      const body = await post(fetchImpl, options, {
        task: 'classify',
        text: maskPersonalData(text),
        schema: modelDecisionJsonSchema,
      });
      if (!body) return null;
      const parsed = modelDecisionSchema.safeParse(body.decision);
      if (!parsed.success) return null;
      const model =
        typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'provider';
      return { decision: parsed.data, model: model.slice(0, 80) };
    },
    async explain(query, hits) {
      const body = await post(fetchImpl, options, {
        task: 'explain',
        query: maskPersonalData(query),
        hits: hits.map((hit) => ({ kind: hit.kind, title: maskPersonalData(hit.title) })),
      });
      if (!body || typeof body.de !== 'string' || typeof body.en !== 'string') return null;
      const de = maskPersonalData(body.de).slice(0, 240);
      const en = maskPersonalData(body.en).slice(0, 240);
      if (!de || !en) return null;
      return { de, en };
    },
    async satisfaction(text) {
      const body = await post(fetchImpl, options, {
        task: 'satisfaction',
        text: maskPersonalData(text),
      });
      const answer = typeof body?.answer === 'string' ? body.answer : '';
      return parseSatisfaction(answer);
    },
    async review(prompt, text) {
      const body = await post(fetchImpl, options, {
        task: 'review_mail',
        provider: providerName,
        prompt,
        text: maskPersonalData(text),
      });
      const answer = typeof body?.answer === 'string' ? body.answer : '';
      if (!answer.trim()) return null;
      const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : providerName;
      return { answer: answer.slice(0, 2000), model: model.slice(0, 80) };
    },
  };
}

export function scriptedModel(input: {
  decision?: ModelDecision | null;
  sentence?: { de: string; en: string } | null;
  answer?: string | null;
  satisfaction?: Satisfaction | null;
  onClassify?: (text: string) => void;
  onExplain?: (query: string) => void;
  onReview?: (text: string) => void;
}): ModelProvider {
  return {
    configured: true,
    name: 'scripted',
    async classify(text) {
      input.onClassify?.(text);
      return input.decision ? { decision: input.decision, model: 'scripted' } : null;
    },
    async explain(query) {
      input.onExplain?.(query);
      return input.sentence ?? null;
    },
    async review(_prompt, text) {
      input.onReview?.(text);
      if (!input.answer) return null;
      return { answer: input.answer, model: 'scripted' };
    },
    async satisfaction() {
      return input.satisfaction ?? null;
    },
  };
}

async function post(
  fetchImpl: typeof fetch,
  options: { endpoint: string; apiKey: string },
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== 'object') return null;
    const body = parsed as Record<string, unknown>;
    if (typeof body.model === 'string' && body.model.trim()) {
      return { ...body, model: body.model.trim().slice(0, 80) };
    }
    return body;
  } catch {
    return null;
  }
}
