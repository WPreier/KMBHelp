import { chromium, type Page } from 'playwright';
import type { Localized, TestOutcome } from '../src/types';
import { exclusive } from './lock';
import { redact, scrubExcerpt } from './redact';
import { readCredentials, type Credentials } from './secrets';
import { PUBLIC_ORIGIN } from './targets';

const CHROME = '/usr/bin/google-chrome';

type LangSignals = {
  htmlLang: string;
  dataLang: string;
  labels: 'de' | 'en' | 'both' | 'none';
  stored: string | null;
};

type ThemeSignals = {
  dataTheme: string;
  className: string;
  background: string;
  stored: string | null;
  prefers: 'dark' | 'light';
};

function fail(id: string, error: Localized): TestOutcome {
  return { id, status: 'fail', error };
}

function pass(id: string, report: Localized): TestOutcome {
  return { id, status: 'pass', report };
}

async function secretValues(): Promise<string[]> {
  try {
    const credentials = await readCredentials();
    if (!credentials) return [];
    return [credentials.password, credentials.username];
  } catch {
    return [];
  }
}

function clean(de: string, en: string, secrets: string[]): Localized {
  return { de: redact(de, secrets), en: redact(en, secrets) };
}

async function withBrowser<T>(fn: (page: Page) => Promise<T>, timeoutMs = 45000): Promise<T> {
  return exclusive(async () => {
    const browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    let timer: NodeJS.Timeout | undefined;
    const work = (async () => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'de-AT' });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      return fn(page);
    })();
    try {
      return await Promise.race([
        work,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('browser check timed out')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      await browser.close().catch(() => undefined);
      work.catch(() => undefined);
    }
  });
}

async function guarded(id: string, fn: () => Promise<TestOutcome>): Promise<TestOutcome> {
  try {
    return await fn();
  } catch (error) {
    const secrets = await secretValues();
    const message = error instanceof Error ? error.message : 'check failed';
    const text = redact(message, secrets);
    return fail(id, { de: text, en: text });
  }
}

async function bodyExcerpt(page: Page): Promise<string> {
  const text = await page.locator('body').innerText().catch(() => '');
  return scrubExcerpt(text);
}

export async function attemptLogin(page: Page, credentials: Credentials): Promise<{ ok: true } | { ok: false; error: Localized }> {
  const secrets = [credentials.password, credentials.username];
  try {
    await page.goto(PUBLIC_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'navigation failed';
    return { ok: false, error: clean(`Seite nicht geöffnet: ${message}`, `Page did not open: ${message}`, secrets) };
  }
  const control = page
    .getByRole('button', { name: /anmeldung|anmelden|sign in/i })
    .or(page.getByRole('link', { name: /anmeldung|anmelden|sign in/i }));
  if ((await control.count()) === 0) {
    const seen = await bodyExcerpt(page);
    return {
      ok: false,
      error: clean(
        `Schaltfläche Anmeldung nicht gefunden. Sichtbarer Text: ${seen || 'leer'}.`,
        `Sign-in control was not found. Visible text: ${seen || 'empty'}.`,
        secrets,
      ),
    };
  }
  await control.first().click();
  const username = page.locator('input[name="username"], input[name="email"], input[type="email"], input[autocomplete="username"]').first();
  const password = page.locator('input[type="password"]').first();
  if ((await username.count()) === 0 || (await password.count()) === 0) {
    return {
      ok: false,
      error: {
        de: 'Anmeldung geöffnet, aber Benutzer- oder Passwortfeld fehlt.',
        en: 'Sign-in opened, but the username or password field is missing.',
      },
    };
  }
  try {
    await username.fill(credentials.username);
    await password.fill(credentials.password);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fill failed';
    return { ok: false, error: clean(`Felder nicht ausgefüllt: ${message}`, `Fields were not filled: ${message}`, secrets) };
  }
  const submit = page.getByRole('button', { name: /anmelden|sign in|login|einloggen/i });
  if ((await submit.count()) > 0) await submit.first().click();
  else await password.press('Enter');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  const stillPassword = (await page.locator('input[type="password"]').count()) > 0;
  const signedOut = page
    .getByRole('button', { name: /abmelden|sign out|log out/i })
    .or(page.getByRole('link', { name: /abmelden|sign out|log out/i }));
  const alertText = scrubExcerpt(await page.locator('[role="alert"]').innerText().catch(() => ''));
  if ((await signedOut.count()) > 0) return { ok: true };
  if (alertText && /fehler|ungültig|invalid|falsch|denied/i.test(alertText)) {
    return { ok: false, error: clean(`Anmeldung abgelehnt: ${alertText}`, `Sign-in was rejected: ${alertText}`, secrets) };
  }
  if (!stillPassword) return { ok: true };
  return {
    ok: false,
    error: {
      de: 'Anmeldung nicht bestätigt. Das Passwortfeld ist noch sichtbar.',
      en: 'Sign-in was not confirmed. The password field is still visible.',
    },
  };
}

async function findSearch(page: Page) {
  const selectors = [
    'header input[type="search"]',
    '[role="search"] input',
    'input[type="search"]',
    'header input[name="q"]',
    'input[placeholder*="Suche" i]',
    'input[placeholder*="Search" i]',
    'input[aria-label*="Suche" i]',
    'input[aria-label*="Search" i]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) return locator;
  }
  return null;
}

async function termFromContent(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const interesting = /anleitungen|guides|tickets/i;
    const nodes = Array.from(document.querySelectorAll('section, nav, main, article, div'));
    const region = nodes.find((node) => interesting.test(node.textContent ?? '') && (node.textContent ?? '').length < 4000);
    const scope = region ?? document.body;
    const candidates = Array.from(scope.querySelectorAll('a, li, h1, h2, h3'));
    for (const node of candidates) {
      const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (value.length < 3 || value.length > 60) continue;
      if (interesting.test(value) && value.split(' ').length < 3) continue;
      return value;
    }
    return null;
  });
}

