import {
  defaultSyslogFacility,
  defaultSyslogHost,
  defaultSyslogName,
  defaultSyslogOffset,
  defaultSyslogPort,
  syslogFacilitySetting,
  syslogHostSetting,
  syslogNameSetting,
  syslogOffsetSetting,
  syslogPortSetting,
} from '@kmbhelp/shared';
import { loadEnvFileIfPresent } from '@kmbhelp/shared/env';
import { sql } from 'drizzle-orm';
import {
  approvedExchangeSettingKey,
  catalogItems,
  categories,
  faqStubs,
  freezeWindows,
  skills,
} from './catalog.js';
import { createDatabase, type Database } from './client.js';
import {
  appSetting,
  catalogItem,
  category,
  changeFreeze,
  faqArticle,
  procurementPolicy,
  skill,
} from './schema.js';

export async function seedCatalog(database: Database): Promise<void> {
  await database.db
    .insert(skill)
    .values([...skills])
    .onConflictDoUpdate({
      target: skill.code,
      set: { labelDe: sql`excluded.label_de`, labelEn: sql`excluded.label_en` },
    });

  await database.db
    .insert(category)
    .values([...categories])
    .onConflictDoUpdate({
      target: category.code,
      set: {
        groupCode: sql`excluded.group_code`,
        labelDe: sql`excluded.label_de`,
        labelEn: sql`excluded.label_en`,
        defaultSkillCode: sql`excluded.default_skill_code`,
      },
    });

  await database.db
    .insert(catalogItem)
    .values(catalogItems.map((entry) => ({ ...entry, checklist: [...entry.checklist] })))
    .onConflictDoUpdate({
      target: catalogItem.code,
      set: {
        type: sql`excluded.type`,
        categoryCode: sql`excluded.category_code`,
        skillCode: sql`excluded.skill_code`,
        labelDe: sql`excluded.label_de`,
        labelEn: sql`excluded.label_en`,
        targetMinutes: sql`excluded.target_minutes`,
        checklist: sql`excluded.checklist`,
      },
    });

  await database.db
    .insert(faqArticle)
    .values(
      faqStubs.map((entry) => ({
        ...entry,
        bodyDe: '',
        bodyEn: '',
        published: false,
      })),
    )
    .onConflictDoNothing();

  await database.db
    .insert(changeFreeze)
    .values(freezeWindows.map((entry) => ({ ...entry, active: true })))
    .onConflictDoUpdate({
      target: changeFreeze.code,
      set: {
        dayOfMonthFrom: sql`excluded.day_of_month_from`,
        dayOfMonthTo: sql`excluded.day_of_month_to`,
        weekdaysOnly: sql`excluded.weekdays_only`,
        label: sql`excluded.label`,
      },
    });

  await database.db
    .insert(procurementPolicy)
    .values({ id: 'default', directBelow: '100.00', tokenUntil: '500.00' })
    .onConflictDoNothing();

  await database.db
    .insert(appSetting)
    .values({ key: approvedExchangeSettingKey, value: '' })
    .onConflictDoNothing();

  await database.db
    .insert(appSetting)
    .values([
      { key: syslogHostSetting, value: defaultSyslogHost },
      { key: syslogPortSetting, value: String(defaultSyslogPort) },
      { key: syslogNameSetting, value: defaultSyslogName },
      { key: syslogFacilitySetting, value: defaultSyslogFacility },
      { key: syslogOffsetSetting, value: defaultSyslogOffset },
    ])
    .onConflictDoNothing();
}

const isDirect = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');

if (isDirect) {
  loadEnvFileIfPresent(new URL('../../../.env', import.meta.url));
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    process.stderr.write('DATABASE_URL is not set.\n');
    process.exit(1);
  }
  const database = createDatabase(connectionString);
  try {
    await seedCatalog(database);
    process.stdout.write('catalog seeded\n');
  } finally {
    await database.pool.end();
  }
}
