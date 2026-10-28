import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StaffTicket } from '@kmbhelp/shared';
import { createHelpdeskClient } from './client.js';
import { canShowStaffDetail, presentStaffTicket } from './gate.js';
import { apiOrigin } from './origin.js';
import { readSessionCookies } from './session.js';
import type { HelpdeskHttp } from './client.js';

const ticket: StaffTicket = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 12,
  categoryCode: 'printer',
  categoryLabelDe: 'Drucker',
  categoryLabelEn: 'Printer',
  status: 'open',
  impact: 'workplace',
  priority: 'p3',
  priorityReason: 'single_workplace',
  subject: 'Papierstau',
  body: 'Mandant Meier, Lohn Mai',
  requesterEmail: 'person@kmb-steuerberatung.at',
  requesterName: 'Ada',
  dueOn: null,
  source: 'app',
  ageSeconds: 10,
  durationSeconds: null,
};

describe('mobile client', () => {
  it('uses the public https origin and rejects a clear-text office address', () => {
    expect(apiOrigin({})).toBe('https://helpdesk.kmbcloud.at');
    expect(apiOrigin({ EXPO_PUBLIC_API_ORIGIN: 'http://127.0.0.1:3000' })).toBe(
      'http://127.0.0.1:3000',
    );
    expect(() => apiOrigin({ EXPO_PUBLIC_API_ORIGIN: 'http://192.168.36.20:3000' })).toThrow(
      'api origin must be https',
    );
  });

  it('files an app ticket and refuses a public row that carries a description', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const http: HelpdeskHttp = async (url, init) => {
      calls.push({ url, body: String(init?.body ?? '') });
      if (url.endsWith('/api/v1/tickets')) {
        return jsonResponse({ number: 4, priority: 'p3', priorityReason: 'single_workplace' });
      }
      return jsonResponse({
        tickets: [
          {
            number: 4,
            groupCode: 'workplace',
            groupLabelDe: 'Arbeitsplatz',
            groupLabelEn: 'Workplace',
            categoryCode: 'printer',
            categoryLabelDe: 'Drucker',
            categoryLabelEn: 'Printer',
            subject: 'Sichtbarer Betreff',
            status: 'open',
            priority: 'p3',
            ageSeconds: 1,
            dueOn: null,
            staffMark: null,
            body: 'geheim',
          },
        ],
      });
    };
    const client = createHelpdeskClient({ origin: 'https://helpdesk.kmbcloud.at', fetch: http });
    const created = await client.createTicket({
      categoryCode: 'printer',
      impact: 'workplace',
      subject: 'Papierstau',
      body: 'Fach 2',
      source: 'web',
    });
    expect(created.number).toBe(4);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({ source: 'app' });
    await expect(client.publicTickets()).rejects.toThrow();
  });

  it('hides the staff description until the server session and the device are both open', () => {
    expect(canShowStaffDetail(true, false)).toBe(false);
    expect(canShowStaffDetail(false, true)).toBe(false);
    expect(canShowStaffDetail(true, true)).toBe(true);
    const hidden = presentStaffTicket(ticket, false);
    expect(hidden.subject).toBe('Papierstau');
    expect(hidden.body).toBeNull();
    expect(hidden.requesterEmail).toBeNull();
    expect(hidden.requesterName).toBeNull();
    expect(presentStaffTicket(ticket, true).body).toContain('Lohn');
  });

  it('reads the session cookies and keeps the device prompt in the screen', () => {
    const cookies = readSessionCookies({
      get: () => null,
      getSetCookie: () => ['kmbhelp_session=abc', 'kmbhelp_csrf=def'],
    });
    expect(cookies).toEqual({ session: 'abc', csrf: 'def' });
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('presentStaffTicket');
    expect(app).toContain('authenticateAsync');
    expect(app).not.toContain('kmbhelp_password');
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
}
