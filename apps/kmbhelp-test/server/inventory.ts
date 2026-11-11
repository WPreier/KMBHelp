import { chromium, type Browser, type Page } from 'playwright';
import type { CaseResult, Localized, PlanDocument } from '../src/types';
import { attemptLogin } from './browserChecks';
import { exclusive } from './lock';
import {
  casesFromPages,
  currentPlan,
  isComplete,
  loadTemplate,
  publishPlan,
  purposeFor,
  runFilePath,
  safeLabel,
  writeRun,
  type ObservedField,
  type ObservedPage,
} from './plan';
import type { StoredCase } from './planSchema';
import { scrubExcerpt } from './redact';
import { readCredentials } from './secrets';

const CHROME = '/usr/bin/google-chrome';
const PAGE_CAP = 15;

function exampleValue(type: string): string {
  if (type === 'email') return 'dev-kmbhelp-test@example.com';
  if (type === 'tel') return '00000';
  if (type === 'number') return '1';
  if (type === 'date') return '2026-01-15';
  if (type === 'url') return 'https://example.com';
  if (type === 'password') return 'Beispiel-nur-test';
  return 'Beispiel';
}

function invalidValue(type: string): string {
  if (type === 'email') return 'kein-email';
  if (type === 'number') return 'abc';
  if (type === 'url') return 'nicht-eine-url';
  if (type === 'date') return '2026-13-40';
  return '';
}

function isLogout(url: string, text: string): boolean {
  return /abmelden|logout|sign-out|signout/i.test(`${url} ${text}`);
}

async function observe(page: Page): Promise<{ page: ObservedPage; links: { href: string; text: string }[] }> {
  const data = await page.evaluate(() => {
    const heading = document.querySelector('h1')?.textContent ?? '';
    const title = document.title ?? '';
    const fields = Array.from(document.querySelectorAll('input, textarea, select'))
      .map((element) => {
        const input = element as HTMLInputElement;
        const type = (input.getAttribute('type') || input.tagName).toLowerCase();
        if (type === 'hidden' || type === 'file' || type === 'submit' || type === 'button') return null;
        const id = input.id;
        const labelNode = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const label = labelNode?.textContent || input.getAttribute('aria-label') || '';
        return {
          name: input.name || '',
          type,
          required: Boolean(input.required),
          label: label ?? '',
        };
      })
      .filter((field): field is ObservedField => field !== null);
    const links = Array.from(document.querySelectorAll('a[href]')).map((anchor) => ({
      href: (anchor as HTMLAnchorElement).href,
      text: anchor.textContent ?? '',
    }));
    return { heading, title, fields, links };
  });
  return {
    page: {
      url: page.url(),
      title: data.title,
      heading: data.heading,
      fields: data.fields.map((field) => ({
        ...field,
        label: safeLabel(field.label),
        name: safeLabel(field.name),
      })),
    },
    links: data.links,
  };
}

function looksBroken(text: string, status: number): boolean {
  return status >= 500 || /TypeError|ReferenceError|Internal Server Error/i.test(text);
}

export async function executeCase(page: Page, item: StoredCase): Promise<CaseResult> {
  try {
    return await runObservedCase(page, item);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'case failed';
    return {
      status: 'fail',
      error: { de: `Fall nicht ausgeführt: ${message}`, en: `Case was not run: ${message}` },
    };
  }
}

async function runObservedCase(page: Page, item: StoredCase): Promise<CaseResult> {
  const fields = item.fields ?? [];
  if (item.kind === 'invalid' && fields.length === 0) {
    const target = `${item.pageUrl.replace(/\/$/, '')}/kmbhelp-test-invalid`;
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const status = response?.status() ?? 0;
    const text = await page.locator('body').innerText().catch(() => '');
    const excerpt = scrubExcerpt(text);
    if (looksBroken(text, status)) {
      return {
        status: 'fail',
        error: {
          de: `Ungültiger Pfad endete mit HTTP ${status}. ${excerpt}`,
          en: `Invalid path ended with HTTP ${status}. ${excerpt}`,
        },
      };
    }
    return {
      status: 'pass',
      report: { de: `Ungültiger Pfad, HTTP ${status}.`, en: `Invalid path, HTTP ${status}.` },
    };
  }
  const response = await page.goto(item.pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const status = response?.status() ?? 0;
  if (fields.length === 0) {
    if (status >= 400) {
      return {
        status: 'fail',
        error: { de: `Seite öffnete mit HTTP ${status}.`, en: `Page opened with HTTP ${status}.` },
      };
    }
    return { status: 'pass', report: { de: `Seite geöffnet, HTTP ${status}.`, en: `Page opened, HTTP ${status}.` } };
  }
  for (const field of fields) {
    const locator = field.name
      ? page.locator(`[name="${field.name.replace(/"/g, '')}"]`).first()
      : page.locator('input, textarea, select').first();
    if ((await locator.count()) === 0) continue;
    if (field.type === 'checkbox') {
      if (item.kind === 'valid') await locator.check().catch(() => undefined);
      else await locator.uncheck().catch(() => undefined);
      continue;
    }
    const value = item.kind === 'valid' ? exampleValue(field.type) : invalidValue(field.type);
    await locator.fill(value).catch(() => undefined);
  }
  const validity = await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) return { hasForm: false, valid: true };
    return { hasForm: true, valid: form.checkValidity() };
  });
  if (item.kind === 'invalid' && validity.hasForm && !validity.valid) {
    return {
      status: 'pass',
      report: {
        de: 'Ungültige Eingabe wurde vom Formular abgelehnt.',
        en: 'Invalid input was rejected by the form.',
      },
    };
  }
  const submit = page.locator('form button[type="submit"], form input[type="submit"], form button:not([type])').first();
  if ((await submit.count()) > 0) await submit.click().catch(() => undefined);
  await page.waitForTimeout(400);
  const text = await page.locator('body').innerText().catch(() => '');
  const excerpt = scrubExcerpt(text);
  if (looksBroken(text, 0)) {
    return {
      status: 'fail',
      error: { de: `Die Seite zeigte einen Fehler: ${excerpt}`, en: `The page showed an error: ${excerpt}` },
    };
  }
  if (item.kind === 'invalid') {
    if (!/ungültig|fehler|required|pflicht|invalid/i.test(text)) {
      return {
        status: 'fail',
        error: {
          de: 'Ungültige Eingabe wurde nicht erkennbar abgelehnt.',
          en: 'Invalid input was not visibly rejected.',
        },
      };
    }
    return { status: 'pass', report: { de: `Abgelehnt: ${excerpt}`, en: `Rejected: ${excerpt}` } };
  }
  return {
    status: 'pass',
    report: {
      de: `Gültige Beispieleingabe abgeschickt. Antwort: ${excerpt}`,
      en: `Valid sample input submitted. Response: ${excerpt}`,
    },
  };
}

