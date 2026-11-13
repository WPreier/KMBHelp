export const defaultMailcheckModel = 'gemma4:12b';

/** Max characters of the mail (headers + body) sent to the MAILCHECK model. */
export const mailcheckInputMax = 5000;

export const mailcheckModels = ['gemma4:12b', 'gemma4:26b', 'qwen3.8:27b'] as const;

export type MailcheckModel = (typeof mailcheckModels)[number];

export function isMailcheckModel(value: string): value is MailcheckModel {
  return (mailcheckModels as readonly string[]).includes(value);
}

export function resolveMailcheckModel(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return isMailcheckModel(trimmed) ? trimmed : defaultMailcheckModel;
}
