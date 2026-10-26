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
                status: 'open',
                priority: 'p1',
                ageSeconds: 120,
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
    expect(screen.getByText('www').tagName).toBe('SPAN');
    expect(screen.getByText('Home').tagName).toBe('SPAN');
    expect(screen.getByText('Wiki').tagName).toBe('SPAN');
    expect(screen.getByText(/not set yet/i)).toBeTruthy();
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'File a ticket' })).toBeTruthy();
    expect(await screen.findByText('7')).toBeTruthy();
    expect(screen.getByText('Payroll run')).toBeTruthy();
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
