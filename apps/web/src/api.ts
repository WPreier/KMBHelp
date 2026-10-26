import { readPublicError } from '@kmbhelp/shared';

export class RequestFailed extends Error {
  readonly text: { de: string; en: string } | null;

  constructor(text: { de: string; en: string } | null) {
    super('request failed');
    this.text = text;
  }
}

export async function getJson<T>(url: string, parse: (value: unknown) => T): Promise<T> {
  return readResponse(await fetch(url), parse);
}

export async function postJson<T>(
  url: string,
  payload: unknown,
  parse: (value: unknown) => T,
): Promise<T> {
  return readResponse(
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    parse,
  );
}

async function readResponse<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new RequestFailed(readPublicError(body));
  return parse(body);
}
