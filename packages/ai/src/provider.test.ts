import { describe, expect, it } from 'vitest';
import { modelProviderFromEnv, httpModelProvider, parseSatisfaction, unconfiguredModel } from './provider.js';

describe('model provider', () => {
  it('stays unconfigured until endpoint, EU region, key and AVV are all set', async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response('{}');
    };
    const missing = modelProviderFromEnv(
      { AI_ENDPOINT: 'https://model.example.eu/v1', AI_REGION: 'germanywestcentral' },
      fetchImpl,
    );
    const unitedStates = modelProviderFromEnv(
      {
        AI_ENDPOINT: 'https://model.example.eu/v1',
        AI_REGION: 'eastus',
        AI_API_KEY: 'secret-key',
        AI_AVV_REFERENCE: 'AVV-1',
      },
      fetchImpl,
    );
    expect(missing.configured).toBe(false);
    expect(unitedStates.configured).toBe(false);
    expect(await missing.classify('Drucker')).toBeNull();
    expect(called).toBe(false);
  });

  it('sends the masked text and reads a recorded decision', async () => {
    let sent = '';
    const provider = httpModelProvider({
      endpoint: 'https://model.example.eu/v1',
      apiKey: 'secret-key',
      fetchImpl: async (_url, init) => {
        sent = String(init?.body ?? '');
        return new Response(
          JSON.stringify({
            model: 'recorded',
            decision: {
              category: 'printer',
              priority: 'p3',
              skill: 'workplace',
              confidence: 0.91,
              auto_reply_allowed: false,
              is_support: true,
              faq_slug: null,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const decision = await provider.classify('SVNR 1234 010180 Der Drucker klemmt.');
    expect(decision?.model).toBe('recorded');
    expect(decision?.decision.category).toBe('printer');
    expect(sent).toContain('[SVNR]');
    expect(sent).not.toContain('1234');
    expect(sent).not.toContain('secret-key');
  });

  it('reads satisfaction only from the answer words and does not call a model when unconfigured', async () => {
    expect(parseSatisfaction('unzufrieden')).toBe('dissatisfied');
    expect(parseSatisfaction('neutral')).toBe('neutral');
    expect(parseSatisfaction('zufrieden')).toBe('satisfied');
    expect(parseSatisfaction('vielleicht')).toBeNull();
    expect(await unconfiguredModel.satisfaction('zufrieden')).toBeNull();
  });
});
