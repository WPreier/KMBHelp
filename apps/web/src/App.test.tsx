import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { SignInPage } from './auth-pages';
import { DashboardPage } from './dashboard-page';
import { MailTestPage } from './admin-test-pages';
import { AdminLinks, ConfigurationPage, ServiceChecks } from './operations-pages';
import { LocaleProvider } from './locale';

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

describe('placeholder page', () => {
  beforeEach(() => {
    document.cookie = 'kmbhelp_lang=; Path=/; Max-Age=0';
    document.cookie = 'kmbhelp_theme=; Path=/; Max-Age=0';
    installMatchMedia(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/categories')) {
          return json({
            categories: [
              {
                code: 'payroll_run',
                groupCode: 'payroll',
                groupLabelDe: 'Lohn',
                groupLabelEn: 'Payroll',
                labelDe: 'Abrechnungslauf',
                labelEn: 'Payroll run',
              },
            ],
          });
        }
        if (url.includes('/api/v1/auth/session')) {
          return json({
            signedIn: true,
            isLocalAdmin: true,
            displayName: null,
            internalAdmin: true,
            email: null,
            audience: 'administrator',
          });
        }
        if (url.includes('/api/v1/tickets/public')) {
          return json({
            tickets: [
              {
                number: 7,
                code: '26-0007',
                closeRequested: false,
                groupCode: 'payroll',
                groupLabelDe: 'Lohn',
                groupLabelEn: 'Payroll',
                categoryCode: 'payroll_run',
                categoryLabelDe: 'Abrechnungslauf',
                categoryLabelEn: 'Payroll run',
                subject: 'Payroll run text',
                status: 'open',
                priority: 'p1',
                ageSeconds: 120,
                dueOn: '2026-10-26',
                assigneeEmail: 'helpdesk@kmbcloud.at',
                staffMark: 'abc',
              },
            ],
          });
        }
        return json({ articles: [], hits: [] });
      }),
    );
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows both wordmarks and keeps the firm links without invented addresses', async () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'KMB Steuerberatung' })).toBeTruthy();
    const malama = screen.getByRole('link', { name: 'Malama' });
    expect(malama.getAttribute('href')).toBe('https://malama.at');
    expect(malama.getAttribute('target')).toBe('_blank');
    expect(
      screen
        .getByRole('link', { name: 'KMB Steuerberatung' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toContain('kmb-logo--light');
    expect(malama.querySelector('img')?.getAttribute('src')).toContain('malama-logo-light');
    for (const [name, href] of [
      ['www', 'https://kmb-steuerberatung.at'],
      ['Home', 'https://home.kmbcloud.at'],
      ['Wiki', 'https://wiki.kmbcloud.at'],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(href);
      expect(link.getAttribute('target')).toBe('_blank');
    }
    const search = screen.getByRole('search');
    expect(search.closest('header')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' }).getAttribute('title')).toBe(
      'Searches the chosen area: verdict, summary or ticket.',
    );
    expect(screen.getByRole('heading', { name: 'KMBHelp' })).toBeTruthy();
    expect(screen.getByText('IT helpdesk for KMB Steuerberatung')).toBeTruthy();
    expect(screen.queryByText('Search')).toBeNull();
    expect(screen.queryByLabelText('Email for the secret link')).toBeNull();
    expect(screen.getByRole('heading', { name: 'File a ticket' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Priority' })).toBeTruthy();
    expect(await screen.findByText(/Payroll run text/)).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'ID' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Text' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Age' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Due by' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Mark' })).toBeNull();
    expect(screen.getByText('26-0007')).toBeTruthy();
    expect(screen.getByText('26.10.2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' }).closest('header')).toBeTruthy();
    expect(screen.getByText('Administrator')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Log' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deutsch' }).closest('header')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Light' }).closest('header')).toBeTruthy();
    expect(screen.getAllByRole('option', { name: 'Very important' }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Age:/);
    expect(document.body.textContent).not.toMatch(/Text:/);
    expect(
      screen.getByRole('checkbox').closest('[data-hint]')?.getAttribute('data-hint'),
    ).toContain('inactive');
    expect(
      screen
        .getByRole('button', { name: 'Done' })
        .closest('[data-hint]')
        ?.getAttribute('data-hint'),
    ).toContain('cannot be opened');
    expect(screen.getByLabelText('Due on').getAttribute('type')).toBe('date');
    expect(document.body.textContent).not.toContain('secret subject');
  });

  it('shows only the sign-in page when nobody is signed in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/session')) {
          return json({
            signedIn: false,
            isLocalAdmin: false,
            displayName: null,
            internalAdmin: false,
            email: null,
            audience: null,
          });
        }
        return json({ articles: [], hits: [], token: 'qr-token', step: 'wait' });
      }),
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'File a ticket' })).toBeNull();
  });

  it('stores the language and theme choices', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(document.documentElement.lang).toBe('de');
    expect(document.cookie).toContain('kmbhelp_lang=de');
    expect(screen.getByRole('heading', { name: 'Ticket erfassen' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dunkel' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(
      screen
        .getByRole('link', { name: 'KMB Steuerberatung' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toContain('kmb-logo-dark');
    expect(
      screen.getByRole('link', { name: 'Malama' }).querySelector('img')?.getAttribute('src'),
    ).toContain('malama-logo-dark');
    expect(document.cookie).toContain('kmbhelp_theme=dark');
    expect(screen.getByRole('button', { name: 'Dunkel' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('opens administration and shows the login name for the local admin', async () => {
    let signed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/login')) {
          signed = true;
          return json({ step: 'staff', isLocalAdmin: true });
        }
        if (url.includes('/api/v1/auth/session')) {
          return json(
            signed
              ? {
                  signedIn: true,
                  isLocalAdmin: true,
                  displayName: 'office-admin',
                  internalAdmin: false,
                }
              : {
                  signedIn: false,
                  isLocalAdmin: false,
                  displayName: null,
                  internalAdmin: false,
                },
          );
        }
        return json({ articles: [], hits: [], categories: [], tickets: [] });
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.change(screen.getAllByLabelText('Email or username')[0]!, {
      target: { value: 'office-admin' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }));
    expect(await screen.findByRole('heading', { name: 'IT staff' })).toBeTruthy();
    expect(screen.getByText('Administrator, office-admin')).toBeTruthy();
    expect(screen.queryByText('Not signed in')).toBeNull();
  });

  it('shows the one-time code for a domain account without pressing the setup button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/login')) {
          return json({ step: 'enroll', presentTotp: true });
        }
        if (url.includes('/api/v1/auth/totp/setup')) {
          return json({
            secret: 'JBSWY3DPEHPK3PXP',
            otpauth:
              'otpauth://totp/KMBHelp:ada@kmbcloud.at?secret=JBSWY3DPEHPK3PXP&issuer=KMBHelp&algorithm=SHA1&digits=6&period=30',
          });
        }
        if (url.includes('/api/v1/auth/session')) {
          return json({
            signedIn: false,
            isLocalAdmin: false,
            displayName: null,
            internalAdmin: false,
          });
        }
        return json({ articles: [], hits: [], categories: [], tickets: [] });
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.change(screen.getAllByLabelText('Email or username')[0]!, {
      target: { value: 'ada@kmbcloud.at' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'directory-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up a one-time code' })).toBeNull();
  });

  it('names the signed-in account and shows a code that signs the user out', async () => {
    let signed = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/logout')) {
          signed = false;
          return json({ ok: true });
        }
        if (url.includes('/api/v1/auth/session')) {
          return json(
            signed
              ? {
                  signedIn: true,
                  isLocalAdmin: false,
                  displayName: 'Ada',
                  internalAdmin: false,
                  email: 'ada@example.com',
                  audience: 'user',
                }
              : {
                  signedIn: false,
                  isLocalAdmin: false,
                  displayName: null,
                  internalAdmin: false,
                  email: null,
                  audience: null,
                },
          );
        }
        if (url.includes('/api/v1/auth/totp/setup')) {
          return json({
            secret: 'JBSWY3DPEHPK3PXP',
            otpauth:
              'otpauth://totp/KMBHelp:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=KMBHelp&algorithm=SHA1&digits=6&period=30',
          });
        }
        if (url.includes('/api/v1/auth/totp/check')) {
          const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as {
            code?: string;
          };
          return json({ ok: body.code === '123456' });
        }
        return json({ articles: [], hits: [], categories: [], tickets: [] });
      }),
    );
    render(
      <MemoryRouter initialEntries={['/anmelden']}>
        <LocaleProvider lang="de">
          <SignInPage />
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Angemeldet als Benutzer mit ada@example.com')).toBeTruthy();
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    expect(
      await screen.findByRole('img', { name: 'Mit der Authenticator-App scannen.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Passkey hinterlegen' })).toBeNull();
    expect(screen.queryByText('vorschau@example.com')).toBeNull();
    fireEvent.change(screen.getByLabelText('Einmalcode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teste Passkey jetzt' }));
    expect(await screen.findByText('Passkey falsch')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Einmalcode'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teste Passkey jetzt' }));
    expect(await screen.findByText('Passkey akzeptiert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(await screen.findByRole('button', { name: 'Mit Passwort anmelden' })).toBeTruthy();
    expect(screen.queryByText('Angemeldet als Benutzer mit ada@example.com')).toBeNull();
  });

  it('hides the service check on the dashboard', async () => {
    function session(signedIn: boolean) {
      return json({
        signedIn,
        isLocalAdmin: false,
        displayName: signedIn ? 'Ada' : null,
        internalAdmin: false,
      });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/session')) return session(true);
        return { ok: false, status: 401, json: async () => null };
      }),
    );
    render(
      <MemoryRouter>
        <LocaleProvider lang="de">
          <DashboardPage />
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Die Daten konnten nicht geladen werden.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Dienste' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test jetzt durchführen und prüfen' })).toBeNull();
  });

  it('runs one service test from the configuration page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/v1/staff/services/smtp')) {
          return json({
            code: 'smtp',
            status: 'ok',
            textDe: 'Postfix nimmt Verbindungen an.',
            textEn: 'Postfix accepts connections.',
          });
        }
        if (url.endsWith('/api/v1/staff/services')) {
          return json({
            services: [
              {
                code: 'smtp',
                status: 'error',
                textDe: 'Postfix ist nicht erreichbar.',
                textEn: 'Postfix cannot be reached.',
              },
            ],
          });
        }
        return { ok: false, status: 404, json: async () => null };
      }),
    );
    render(
      <LocaleProvider lang="de">
        <ServiceChecks />
      </LocaleProvider>,
    );
    expect(await screen.findByText('Postfix ist nicht erreichbar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Test jetzt durchführen und prüfen' }));
    expect(await screen.findByText('Postfix nimmt Verbindungen an.')).toBeTruthy();
  });

  it('keeps the service check off the configuration page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => null })),
    );
    render(
      <LocaleProvider lang="de">
        <ConfigurationPage />
      </LocaleProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Konfiguration' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Dienste' })).toBeNull();
  });

  it('shows the test pages only to an administrator', () => {
    const { unmount } = render(
      <MemoryRouter>
        <LocaleProvider lang="de">
          <AdminLinks administrator={false} />
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Tests' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'KI-Mailtest' })).toBeNull();
    unmount();
    render(
      <MemoryRouter>
        <LocaleProvider lang="de">
          <AdminLinks administrator />
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Tests' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'KI-Mailtest' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Helpdesk-Mailbox' })).toBeTruthy();
  });

  it('shows the model text, the answer and the seconds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/v1/admin/mail-test') && init?.method !== 'POST') {
          return json({ prompt: 'Lies diese E-Mail.' });
        }
        if (url.endsWith('/api/v1/admin/mail-test')) {
          return json({
            seconds: 1.5,
            exchanges: [
              { kind: 'classify', prompt: 'Lies diese E-Mail.\n\nFrom: a', answer: 'SPAM' },
            ],
            textDe: 'Ergebnis: spam.',
            textEn: 'Result: spam.',
          });
        }
        return { ok: false, status: 404, json: async () => null };
      }),
    );
    render(
      <MemoryRouter>
        <LocaleProvider lang="de">
          <MailTestPage />
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByDisplayValue('Lies diese E-Mail.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'Hallo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Testen' }));
    expect(await screen.findByText('An die KI geschickt')).toBeTruthy();
    expect(screen.getByText('SPAM')).toBeTruthy();
    expect(screen.getByText('Der Test hat 1.5 Sekunden gedauert.')).toBeTruthy();
  });

  it('boots from the browser before the module loads', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('kmbhelp_lang');
    expect(html).toContain('kmbhelp_theme');
    expect(html).toContain('prefers-color-scheme');
  });
});
