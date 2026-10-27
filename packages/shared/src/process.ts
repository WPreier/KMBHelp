import { z } from 'zod';
import { displayDateToIso } from './dates.js';

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function displayDateInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return displayDateToIso(trimmed) ?? trimmed;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const money = z.number().positive().lt(1_000_000_000);

export const changeInputSchema = z
  .object({
    summary: z.string().trim().min(1).max(200),
    scheduledFor: z.preprocess(displayDateInput, isoDate),
    fallbackText: z.preprocess(emptyToUndefined, z.string().trim().max(4000).optional()),
    systems: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
    exceptionReason: z.preprocess(emptyToUndefined, z.string().trim().min(3).max(2000).optional()),
  })
  .strict();

export const changeApproveSchema = z.object({}).strict();

export const changeOutcomeSchema = z.object({ outcome: z.enum(['done', 'rolled_back']) }).strict();

export const procurementInputSchema = z
  .object({
    article: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(4000),
    amountNet: money,
    supplierId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    wantedOn: z.preprocess(displayDateInput, isoDate.optional()),
    supervisorEmail: z.preprocess(emptyToUndefined, z.string().trim().email().max(200).optional()),
  })
  .strict();

export const procurementPolicySchema = z
  .object({
    directBelow: money,
    tokenUntil: money,
  })
  .strict()
  .refine((value) => value.directBelow < value.tokenUntil, { path: ['tokenUntil'] });

export const supplierInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    purpose: z.string().trim().min(1).max(500),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/u),
    avvOn: z.preprocess(displayDateInput, isoDate.optional()),
    confidentialityOn: z.preprocess(displayDateInput, isoDate.optional()),
    subprocessorsKnown: z.boolean(),
    subprocessorsText: z.string().trim().max(4000).default(''),
    recordRef: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  })
  .strict();

export const remoteSupportInputSchema = z
  .object({
    supplierId: z.string().uuid(),
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    accountName: z.string().trim().min(1).max(200),
  })
  .strict();

export const backupTestInputSchema = z
  .object({
    systemName: z.string().trim().min(1).max(200),
    backupTakenOn: z.preprocess(displayDateInput, isoDate),
  })
  .strict();

export const backupCloseSchema = z
  .object({
    restored: z.boolean().optional(),
    restoredTo: z.string().trim().min(1).max(300),
    resultText: z.string().trim().min(1).max(4000),
    durationMinutes: z.number().int().positive().max(10000),
  })
  .strict();

export const securityIncidentInputSchema = z
  .object({
    detectedAt: z.string().datetime(),
    affected: z.string().trim().min(1).max(2000),
    isolated: z.boolean().optional(),
    clientNotice: z.enum(['yes', 'no', 'open']).optional(),
  })
  .strict();

export const securityDowngradeSchema = z
  .object({
    priority: z.enum(['p1', 'p2', 'p3']),
    reason: z.preprocess(emptyToUndefined, z.string().trim().min(3).max(2000).optional()),
  })
  .strict();

export const offboardingInputSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(4000),
    dueOn: z.preprocess(displayDateInput, isoDate.optional()),
  })
  .strict();

export const checklistUpdateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,64}$/u),
    state: z.enum(['done', 'na', 'open']),
  })
  .strict();

export const certificateInputSchema = z
  .object({
    systemName: z.string().trim().min(1).max(200),
    expiresOn: z.preprocess(displayDateInput, isoDate),
    ownerStaffId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  })
  .strict();

export const portalInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    accountName: z.string().trim().min(1).max(200),
    mfa: z.boolean(),
    ownerName: z.string().trim().min(1).max(200),
    ownerStaffId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  })
  .strict();

export const retentionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    dataKind: z.string().trim().min(1).max(200),
    retentionLabel: z.string().trim().min(1).max(200),
    backupsFollowSamePeriod: z.boolean(),
    ownerStaffId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  })
  .strict();

export const freezeInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,64}$/u),
    label: z.string().trim().min(1).max(200),
    onDate: z.preprocess(displayDateInput, isoDate.optional()),
    dayOfMonthFrom: z.number().int().min(1).max(31).optional(),
    dayOfMonthTo: z.number().int().min(1).max(31).optional(),
    weekdaysOnly: z.boolean().default(true),
  })
  .strict();

export const procurementDecisionSchema = z
  .object({
    token: z.string().trim().min(20).max(200),
    decision: z.enum(['approved', 'rejected']).optional(),
  })
  .strict();

export const processCreatedSchema = z
  .object({
    number: z.number().int().positive(),
    status: z.string(),
    route: z.enum(['direct', 'token', 'manual']).optional(),
    decisionPath: z.string().optional(),
  })
  .strict();