async function browseSignedIn(browser: Browser): Promise<{ plan: PlanDocument; results: Record<string, CaseResult>; error?: Localized }> {
  const credentials = await readCredentials();
  const template = await loadTemplate();
  if (!credentials) {
    const plan: PlanDocument = { ...template, inventoryStatus: 'waiting_for_credentials', pages: [], cases: [] };
    await writeRun(plan, {});
    await publishPlan(plan, {});
    return {
      plan,
      results: {},
      error: {
        de: 'Die Seitenliste wartet auf Zugangsdaten. Es wird kein Passwort erfunden.',
        en: 'The page inventory is waiting for credentials. No password is invented.',
      },
    };
  }
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'de-AT' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const login = await attemptLogin(page, credentials);
  if (!login.ok) {
    const plan: PlanDocument = { ...template, inventoryStatus: 'login_failed', pages: [], cases: [] };
    await writeRun(plan, {});
    await publishPlan(plan, {});
    return { plan, results: {}, error: login.error };
  }
  const origin = new URL(page.url()).origin;
  const queue = [page.url()];
  const seen = new Set<string>();
  const observed: ObservedPage[] = [];
  while (queue.length > 0 && observed.length < PAGE_CAP) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    if (observed.length > 0) {
      await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined);
    }
    if (!page.url().startsWith(origin)) continue;
    const snapshot = await observe(page);
    observed.push(snapshot.page);
    for (const link of snapshot.links) {
      if (isLogout(link.href, link.text)) continue;
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        continue;
      }
      if (url.origin !== origin) continue;
      url.hash = '';
      const key = url.toString();
      if (!seen.has(key) && queue.length < PAGE_CAP) queue.push(key);
    }
  }
  const pages = observed.map((item) => ({ url: item.url, purpose: purposeFor(item) }));
  const cases = casesFromPages(observed);
  const results: Record<string, CaseResult> = {};
  for (const item of cases) {
    results[item.id] = await executeCase(page, item);
  }
  const plan: PlanDocument = {
    ...template,
    inventoryStatus: 'inventoried',
    pages,
    cases,
  };
  await writeRun(plan, results);
  await publishPlan(plan, results);
  return { plan, results };
}

async function waitingPlan(): Promise<{ plan: PlanDocument; results: Record<string, CaseResult>; error: Localized }> {
  const template = await loadTemplate();
  const plan: PlanDocument = { ...template, inventoryStatus: 'waiting_for_credentials', pages: [], cases: [] };
  await writeRun(plan, {});
  await publishPlan(plan, {});
  return {
    plan,
    results: {},
    error: {
      de: 'Die Seitenliste wartet auf Zugangsdaten. Es wird kein Passwort erfunden.',
      en: 'The page inventory is waiting for credentials. No password is invented.',
    },
  };
}

export async function runInventory(): Promise<{ plan: PlanDocument; results: Record<string, CaseResult>; error?: Localized }> {
  return exclusive(async () => {
    const credentials = await readCredentials();
    if (!credentials) return waitingPlan();
    const browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      return await browseSignedIn(browser);
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}

export async function rerunCase(id: string): Promise<{ plan: PlanDocument; results: Record<string, CaseResult>; error?: Localized }> {
  const current = await currentPlan();
  const item = current.plan.cases.find((entry) => entry.id === id);
  if (!item) {
    return {
      ...current,
      error: { de: 'Dieser Fall steht nicht im gespeicherten Plan.', en: 'That case is not in the stored plan.' },
    };
  }
  const credentials = await readCredentials();
  if (!credentials) {
    return {
      ...current,
      error: {
        de: 'Fall nicht ausgeführt: die lokale Zugangsdatei fehlt. Es wird kein Passwort erfunden.',
        en: 'Case not run: the local credentials file is missing. No password is invented.',
      },
    };
  }
  return exclusive(async () => {
    const browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'de-AT' });
      const page = await context.newPage();
      const login = await attemptLogin(page, credentials);
      if (!login.ok) return { ...current, error: login.error };
      const result = await executeCase(page, item);
      const results = { ...current.results, [id]: result };
      await writeRun(current.plan, results);
      await publishPlan(current.plan, results);
      return { plan: current.plan, results };
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}

export async function planPayload(): Promise<{
  plan: PlanDocument;
  results: Record<string, CaseResult>;
  complete: boolean;
  runFile: string;
  storeFile: string | null;
}> {
  const current = await currentPlan();
  const storeFile = await publishPlan(current.plan, current.results);
  return {
    ...current,
    complete: isComplete(current.plan, current.results),
    runFile: runFilePath(),
    storeFile,
  };
}
