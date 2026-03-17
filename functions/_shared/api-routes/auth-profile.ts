import { AuthRequest, EmailAuthRequest, DemoLoginRequest } from '../../../contracts/storage';
import { EnglishLevel, UserGrade, UserRole, UserStudyMode } from '../../../types';
import { DEMO_SESSION_TTL_MS } from '../../../utils/demo';
import {
  clearSession,
  createSession,
  createUser,
  ensureDemoUser,
  findUserByEmail,
  hashPassword,
  mapUserRowToProfile,
  requireUser,
  verifyPassword,
} from '../auth';
import {
  assertAuthAttemptAllowed,
  clearAuthFailures,
  createAuthAttemptScopeKey,
  recordAuthFailure,
} from '../auth-rate-limit';
import { HttpError, noContent, readJson } from '../http';
import getServerRuntimeFlags from '../runtime';
import type { DbUserRow } from '../types';
import {
  ApiRouteDefinition,
  ApiRouteResult,
  createJsonResponse,
  isEnumValue,
} from './runtime';

interface ProfileBody {
  user?: {
    displayName?: string;
    grade?: string;
    englishLevel?: string;
    studyMode?: string;
  };
}

const handleDemoLogin = async (
  context: Parameters<ApiRouteDefinition['handle']>[0],
  body: DemoLoginRequest,
): Promise<ApiRouteResult> => {
  const { env, request } = context;
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

  return {
    response: createJsonResponse(mapUserRowToProfile(user), {
      headers: { 'Set-Cookie': sessionCookie },
    }),
  };
};

const handleEmailAuth = async (
  context: Parameters<ApiRouteDefinition['handle']>[0],
  body: EmailAuthRequest,
): Promise<ApiRouteResult> => {
  const { env, request } = context;
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
    return {
      response: createJsonResponse(mapUserRowToProfile(user), {
        headers: { 'Set-Cookie': sessionCookie },
      }),
    };
  }

  await assertAuthAttemptAllowed(env, authScopeKey);
  const existing = await findUserByEmail(env, email);
  if (!existing || !(await verifyPassword(password, existing.password_hash))) {
    await recordAuthFailure(env, authScopeKey);
    throw new HttpError(401, 'メールアドレスまたはパスワードが間違っています。');
  }

  await clearAuthFailures(env, authScopeKey);
  const sessionCookie = await createSession(env, request, existing.id);

  return {
    response: createJsonResponse(mapUserRowToProfile(existing), {
      headers: { 'Set-Cookie': sessionCookie },
    }),
  };
};

const handleProfileUpdate = async (
  context: Parameters<ApiRouteDefinition['handle']>[0],
  currentUser: DbUserRow,
): Promise<ApiRouteResult> => {
  const { env, request } = context;
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
    currentUser.id,
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(currentUser.id).first();
  return {
    logUser: currentUser,
    response: createJsonResponse(mapUserRowToProfile(updated)),
  };
};

export const authProfileRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'auth' && request.method === 'POST',
    handle: async (context) => {
      const body = await readJson<AuthRequest>(context.request);
      if (body.action === 'demo-login') {
        return handleDemoLogin(context, body);
      }
      if (body.action === 'email-auth') {
        return handleEmailAuth(context, body);
      }
      throw new HttpError(404, '未知の認証操作です。');
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'session' && request.method === 'GET',
    handle: async ({ env, request }) => {
      const user = await requireUser(env, request).catch(() => null);
      return {
        logUser: user,
        response: createJsonResponse(user ? mapUserRowToProfile(user) : null),
      };
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'session' && request.method === 'DELETE',
    handle: async ({ env, request }) => {
      const cookie = await clearSession(env, request);
      return {
        response: noContent({ headers: { 'Set-Cookie': cookie } }),
      };
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'profile' && request.method === 'POST',
    handle: async (context) => {
      const user = await requireUser(context.env, context.request);
      return handleProfileUpdate(context, user);
    },
  },
];
