import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomTotpSecret(): Buffer {
  return randomBytes(20);
}

export function encodeBase32(value: Buffer): string {
  let bits = 0;
  let buffer = 0;
  let out = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 31];
  return out;
}

export function decodeBase32(value: string): Buffer {
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of value.replace(/=+$/u, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 255);
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const moving = Buffer.alloc(8);
  moving.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(moving).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

export function totpCode(secret: Buffer, at = Date.now()): string {
  return hotp(secret, Math.floor(at / 30_000));
}

export function totpMatches(secret: Buffer, code: string, at = Date.now()): boolean {
  const normalized = code.replace(/\s/gu, '');
  if (!/^\d{6}$/u.test(normalized)) return false;
  const given = Buffer.from(normalized);
  const counter = Math.floor(at / 30_000);
  for (const delta of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(secret, counter + delta));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function sealSecret(sessionSecret: string, plain: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(sessionSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function openSecret(sessionSecret: string, sealed: string): Buffer {
  const packed = Buffer.from(sealed, 'base64url');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(sessionSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
