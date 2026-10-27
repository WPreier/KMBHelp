import type { StaffRole } from '@kmbhelp/shared';
import type { Database } from '../client.js';
import { staff } from '../schema.js';
import type { TestResidue } from './cleanup.js';

export function assertTestStaffFactoryAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('test staff factory is not available in production');
  }
}

export async function createTestStaff(
  db: Database['db'],
  input: { email: string; displayName: string; role?: StaffRole },
  residue?: TestResidue,
): Promise<{ id: string }> {
  assertTestStaffFactoryAllowed();
  const rows = await db
    .insert(staff)
    .values({
      email: input.email,
      displayName: input.displayName,
      role: input.role ?? 'agent',
      isLocalAdmin: false,
    })
    .returning({ id: staff.id });
  const created = rows[0];
  if (!created) throw new Error('staff insert returned no row');
  if (residue) {
    residue.staffIds.push(created.id);
    residue.emails.push(input.email.trim().toLowerCase());
  }
  return created;
}
