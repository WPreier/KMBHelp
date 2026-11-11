import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseResult, PlanDocument } from '../src/types';
import { z } from 'zod';
import { CaseResultSchema, PlanSchema, type StoredCase, type StoredPlan } from './planSchema';
import { STORE_PLAN_PATH, STORE_ROOT } from './targets';

const FRONTMATTER = `---
cursor:
  subagentId: "bc-44a91835-f9ff-53a5-8d62-22fef481e6df"
---

`;

export function templatePath(): string {
  return fileURLToPath(new URL('../plan/template.json', import.meta.url));
}

export function runFilePath(): string {
  return path.join(fileURLToPath(new URL('..', import.meta.url)), '.run', 'plan-run.json');
}

export async function loadTemplate(): Promise<PlanDocument> {
  const parsed = PlanSchema.parse(JSON.parse(await readFile(templatePath(), 'utf8')));
  return parsed;
}

export async function loadRun(): Promise<{ plan: PlanDocument; results: Record<string, CaseResult> } | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(runFilePath(), 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    const { results, ...rest } = raw as Record<string, unknown>;
    const plan = PlanSchema.parse(rest);
    const parsedResults = z.record(CaseResultSchema).parse(results ?? {});
    return { plan, results: parsedResults };
  } catch {
    return null;
  }
}

export async function currentPlan(): Promise<{ plan: PlanDocument; results: Record<string, CaseResult> }> {
  const stored = await loadRun();
  if (stored) return stored;
  return { plan: await loadTemplate(), results: {} };
}

export function isComplete(plan: PlanDocument, results: Record<string, CaseResult>): boolean {
  return plan.cases.length > 0 && plan.cases.every((item) => results[item.id]?.status === 'pass');
}

export async function writeRun(plan: PlanDocument, results: Record<string, CaseResult>): Promise<void> {
  const file = runFilePath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(file), 0o700);
  await writeFile(file, `${JSON.stringify({ ...plan, results }, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

export function renderPlanMarkdown(plan: PlanDocument, results: Record<string, CaseResult>): string {
  const statusNote =
    plan.inventoryStatus === 'waiting_for_credentials'
      ? 'Die Seitenliste wartet auf Zugangsdaten. Es wurde kein Passwort erfunden und keine unbeobachtete Seite eingetragen.'
      : plan.inventoryStatus === 'login_failed'
        ? 'Die Anmeldung ist fehlgeschlagen. Seiten, die nicht beobachtet wurden, stehen hier nicht.'
        : 'Die Seiten stammen aus einem angemeldeten Lauf. Titel von Einzeldatensätzen werden nicht übernommen.';
  const pages =
    plan.pages.length === 0
      ? 'Keine beobachteten Seiten.'
      : plan.pages.map((page) => `- ${page.url}\n  - Zweck: ${page.purpose.de}`).join('\n');
  const cases =
    plan.cases.length === 0
      ? 'Keine Fälle.'
      : plan.cases
          .map((item) => {
            const state = results[item.id]?.status ?? 'nicht ausgeführt';
            return `- ${item.title.de} (${item.kind}) — ${state}\n  - Eingabe: ${item.inputDescription.de}`;
          })
          .join('\n');
  return `${FRONTMATTER}# kmbhelp Testplan

${statusNote}

- Öffentlicher Host: ${plan.target.publicOrigin}
- Kurzname: ${plan.target.shortName}
- LAN: ${plan.target.lanOrigin}, nur wenn es dieselbe App ist. Die Zertifikatsprüfung bleibt auf dem öffentlichen Host.

Schema: \`version\` ${plan.version}, \`inventoryStatus\` \`${plan.inventoryStatus}\`, \`pages\` und \`cases\`. Jeder Fall ist \`valid\` oder \`invalid\`. Der Lauf ist abgeschlossen, wenn jeder Fall bestanden hat.

## Seiten

${pages}

## Fälle

${cases}
`;
}

