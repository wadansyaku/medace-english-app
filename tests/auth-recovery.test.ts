import { describe, expect, it } from 'vitest';

import { authProfileRoutes } from '../functions/_shared/api-routes/auth-profile';
import { verifyPassword } from '../functions/_shared/auth';
import { HttpError } from '../functions/_shared/http';
import { handleIssuePasswordResetLink } from '../functions/_shared/password-reset-actions';
import { handleUpdatePasswordRecoveryRequest } from '../functions/_shared/storage-dashboard-actions';
import type { D1Database, D1PreparedStatement, DbUserRow } from '../functions/_shared/types';

type DbWrite = {
  sql: string;
  values: unknown[];
};

const createRecoveryRequest = (email: string): Request => new Request('https://medace-english-app.pages.dev/api/auth', {
  method: 'POST',
  body: JSON.stringify({
    action: 'password-recovery-request',
    email,
    source: 'login',
  }),
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://medace-english-app.pages.dev',
  },
});

const createPasswordResetConfirmRequest = (token: string, password: string): Request => new Request('https://medace-english-app.pages.dev/api/auth', {
  method: 'POST',
  body: JSON.stringify({
    action: 'password-reset-confirm',
    token,
    password,
  }),
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://medace-english-app.pages.dev',
  },
});

const findAuthRoute = (request: Request) => {
  const route = authProfileRoutes.find((candidate) => candidate.matches({
    env: {} as never,
    request,
    pathname: 'auth',
  }));
  expect(route).toBeDefined();
  return route!;
};

const createMockDb = ({
  hasMatchingUser = false,
}: {
  hasMatchingUser?: boolean;
} = {}): { db: D1Database; writes: DbWrite[] } => {
  const writes: DbWrite[] = [];

  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let values: unknown[] = [];

      const statement: D1PreparedStatement = {
        bind(...nextValues: unknown[]): D1PreparedStatement {
          values = nextValues;
          return statement;
        },
        async first<TRow = Record<string, unknown>>(): Promise<TRow | null> {
          if (sql.includes('FROM auth_attempt_limits')) {
            return null;
          }
          if (sql.includes('FROM users')) {
            return hasMatchingUser ? ({ id: 'user-1', email: values[0] } as TRow) : null;
          }
          return null;
        },
        async all() {
          return { meta: {}, results: [], success: true };
        },
        async run() {
          writes.push({ sql, values });
          return { meta: {}, success: true };
        },
      };

      return statement;
    },
    async batch() {
      return [];
    },
  };

  return { db, writes };
};

const createAdminUser = (): DbUserRow => ({
  id: 'admin-1',
  email: 'admin@example.com',
  password_hash: null,
  display_name: 'Admin',
  role: 'ADMIN',
  grade: null,
  english_level: null,
  subscription_plan: null,
  organization_id: null,
  organization_name: null,
  organization_role: null,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 0,
  updated_at: 0,
});

const createStudentUser = (): DbUserRow => ({
  id: 'user-1',
  email: 'student@example.com',
  password_hash: 'old-password-hash',
  display_name: 'Student',
  role: 'STUDENT',
  grade: null,
  english_level: null,
  subscription_plan: null,
  organization_id: null,
  organization_name: null,
  organization_role: null,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 0,
  updated_at: 0,
});

