export { createHelpdeskClient } from './client.js';
export { canShowStaffDetail, presentStaffTicket } from './gate.js';
export { apiOrigin } from './origin.js';
export { readSessionCookies } from './session.js';

export const mobileShell = {
  name: 'KMBHelp',
  origin: 'https://helpdesk.kmbcloud.at',
} as const;
