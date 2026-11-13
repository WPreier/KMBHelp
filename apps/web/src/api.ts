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

export async function deleteJson<T>(url: string, parse: (value: unknown) => T): Promise<T> {
  return readResponse(
    await fetch(url, {
      method: 'DELETE',
      credentials: 'include',
      headers: { ...csrfHeader() },
    }),
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
  if (!response.ok) {
    throw new RequestFailed(readPublicError(body) ?? gatewayError(response.status));
  }
  try {
    return parse(body);
  } catch {
    throw new RequestFailed({
      de: 'Die Antwort der API war ungültig. Bitte Seite neu laden und erneut versuchen.',
      en: 'The API answer was invalid. Reload the page and try again.',
    });
  }
}

function gatewayError(status: number): { de: string; en: string } | null {
  if (status === 502 || status === 504) {
    return {
      de: 'Die Anfrage wurde vom Webserver abgebrochen (Zeitlimit). Für den KI-Mailtest braucht nginx proxy_read_timeout mindestens 360s unter location /api/.',
      en: 'The web server aborted the request (time limit). For the model mail test nginx needs proxy_read_timeout of at least 360s under location /api/.',
    };
  }
  if (status === 401) {
    return {
      de: 'Dafür ist eine Anmeldung nötig.',
      en: 'Sign-in is required.',
    };
  }
  return null;
}
