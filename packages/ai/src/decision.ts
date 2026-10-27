import { z } from 'zod';
import { containsPersonalData } from './mask.js';

export const autoReplyConfidence = 0.85;

export const modelDecisionSchema = z
  .object({
    category: z.string().trim().min(1).max(80),
    priority: z.enum(['p1', 'p2', 'p3']),
    skill: z.string().trim().min(1).max(80),
    confidence: z.number().min(0).max(1),
    auto_reply_allowed: z.boolean(),
    is_support: z.boolean(),
    faq_slug: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict();

export type ModelDecision = z.infer<typeof modelDecisionSchema>;

export const modelDecisionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'priority', 'skill', 'confidence', 'auto_reply_allowed', 'is_support'],
  properties: {
    category: { type: 'string', minLength: 1, maxLength: 80 },
    priority: { type: 'string', enum: ['p1', 'p2', 'p3'] },
    skill: { type: 'string', minLength: 1, maxLength: 80 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    auto_reply_allowed: { type: 'boolean' },
    is_support: { type: 'boolean' },
    faq_slug: { type: ['string', 'null'] },
  },
} as const;

const rank = { p1: 1, p2: 2, p3: 3 } as const;

export function stricterPriority(
  left: 'p1' | 'p2' | 'p3',
  right: 'p1' | 'p2' | 'p3',
): 'p1' | 'p2' | 'p3' {
  return rank[left] <= rank[right] ? left : right;
}

export function confirmsSupportMail(decision: ModelDecision | null | undefined): boolean {
  return decision?.is_support === true;
}

export function autoReplyAllowlist(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^[a-z0-9_]+$/u.test(entry));
}

export function autoReplyGate(input: {
  decision: ModelDecision;
  allowlist: readonly string[];
  publishedFaqSlugs: readonly string[];
  text: string;
  now?: Date;
  threshold?: number;
}): { close: boolean; reason: string } {
  if (input.allowlist.length === 0) return { close: false, reason: 'allowlist' };
  if (!input.allowlist.includes(input.decision.category))
    return { close: false, reason: 'category' };
  if (input.decision.confidence < (input.threshold ?? autoReplyConfidence)) {
    return { close: false, reason: 'confidence' };
  }
  if (!input.decision.auto_reply_allowed) return { close: false, reason: 'model_refused' };
  if (containsPersonalData(input.text, input.now)) return { close: false, reason: 'personal_data' };
  const slug = input.decision.faq_slug ?? '';
  if (!slug || !input.publishedFaqSlugs.includes(slug)) return { close: false, reason: 'faq' };
  return { close: true, reason: 'ok' };
}
