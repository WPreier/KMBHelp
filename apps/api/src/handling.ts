import type { Database } from '@kmbhelp/db';

export function solvedMail(number: number): { subject: string; text: string } {
  return {
    subject: `Ticket ${number}`,
    text: 'Das Ticket ist gelöst. Wenn es zur Zufriedenheit gelöst wurde, würde man sich über eine kurze Antwort freuen.\n',
  };
}

export function workingMail(number: number): { subject: string; text: string } {
  return {
    subject: `Ticket ${number}`,
    text: 'Ich arbeite jetzt an diesem Ticket.\n',
  };
}

export function questionMail(number: number, text: string): { subject: string; text: string } {
  return {
    subject: `Ticket ${number}`,
    text: `${text.trim()}\n`,
  };
}

export async function forgetMisreadTicket(database: Database, ticketId: string): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query('begin');
    await client.query('alter table ticket_event disable trigger ticket_event_append_only');
    await client.query('update knowledge_article set source_ticket_id = null where source_ticket_id = $1', [
      ticketId,
    ]);
    await client.query('delete from access_log where ticket_id = $1', [ticketId]);
    await client.query('delete from ticket_event where ticket_id = $1', [ticketId]);
    await client.query('delete from procurement where ticket_id = $1', [ticketId]);
    await client.query('delete from change_detail where ticket_id = $1', [ticketId]);
    await client.query('delete from backup_test_detail where ticket_id = $1', [ticketId]);
    await client.query('delete from security_incident_detail where ticket_id = $1', [ticketId]);
    await client.query('delete from remote_support_detail where ticket_id = $1', [ticketId]);
    await client.query('delete from ticket where id = $1', [ticketId]);
    await client.query('alter table ticket_event enable trigger ticket_event_append_only');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
