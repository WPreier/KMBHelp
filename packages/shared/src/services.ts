import { z } from 'zod';

export const serviceCodes = [
  'database',
  'worker',
  'smtp',
  'directory',
  'mailbox',
  'ollama',
  'syslog',
] as const;

export const serviceCodeSchema = z.enum(serviceCodes);

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

export type ServiceCode = z.infer<typeof serviceCodeSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type ServiceRow = z.infer<typeof serviceRowSchema>;
export type ServiceReport = z.infer<typeof serviceReportSchema>;
