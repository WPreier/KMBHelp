import { describe, expect, it } from 'vitest';
import {
  absoluteTicketFileBytes,
  defaultTicketFileBytes,
  ticketFileAllowed,
  ticketFileMatchesExtension,
  ticketFilePolicy,
} from './ticket-file.js';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const text = Uint8Array.from([...'Hinweis'].map((char) => char.charCodeAt(0)));

function office(marker: string): Uint8Array {
  const body = `PK\u0003\u0004${marker}`;
  return Uint8Array.from([...body].map((char) => char.charCodeAt(0)));
}

describe('ticket file policy', () => {
  it('uses the built-in types and 10 megabytes when the fields are empty', () => {
    const policy = ticketFilePolicy({});
    expect(policy.maxBytes).toBe(defaultTicketFileBytes);
    expect(ticketFileAllowed('foto.PNG', policy.extensions)).toBe(true);
    expect(ticketFileAllowed('makro.exe', policy.extensions)).toBe(false);
    expect(ticketFileAllowed('ohneendung', policy.extensions)).toBe(false);
  });

  it('reads a custom list and a custom size', () => {
    const policy = ticketFilePolicy({
      TICKET_FILE_TYPES: '.png, PDF',
      TICKET_FILE_MAX_BYTES: '2048',
    });
    expect(policy.extensions).toEqual(['png', 'pdf']);
    expect(policy.maxBytes).toBe(2048);
    expect(ticketFileAllowed('foto.png', policy.extensions)).toBe(true);
    expect(ticketFileAllowed('liste.xlsx', policy.extensions)).toBe(false);
  });

  it('keeps the default when the size is not a number and caps a huge size', () => {
    expect(ticketFilePolicy({ TICKET_FILE_MAX_BYTES: 'groß' }).maxBytes).toBe(
      defaultTicketFileBytes,
    );
    expect(ticketFilePolicy({ TICKET_FILE_MAX_BYTES: '999999999999' }).maxBytes).toBe(
      absoluteTicketFileBytes,
    );
  });

  it('rejects content that does not match the extension', () => {
    expect(ticketFileMatchesExtension('foto.png', png)).toBe(true);
    expect(ticketFileMatchesExtension('foto.jpg', png)).toBe(false);
    expect(ticketFileMatchesExtension('brief.pdf', pdf)).toBe(true);
    expect(ticketFileMatchesExtension('brief.txt', pdf)).toBe(false);
    expect(ticketFileMatchesExtension('notiz.txt', text)).toBe(true);
    expect(ticketFileMatchesExtension('notiz.pdf', text)).toBe(false);
    expect(ticketFileMatchesExtension('tabelle.docx', office('word/document.xml'))).toBe(true);
    expect(ticketFileMatchesExtension('tabelle.xlsx', office('word/document.xml'))).toBe(false);
    expect(ticketFileMatchesExtension('programm.txt', Uint8Array.from([0x4d, 0x5a, 0x00]))).toBe(
      false,
    );
  });
});
