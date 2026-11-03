import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('kmbhelp-api'),
  database: z.enum(['up', 'down']),
  worker: z.enum(['up', 'down', 'not_configured']),
  smtp: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
