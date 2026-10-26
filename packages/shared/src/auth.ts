import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().max(200).optional(),
  code: z.string().trim().max(12).optional(),
});

export const loginResultSchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('enroll') }),
  z.object({
    step: z.literal('mfa'),
    methods: z.array(z.enum(['totp', 'webauthn'])),
    passwordRequired: z.boolean(),
  }),
  z.object({ step: z.literal('staff'), isLocalAdmin: z.boolean() }),
]);

export const totpSetupSchema = z.object({
  secret: z.string(),
  otpauth: z.string(),
});

export const totpConfirmSchema = z.object({
  code: z.string().trim().min(6).max(12),
});

export const adminPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

export const adminAccessSchema = z.object({
  skillCodes: z.array(z.string().trim().min(1).max(80)).max(100),
  categoryCodes: z.array(z.string().trim().min(1).max(80)).max(100),
});

export const adminStaffSchema = z.object({
  skills: z.array(z.object({ code: z.string(), labelDe: z.string(), labelEn: z.string() })),
  categories: z.array(z.object({ code: z.string(), labelDe: z.string(), labelEn: z.string() })),
  staff: z.array(
    z.object({
      id: z.string().uuid(),
      email: z.string(),
      username: z.string().nullable(),
      displayName: z.string(),
      isLocalAdmin: z.boolean(),
      mfaEnrolled: z.boolean(),
      skillCodes: z.array(z.string()),
      categoryCodes: z.array(z.string()),
    }),
  ),
});

export type LoginResult = z.infer<typeof loginResultSchema>;
export type AdminStaffList = z.infer<typeof adminStaffSchema>;
