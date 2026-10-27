import { z } from 'zod';

export const noticeCategories = ['informational', 'warning', 'error'] as const;

export const syslogHostSetting = 'syslog.host';
export const syslogPortSetting = 'syslog.port';
export const syslogNameSetting = 'syslog.name';
export const syslogFacilitySetting = 'syslog.facility';
export const syslogOffsetSetting = 'syslog.offset';
export const defaultSyslogHost = '192.168.191.215';
export const defaultSyslogPort = 514;
export const defaultSyslogName = 'KMBHelp';
export const defaultSyslogFacility = 'local0';
export const defaultSyslogOffset = '+01:00';
export const syslogOffsetPattern = /^[+-](?:0\d|1[0-4]):[0-5]\d$/u;
export const syslogFacilities = [
  'local0',
  'local1',
  'local2',
  'local3',
  'local4',
  'local5',
  'local6',
  'local7',
] as const;

const syslogHostPattern = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/u;

export const syslogTargetSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(syslogHostPattern)
    .refine((host) => !host.includes('..')),
  port: z.number().int().min(1).max(65535),
  appName: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .regex(/^[\x21-\x7e]+$/u),
  facility: z.enum(syslogFacilities),
  offset: z.string().regex(syslogOffsetPattern),
});

export const configValueSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().max(20000),
});

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
  syslog: z.object({
    host: z.string(),
    port: z.number().int(),
    appName: z.string(),
    facility: z.enum(syslogFacilities),
    offset: z.string(),
  }),
  entries: z.array(
    z.object({
      key: z.string(),
      secret: z.boolean(),
      state: z.enum(['set', 'missing', 'shown']),
      value: z.string(),
      textDe: z.string(),
      textEn: z.string(),
    }),
  ),
});

export const configFieldResultSchema = z.object({
  entry: configurationSchema.shape.entries.element,
  check: configurationSchema.shape.checks.element,
  syslog: configurationSchema.shape.syslog,
});

export const syslogTestSchema = z.object({
  ok: z.boolean(),
});

export const sessionViewSchema = z.object({
  signedIn: z.boolean(),
  isLocalAdmin: z.boolean(),
});

export type NoticeList = z.infer<typeof noticeListSchema>;
export type ConfigurationReport = z.infer<typeof configurationSchema>;
export type SessionView = z.infer<typeof sessionViewSchema>;
