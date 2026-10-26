import { z } from 'zod';

export const noticeCategories = ['informational', 'warning', 'error'] as const;

export const noticeUpdateSchema = z.object({
  category: z.enum(noticeCategories),
  enabled: z.boolean(),
});

export const noticeListSchema = z.object({
  notices: z.array(
    z.object({
      code: z.string(),
      category: z.enum(noticeCategories),
      enabled: z.boolean(),
      textDe: z.string(),
      textEn: z.string(),
    }),
  ),
});

export const configurationSchema = z.object({
  values: z.array(
    z.object({
      key: z.string(),
      state: z.enum(['set', 'missing', 'shown']),
      value: z.string(),
    }),
  ),
  checks: z.array(
    z.object({
      code: z.string(),
      status: z.enum(['ok', 'informational', 'warning', 'error']),
      textDe: z.string(),
      textEn: z.string(),
    }),
  ),
});

export const sessionViewSchema = z.object({
  signedIn: z.boolean(),
  isLocalAdmin: z.boolean(),
});

export type NoticeList = z.infer<typeof noticeListSchema>;
export type ConfigurationReport = z.infer<typeof configurationSchema>;
export type SessionView = z.infer<typeof sessionViewSchema>;