export function runSearch(): Promise<TestOutcome> {
  return guarded('search', () =>
    withBrowser(async (page) => {
      const secrets = await secretValues();
      await page.goto(PUBLIC_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const box = await findSearch(page);
      const seen = await bodyExcerpt(page);
      if (!box) {
        return fail(
          'search',
          clean(
            `Keine Suche ausgeführt. Kein Suchfeld gefunden. Sichtbarer Text: ${seen || 'leer'}. Adresse ${page.url()}.`,
            `No search was run. No search field found. Visible text: ${seen || 'empty'}. Address ${page.url()}.`,
            secrets,
          ),
        );
      }
      const term = await termFromContent(page);
      if (!term) {
        return fail(
          'search',
          clean(
            'Suchfeld gefunden, aber keine sichtbare Anleitung oder kein Ticket. Es wurde kein Suchbegriff erfunden.',
            'A search field was found, but no visible guide or ticket. No query was invented.',
            secrets,
          ),
        );
      }
      await box.fill(term);
      await box.press('Enter');
      await page.waitForTimeout(800);
      const after = await bodyExcerpt(page);
      if (!after.toLowerCase().includes(term.toLowerCase())) {
        return fail(
          'search',
          clean(
            `Gesucht: „${term}“. Zurück kam: ${after || 'kein Text'}. Der Begriff ist in der Antwort nicht sichtbar.`,
            `Searched: "${term}". Came back: ${after || 'no text'}. The term is not visible in the response.`,
            secrets,
          ),
        );
      }
      return pass(
        'search',
        clean(
          `Gesucht: „${term}“ aus dem sichtbaren Inhalt. Zurück kam: ${after}.`,
          `Searched: "${term}" from the visible content. Came back: ${after}.`,
          secrets,
        ),
      );
    }),
  );
}

export function runLogin(): Promise<TestOutcome> {
  return guarded('login', async () => {
    const credentials = await readCredentials();
    if (!credentials) {
      return fail('login', {
        de: 'Anmeldung nicht möglich: die lokale Zugangsdatei fehlt. Es wird kein Passwort erfunden.',
        en: 'Sign-in is not possible: the local credentials file is missing. No password is invented.',
      });
    }
    return withBrowser(async (page) => {
      const result = await attemptLogin(page, credentials);
      if (!result.ok) return fail('login', result.error);
      return pass('login', {
        de: 'Anmeldung bestätigt. Das Passwort wurde nicht protokolliert.',
        en: 'Sign-in confirmed. The password was not logged.',
      });
    });
  });
}

async function readLang(page: Page): Promise<LangSignals> {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    const de = /Anmeldung|Anleitungen|Suche/.test(text);
    const en = /\bSign in\b|\bGuides\b|\bSearch\b/.test(text);
    let labels: LangSignals['labels'] = 'none';
    if (de && en) labels = 'both';
    else if (de) labels = 'de';
    else if (en) labels = 'en';
    return {
      htmlLang: document.documentElement.lang || '',
      dataLang: document.documentElement.getAttribute('data-lang') || '',
      labels,
      stored: localStorage.getItem('kmbhelp_lang'),
    };
  });
}

function langMethod(before: LangSignals, after: LangSignals): { method: string; changed: boolean } {
  if ((before.htmlLang || after.htmlLang) && before.htmlLang !== after.htmlLang) {
    return { method: 'document.documentElement.lang', changed: true };
  }
  if ((before.dataLang || after.dataLang) && before.dataLang !== after.dataLang) {
    return { method: 'data-lang', changed: true };
  }
  if (before.labels !== after.labels && after.labels !== 'both' && after.labels !== 'none') {
    return { method: 'visible-labels', changed: true };
  }
  if (before.htmlLang || after.htmlLang) return { method: 'document.documentElement.lang', changed: false };
  if (before.dataLang || after.dataLang) return { method: 'data-lang', changed: false };
  return { method: 'visible-labels', changed: false };
}

