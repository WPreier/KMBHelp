import { readCookie, readPublicError } from '@kmbhelp/shared';

export class RequestFailed extends Error {
  readonly text: { de: string; en: string } | null;

  constructor(text: { de: string; en: string } | null) {
    super('request failed');
    this.text = text;
  }
}

export async function getJson<T>(url: string, parse: (value: unknown) => T): Promise<T> {
  return readResponse(
    await fetch(url, { credentials: 'include', headers: { ...csrfHeader() } }),
    parse,
  );
}

export async function postJson<T>(
  url: string,
  payload: unknown,
  parse: (value: unknown) => T,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  return readResponse(
    await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify(payload),
    }),
    parse,
  );
}

function csrfHeader(): { 'x-kmbhelp-csrf'?: string } {
  const token = readCookie(document.cookie, 'kmbhelp_csrf');
  return token ? { 'x-kmbhelp-csrf': token } : {};
}

async function readResponse<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new RequestFailed(readPublicError(body));
  return parse(body);
}