const createPasswordResetDb = (): {
  db: D1Database;
  writes: DbWrite[];
  state: {
    user: DbUserRow;
    resetTokens: Array<{
      id: number;
      recovery_request_id: number | null;
      user_id: string;
      token_hash: string;
      expires_at: number;
      used_at: number | null;
      created_by: string | null;
      created_at: number;
    }>;
    recoveryRequest: {
      id: number;
      email: string;
      has_matching_user: number;
      status: 'OPEN' | 'RESOLVED';
      source: string;
      created_at: number;
      updated_at: number;
      resolved_at: number | null;
      resolved_by: string | null;
      resolution_note: string | null;
    };
    deletedSessionUserId: string | null;
  };
} => {
  const writes: DbWrite[] = [];
  const state = {
    user: createStudentUser(),
    resetTokens: [] as Array<{
      id: number;
      recovery_request_id: number | null;
      user_id: string;
      token_hash: string;
      expires_at: number;
      used_at: number | null;
      created_by: string | null;
      created_at: number;
    }>,
    recoveryRequest: {
      id: 1,
      email: 'student@example.com',
      has_matching_user: 1,
      status: 'OPEN' as 'OPEN' | 'RESOLVED',
      source: 'login',
      created_at: 1783057800000,
      updated_at: 1783057800000,
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
    },
    deletedSessionUserId: null as string | null,
  };

  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let values: unknown[] = [];

      const statement: D1PreparedStatement = {
        bind(...nextValues: unknown[]): D1PreparedStatement {
          values = nextValues;
          return statement;
        },
        async first<TRow = Record<string, unknown>>(): Promise<TRow | null> {
          if (sql.includes('FROM auth_recovery_requests')) {
            if (Number(values[0]) === state.recoveryRequest.id) {
              return state.recoveryRequest as TRow;
            }
            return null;
          }
          if (sql.includes('FROM users')) {
            return values[0] === state.user.email ? state.user as TRow : null;
          }
          if (sql.includes('FROM password_reset_tokens')) {
            return (state.resetTokens.find((token) => token.token_hash === values[0]) || null) as TRow | null;
          }
          return null;
        },
        async all() {
          return { meta: {}, results: [], success: true };
        },
        async run() {
          writes.push({ sql, values });
          if (sql.includes('UPDATE password_reset_tokens') && sql.includes('WHERE user_id')) {
            state.resetTokens = state.resetTokens.map((token) => (
              token.user_id === values[1] && token.used_at === null
                ? { ...token, used_at: values[0] as number }
                : token
            ));
          } else if (sql.includes('INSERT INTO password_reset_tokens')) {
            state.resetTokens.push({
              id: state.resetTokens.length + 1,
              recovery_request_id: values[0] as number | null,
              user_id: values[1] as string,
              token_hash: values[2] as string,
              expires_at: values[3] as number,
              created_by: values[4] as string | null,
              created_at: values[5] as number,
              used_at: null,
            });
          } else if (sql.includes('UPDATE users')) {
            state.user = {
              ...state.user,
              password_hash: values[0] as string,
              updated_at: values[1] as number,
            };
          } else if (sql.includes('UPDATE password_reset_tokens') && sql.includes('WHERE id')) {
            state.resetTokens = state.resetTokens.map((token) => (
              token.id === values[1] ? { ...token, used_at: values[0] as number } : token
            ));
          } else if (sql.includes('DELETE FROM sessions')) {
            state.deletedSessionUserId = values[0] as string;
          } else if (sql.includes('UPDATE auth_recovery_requests') && sql.includes("status = 'RESOLVED'")) {
            state.recoveryRequest = {
              ...state.recoveryRequest,
              status: 'RESOLVED',
              updated_at: values[0] as number,
              resolved_at: values[1] as number,
              resolved_by: values[2] as string,
              resolution_note: values[3] as string,
            };
          } else if (sql.includes('UPDATE auth_recovery_requests')) {
            state.recoveryRequest = {
              ...state.recoveryRequest,
              updated_at: values[0] as number,
              resolution_note: values[1] as string,
            };
          }
          return { meta: {}, success: true };
        },
      };

      return statement;
    },
    async batch() {
      return [];
    },
  };

  return { db, writes, state };
};

const createRecoveryUpdateDb = ({
  exists = true,
  initialStatus = 'OPEN',
}: {
  exists?: boolean;
  initialStatus?: 'OPEN' | 'RESOLVED';
} = {}): { db: D1Database; writes: DbWrite[] } => {
  const writes: DbWrite[] = [];
  let row = exists ? {
    id: 1,
    email: 'student@example.com',
    has_matching_user: 1,
    status: initialStatus,
    source: 'login',
    created_at: 1783057800000,
    updated_at: 1783057800000,
    resolved_at: initialStatus === 'RESOLVED' ? 1783057900000 : null,
    resolved_by: initialStatus === 'RESOLVED' ? 'admin-old' : null,
    resolution_note: initialStatus === 'RESOLVED' ? '対応済み' : null,
  } : null;

  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let values: unknown[] = [];

      const statement: D1PreparedStatement = {
        bind(...nextValues: unknown[]): D1PreparedStatement {
          values = nextValues;
          return statement;
        },
        async first<TRow = Record<string, unknown>>(): Promise<TRow | null> {
          if (sql.includes('FROM auth_recovery_requests') && Number(values[0]) === row?.id) {
            return row as TRow;
          }
          return null;
        },
        async all() {
          return { meta: {}, results: [], success: true };
        },
        async run() {
          writes.push({ sql, values });
          if (sql.includes('UPDATE auth_recovery_requests') && row) {
            row = {
              ...row,
              status: values[0] as 'OPEN' | 'RESOLVED',
              updated_at: values[1] as number,
              resolved_at: values[2] as number | null,
              resolved_by: values[3] as string | null,
              resolution_note: values[4] as string | null,
            };
          }
          return { meta: {}, success: true };
        },
      };

      return statement;
    },
    async batch() {
      return [];
    },
  };

  return { db, writes };
};

