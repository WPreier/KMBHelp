import {
  readPublicError,
  categoryListSchema,
  createTicketSchema,
  createdTicketSchema,
  dashboardSchema,
  faqArticleSchema,
  faqListSchema,
  loginRequestSchema,
  loginResultSchema,
  publicTicketListSchema,
  searchResultSchema,
  sessionViewSchema,
  staffTicketListSchema,
  type CreateTicketInput,
  type DashboardRange,
} from '@kmbhelp/shared';
import { cookieHeader, readSessionCookies, type SessionCookies } from './session.js';

type HttpResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null; getSetCookie?: () => string[] };
  json(): Promise<unknown>;
};

export type HelpdeskInit = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

export type HelpdeskHttp = (input: string, init?: HelpdeskInit) => Promise<HttpResponse>;

export class HelpdeskRequestError extends Error {
  readonly status: number;
  readonly text: { de: string; en: string } | null;

  constructor(status: number, text: { de: string; en: string } | null) {
    super(`http ${status}`);
    this.status = status;
    this.text = text;
  }
}

async function readAnswer<T>(response: HttpResponse, parse: (value: unknown) => T): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new HelpdeskRequestError(response.status, readPublicError(body));
  return parse(body);
}

export function createHelpdeskClient(options: {
  origin: string;
  fetch: HelpdeskHttp;
  session?: SessionCookies | null;
}) {
  const origin = options.origin.replace(/\/$/u, '');

  async function send(path: string, init?: HelpdeskInit): Promise<HttpResponse> {
    const headers = { ...(init?.headers ?? {}) };
    if (options.session) headers.cookie = cookieHeader(options.session);
    if (init?.body && !headers['content-type']) headers['content-type'] = 'application/json';
    return options.fetch(`${origin}${path}`, { ...init, headers });
  }

  return {
    async publicTickets() {
      return readAnswer(await send('/api/v1/tickets/public'), publicTicketListSchema.parse);
    },
    async createTicket(input: Omit<CreateTicketInput, 'source'> & { source?: 'web' | 'app' }) {
      const body = createTicketSchema.parse({ ...input, source: 'app' });
      return readAnswer(
        await send('/api/v1/tickets', { method: 'POST', body: JSON.stringify(body) }),
        createdTicketSchema.parse,
      );
    },
    async categories() {
      return readAnswer(await send('/api/v1/categories'), categoryListSchema.parse);
    },
    async faq() {
      return readAnswer(await send('/api/v1/faq'), faqListSchema.parse);
    },
    async faqArticle(slug: string) {
      return readAnswer(
        await send(`/api/v1/faq/${encodeURIComponent(slug)}`),
        faqArticleSchema.parse,
      );
    },
    async search(q: string) {
      return readAnswer(
        await send(`/api/v1/search?q=${encodeURIComponent(q)}`),
        searchResultSchema.parse,
      );
    },
    async session() {
      return readAnswer(await send('/api/v1/auth/session'), sessionViewSchema.parse);
    },
    async login(input: { email: string; password?: string; code?: string }) {
      const body = loginRequestSchema.parse(input);
      const response = await send('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const cookies = readSessionCookies(response.headers);
      return { result: await readAnswer(response, loginResultSchema.parse), cookies };
    },
    async staffTickets() {
      return readAnswer(await send('/api/v1/staff/tickets'), staffTicketListSchema.parse);
    },
    async dashboard(range: DashboardRange) {
      return readAnswer(
        await send(`/api/v1/staff/dashboard?range=${range}`),
        dashboardSchema.parse,
      );
    },
  };
}
