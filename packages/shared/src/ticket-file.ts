import { ticketFileExtensions } from './ticket-code.js';

export const defaultTicketFileBytes = 10 * 1024 * 1024;
export const absoluteTicketFileBytes = 32 * 1024 * 1024;
export const defaultTicketFileTypes = ticketFileExtensions.join(', ');

const textExtensions = new Set(['txt', 'csv', 'md']);

export type TicketFilePolicy = {
  extensions: readonly string[];
  maxBytes: number;
};

export function ticketFilePolicy(env: NodeJS.ProcessEnv): TicketFilePolicy {
  return {
    extensions: configuredExtensions(env.TICKET_FILE_TYPES),
    maxBytes: configuredBytes(env.TICKET_FILE_MAX_BYTES),
  };
}

export function ticketFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function ticketFileAllowed(name: string, extensions: readonly string[]): boolean {
  const extension = ticketFileExtension(name);
  return extension !== '' && extensions.includes(extension);
}

export function ticketFileMatchesExtension(name: string, bytes: Uint8Array): boolean {
  const extension = ticketFileExtension(name);
  if (extension === '' || bytes.length < 1) return false;
  if (textExtensions.has(extension)) return isText(bytes);
  if (extension === 'png')
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === 'jpg' || extension === 'jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (extension === 'gif') return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
  if (extension === 'webp')
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && at(bytes, 8, [0x57, 0x45, 0x42, 0x50]);
  if (extension === 'bmp') return startsWith(bytes, [0x42, 0x4d]);
  if (extension === 'tif' || extension === 'tiff') {
    return (
      startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
    );
  }
  if (extension === 'pdf') return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === 'docx') return officePart(bytes, 'word/document.xml');
  if (extension === 'xlsx') return officePart(bytes, 'xl/workbook.xml');
  if (extension === 'pptx') return officePart(bytes, 'ppt/presentation.xml');
  return false;
}

function configuredExtensions(raw: string | undefined): readonly string[] {
  const text = raw?.trim() ?? '';
  if (text === '') return ticketFileExtensions;
  const found = text
    .split(/[,;\s]+/u)
    .map((part) => part.trim().replace(/^\./u, '').toLowerCase())
    .filter((part) => /^[a-z0-9]{1,8}$/u.test(part));
  const unique = [...new Set(found)];
  return unique.length > 0 ? unique : ticketFileExtensions;
}

function configuredBytes(raw: string | undefined): number {
  const text = raw?.trim() ?? '';
  if (text === '' || !/^\d+$/u.test(text)) return defaultTicketFileBytes;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) return defaultTicketFileBytes;
  return Math.min(value, absoluteTicketFileBytes);
}

function officePart(bytes: Uint8Array, marker: string): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && containsAscii(bytes, marker);
}

function isText(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) return true;
  const sample = bytes.subarray(0, 65_536);
  if (sample.includes(0)) return false;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return false;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return false;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return false;
  if (startsWith(bytes, [0x4d, 0x5a])) return false;
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46])) return false;
  return true;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return at(bytes, 0, signature);
}

function at(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const pattern = [...needle].map((char) => char.charCodeAt(0));
  const last = bytes.length - pattern.length;
  for (let index = 0; index <= last; index += 1) {
    let matched = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}
