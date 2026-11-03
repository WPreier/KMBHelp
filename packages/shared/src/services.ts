import { z } from 'zod';

export const serviceStatusSchema = z.enum(['ok', 'error']);

export const serviceRowSchema = z.object({
  code: z.string(),
  status: serviceStatusSchema,
  textDe: z.string(),
  textEn: z.string(),
});

export const serviceReportSchema = z.object({
  services: z.array(serviceRowSchema),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type ServiceRow = z.infer<typeof serviceRowSchema>;
export type ServiceReport = z.infer<typeof serviceReportSchema>;
