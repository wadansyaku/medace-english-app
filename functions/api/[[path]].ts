import { AuthRequest, CommercialRequestPayload, DemoLoginRequest, EmailAuthRequest, StorageAction, StorageActionRequest } from '../../contracts/storage';
import { EnglishLevel, OrganizationRole, UserGrade, UserRole, UserStudyMode } from '../../types';
import { clearSession, createSession, createUser, ensureDemoUser, findUserByEmail, mapUserRowToProfile, requireUser, verifyPassword, hashPassword } from '../_shared/auth';
import {
  assertAuthAttemptAllowed,
  clearAuthFailures,
  createAuthAttemptScopeKey,
  recordAuthFailure,
} from '../_shared/auth-rate-limit';
import { handleAiAction } from '../_shared/ai-actions';
import { handleCreateCommercialRequest } from '../_shared/commercial-actions';
import { handleError, HttpError, json, noContent, readJson } from '../_shared/http';
import getServerRuntimeFlags from '../_shared/runtime';
import { handleGetPublicMotivationSnapshot } from '../_shared/storage-dashboard-actions';
import { handleStorageAction } from '../_shared/storage-actions';
import { AppEnv, DbUserRow } from '../_shared/types';
import { handleWritingAssetUpload, handleWritingRequest } from '../_shared/writing-actions';
import { DEMO_SESSION_TTL_MS } from '../../utils/demo';

interface ProfileBody {
  user?: {
    displayName?: string;
    grade?: string;
    englishLevel?: string;
    studyMode?: string;
  };
}

type ApiLogUser = Pick<DbUserRow, 'id' | 'role' | 'organization_id' | 'organization_role'> | null;

const createJsonResponse = (data: unknown, init: ResponseInit = {}): Response => {
  if (data === null || data === undefined) {
    return noContent(init);
  }
  return json(data, init);
};

const isEnumValue = <TEnum extends Record<string, string>>(
  enumObject: TEnum,
  value: unknown,
): value is TEnum[keyof TEnum] => {
  return typeof value === 'string' && Object.values(enumObject).includes(value as TEnum[keyof TEnum]);
};

const getDeploymentLabel = (request: Request, env: AppEnv) => {
  const deployment = getServerRuntimeFlags(request, env).deployment;
  if (deployment.isLocalhost) return 'local';
  if (deployment.isPagesPreviewHost) return 'preview';
  return 'production';
};

