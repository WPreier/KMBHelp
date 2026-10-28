import type { StaffTicket } from '@kmbhelp/shared';

export type StaffRow = {
  number: number;
  subject: string;
  status: StaffTicket['status'];
  priority: StaffTicket['priority'];
  ageSeconds: number;
  durationSeconds: number | null;
  body: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
};

export function canShowStaffDetail(serverSignedIn: boolean, deviceUnlocked: boolean): boolean {
  return serverSignedIn && deviceUnlocked;
}

export function presentStaffTicket(ticket: StaffTicket, reveal: boolean): StaffRow {
  return {
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    ageSeconds: ticket.ageSeconds,
    durationSeconds: ticket.durationSeconds,
    body: reveal ? ticket.body : null,
    requesterName: reveal ? ticket.requesterName : null,
    requesterEmail: reveal ? ticket.requesterEmail : null,
  };
}
