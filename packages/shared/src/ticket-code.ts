const ticketCodePattern = /^(\d{2})-(\d{4})$/;

export function formatTicketCode(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error('ticket year');
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new Error('ticket code range');
  }
  return `${String(year).slice(-2)}-${String(sequence).padStart(4, '0')}`;
}

export function isTicketCode(value: string): boolean {
  return ticketCodePattern.test(value);
}

export const ticketFileExtensions = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'tif',
  'tiff',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'txt',
  'csv',
  'md',
] as const;

export function allowedTicketFile(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return (ticketFileExtensions as readonly string[]).includes(extension);
}