describe('password recovery request route', () => {
  it('records a generic password recovery request for the admin queue', async () => {
    const request = createRecoveryRequest('Student@Example.COM');
    const { db, writes } = createMockDb({ hasMatchingUser: true });
    const route = findAuthRoute(request);

    const result = await route.handle({
      env: { DB: db } as never,
      request,
      pathname: 'auth',
    });

    expect(result.response.status).toBe(200);
    const body = await result.response.json() as { message: string; requestedAt: number };
    expect(body.message).toContain('再設定リクエストを受け付けました');
    expect(body.message).toContain('登録済みのアカウントの場合');
    expect(typeof body.requestedAt).toBe('number');

    const recoveryWrite = writes.find((write) => write.sql.includes('INSERT INTO auth_recovery_requests'));
    expect(recoveryWrite?.values[0]).toBe('student@example.com');
    expect(recoveryWrite?.values[1]).toBe(1);
    expect(recoveryWrite?.values[2]).toBe('login');
    expect(typeof recoveryWrite?.values[3]).toBe('number');
    expect(typeof recoveryWrite?.values[4]).toBe('number');

    const rateLimitWrite = writes.find((write) => write.sql.includes('INSERT INTO auth_attempt_limits'));
    expect(rateLimitWrite?.values[0]).toContain('password-recovery:');
    expect(rateLimitWrite?.values[1]).toBe(1);
  });

  it('rejects malformed recovery email before writing', async () => {
    const request = createRecoveryRequest('not-an-email');
    const { db, writes } = createMockDb();
    const route = findAuthRoute(request);

    await expect(route.handle({
      env: { DB: db } as never,
      request,
      pathname: 'auth',
    })).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
      message: '再設定に使うメールアドレスを入力してください。',
    } satisfies Partial<HttpError>);

    expect(writes).toHaveLength(0);
  });
});

describe('password recovery admin handling', () => {
  it('marks a recovery request as resolved with operator evidence', async () => {
    const { db, writes } = createRecoveryUpdateDb();

    const result = await handleUpdatePasswordRecoveryRequest(
      { DB: db } as never,
      createAdminUser(),
      {
        requestId: 1,
        status: 'RESOLVED',
        resolutionNote: 'メールで案内済み',
      },
    );

    expect(result).toMatchObject({
      id: 1,
      email: 'student@example.com',
      hasMatchingUser: true,
      status: 'RESOLVED',
      resolvedBy: 'admin-1',
      resolutionNote: 'メールで案内済み',
    });
    expect(typeof result.resolvedAt).toBe('number');

    const updateWrite = writes.find((write) => write.sql.includes('UPDATE auth_recovery_requests'));
    expect(updateWrite?.values[0]).toBe('RESOLVED');
    expect(typeof updateWrite?.values[1]).toBe('number');
    expect(typeof updateWrite?.values[2]).toBe('number');
    expect(updateWrite?.values[3]).toBe('admin-1');
    expect(updateWrite?.values[4]).toBe('メールで案内済み');
    expect(updateWrite?.values[5]).toBe(1);
  });

  it('can reopen a resolved recovery request and clears resolution fields', async () => {
    const { db, writes } = createRecoveryUpdateDb({ initialStatus: 'RESOLVED' });

    const result = await handleUpdatePasswordRecoveryRequest(
      { DB: db } as never,
      createAdminUser(),
      {
        requestId: 1,
        status: 'OPEN',
      },
    );

    expect(result.status).toBe('OPEN');
    expect(result.resolvedAt).toBeUndefined();
    expect(result.resolvedBy).toBeUndefined();
    expect(result.resolutionNote).toBeUndefined();

    const updateWrite = writes.find((write) => write.sql.includes('UPDATE auth_recovery_requests'));
    expect(updateWrite?.values[0]).toBe('OPEN');
    expect(updateWrite?.values[2]).toBeNull();
    expect(updateWrite?.values[3]).toBeNull();
    expect(updateWrite?.values[4]).toBeNull();
  });

  it('returns 404 when the recovery request does not exist', async () => {
    const { db } = createRecoveryUpdateDb({ exists: false });

    await expect(handleUpdatePasswordRecoveryRequest(
      { DB: db } as never,
      createAdminUser(),
      {
        requestId: 404,
        status: 'RESOLVED',
      },
    )).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
      message: '再設定リクエストが見つかりません。',
    } satisfies Partial<HttpError>);
  });
});

