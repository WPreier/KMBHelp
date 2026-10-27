import { eq } from 'drizzle-orm';
import { staff, type Database } from '@kmbhelp/db';
import { DirectoryUnavailable, type Directory, type DirectoryMember } from './directory.js';

export type HelpdeskSync = {
  directory: 'ok' | 'unavailable';
  added: Array<{ email: string; displayName: string }>;
  missing: Array<{ id: string; email: string; displayName: string }>;
};

type StaffRow = {
  id: string;
  email: string;
  displayName: string;
  isLocalAdmin: boolean;
  active: boolean;
  adObjectId: string | null;
};

async function readStaff(database: Database): Promise<StaffRow[]> {
  return database.db
    .select({
      id: staff.id,
      email: staff.email,
      displayName: staff.displayName,
      isLocalAdmin: staff.isLocalAdmin,
      active: staff.active,
      adObjectId: staff.adObjectId,
    })
    .from(staff);
}

export async function reconcileHelpdesk(
  database: Database,
  directory: Directory,
): Promise<HelpdeskSync> {
  let members: DirectoryMember[];
  try {
    members = await directory.listHelpdeskAdmins();
  } catch (error) {
    if (error instanceof DirectoryUnavailable) {
      return { directory: 'unavailable', added: [], missing: [] };
    }
    throw error;
  }
  const people = await readStaff(database);
  const byEmail = new Map(people.map((person) => [person.email.toLowerCase(), person]));
  const present = new Set<string>();
  const added: HelpdeskSync['added'] = [];
  for (const member of members) {
    const key = member.email.toLowerCase();
    present.add(key);
    const cn = member.cn.slice(0, 200) || member.email;
    const existing = byEmail.get(key);
    if (!existing) {
      await database.db.insert(staff).values({
        email: member.email,
        displayName: cn,
        role: 'agent',
        active: member.active,
        isLocalAdmin: false,
        adObjectId: member.adObjectId || null,
      });
      added.push({ email: member.email, displayName: cn });
      continue;
    }
    if (existing.isLocalAdmin) continue;
    await database.db
      .update(staff)
      .set({
        displayName: cn,
        active: member.active,
        adObjectId: member.adObjectId || existing.adObjectId,
      })
      .where(eq(staff.id, existing.id));
  }
  const current = await readStaff(database);
  const missing = current
    .filter(
      (person) => !person.isLocalAdmin && person.active && !present.has(person.email.toLowerCase()),
    )
    .map((person) => ({
      id: person.id,
      email: person.email,
      displayName: person.displayName,
    }));
  return { directory: 'ok', added, missing };
}

export async function deactivateMissing(
  database: Database,
  directory: Directory,
  ids: string[],
): Promise<number> {
  const members = await directory.listHelpdeskAdmins();
  const present = new Set(members.map((member) => member.email.toLowerCase()));
  const people = await readStaff(database);
  const wanted = new Set(ids);
  let count = 0;
  for (const person of people) {
    if (!wanted.has(person.id) || person.isLocalAdmin) continue;
    if (present.has(person.email.toLowerCase())) continue;
    await database.db.update(staff).set({ active: false }).where(eq(staff.id, person.id));
    count += 1;
  }
  return count;
}
