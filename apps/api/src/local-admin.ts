import { eq } from 'drizzle-orm';
import { staff, type Database } from '@kmbhelp/db';
import { hashLocalPassword } from './passwords.js';

export async function createLocalAdmin(
  database: Database,
  username: string,
  password: string,
): Promise<void> {
  const name = username.trim();
  if (name.length < 3 || name.length > 200 || password.length < 12 || password.length > 200) {
    throw new Error('local admin name or password is too short');
  }
  const existing = await database.db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.isLocalAdmin, true));
  if (existing.length > 0) throw new Error('local admin already exists');
  const passwordHash = await hashLocalPassword(password);
  await database.db.insert(staff).values({
    email: name,
    username: name,
    displayName: name,
    role: 'admin',
    isLocalAdmin: true,
    passwordHash,
    active: true,
  });
}
