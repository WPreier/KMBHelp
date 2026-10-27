import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

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
        if (url.includes('/api/v1/tickets/public')) {
          return json({
            tickets: [
              {
                number: 7,
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
      'Searches the published guides.',
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
    expect(screen.getByRole('columnheader', { name: 'Due by:' })).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('26.10.2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deutsch' }).closest('header')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Light' }).closest('header')).toBeTruthy();
    expect(screen.getAllByRole('option', { name: 'Very important' }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Age:/);
    expect(document.body.textContent).not.toMatch(/Text:/);
    expect(screen.getByRole('checkbox').getAttribute('title')).toContain('inactive');
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('title')).toContain(
      'cannot be opened',
    );
    expect(document.body.textContent).not.toContain('secret subject');
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

  it('boots from the browser before the module loads', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('kmbhelp_lang');
    expect(html).toContain('kmbhelp_theme');
    expect(html).toContain('prefers-color-scheme');
  });
});
