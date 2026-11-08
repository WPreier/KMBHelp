import { z } from 'zod';

export const mailTestPromptSchema = z
  .object({
    prompt: z.string(),
  })
  .strict();

export const mailTestRequestSchema = z
  .object({
    prompt: z.string().max(20_000),
    email: z.string().max(20_000),
  })
  .strict();

export const mailExchangeSchema = z
  .object({
    kind: z.enum(['classify', 'retry', 'importance']),
    prompt: z.string(),
    answer: z.string(),
  })
  .strict();

export const mailTestResultSchema = z
  .object({
    seconds: z.number().nonnegative(),
    exchanges: z.array(mailExchangeSchema),
    textDe: z.string(),
    textEn: z.string(),
  })
  .strict();

export const mailboxRowSchema = z
  .object({
    graphId: z.string(),
    fromName: z.string(),
    fromEmail: z.string(),
    to: z.string(),
    cc: z.string(),
    sentAt: z.string(),
    subject: z.string(),
    internetMessageId: z.string(),
    inReplyTo: z.string(),
    references: z.string(),
    body: z.string(),
    unread: z.boolean(),
  })
  .strict();

export const mailboxMessageSchema = mailboxRowSchema
  .extend({
    source: z.string(),
  })
  .strict();

export const mailboxListSchema = z
  .object({
    messages: z.array(mailboxRowSchema),
    truncated: z.boolean(),
  })
  .strict();

export const mailboxReadSchema = z
  .object({
    graphId: z.string().trim().min(1).max(2000),
    unread: z.boolean(),
  })
  .strict();

export type MailTestResult = z.infer<typeof mailTestResultSchema>;
export type MailboxRow = z.infer<typeof mailboxRowSchema>;
export type MailboxMessage = z.infer<typeof mailboxMessageSchema>;