const finalizeApiResponse = (request: Request, env: AppEnv, response: Response): Response => {
  const headers = new Headers(response.headers);
  if (getServerRuntimeFlags(request, env).deployment.isPagesPreviewHost) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (env.DEPLOYMENT_SHA) {
    headers.set('X-Deployment-Sha', env.DEPLOYMENT_SHA);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const logApiResponse = (
  request: Request,
  env: AppEnv,
  pathname: string,
  response: Response,
  user: ApiLogUser,
  error?: unknown,
) => {
  const logPayload = {
    type: 'api_request',
    method: request.method,
    pathname: pathname || '/',
    hostname: new URL(request.url).hostname,
    status: response.status,
    deployment: getDeploymentLabel(request, env),
    deploymentSha: env.DEPLOYMENT_SHA || null,
    requestId: request.headers.get('cf-ray') || crypto.randomUUID(),
    userId: user?.id || null,
    role: user?.role || null,
    organizationId: user?.organization_id || null,
    organizationRole: user?.organization_role || null,
    error: error instanceof Error ? error.message : null,
  };

  const sink = response.status >= 500 ? console.error : console.log;
  sink(JSON.stringify(logPayload));
};

const handleDemoLogin = async (env: AppEnv, request: Request, body: DemoLoginRequest): Promise<Response> => {
  const runtimeFlags = getServerRuntimeFlags(request, env);
  const role = body.role || UserRole.STUDENT;

  if (role !== UserRole.STUDENT && role !== UserRole.ADMIN && !runtimeFlags.enablePublicBusinessDemo) {
    throw new HttpError(403, '学校・教室向けデモは preview / 個別案内のみです。');
  }

  if (body.organizationRole && !runtimeFlags.enablePublicBusinessDemo) {
    throw new HttpError(403, '学校・教室向けデモは preview / 個別案内のみです。');
  }

  if (role === UserRole.ADMIN) {
    if (!runtimeFlags.enableAdminDemo) {
      throw new HttpError(403, 'サービス管理者デモは preview / 個別案内のみです。');
    }

    const authScopeKey = createAuthAttemptScopeKey(request, 'admin-demo', role);
    await assertAuthAttemptAllowed(env, authScopeKey);

    const hostname = new URL(request.url).hostname;
    const expectedPassword = env.ADMIN_DEMO_PASSWORD || (hostname === 'localhost' || hostname === '127.0.0.1' ? 'admin' : undefined);
    if (!expectedPassword) {
      throw new HttpError(403, 'ADMIN_DEMO_PASSWORD を設定してください。');
    }
    if (body.demoPassword !== expectedPassword) {
      await recordAuthFailure(env, authScopeKey);
      throw new HttpError(403, '管理用パスワードが正しくありません。');
    }

    await clearAuthFailures(env, authScopeKey);
  }

  const user = await ensureDemoUser(env, role, body.organizationRole);
  const sessionCookie = await createSession(env, request, user.id, DEMO_SESSION_TTL_MS);
  return createJsonResponse(mapUserRowToProfile(user), {
    headers: { 'Set-Cookie': sessionCookie },
  });
};

const handleEmailAuth = async (env: AppEnv, request: Request, body: EmailAuthRequest): Promise<Response> => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const requestedRole = body.role || UserRole.STUDENT;
  const authScopeKey = createAuthAttemptScopeKey(request, 'email-auth', email || 'anonymous');

  if (!email || !password) {
    throw new HttpError(400, 'メールアドレスとパスワードを入力してください。');
  }

  if (body.isSignUp) {
    if (requestedRole !== UserRole.STUDENT) {
      throw new HttpError(403, 'この登録導線では生徒アカウントのみ作成できます。');
    }

    if (password.length < 6) {
      throw new HttpError(400, 'パスワードは6文字以上にしてください。');
    }

    const existing = await findUserByEmail(env, email);
    if (existing) {
      throw new HttpError(409, 'このメールアドレスは既に登録されています。');
    }

    const passwordHash = await hashPassword(password);
    const displayName = String(body.displayName || email.split('@')[0]).trim();
    if (!displayName) {
      throw new HttpError(400, '表示名を入力してください。');
    }

    const user = await createUser(env, {
      email,
      passwordHash,
      displayName,
      role: UserRole.STUDENT,
    });

    const sessionCookie = await createSession(env, request, user.id);
    return createJsonResponse(mapUserRowToProfile(user), {
      headers: { 'Set-Cookie': sessionCookie },
    });
  }

  await assertAuthAttemptAllowed(env, authScopeKey);
  const existing = await findUserByEmail(env, email);
  if (!existing || !(await verifyPassword(password, existing.password_hash))) {
    await recordAuthFailure(env, authScopeKey);
    throw new HttpError(401, 'メールアドレスまたはパスワードが間違っています。');
  }

  await clearAuthFailures(env, authScopeKey);
  const sessionCookie = await createSession(env, request, existing.id);
  return createJsonResponse(mapUserRowToProfile(existing), {
    headers: { 'Set-Cookie': sessionCookie },
  });
};

const handleProfileUpdate = async (env: AppEnv, request: Request, currentUser: DbUserRow): Promise<Response> => {
  const body = await readJson<ProfileBody>(request);
  const nextUser = body.user || {};
  const nextDisplayName =
    typeof nextUser.displayName === 'string' && nextUser.displayName.trim()
      ? nextUser.displayName.trim()
      : currentUser.display_name;
  const nextGrade = isEnumValue(UserGrade, nextUser.grade)
    ? nextUser.grade
    : currentUser.grade || null;
  const nextEnglishLevel = isEnumValue(EnglishLevel, nextUser.englishLevel)
    ? nextUser.englishLevel
    : currentUser.english_level || null;
  const nextStudyMode = isEnumValue(UserStudyMode, nextUser.studyMode)
    ? nextUser.studyMode
    : currentUser.study_mode || UserStudyMode.FOCUS;

  await env.DB.prepare(`
    UPDATE users
    SET display_name = ?, grade = ?, english_level = ?, study_mode = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    nextDisplayName,
    nextGrade,
    nextEnglishLevel,
    nextStudyMode,
    Date.now(),
    currentUser.id
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(currentUser.id).first();
  return createJsonResponse(mapUserRowToProfile(updated));
};

export const onRequest = async (context: { request: Request; env: AppEnv; }): Promise<Response> => {
  const { request, env } = context;
  let pathname = '';
  let logUser: ApiLogUser = null;

  try {
    const url = new URL(request.url);
    pathname = url.pathname.replace(/^\/api\/?/, '');
    let response: Response;

    if (pathname === 'auth' && request.method === 'POST') {
      const body = await readJson<AuthRequest>(request);
      if (body.action === 'demo-login') {
        response = await handleDemoLogin(env, request, body);
      } else if (body.action === 'email-auth') {
        response = await handleEmailAuth(env, request, body);
      } else {
        throw new HttpError(404, '未知の認証操作です。');
      }
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname === 'session' && request.method === 'GET') {
      const user = await requireUser(env, request).catch(() => null);
      logUser = user;
      response = createJsonResponse(user ? mapUserRowToProfile(user) : null);
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname === 'session' && request.method === 'DELETE') {
      const cookie = await clearSession(env, request);
      response = noContent({ headers: { 'Set-Cookie': cookie } });
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname === 'public/motivation' && request.method === 'GET') {
      response = createJsonResponse(await handleGetPublicMotivationSnapshot(env));
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname === 'public/commercial-request' && request.method === 'POST') {
      const body = await readJson<CommercialRequestPayload>(request);
      response = createJsonResponse(await handleCreateCommercialRequest(env, body));
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname === 'profile' && request.method === 'POST') {
      const user = await requireUser(env, request);
      logUser = user;
      response = await handleProfileUpdate(env, request, user);
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname.startsWith('writing/upload/') && request.method === 'PUT') {
      response = await handleWritingAssetUpload(env, pathname.replace(/^writing\/upload\//, ''), request);
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname.startsWith('writing')) {
      const user = await requireUser(env, request);
      logUser = user;
      const writingPath = pathname.replace(/^writing/, '');
      response = await handleWritingRequest(env, user, request, writingPath);
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname === 'storage' && request.method === 'POST') {
      const user = await requireUser(env, request);
      logUser = user;
      const body = await readJson<StorageActionRequest<StorageAction>>(request);
      const result = await handleStorageAction(env, user, body, request);
      response = createJsonResponse(result);
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    if (pathname === 'ai' && request.method === 'POST') {
      const user = await requireUser(env, request);
      logUser = user;
      const body = await readJson<{ action: string; payload?: any }>(request);
      const result = await handleAiAction(env, user, body);
      response = createJsonResponse(result);
      response = finalizeApiResponse(request, env, response);
      logApiResponse(request, env, pathname, response, logUser);
      return response;
    }

    throw new HttpError(404, 'APIエンドポイントが見つかりません。');
  } catch (error) {
    const response = finalizeApiResponse(request, env, handleError(error));
    logApiResponse(request, env, pathname, response, logUser, error);
    return response;
  }
};
