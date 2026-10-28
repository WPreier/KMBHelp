import {
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
      const response = await send('/api/v1/tickets/public');
      return publicTicketListSchema.parse(await response.json());
    },
    async createTicket(input: Omit<CreateTicketInput, 'source'> & { source?: 'web' | 'app' }) {
      const body = createTicketSchema.parse({ ...input, source: 'app' });
      const response = await send('/api/v1/tickets', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`ticket ${response.status}`);
      return createdTicketSchema.parse(await response.json());
    },
    async categories() {
      const response = await send('/api/v1/categories');
      return categoryListSchema.parse(await response.json());
    },
    async faq() {
      const response = await send('/api/v1/faq');
      return faqListSchema.parse(await response.json());
    },
    async faqArticle(slug: string) {
      const response = await send(`/api/v1/faq/${encodeURIComponent(slug)}`);
      return faqArticleSchema.parse(await response.json());
    },
    async search(q: string) {
      const response = await send(`/api/v1/search?q=${encodeURIComponent(q)}`);
      return searchResultSchema.parse(await response.json());
    },
    async session() {
      const response = await send('/api/v1/auth/session');
      return sessionViewSchema.parse(await response.json());
    },
    async login(input: { email: string; password?: string; code?: string }) {
      const body = loginRequestSchema.parse(input);
      const response = await send('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const cookies = readSessionCookies(response.headers);
      return { result: loginResultSchema.parse(await response.json()), cookies };
    },
    async staffTickets() {
      const response = await send('/api/v1/staff/tickets');
      if (!response.ok) throw new Error(`staff ${response.status}`);
      return staffTicketListSchema.parse(await response.json());
    },
    async dashboard(range: DashboardRange) {
      const response = await send(`/api/v1/staff/dashboard?range=${range}`);
      if (!response.ok) throw new Error(`dashboard ${response.status}`);
      return dashboardSchema.parse(await response.json());
    },
  };
}
