import type { Database } from '../client.js';

const nilStaff = '00000000-0000-0000-0000-000000000000';
const absentEmail = '__kmbhelp_no_test_marker__';

export type TestResidue = {
  staffIds: string[];
  ticketIds: string[];
  supplierIds: string[];
  faqSlugs: string[];
  emails: string[];
};

export function createTestResidue(): TestResidue {
  return { staffIds: [], ticketIds: [], supplierIds: [], faqSlugs: [], emails: [] };
}

export async function rememberTicketNumber(
  database: Database,
  number: number,
  residue: TestResidue,
): Promise<void> {
  const found = await database.pool.query<{ id: string }>('select id from ticket where number = $1', [number]);
  const id = found.rows[0]?.id;
  if (id && !residue.ticketIds.includes(id)) residue.ticketIds.push(id);
}

export async function deleteTestResidue(database: Database, residue: TestResidue): Promise<void> {
  await deleteTracked(database, residue, false);
  residue.staffIds.length = 0;
  residue.ticketIds.length = 0;
  residue.supplierIds.length = 0;
  residue.faqSlugs.length = 0;
  residue.emails.length = 0;
}

export async function deleteDirectoryFixtures(database: Database): Promise<void> {
  const rows = await database.pool.query<{ id: string; email: string }>(
    `select id, email from staff
      where username like 'breakglass-%'
         or email ~* '^agent-[0-9a-f-]{36}@kmbcloud\\.at$'`,
  );
  await deleteTracked(
    database,
    {
      staffIds: rows.rows.map((row) => row.id),
      ticketIds: [],
      supplierIds: [],
      faqSlugs: [],
      emails: rows.rows.map((row) => row.email.toLowerCase()),
    },
    false,
  );
}

export async function sweepTestArtifacts(database: Database): Promise<void> {
  await deleteTracked(database, createTestResidue(), true);
}

export async function deleteTickets(database: Database, ticketIds: readonly string[]): Promise<void> {
  if (ticketIds.length === 0) return;
  await deleteTracked(
    database,
    {
      staffIds: [],
      ticketIds: [...ticketIds],
      supplierIds: [],
      faqSlugs: [],
      emails: [],
    },
    false,
  );
}

