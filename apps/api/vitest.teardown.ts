import { createDatabase } from '@kmbhelp/db';
import { sweepTestArtifacts } from '@kmbhelp/db/testing';
import { loadWorkstationEnv } from '@kmbhelp/shared/env';

export default async function teardown(): Promise<void> {
  loadWorkstationEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  const database = createDatabase(url);
  try {
    await sweepTestArtifacts(database);
  } finally {
    await database.pool.end();
  }
}
