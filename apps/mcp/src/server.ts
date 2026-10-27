import { listToolNames, resolveToolCall, toolDefinitions } from './tools.js';

export type ReviewMailInput = {
  fromEmail: string;
  subject: string;
  body: string;
};

export { listToolNames, toolDefinitions };

export function reviewMailTool(): {
  name: 'review_mail';
  description: string;
} {
  const tool = toolDefinitions.find((entry) => entry.name === 'review_mail');
  if (!tool) throw new Error('review_mail missing');
  return { name: 'review_mail', description: tool.description };
}

export async function callReviewMail(
  input: ReviewMailInput,
  options: { origin: string; fetchImpl?: typeof fetch },
): Promise<unknown> {
  return callTool('review_mail', input, { ...options, token: '' }).then((result) => result.json);
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  options: { origin: string; token: string; fetchImpl?: typeof fetch },
): Promise<{ status: number; json: unknown; isError: boolean }> {
  const call = resolveToolCall(name, args);
  if (call.auth && options.token.trim().length < 16) {
    return { status: 401, json: { error: 'token_missing' }, isError: true };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (call.body !== undefined) headers['content-type'] = 'application/json';
  if (call.auth) headers.authorization = `Bearer ${options.token.trim()}`;
  const response = await fetchImpl(`${options.origin.replace(/\/$/u, '')}${call.path}`, {
    method: call.method,
    headers,
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
  });
  const json: unknown = await response.json();
  return { status: response.status, json, isError: response.status >= 400 };
}
