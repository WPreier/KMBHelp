import { readFile, writeFile } from 'node:fs/promises';
import { category, createDatabase, skill } from '@kmbhelp/db';
import { loadProjectEnv, loadWorkstationEnv } from '@kmbhelp/shared/env';

loadProjectEnv(new URL('../.env', import.meta.url));
loadWorkstationEnv();

const mode = process.argv[2];
const target = process.argv[3];
if (mode !== 'export' && mode !== 'import') {
  process.stderr.write(
    'Aufruf: pnpm catalog:export -- datei.json oder pnpm catalog:import -- datei.json\nUsage: pnpm catalog:export -- file.json or pnpm catalog:import -- file.json\n',
  );
  process.exit(1);
}
if (!target) {
  process.stderr.write('Die Datei fehlt.\nThe file is missing.\n');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL fehlt.\nDATABASE_URL is missing.\n');
  process.exit(1);
}

const database = createDatabase(databaseUrl);

try {
  if (mode === 'export') await exportCatalog(target);
  else await importCatalog(target);
} catch (error) {
  const message = error instanceof Error ? error.message : 'catalog transfer failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await database.pool.end();
}

async function exportCatalog(path: string): Promise<void> {
  const skillRows = await database.db
    .select({ code: skill.code, labelDe: skill.labelDe, labelEn: skill.labelEn })
    .from(skill);
  skillRows.sort((left, right) => left.code.localeCompare(right.code));
  const categoryRows = await database.db
    .select({
      code: category.code,
      groupCode: category.groupCode,
      labelDe: category.labelDe,
      labelEn: category.labelEn,
      defaultSkillCode: category.defaultSkillCode,
    })
    .from(category);
  categoryRows.sort((left, right) => left.code.localeCompare(right.code));
  await writeFile(
    path,
    `${JSON.stringify({ skills: skillRows, categories: categoryRows }, null, 2)}\n`,
    'utf8',
  );
  process.stderr.write(
    `${skillRows.length} Kenntnisse, ${categoryRows.length} Kategorien geschrieben.\n${skillRows.length} skills, ${categoryRows.length} categories written.\n`,
  );
}

async function importCatalog(path: string): Promise<void> {
  const parsed = parseCatalog(await readFile(path, 'utf8'));
  await database.db.transaction(async (tx) => {
    for (const row of parsed.skills) {
      await tx
        .insert(skill)
        .values(row)
        .onConflictDoUpdate({
          target: skill.code,
          set: { labelDe: row.labelDe, labelEn: row.labelEn },
        });
    }
    for (const row of parsed.categories) {
      await tx
        .insert(category)
        .values(row)
        .onConflictDoUpdate({
          target: category.code,
          set: {
            groupCode: row.groupCode,
            labelDe: row.labelDe,
            labelEn: row.labelEn,
            defaultSkillCode: row.defaultSkillCode,
          },
        });
    }
  });
  process.stderr.write(
    `${parsed.skills.length} Kenntnisse, ${parsed.categories.length} Kategorien übernommen.\n${parsed.skills.length} skills, ${parsed.categories.length} categories applied.\n`,
  );
}

type SkillRow = { code: string; labelDe: string; labelEn: string };
type CategoryRow = SkillRow & { groupCode: string; defaultSkillCode: string };

function parseCatalog(raw: string): { skills: SkillRow[]; categories: CategoryRow[] } {
  const text = raw.replace(/^\uFEFF/u, '');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein JSON.\nThe file is not JSON.');
  }
  if (!value || typeof value !== 'object')
    throw new Error('Die Datei ist kein Katalog.\nThe file is not a catalog.');
  const record = value as { skills?: unknown; categories?: unknown };
  const skills = list(record.skills, readSkill, 'Kenntnis');
  const categories = list(record.categories, readCategory, 'Kategorie');
  return { skills, categories };
}

function list<T>(value: unknown, read: (entry: unknown) => T, name: string): T[] {
  if (!Array.isArray(value) || value.length > 2000) {
    throw new Error(`${name} fehlt oder ist zu lang.\n${name} is missing or too long.`);
  }
  return value.map(read);
}

function readSkill(entry: unknown): SkillRow {
  const record = object(entry);
  return {
    code: code(record.code),
    labelDe: label(record.labelDe),
    labelEn: label(record.labelEn),
  };
}

function readCategory(entry: unknown): CategoryRow {
  const record = object(entry);
  return {
    code: code(record.code),
    groupCode: code(record.groupCode),
    labelDe: label(record.labelDe),
    labelEn: label(record.labelEn),
    defaultSkillCode: code(record.defaultSkillCode),
  };
}

function object(entry: unknown): Record<string, unknown> {
  if (!entry || typeof entry !== 'object')
    throw new Error('Eine Zeile ist kein Objekt.\nA row is not an object.');
  return entry as Record<string, unknown>;
}

function code(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(text)) {
    throw new Error('Ein Code ist ungültig.\nA code is invalid.');
  }
  return text;
}

function label(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 120 || [...text].some((char) => (char.codePointAt(0) ?? 0) < 32)) {
    throw new Error('Eine Bezeichnung ist ungültig.\nA label is invalid.');
  }
  return text;
}
