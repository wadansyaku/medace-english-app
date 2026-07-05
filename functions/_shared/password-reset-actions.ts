import type {
  AdminPasswordResetLinkIssuePayload,
  AdminPasswordResetLinkIssueResult,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
} from '../../contracts/storage';
import {
  findUserByEmail,
  hashOpaqueToken,
  hashPassword,
} from './auth';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_ISSUED_NOTE = '再設定リンクを発行済み。本人確認後に手動案内してください。';
const PASSWORD_RESET_COMPLETED_NOTE = 'ユーザーが再設定リンクでパスワードを更新済み';

interface PasswordResetRecoveryRow {
  id: number;
  email: string;
  has_matching_user: number;
  status: string;
}

interface PasswordResetTokenRow {
  id: number;
  user_id: string;
  recovery_request_id: number | null;
  expires_at: number;
  used_at: number | null;
}

const bytesToBinary = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return binary;
};

const encodeBase64Url = (bytes: Uint8Array): string => (
  btoa(bytesToBinary(bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
);

const createResetToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(PASSWORD_RESET_TOKEN_BYTES));
  return encodeBase64Url(bytes);
};

const normalizeRequestId = (value: number): number => {
  const requestId = Math.trunc(Number(value));
  if (!Number.isFinite(requestId) || requestId <= 0) {
    throw new HttpError(400, '再設定リクエストIDが不正です。');
  }
  return requestId;
};

export const handleIssuePasswordResetLink = async (
  env: AppEnv,
  request: Request,
  adminUser: DbUserRow,
  payload: AdminPasswordResetLinkIssuePayload,
): Promise<AdminPasswordResetLinkIssueResult> => {
  const requestId = normalizeRequestId(payload.requestId);
  const recoveryRequest = await env.DB.prepare(`
    SELECT id, email, has_matching_user, status
    FROM auth_recovery_requests
    WHERE id = ?
  `).bind(requestId).first<PasswordResetRecoveryRow>();

  if (!recoveryRequest) {
    throw new HttpError(404, '再設定リクエストが見つかりません。');
  }

  if (recoveryRequest.status !== 'OPEN') {
    throw new HttpError(409, '処理済みの再設定リクエストにはリンクを発行できません。');
  }

  const matchedUser = await findUserByEmail(env, String(recoveryRequest.email || '').trim().toLowerCase());
  if (!matchedUser || !recoveryRequest.has_matching_user) {
    throw new HttpError(400, '登録一致のあるリクエストだけ再設定リンクを発行できます。');
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + PASSWORD_RESET_TOKEN_TTL_MS;
  const rawToken = createResetToken();
  const tokenHash = await hashOpaqueToken(rawToken);

  await env.DB.prepare(`
    UPDATE password_reset_tokens
    SET used_at = ?
    WHERE user_id = ? AND used_at IS NULL
  `).bind(issuedAt, matchedUser.id).run();

  await env.DB.prepare(`
    INSERT INTO password_reset_tokens (
      recovery_request_id,
      user_id,
      token_hash,
      expires_at,
      created_by,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    requestId,
    matchedUser.id,
    tokenHash,
    expiresAt,
    adminUser.id,
    issuedAt,
  ).run();

  await env.DB.prepare(`
    UPDATE auth_recovery_requests
    SET updated_at = ?, resolution_note = ?
    WHERE id = ?
  `).bind(issuedAt, PASSWORD_RESET_ISSUED_NOTE, requestId).run();

  const resetUrl = new URL('/reset-password', request.url);
  resetUrl.searchParams.set('token', rawToken);

  return {
    requestId,
    resetUrl: resetUrl.toString(),
    expiresAt,
    issuedAt,
  };
};

export const handlePasswordResetConfirm = async (
  env: AppEnv,
  body: PasswordResetConfirmRequest,
): Promise<PasswordResetConfirmResponse> => {
  const token = String(body.token || '').trim();
  const password = String(body.password || '');

  if (!token || token.length > 256) {
    throw new HttpError(400, '再設定リンクが無効または期限切れです。');
  }
  if (password.length < 6) {
    throw new HttpError(400, 'パスワードは6文字以上にしてください。');
  }
  if (password.length > 128) {
    throw new HttpError(400, 'パスワードは128文字以内にしてください。');
  }

  const now = Date.now();
  const tokenHash = await hashOpaqueToken(token);
  const resetToken = await env.DB.prepare(`
    SELECT id, user_id, recovery_request_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = ?
  `).bind(tokenHash).first<PasswordResetTokenRow>();

  if (!resetToken || resetToken.used_at || Number(resetToken.expires_at) <= now) {
    throw new HttpError(400, '再設定リンクが無効または期限切れです。');
  }

  const passwordHash = await hashPassword(password);
  await env.DB.prepare(`
    UPDATE users
    SET password_hash = ?, updated_at = ?
    WHERE id = ?
  `).bind(passwordHash, now, resetToken.user_id).run();

  await env.DB.prepare(`
    UPDATE password_reset_tokens
    SET used_at = ?
    WHERE id = ?
  `).bind(now, resetToken.id).run();

  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(resetToken.user_id).run();

  if (resetToken.recovery_request_id) {
    await env.DB.prepare(`
      UPDATE auth_recovery_requests
      SET
        status = 'RESOLVED',
        updated_at = ?,
        resolved_at = ?,
        resolved_by = COALESCE(resolved_by, ?),
        resolution_note = ?
      WHERE id = ?
    `).bind(
      now,
      now,
      resetToken.user_id,
      PASSWORD_RESET_COMPLETED_NOTE,
      resetToken.recovery_request_id,
    ).run();
  }

  return {
    message: 'パスワードを更新しました。新しいパスワードでログインしてください。',
    resetAt: now,
  };
};
