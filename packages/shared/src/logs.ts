import { z } from 'zod';

export const logNames = ['activity', 'error', 'mail', 'ki'] as const;

export const logLineSchema = z.object({
  at: z.string(),
  actor: z.string(),
  kind: z.string(),
  target: z.string(),
  detail: z.string(),
  seconds: z.string().default(''),
  request: z.string().default(''),
  answer: z.string().default(''),
});

export const logReportSchema = z.object({
  file: z.enum(logNames),
  lines: z.array(logLineSchema),
});

export type LogName = (typeof logNames)[number];
export type LogLine = z.infer<typeof logLineSchema>;
export type LogReport = z.infer<typeof logReportSchema>;
