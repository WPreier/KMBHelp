import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

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
  });

  afterEach(() => {
    cleanup();
  });

  it('shows both wordmarks and keeps the firm links without invented addresses', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'KMB Steuerberatung' })).toBeTruthy();
    const malama = screen.getByRole('link', { name: 'Malama' });
    expect(malama.getAttribute('href')).toBe('https://malama.at');
    expect(screen.getByText('www').tagName).toBe('SPAN');
    expect(screen.getByText('Home').tagName).toBe('SPAN');
    expect(screen.getByText('Wiki').tagName).toBe('SPAN');
    expect(screen.getByText(/not set yet/i)).toBeTruthy();
  });

  it('stores the language and theme choices', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(document.documentElement.lang).toBe('de');
    expect(document.cookie).toContain('kmbhelp_lang=de');
    expect(screen.getByText(/noch nicht erfasst/)).toBeTruthy();

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