async function deleteTracked(database: Database, residue: TestResidue, sweep: boolean): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query('begin');
    await client.query('alter table ticket_event disable trigger ticket_event_append_only');
    await client.query('alter table login_audit disable trigger login_audit_append_only');

    const staff = await client.query<{ id: string; email: string }>(
      sweep
        ? `select id, email from staff
            where id = any($1::uuid[])
               or email ~* '@example\\.(com|invalid)$'
               or email ~* '^agent-[0-9a-f-]{36}@kmbcloud\\.at$'
               or coalesce(username, '') like 'breakglass-%'
               or lower(email) = 'automation@kmbhelp.invalid'
               or display_name ~* '^phase'
               or display_name in ('Dash Agent', 'Dash Lead', 'Dash Other', 'Test Staff', 'Factory Tester')`
        : `select id, email from staff where id = any($1::uuid[])`,
      [uuidList(residue.staffIds)],
    );
    const staffIds = unique(staff.rows.map((row) => row.id));
    const emails = unique([
      ...residue.emails.map((email) => email.toLowerCase()),
      ...staff.rows.map((row) => row.email.toLowerCase()),
    ]);

    const tickets = await client.query<{ id: string }>(
      sweep
        ? `select id from ticket
            where id = any($1::uuid[])
               or assigned_staff_id = any($2::uuid[])
               or lower(coalesce(requester_email, '')) = any($3::text[])
               or id in (select ticket_id from ticket_event where actor_staff_id = any($2::uuid[]))
               or subject ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'`
        : `select id from ticket
            where id = any($1::uuid[])
               or assigned_staff_id = any($2::uuid[])
               or lower(coalesce(requester_email, '')) = any($3::text[])
               or id in (select ticket_id from ticket_event where actor_staff_id = any($2::uuid[]))`,
      [uuidList(residue.ticketIds), uuidList(staffIds), textList(emails)],
    );
    const ticketIds = unique(tickets.rows.map((row) => row.id));

    const suppliers = await client.query<{ id: string }>(
      sweep
        ? `select id from supplier
            where id = any($1::uuid[])
               or approved_by_staff_id = any($2::uuid[])
               or name like 'Dash %'
               or (name = 'Scan AG' and purpose = 'Scan')`
        : `select id from supplier
            where id = any($1::uuid[])
               or approved_by_staff_id = any($2::uuid[])`,
      [uuidList(residue.supplierIds), uuidList(staffIds)],
    );
    const supplierIds = unique(suppliers.rows.map((row) => row.id));

    if (sweep) {
      await client.query(`delete from faq_article where slug like 'phase6-%' or slug = any($1::text[])`, [
        textList(residue.faqSlugs),
      ]);
      await client.query(
        `delete from knowledge_article
          where (title = 'Intern' and body = 'Rohtext')
             or (title = 'VPN kurz' and body = 'Nur der redigierte Satz.')`,
      );
      await client.query('delete from access_log where user_agent = $1', ['a'.repeat(160)]);
    } else if (residue.faqSlugs.length > 0) {
      await client.query('delete from faq_article where slug = any($1::text[])', [residue.faqSlugs]);
    }

    await client.query(
      'update knowledge_article set source_ticket_id = null where source_ticket_id = any($1::uuid[])',
      [uuidList(ticketIds)],
    );
    await client.query('delete from access_log where ticket_id = any($1::uuid[])', [uuidList(ticketIds)]);
    await client.query('delete from ticket_event where ticket_id = any($1::uuid[])', [uuidList(ticketIds)]);
    await client.query('delete from procurement where ticket_id = any($1::uuid[])', [uuidList(ticketIds)]);
    await client.query('delete from change_detail where ticket_id = any($1::uuid[])', [uuidList(ticketIds)]);
    await client.query('delete from backup_test_detail where ticket_id = any($1::uuid[])', [uuidList(ticketIds)]);
    await client.query('delete from security_incident_detail where ticket_id = any($1::uuid[])', [
      uuidList(ticketIds),
    ]);
    await client.query(
      'delete from remote_support_detail where ticket_id = any($1::uuid[]) or supplier_id = any($2::uuid[])',
      [uuidList(ticketIds), uuidList(supplierIds)],
    );
    await client.query('delete from ticket where id = any($1::uuid[])', [uuidList(ticketIds)]);
    await client.query(
      'update supplier set approved_by_staff_id = null where approved_by_staff_id = any($1::uuid[])',
      [uuidList(staffIds)],
    );
    await client.query('delete from supplier where id = any($1::uuid[])', [uuidList(supplierIds)]);
    await client.query('delete from staff_skill where staff_id = any($1::uuid[])', [uuidList(staffIds)]);
    await client.query('delete from staff_category where staff_id = any($1::uuid[])', [uuidList(staffIds)]);
    await client.query('delete from session where staff_id = any($1::uuid[])', [uuidList(staffIds)]);
    await client.query('delete from webauthn_credential where staff_id = any($1::uuid[])', [uuidList(staffIds)]);
    await client.query('delete from webauthn_challenge where staff_id = any($1::uuid[])', [uuidList(staffIds)]);
    await client.query('delete from staff_search where staff_id = any($1::uuid[])', [uuidList(staffIds)]);
    await client.query('update ticket_event set actor_staff_id = null where actor_staff_id = any($1::uuid[])', [
      uuidList(staffIds),
    ]);
    await client.query('update certificate set owner_staff_id = null where owner_staff_id = any($1::uuid[])', [
      uuidList(staffIds),
    ]);
    await client.query('update portal set owner_staff_id = null where owner_staff_id = any($1::uuid[])', [
      uuidList(staffIds),
    ]);
    await client.query(
      'update retention_location set owner_staff_id = null where owner_staff_id = any($1::uuid[])',
      [uuidList(staffIds)],
    );
    await client.query(
      'delete from login_audit where staff_id = any($1::uuid[]) or lower(email) = any($2::text[])',
      [uuidList(staffIds), textList(emails)],
    );
    await client.query('delete from activity_log where lower(actor) = any($1::text[])', [textList(emails)]);
    await client.query('delete from staff where id = any($1::uuid[])', [uuidList(staffIds)]);

    await client.query('alter table ticket_event enable trigger ticket_event_append_only');
    await client.query('alter table login_audit enable trigger login_audit_append_only');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uuidList(values: readonly string[]): string[] {
  return values.length > 0 ? [...values] : [nilStaff];
}

function textList(values: readonly string[]): string[] {
  return values.length > 0 ? [...values] : [absentEmail];
}
