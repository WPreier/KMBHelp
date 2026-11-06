import { z } from 'zod';
import { displayDateToIso } from './dates.js';
import { impacts, priorities, ticketStatuses } from './domain.js';

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function displayDateInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return displayDateToIso(trimmed) ?? trimmed;
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
    requesterName: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    dueOn: z.preprocess(
      displayDateInput,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
    clientPriority: z.preprocess(emptyToUndefined, z.enum(priorities).optional()),
    assignedStaffId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    source: z.enum(['web', 'app']).default('web'),
  })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const publicTicketSchema = z
  .object({
    number: z.number().int().positive(),
    code: z.string().regex(/^\d{2}-\d{4}$/),
    closeRequested: z.boolean(),
    groupCode: z.string(),
    groupLabelDe: z.string(),
    groupLabelEn: z.string(),
    categoryCode: z.string(),
    categoryLabelDe: z.string(),
    categoryLabelEn: z.string(),
    subject: z.string(),
    status: z.enum(ticketStatuses),
    priority: z.enum(priorities),
    ageSeconds: z.number().int().nonnegative(),
    dueOn: z.string().nullable(),
    staffMark: z.string().min(1).max(3).nullable(),
  })
  .strict();

export type PublicTicket = z.infer<typeof publicTicketSchema>;

export const createdTicketSchema = z
  .object({
    number: z.number().int().positive(),
    code: z.string().regex(/^\d{2}-\d{4}$/),
    priority: z.enum(priorities),
    priorityReason: z.enum([
      'deadline_today_or_overdue',
      'deadline_later',
      'impact_without_date',
      'single_workplace',
      'no_deadline',
    ]),
  })
  .strict();

export type CreatedTicket = z.infer<typeof createdTicketSchema>;

export const publicTicketActionSchema = z
  .object({
    action: z.enum(['toggle', 'close', 'priority']),
    priority: z.enum(priorities).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'priority' && !value.priority) {
      context.addIssue({ code: 'custom', message: 'priority', path: ['priority'] });
    }
  });

export const publicTicketStateSchema = z
  .object({
    number: z.number().int().positive(),
    status: z.enum(ticketStatuses),
    priority: z.enum(priorities),
  })
  .strict();

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

export const searchScopes = ['verdict', 'summary', 'ticket'] as const;

export const searchQuerySchema = z.object({
  q: z.string().trim().max(80),
  scope: z.enum(searchScopes).optional(),
});

export const closedTicketSchema = z
  .object({
    code: z.string(),
    subject: z.string(),
    verdict: z.string(),
  })
  .strict();

export const closedTicketListSchema = z.object({ tickets: z.array(closedTicketSchema) }).strict();

export const closedTicketPageSchema = z
  .object({
    code: z.string(),
    subject: z.string(),
    summary: z.string(),
    verdict: z.string(),
  })
  .strict();

export const ticketPageSchema = z
  .object({
    code: z.string(),
    categoryLabelDe: z.string(),
    categoryLabelEn: z.string(),
    impact: z.enum(impacts),
    subject: z.string(),
    dueOn: z.string().nullable(),
    priority: z.enum(priorities),
    status: z.enum(ticketStatuses),
    closeRequested: z.boolean(),
    frozen: z.boolean(),
  })
  .strict();

export type TicketPage = z.infer<typeof ticketPageSchema>;

export const ticketFileViewSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    mediaType: z.string(),
    bytes: z.number().int().nonnegative(),
    createdAt: z.string(),
  })
  .strict();

export const ticketWorkSchema = z
  .object({
    body: z.string(),
    workingMarkdown: z.string(),
    requesterName: z.string().nullable(),
    updatedAt: z.string(),
    lastEditor: z.string().nullable(),
    files: z.array(ticketFileViewSchema),
  })
  .strict();

export const ticketSavedSchema = z
  .object({
    updatedAt: z.string(),
    lastEditor: z.string(),
  })
  .strict();

export const archiveIndexSchema = z
  .object({
    code: z.string(),
    archived: z.boolean(),
    markdown: z.string(),
    files: z.array(
      z
        .object({
          name: z.string(),
          bytes: z.number().int().nonnegative(),
          modifiedAt: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const ticketMarkdownSchema = z
  .object({
    markdown: z.string().max(100_000),
  })
  .strict();

export const ticketUploadSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    mediaType: z.string().trim().min(1).max(120),
    contentBase64: z.string().min(1).max(14_000_000),
  })
  .strict();

export const publicTicketListSchema = z.object({ tickets: z.array(publicTicketSchema) }).strict();
export const assignableStaffSchema = z
  .object({
    staff: z.array(
      z
        .object({
          id: z.string().uuid(),
          displayName: z.string(),
          active: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export const availabilitySchema = z
  .object({
    configured: z.boolean(),
    windows: z.array(
      z
        .object({
          start: z.string(),
          end: z.string(),
        })
        .strict(),
    ),
    textDe: z.string(),
    textEn: z.string(),
  })
  .strict();

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

export const staffTicketListSchema = z
  .object({
    open: z.array(staffTicketSchema),
    recent: z.array(staffTicketSchema),
  })
  .strict();

export type StaffTicketList = z.infer<typeof staffTicketListSchema>;
