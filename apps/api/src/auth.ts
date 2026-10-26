import type { FastifyRequest } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { publicErrors } from '@kmbhelp/shared';
import { staff, type Database } from '@kmbhelp/db';
import { PublicError } from './http.js';

export const TEST_STAFF_HEADER = 'x-kmbhelp-test-staff';

export function readRuntimeAuth(env: NodeJS.ProcessEnv): { testAuthEnabled: boolean } {
  const flag = env.ALLOW_TEST_AUTH?.trim() ?? '';
  if (env.NODE_ENV === 'production' && flag !== '') {
    throw new Error('ALLOW_TEST_AUTH must not be set in production');
  }
  return { testAuthEnabled: env.NODE_ENV !== 'production' && flag === '1' };
}

export async function staffFromTestHeader(
  database: Database,
  request: FastifyRequest,
  testAuthEnabled: boolean,
): Promise<{ id: string }> {
  if (!testAuthEnabled) {
    throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  }
  const header = request.headers[TEST_STAFF_HEADER];
  if (typeof header !== 'string' || !header.includes('@')) {
    throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  }
  const email = header.trim().toLowerCase();
  const rows = await database.db
    .select({ id: staff.id })
    .from(staff)
    .where(and(sql`lower(${staff.email}) = ${email}`, eq(staff.active, true)));
  const found = rows[0];
  if (!found) throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  return found;
}
