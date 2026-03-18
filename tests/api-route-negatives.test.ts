import { describe, expect, it } from 'vitest';

import { UserRole } from '../types';
import { authProfileRoutes } from '../functions/_shared/api-routes/auth-profile';
import { handleAiAction } from '../functions/_shared/ai-actions';
import { HttpError } from '../functions/_shared/http';
import { handleStorageAction } from '../functions/_shared/storage-actions';
import { handleWritingRequest } from '../functions/_shared/writing-actions';

const createUser = (role: UserRole = UserRole.STUDENT) => ({
  id: 'user-1',
  email: 'user@example.com',
  password_hash: null,
  display_name: 'User',
  role,
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

const expectHttpError = async (
  promise: Promise<unknown>,
  status: number,
  message: string,
) => {
  await expect(promise).rejects.toMatchObject({
    name: 'HttpError',
    status,
    message,
  } satisfies Partial<HttpError>);
};

describe('negative route guards', () => {
  it('rejects unknown auth actions', async () => {
    const request = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'unknown-auth-action' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const route = authProfileRoutes.find((candidate) => candidate.matches({
      env: {} as never,
      request,
      pathname: 'auth',
    }));

    expect(route).toBeDefined();
    await expectHttpError(
      route!.handle({
        env: {} as never,
        request,
        pathname: 'auth',
      }),
      404,
      '未知の認証操作です。',
    );
  });

  it('rejects storage requests without an action', async () => {
    await expectHttpError(
      handleStorageAction(
        {} as never,
        createUser(),
        {} as never,
        new Request('https://medace-english-app.pages.dev/api/storage', { method: 'POST' }),
      ),
      400,
      'storage action が指定されていません。',
    );
  });

  it('rejects unknown storage actions', async () => {
    await expectHttpError(
      handleStorageAction(
        {} as never,
        createUser(),
        { action: 'unknown-storage-action' } as never,
        new Request('https://medace-english-app.pages.dev/api/storage', { method: 'POST' }),
      ),
      404,
      '未対応のストレージ操作です: unknown-storage-action',
    );
  });

  it('keeps destructive storage actions blocked on production hosts before execution', async () => {
    await expectHttpError(
      handleStorageAction(
        {} as never,
        createUser(UserRole.ADMIN),
        { action: 'resetAllData' } as never,
        new Request('https://medace-english-app.pages.dev/api/storage', { method: 'POST' }),
      ),
      403,
      '本番環境ではデータ初期化を API から実行できません。preview またはローカル検証環境に限定してください。',
    );
  });

  it('rejects unknown writing endpoints', async () => {
    await expectHttpError(
      handleWritingRequest(
        {} as never,
        createUser(),
        new Request('http://localhost/api/writing/not-found', { method: 'GET' }),
        '/not-found',
      ),
      404,
      'Writing API エンドポイントが見つかりません。',
    );
  });

  it('rejects unknown ai actions', async () => {
    await expectHttpError(
      handleAiAction(
        {} as never,
        createUser(),
        { action: 'unknown-ai-action' },
      ),
      404,
      '未知のAI操作です。',
    );
  });
});