describe('password reset token flow', () => {
  it('issues a one-time reset link without storing the raw token', async () => {
    const { db, state } = createPasswordResetDb();
    const request = new Request('https://medace-english-app.pages.dev/api/storage', {
      method: 'POST',
    });

    const result = await handleIssuePasswordResetLink(
      { DB: db } as never,
      request,
      createAdminUser(),
      { requestId: 1 },
    );

    const url = new URL(result.resetUrl);
    const rawToken = url.searchParams.get('token');
    expect(url.pathname).toBe('/reset-password');
    expect(rawToken).toBeTruthy();
    expect(result.requestId).toBe(1);
    expect(result.expiresAt).toBeGreaterThan(result.issuedAt);
    expect(state.resetTokens).toHaveLength(1);
    expect(state.resetTokens[0].token_hash).not.toBe(rawToken);
    expect(state.resetTokens[0].created_by).toBe('admin-1');
    expect(state.recoveryRequest.resolution_note).toContain('再設定リンクを発行済み');
  });

  it('confirms a reset token once, updates the password, and clears sessions', async () => {
    const { db, state } = createPasswordResetDb();
    const issueRequest = new Request('https://medace-english-app.pages.dev/api/storage', {
      method: 'POST',
    });
    const issued = await handleIssuePasswordResetLink(
      { DB: db } as never,
      issueRequest,
      createAdminUser(),
      { requestId: 1 },
    );
    const rawToken = new URL(issued.resetUrl).searchParams.get('token') || '';
    const route = findAuthRoute(createPasswordResetConfirmRequest(rawToken, 'new-secret'));

    const result = await route.handle({
      env: { DB: db } as never,
      request: createPasswordResetConfirmRequest(rawToken, 'new-secret'),
      pathname: 'auth',
    });

    expect(result.response.status).toBe(200);
    const body = await result.response.json() as { message: string; resetAt: number };
    expect(body.message).toContain('パスワードを更新しました');
    expect(typeof body.resetAt).toBe('number');
    expect(await verifyPassword('new-secret', state.user.password_hash)).toBe(true);
    expect(state.resetTokens[0].used_at).toEqual(expect.any(Number));
    expect(state.deletedSessionUserId).toBe('user-1');
    expect(state.recoveryRequest.status).toBe('RESOLVED');
    expect(state.recoveryRequest.resolution_note).toContain('パスワードを更新済み');

    await expect(route.handle({
      env: { DB: db } as never,
      request: createPasswordResetConfirmRequest(rawToken, 'new-secret-again'),
      pathname: 'auth',
    })).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
      message: '再設定リンクが無効または期限切れです。',
    } satisfies Partial<HttpError>);
  });

  it('does not issue a reset link for unmatched recovery requests', async () => {
    const { db, state } = createPasswordResetDb();
    state.recoveryRequest.has_matching_user = 0;

    await expect(handleIssuePasswordResetLink(
      { DB: db } as never,
      new Request('https://medace-english-app.pages.dev/api/storage', { method: 'POST' }),
      createAdminUser(),
      { requestId: 1 },
    )).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
      message: '登録一致のあるリクエストだけ再設定リンクを発行できます。',
    } satisfies Partial<HttpError>);

    expect(state.resetTokens).toHaveLength(0);
  });
});
