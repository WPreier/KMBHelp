import { eq, sql } from 'drizzle-orm';
import { staff, type Database } from '@kmbhelp/db';
import { assigneeEmailOrDefault, helpdeskAssigneeEmail } from '@kmbhelp/shared';

type QueryDb = Pick<Database['db'], 'select'>;

export async function assigneeFromEmail(
  db: QueryDb,
  raw: string | null | undefined,
): Promise<{ email: string; staffId: string | null }> {
  const email = assigneeEmailOrDefault(raw);
  const rows = await db
    .select({ id: staff.id, active: staff.active })
    .from(staff)
    .where(sql`lower(${staff.email}) = ${email.toLowerCase()}`)
    .limit(1);
  const person = rows[0];
  return { email, staffId: person?.active ? person.id : null };
}

export async function emailForStaffId(db: QueryDb, staffId: string | null): Promise<string> {
  if (!staffId) return helpdeskAssigneeEmail;
  const rows = await db
    .select({ email: staff.email })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);
  return assigneeEmailOrDefault(rows[0]?.email);
}
