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

export async function replaceLocalAdmin(
  database: Database,
  username: string,
  password: string,
): Promise<'created' | 'replaced'> {
  const name = username.trim();
  if (name.length < 3 || name.length > 200 || password.length < 12 || password.length > 200) {
    throw new Error('local admin name or password is too short');
  }
  const passwordHash = await hashLocalPassword(password);
  const client = await database.pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query<{ id: string }>(
      'select id from staff where is_local_admin = true',
    );
    const ids = existing.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query('alter table ticket_event disable trigger ticket_event_append_only');
      await client.query(
        'update ticket set assigned_staff_id = null where assigned_staff_id = any($1::uuid[])',
        [ids],
      );
      await client.query(
        'update ticket_event set actor_staff_id = null where actor_staff_id = any($1::uuid[])',
        [ids],
      );
      await client.query(
        'update supplier set approved_by_staff_id = null where approved_by_staff_id = any($1::uuid[])',
        [ids],
      );
      await client.query(
        'update certificate set owner_staff_id = null where owner_staff_id = any($1::uuid[])',
        [ids],
      );
      await client.query(
        'update portal set owner_staff_id = null where owner_staff_id = any($1::uuid[])',
        [ids],
      );
      await client.query(
        'update retention_location set owner_staff_id = null where owner_staff_id = any($1::uuid[])',
        [ids],
      );
      await client.query(
        'update login_audit set staff_id = null where staff_id = any($1::uuid[])',
        [ids],
      );
      await client.query('delete from staff_skill where staff_id = any($1::uuid[])', [ids]);
      await client.query('delete from staff_category where staff_id = any($1::uuid[])', [ids]);
      await client.query('delete from session where staff_id = any($1::uuid[])', [ids]);
      await client.query('delete from webauthn_credential where staff_id = any($1::uuid[])', [ids]);
      await client.query('delete from webauthn_challenge where staff_id = any($1::uuid[])', [ids]);
      await client.query('delete from staff_search where staff_id = any($1::uuid[])', [ids]);
      await client.query('delete from staff where id = any($1::uuid[])', [ids]);
      await client.query('alter table ticket_event enable trigger ticket_event_append_only');
    }
    await client.query(
      `insert into staff (email, username, display_name, role, is_local_admin, password_hash, active)
       values ($1, $1, $1, 'admin', true, $2, true)`,
      [name, passwordHash],
    );
    await client.query(
      `insert into activity_log (actor, kind, target, detail, ip)
       values ($1, 'page', 'pnpm install:helpdesk', $2, 'local')`,
      [
        name,
        ids.length > 0
          ? 'Lokaler Admin ersetzt. Domänenkonten bleiben.'
          : 'Lokaler Admin angelegt.',
      ],
    );
    await client.query('commit');
    return ids.length > 0 ? 'replaced' : 'created';
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
