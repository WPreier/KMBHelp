import { z } from 'zod';
import { ticketSources } from './domain.js';

export const staffTicketViewSchema = z.object({
  number: z.number().int(),
  subject: z.string(),
  body: z.string(),
  status: z.string(),
  priority: z.enum(['p1', 'p2', 'p3']),
  source: z.enum(ticketSources),
  categoryCode: z.string(),
  categoryLabelDe: z.string(),
  categoryLabelEn: z.string(),
  requesterName: z.string().nullable(),
  requesterEmail: z.string().nullable(),
  explanation: z.string(),
  satisfaction: z.enum(['satisfied', 'neutral', 'dissatisfied']).nullable(),
  impact: z.enum(['filing', 'payroll', 'workplace', 'cosmetic']),
  dueOn: z.string().nullable(),
  assignedStaffId: z.string().uuid().nullable(),
  assignedName: z.string().nullable(),
  fromMail: z.boolean(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  remote: z
    .object({
      supplierName: z.string(),
      windowStart: z.string().nullable(),
      windowEnd: z.string().nullable(),
      accountName: z.string().nullable(),
      endedAt: z.string().nullable(),
    })
    .nullable(),
});

export type StaffTicketView = z.infer<typeof staffTicketViewSchema>;

export const ticketPatchSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(8000),
    categoryCode: z.string().trim().min(1).max(80),
    impact: z.enum(['filing', 'payroll', 'workplace', 'cosmetic']),
    priority: z.enum(['p1', 'p2', 'p3']),
    priorityReason: z.string().trim().max(500).optional(),
    dueOn: z.string().trim().max(10).nullable(),
    requesterName: z.string().trim().max(200).nullable(),
    requesterEmail: z.string().trim().max(200).nullable(),
    explanation: z.string().trim().max(4000),
    assignedStaffId: z.string().uuid().nullable(),
  })
  .strict();

export const ticketReasonSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const ticketQuestionSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
  })
  .strict();

export const unreadMailListSchema = z.object({
  mails: z.array(
    z.object({
      graphId: z.string(),
      subject: z.string(),
      fromEmail: z.string(),
      fromName: z.string(),
    }),
  ),
});
