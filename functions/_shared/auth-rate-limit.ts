import { HttpError } from './http';
import type { AppEnv } from './types';

interface AuthAttemptLimitRow {
  failure_count: number | null;
  blocked_until: number | null;
}

const MAX_FAILURES = 5;
const BLOCK_WINDOW_MS = 15 * 60 * 1000;

const normalizeKeySegment = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._:@-]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

const getClientAddress = (request: Request): string => {
  const forwardedFor = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
    || 'local';

  return forwardedFor.split(',')[0]?.trim() || 'local';
};

const readAttemptLimit = async (
  env: AppEnv,
  scopeKey: string,
): Promise<AuthAttemptLimitRow | null> => {
  const row = await env.DB.prepare(`
    SELECT failure_count, blocked_until
    FROM auth_attempt_limits
    WHERE scope_key = ?
  `).bind(scopeKey).first<AuthAttemptLimitRow>();

  return row ?? null;
};

export const createAuthAttemptScopeKey = (
  request: Request,
  scope: 'admin-demo' | 'email-auth',
  identity: string,
): string => {
  const clientAddress = normalizeKeySegment(getClientAddress(request));
  const normalizedIdentity = normalizeKeySegment(identity || 'anonymous');
  return `${scope}:${clientAddress}:${normalizedIdentity}`;
};

export const assertAuthAttemptAllowed = async (
  env: AppEnv,
  scopeKey: string,
  now = Date.now(),
): Promise<void> => {
  const row = await readAttemptLimit(env, scopeKey);
  if (!row?.blocked_until || row.blocked_until <= now) {
    return;
  }

  throw new HttpError(429, '試行回数が上限に達しました。15分ほど待ってから再試行してください。');
};

export const recordAuthFailure = async (
  env: AppEnv,
  scopeKey: string,
  now = Date.now(),
): Promise<void> => {
  const current = await readAttemptLimit(env, scopeKey);
  const previousCount = current?.blocked_until && current.blocked_until <= now
    ? 0
    : (current?.failure_count || 0);
  const nextCount = previousCount + 1;
  const blockedUntil = nextCount >= MAX_FAILURES ? now + BLOCK_WINDOW_MS : null;

  await env.DB.prepare(`
    INSERT INTO auth_attempt_limits (scope_key, failure_count, blocked_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(scope_key) DO UPDATE SET
      failure_count = excluded.failure_count,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at
  `).bind(scopeKey, nextCount, blockedUntil, now).run();
};

export const clearAuthFailures = async (
  env: AppEnv,
  scopeKey: string,
): Promise<void> => {
  await env.DB.prepare('DELETE FROM auth_attempt_limits WHERE scope_key = ?').bind(scopeKey).run();
};
