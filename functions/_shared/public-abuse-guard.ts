import { HttpError } from './http';
import type { AppEnv } from './types';

interface PublicWriteLimitOptions {
  scope: string;
  limit: number;
  windowMs: number;
  now?: number;
}

interface PublicWriteLimitRow {
  failure_count: number | null;
  blocked_until: number | null;
  updated_at: number | null;
}

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

const createPublicWriteScopeKey = (request: Request, scope: string): string => [
  'public-write',
  normalizeKeySegment(getClientAddress(request)),
  normalizeKeySegment(scope),
].join(':');

export const assertPublicWriteAllowed = async (
  env: AppEnv,
  request: Request,
  options: PublicWriteLimitOptions,
): Promise<void> => {
  const now = options.now ?? Date.now();
  const scopeKey = createPublicWriteScopeKey(request, options.scope);
  const row = await env.DB.prepare(`
    SELECT failure_count, blocked_until, updated_at
    FROM auth_attempt_limits
    WHERE scope_key = ?
  `).bind(scopeKey).first<PublicWriteLimitRow>();

  if (row?.blocked_until && row.blocked_until > now) {
    throw new HttpError(429, '短時間の操作が上限を超えています。しばらく待ってから再試行してください。');
  }

  const isWithinWindow = Boolean(row?.updated_at && Number(row.updated_at) >= now - options.windowMs);
  const currentCount = isWithinWindow ? Number(row?.failure_count || 0) : 0;
  if (currentCount >= options.limit) {
    const blockedUntil = now + options.windowMs;
    await env.DB.prepare(`
      INSERT INTO auth_attempt_limits (scope_key, failure_count, blocked_until, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        failure_count = excluded.failure_count,
        blocked_until = excluded.blocked_until,
        updated_at = excluded.updated_at
    `).bind(scopeKey, currentCount, blockedUntil, now).run();
    throw new HttpError(429, '短時間の操作が上限を超えています。しばらく待ってから再試行してください。');
  }

  await env.DB.prepare(`
    INSERT INTO auth_attempt_limits (scope_key, failure_count, blocked_until, updated_at)
    VALUES (?, ?, NULL, ?)
    ON CONFLICT(scope_key) DO UPDATE SET
      failure_count = excluded.failure_count,
      blocked_until = NULL,
      updated_at = excluded.updated_at
  `).bind(scopeKey, currentCount + 1, now).run();
};
