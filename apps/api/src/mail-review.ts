import { maskPersonalData, parseSupportAnswer, unconfiguredModel, type ModelProvider } from '@kmbhelp/ai';
import { appSetting, type Database } from '@kmbhelp/db';
import { aiProviderName, internalMailDomains, mailPromptText, type AiProviderName } from '@kmbhelp/shared';
import { inArray } from 'drizzle-orm';

export type MailExclusion = 'helpdesk' | 'staff' | 'domain';

export type MailVerdict = {
  is_support: boolean;
  excluded: boolean;
  held: boolean;
  reason: string;
  model: string;
};

export function mailDomain(email: string): string {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return domain;
}

export function exclusionReason(input: {
  fromEmail: string;
  domains: readonly string[];
  helpdeskMailbox: string;
  staffEmails: readonly string[];
}): MailExclusion | null {
  const from = input.fromEmail.trim().toLowerCase();
  const local = from.split('@')[0] ?? '';
  const mailbox = input.helpdeskMailbox.trim().toLowerCase();
  if (local === 'helpdesk' || (mailbox !== '' && from === mailbox)) return 'helpdesk';
  if (input.staffEmails.some((email) => email.trim().toLowerCase() === from)) return 'staff';
  const domains = input.domains.map((domain) => domain.trim().toLowerCase());
  if (!domains.includes(mailDomain(from))) return 'domain';
  return null;
}

export async function reviewInboundMail(
  mail: { fromEmail: string; subject: string; body: string },
  deps: {
    provider?: ModelProvider | undefined;
    domains: readonly string[];
    prompt?: string | undefined;
    helpdeskMailbox: string;
    staffEmails: readonly string[];
    providerName?: AiProviderName | string | undefined;
    syslog?: ((category: 'informational' | 'warning', message: string) => Promise<void>) | undefined;
    lessons?: readonly { outcome: 'accepted' | 'rejected'; reason: string }[] | undefined;
  },
): Promise<MailVerdict> {
  const excluded = exclusionReason({
    fromEmail: mail.fromEmail,
    domains: deps.domains,
    helpdeskMailbox: deps.helpdeskMailbox,
    staffEmails: deps.staffEmails,
  });
  if (excluded) {
    return {
      is_support: false,
      excluded: true,
      held: false,
      reason: excluded,
      model: 'none',
    };
  }
  const provider = deps.provider ?? unconfiguredModel;
  if (!provider.configured) {
    return { is_support: false, excluded: false, held: true, reason: 'unreachable', model: 'none' };
  }
  const learned = (deps.lessons ?? [])
    .slice(0, 20)
    .map((lesson) =>
      `${lesson.outcome === 'accepted' ? 'JA' : 'NEIN'}: ${maskPersonalData(lesson.reason).slice(0, 200)}`,
    )
    .filter((line) => line.length > 4)
    .join('\n');
  const prompt = learned
    ? `${mailPromptText(deps.prompt)}\n\nBisherige Entscheidungen:\n${learned}`
    : mailPromptText(deps.prompt);
  const text = maskPersonalData(`${mail.subject}\n${mail.body}`);
  let answer: { answer: string; model: string } | null = null;
  try {
    answer = await provider.review(prompt, text);
  } catch {
    answer = null;
  }
  const name = deps.providerName?.trim() || provider.name || 'grok';
  if (!answer) {
    await deps.syslog?.('warning', `external ${name} review unreachable`);
    return { is_support: false, excluded: false, held: true, reason: 'unreachable', model: name };
  }
  const parsed = parseSupportAnswer(answer.answer);
  if (!parsed) {
    await deps.syslog?.('warning', `external ${name} review unparsed`);
    return { is_support: false, excluded: false, held: false, reason: 'unparsed', model: answer.model };
  }
  await deps.syslog?.(
    'informational',
    `external ${name} review ${parsed.support ? 'JA' : 'NEIN'}`,
  );
  return {
    is_support: parsed.support,
    excluded: false,
    held: false,
    reason: maskPersonalData(parsed.reason),
    model: answer.model,
  };
}

export function domainsFromSetting(value: string | undefined): string[] {
  return internalMailDomains(value);
}

export async function loadReviewSettings(database: Database, env: NodeJS.ProcessEnv) {
  const names = ['AI_MAIL_PROMPT', 'INTERNAL_MAIL_DOMAINS', 'AI_PROVIDER'];
  const stored = new Map<string, string>();
  const rows = await database.db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(inArray(appSetting.key, names.map((name) => `config.${name}`)));
  for (const row of rows) stored.set(row.key.slice('config.'.length), row.value);
  const value = (key: string) => stored.get(key) ?? env[key];
  return {
    prompt: mailPromptText(value('AI_MAIL_PROMPT')),
    domains: internalMailDomains(value('INTERNAL_MAIL_DOMAINS')),
    providerName: aiProviderName(value('AI_PROVIDER')),
    helpdeskMailbox: env.GRAPH_MAILBOX ?? '',
  };
}
