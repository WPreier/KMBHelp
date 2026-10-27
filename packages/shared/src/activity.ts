import { z } from 'zod';

export const activityViewSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^\/(?!.*\.\.)[^\s?#]*$/u),
});

export const mailReviewRequestSchema = z.object({
  fromEmail: z.string().trim().email().max(200),
  subject: z.string().trim().max(300),
  body: z.string().max(20_000),
});

export const mailReviewResponseSchema = z.object({
  is_support: z.boolean(),
  excluded: z.boolean(),
  held: z.boolean(),
  reason: z.string().max(300),
  model: z.string().max(80),
});

export const activityEntrySchema = z.object({
  at: z.string(),
  actor: z.string(),
  kind: z.enum(['page', 'mail']),
  target: z.string(),
  detail: z.string(),
  ip: z.string(),
});

export const activityListSchema = z.object({
  entries: z.array(activityEntrySchema),
});

export type ActivityList = z.infer<typeof activityListSchema>;
