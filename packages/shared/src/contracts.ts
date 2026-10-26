import { z } from 'zod';
import { impacts, priorities, ticketStatuses } from './domain.js';

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export const createTicketSchema = z
  .object({
    categoryCode: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,64}$/),
    impact: z.enum(impacts),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(8000),
    requesterEmail: z.preprocess(emptyToUndefined, z.string().email().max(200).optional()),
    requesterName: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    dueOn: z.preprocess(emptyToUndefined, calendarDay.optional()),
    clientPriority: z.preprocess(emptyToUndefined, z.enum(priorities).optional()),
    source: z.enum(['web', 'app']).default('web'),
  })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const publicTicketSchema = z
  .object({
    number: z.number().int().positive(),
    groupCode: z.string(),
    groupLabelDe: z.string(),
    groupLabelEn: z.string(),
    categoryCode: z.string(),
    categoryLabelDe: z.string(),
    categoryLabelEn: z.string(),
    status: z.enum(ticketStatuses),
    priority: z.enum(priorities),
    ageSeconds: z.number().int().nonnegative(),
  })
  .strict();

export type PublicTicket = z.infer<typeof publicTicketSchema>;

export const createdTicketSchema = z
  .object({
    number: z.number().int().positive(),
    priority: z.enum(priorities),
    priorityReason: z.enum([
      'deadline_today_or_overdue',
      'deadline_later',
      'impact_without_date',
      'single_workplace',
      'no_deadline',
    ]),
    secretPath: z.string().nullable(),
  })
  .strict();

export type CreatedTicket = z.infer<typeof createdTicketSchema>;

export const secretTicketSchema = publicTicketSchema
  .extend({
    subject: z.string(),
    body: z.string(),
  })
  .strict();

export type SecretTicket = z.infer<typeof secretTicketSchema>;

export const categoryOptionSchema = z
  .object({
    code: z.string(),
    groupCode: z.string(),
    groupLabelDe: z.string(),
    groupLabelEn: z.string(),
    labelDe: z.string(),
    labelEn: z.string(),
  })
  .strict();

export type CategoryOption = z.infer<typeof categoryOptionSchema>;

export const faqSummarySchema = z
  .object({
    slug: z.string(),
    titleDe: z.string(),
    titleEn: z.string(),
  })
  .strict();

export const faqArticleSchema = faqSummarySchema
  .extend({
    bodyDe: z.string(),
    bodyEn: z.string(),
  })
  .strict();

export type FaqArticleView = z.infer<typeof faqArticleSchema>;

export const knowledgeArticleSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    body: z.string(),
  })
  .strict();

export const searchHitSchema = z
  .object({
    kind: z.enum(['faq', 'article', 'ticket']),
    id: z.string(),
    titleDe: z.string(),
    titleEn: z.string(),
    href: z.string().nullable(),
    sentenceDe: z.string(),
    sentenceEn: z.string(),
  })
  .strict();

export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().max(80),
});

export const publicTicketListSchema = z.object({ tickets: z.array(publicTicketSchema) }).strict();
export const categoryListSchema = z.object({ categories: z.array(categoryOptionSchema) }).strict();
export const faqListSchema = z.object({ articles: z.array(faqSummarySchema) }).strict();
export const searchResultSchema = z.object({ hits: z.array(searchHitSchema) }).strict();

const publicErrorBodySchema = z.object({
  message: z.object({ de: z.string(), en: z.string() }).strict(),
});

export function readPublicError(body: unknown): { de: string; en: string } | null {
  const parsed = publicErrorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.message : null;
}

export const staffTicketSchema = z
  .object({
    id: z.string().uuid(),
    number: z.number().int().positive(),
    categoryCode: z.string(),
    categoryLabelDe: z.string(),
    categoryLabelEn: z.string(),
    status: z.enum(ticketStatuses),
    impact: z.enum(impacts),
    priority: z.enum(priorities),
    priorityReason: z.string(),
    subject: z.string(),
    body: z.string(),
    requesterEmail: z.string().nullable(),
    requesterName: z.string().nullable(),
    dueOn: z.string().nullable(),
    source: z.string(),
    ageSeconds: z.number().int().nonnegative(),
    durationSeconds: z.number().int().nonnegative().nullable(),
  })
  .strict();

export type StaffTicket = z.infer<typeof staffTicketSchema>;
