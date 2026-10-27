const svnrPattern = /\b(\d{4})[ -]?(\d{2})(\d{2})(\d{2})\b/gu;
const ibanPattern = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}[ ]?[A-Z0-9]{0,4}\b/gu;
const cardPattern = /\b(?:\d[ -]?){13,19}\b/gu;
const birthDotPattern = /\b(0[1-9]|[12]\d|3[01])[./](0[1-9]|1[0-2])[./](19\d{2}|20\d{2})\b/gu;
const birthIsoPattern = /\b(19\d{2}|20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/gu;

function validDayMonth(day: number, month: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return false;
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function birthYearLimit(now: Date): number {
  return now.getUTCFullYear() - 16;
}

export function maskPersonalData(text: string, now = new Date()): string {
  const limit = birthYearLimit(now);
  const withoutIbans = text.replace(ibanPattern, '[IBAN]');
  const withoutCards = withoutIbans.replace(cardPattern, (match) => {
    const digits = match.replace(/[ -]/gu, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[KARTE]' : match;
  });
  const withoutSvnr = withoutCards.replace(svnrPattern, (match, _serial, day, month) =>
    validDayMonth(Number(day), Number(month)) ? '[SVNR]' : match,
  );
  const withoutDotDates = withoutSvnr.replace(birthDotPattern, (match, day, month, year) => {
    const numericYear = Number(year);
    if (numericYear > limit || !validDayMonth(Number(day), Number(month))) return match;
    return '[GEBURTSDATUM]';
  });
  return withoutDotDates.replace(birthIsoPattern, (match, year, month, day) => {
    const numericYear = Number(year);
    if (numericYear > limit || !validDayMonth(Number(day), Number(month))) return match;
    return '[GEBURTSDATUM]';
  });
}

export function containsPersonalData(text: string, now = new Date()): boolean {
  return maskPersonalData(text, now) !== text;
}
