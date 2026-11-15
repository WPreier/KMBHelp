import { describe, expect, it } from 'vitest';
import { parseOpenRouterModels } from './openrouter-models.js';

describe('openrouter models', () => {
  it('keeps text chat models, drops non-text output, sorts by prompt cost', () => {
    const models = parseOpenRouterModels({
      data: [
        {
          id: 'expensive/text',
          name: 'Expensive',
          architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] },
          pricing: { prompt: '0.000002', completion: '0.000004' },
        },
        {
          id: 'cheap/text',
          name: 'Cheap',
          architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] },
          pricing: { prompt: '0.0000001', completion: '0.0000002' },
        },
        {
          id: 'image/out',
          name: 'Image',
          architecture: { modality: 'text->image', input_modalities: ['text'], output_modalities: ['image'] },
          pricing: { prompt: '0.00000001', completion: '0' },
        },
      ],
    });
    expect(models.map((entry) => entry.id)).toEqual(['cheap/text', 'expensive/text']);
    expect(models[0]?.promptCostPerMillion).toBeCloseTo(0.1, 5);
    expect(models[1]?.promptCostPerMillion).toBeCloseTo(2, 5);
  });
});
