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
