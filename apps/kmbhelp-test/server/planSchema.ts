import { z } from 'zod';

const LocalizedSchema = z.object({
  de: z.string().min(1),
  en: z.string().min(1),
});

const FieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  label: z.string(),
});

export const PlanPageSchema = z.object({
  url: z.string().url(),
  purpose: LocalizedSchema,
});

export const PlanCaseSchema = z.object({
  id: z.string().min(1),
  pageUrl: z.string().url(),
  kind: z.enum(['valid', 'invalid']),
  title: LocalizedSchema,
  inputDescription: LocalizedSchema,
  purpose: LocalizedSchema,
  fields: z.array(FieldSchema).optional(),
});

export const PlanSchema = z
  .object({
    version: z.literal(1),
    inventoryStatus: z.enum(['waiting_for_credentials', 'login_failed', 'inventoried']),
    target: z.object({
      publicOrigin: z.literal('https://kmbhelp.kmbcloud.at'),
      lanOrigin: z.literal('http://192.168.36.55'),
      shortName: z.literal('kmbhelp'),
    }),
    pages: z.array(PlanPageSchema),
    cases: z.array(PlanCaseSchema),
  })
  .strict();

export const CaseResultSchema = z.object({
  status: z.enum(['pass', 'fail']),
  error: LocalizedSchema.optional(),
  report: LocalizedSchema.optional(),
});

export type StoredPlan = z.infer<typeof PlanSchema>;
export type StoredCase = z.infer<typeof PlanCaseSchema>;
export type StoredField = z.infer<typeof FieldSchema>;