export async function publishPlan(plan: PlanDocument, results: Record<string, CaseResult>): Promise<string | null> {
  if (!existsSync(STORE_ROOT)) return null;
  await mkdir(path.dirname(STORE_PLAN_PATH), { recursive: true });
  await writeFile(STORE_PLAN_PATH, renderPlanMarkdown(plan, results), 'utf8');
  return STORE_PLAN_PATH;
}

export type ObservedField = {
  name: string;
  type: string;
  required: boolean;
  label: string;
};

export type ObservedPage = {
  url: string;
  title: string;
  heading: string;
  fields: ObservedField[];
};

export function safeLabel(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 80 || /[0-9]{6,}/.test(clean) || clean.includes('@')) return '';
  return clean;
}

export function purposeFor(page: ObservedPage): { de: string; en: string } {
  let pathname = '';
  try {
    pathname = new URL(page.url).pathname;
  } catch {
    pathname = page.url;
  }
  const sensitive = /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(page.url) || /\/\d{4,}(?:\/|$)/.test(pathname);
  const heading = safeLabel(page.heading || page.title);
  if (sensitive || !heading) {
    return {
      de: 'Zweck aus der sichtbaren Überschrift nicht übernommen.',
      en: 'Purpose was not copied from the visible heading.',
    };
  }
  return {
    de: `Beobachtete Überschrift: ${heading}`,
    en: `Observed heading: ${heading}`,
  };
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return cleaned || 'seite';
}

function scrubFields(fields: ObservedField[]): StoredCase['fields'] {
  return fields.map((field) => ({
    name: safeLabel(field.name).slice(0, 40),
    type: field.type.slice(0, 40) || 'text',
    required: field.required,
    label: safeLabel(field.label).slice(0, 80),
  }));
}

export function casesFromPages(pages: ObservedPage[]): StoredPlan['cases'] {
  const cases: StoredPlan['cases'] = [];
  pages.forEach((page, index) => {
    const purpose = purposeFor(page);
    let pathname = '/';
    try {
      pathname = new URL(page.url).pathname || '/';
    } catch {
      pathname = '/';
    }
    const base = `${slug(pathname)}-${index + 1}`;
    const fields = scrubFields(page.fields);
    if (!fields || fields.length === 0) {
      cases.push({
        id: `${base}-valid-open`,
        pageUrl: page.url,
        kind: 'valid',
        title: { de: `${pathname}: Seite öffnen`, en: `${pathname}: open page` },
        inputDescription: {
          de: 'Keine Felder beobachtet. Die Seite wird nur geöffnet.',
          en: 'No fields were observed. The page is only opened.',
        },
        purpose,
      });
      cases.push({
        id: `${base}-invalid-route`,
        pageUrl: page.url,
        kind: 'invalid',
        title: { de: `${pathname}: ungültiger Pfad`, en: `${pathname}: invalid path` },
        inputDescription: {
          de: 'Pfad mit dem Zusatz /kmbhelp-test-invalid. Es werden keine Formularfelder erfunden.',
          en: 'Path plus /kmbhelp-test-invalid. No form fields are invented.',
        },
        purpose,
      });
      return;
    }
    const names = fields.map((field) => field.label || field.name || field.type).filter(Boolean).join(', ');
    cases.push({
      id: `${base}-valid-form`,
      pageUrl: page.url,
      kind: 'valid',
      title: { de: `${pathname}: gültige Eingabe`, en: `${pathname}: valid input` },
      inputDescription: {
        de: `Beobachtete Felder (${names}) mit Beispielwerten, kein echtes Mandantendatum.`,
        en: `Observed fields (${names}) with sample values, no real client data.`,
      },
      purpose,
      fields,
    });
    cases.push({
      id: `${base}-invalid-form`,
      pageUrl: page.url,
      kind: 'invalid',
      title: { de: `${pathname}: ungültige Eingabe`, en: `${pathname}: invalid input` },
      inputDescription: {
        de: `Dieselben Felder (${names}) leer oder im falschen Format.`,
        en: `The same fields (${names}) empty or in the wrong format.`,
      },
      purpose,
      fields,
    });
  });
  return cases;
}