async function clickLanguage(page: Page, current: LangSignals): Promise<boolean> {
  const preferEnglish = current.htmlLang.toLowerCase().startsWith('de') || current.labels === 'de' || current.labels === 'none';
  const name = preferEnglish ? /^(en|english|englisch)$/i : /^(de|deutsch|german)$/i;
  const direct = page.getByRole('button', { name }).or(page.getByRole('link', { name }));
  if ((await direct.count()) > 0) {
    await direct.first().click();
    return true;
  }
  const menu = page.getByRole('button', { name: /sprache|language/i });
  if ((await menu.count()) === 0) return false;
  await menu.first().click();
  const item = page.getByRole('button', { name }).or(page.getByRole('menuitem', { name }));
  if ((await item.count()) === 0) return false;
  await item.first().click();
  return true;
}

export function runLanguage(): Promise<TestOutcome> {
  return guarded('language', () =>
    withBrowser(async (page) => {
      await page.goto(PUBLIC_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const before = await readLang(page);
      const clicked = await clickLanguage(page, before);
      await page.waitForTimeout(400);
      const after = await readLang(page);
      const decision = langMethod(before, after);
      const detailDe = `Erkennung: ${decision.method}. html lang „${before.htmlLang || '—'}“ → „${after.htmlLang || '—'}“, data-lang „${before.dataLang || '—'}“ → „${after.dataLang || '—'}“, sichtbare Beschriftung ${before.labels} → ${after.labels}. localStorage kmbhelp_lang ${before.stored ?? '—'} → ${after.stored ?? '—'} wird nur mitgelesen.`;
      const detailEn = `Detection: ${decision.method}. html lang "${before.htmlLang || '—'}" → "${after.htmlLang || '—'}", data-lang "${before.dataLang || '—'}" → "${after.dataLang || '—'}", visible labels ${before.labels} → ${after.labels}. localStorage kmbhelp_lang ${before.stored ?? '—'} → ${after.stored ?? '—'} is only recorded.`;
      if (!clicked) {
        const seen = await bodyExcerpt(page);
        return fail('language', {
          de: `${detailDe} Kein Sprachumschalter gefunden. Sichtbarer Text: ${seen || 'leer'}.`,
          en: `${detailEn} No language switch found. Visible text: ${seen || 'empty'}.`,
        });
      }
      if (!decision.changed) {
        return fail('language', {
          de: `${detailDe} Der Umschalter hat die Oberfläche nicht verändert.`,
          en: `${detailEn} The switch did not change the UI.`,
        });
      }
      return pass('language', { de: detailDe, en: detailEn });
    }),
  );
}

async function readTheme(page: Page): Promise<ThemeSignals> {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body).backgroundColor;
    const root = getComputedStyle(document.documentElement).backgroundColor;
    const background = body === 'rgba(0, 0, 0, 0)' || body === 'transparent' ? root : body;
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return {
      dataTheme: document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '',
      className: `${document.documentElement.className} ${document.body.className}`.trim(),
      background,
      stored: localStorage.getItem('kmbhelp_theme'),
      prefers,
    };
  });
}

function themeText(before: ThemeSignals, after: ThemeSignals): Localized {
  return {
    de: `Erkennung: data-theme „${before.dataTheme || '—'}“ → „${after.dataTheme || '—'}“, Klasse „${before.className || '—'}“ → „${after.className || '—'}“, berechneter Hintergrund ${before.background} → ${after.background}. prefers-color-scheme ist ${before.prefers} und zählt nicht als Nachweis. localStorage kmbhelp_theme ${before.stored ?? '—'} → ${after.stored ?? '—'}.`,
    en: `Detection: data-theme "${before.dataTheme || '—'}" → "${after.dataTheme || '—'}", class "${before.className || '—'}" → "${after.className || '—'}", computed background ${before.background} → ${after.background}. prefers-color-scheme is ${before.prefers} and is not treated as proof. localStorage kmbhelp_theme ${before.stored ?? '—'} → ${after.stored ?? '—'}.`,
  };
}

export function runTheme(): Promise<TestOutcome> {
  return guarded('theme', () =>
    withBrowser(async (page) => {
      await page.goto(PUBLIC_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const before = await readTheme(page);
      const toggle = page.getByRole('button', {
        name: /hell\/dunkel|dunkelmodus|hellmodus|dark mode|light mode|farbschema|erscheinungsbild|^dunkel$|^hell$|^dark$|^light$|^theme$/i,
      });
      if ((await toggle.count()) === 0) {
        const seen = await bodyExcerpt(page);
        const method = themeText(before, before);
        return fail('theme', {
          de: `${method.de} Kein Umschalter für Hell/Dunkel gefunden. Sichtbarer Text: ${seen || 'leer'}.`,
          en: `${method.en} No light/dark switch found. Visible text: ${seen || 'empty'}.`,
        });
      }
      await toggle.first().click();
      await page.waitForTimeout(400);
      const after = await readTheme(page);
      const method = themeText(before, after);
      if (before.background === after.background) {
        return fail('theme', {
          de: `${method.de} Der berechnete Hintergrund hat sich nicht geändert.`,
          en: `${method.en} The computed background did not change.`,
        });
      }
      return pass('theme', method);
    }),
  );
}
