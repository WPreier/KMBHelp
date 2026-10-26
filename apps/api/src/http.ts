import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { publicErrors } from '@kmbhelp/shared';
import { accessLog, type Database } from '@kmbhelp/db';

export class PublicError extends Error {
  readonly statusCode: number;
  readonly error: string;
  readonly text: { readonly de: string; readonly en: string };

  constructor(statusCode: number, error: string, text: { de: string; en: string }) {
    super(error);
    this.statusCode = statusCode;
    this.error = error;
    this.text = text;
  }
}

type Bucket = { resetAt: number; count: number };

export function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const current = buckets.get(key);
      if (!current || current.resetAt <= now) {
        buckets.set(key, { resetAt: now + windowMs, count: 1 });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
  };
}

export function createSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

export function accessLogPath(url: string): string {
  const path = (url.split('?')[0] ?? url).slice(0, 300);
  if (/^\/api\/v1\/tickets\/by-token\/.+$/.test(path)) return '/api/v1/tickets/by-token/:token';
  return path;
}

export function clientAddress(request: FastifyRequest): string {
  const address = request.ip.trim();
  return address === '' ? 'unknown' : address.slice(0, 80);
}

export function userAgent(request: FastifyRequest): string {
  const raw = request.headers['user-agent'];
  const value = typeof raw === 'string' ? raw : '';
  return value.slice(0, 160);
}

export async function writeAccessLog(
  database: Database,
  request: FastifyRequest,
  ticketId?: string,
): Promise<void> {
  await database.db.insert(accessLog).values({
    ip: clientAddress(request),
    method: request.method.slice(0, 16),
    path: accessLogPath(request.url),
    ticketId: ticketId ?? null,
    userAgent: userAgent(request),
  });
}

export function queryHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function rateLimited(): PublicError {
  return new PublicError(429, 'rate_limited', publicErrors.rateLimited);
}

export function databaseDown(): PublicError {
  return new PublicError(503, 'database_down', publicErrors.databaseDown);
}
