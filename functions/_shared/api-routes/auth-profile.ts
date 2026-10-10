import { isStaffLoginEntry, matchesStaffEntryRole } from '../../../shared/staffLogin';
import {
  AuthRequest,
  DemoLoginRequest,
  EmailAuthRequest,
  PasswordRecoveryRequest,
  PasswordResetConfirmRequest,
  type PasswordResetConfirmResponse,
  type PasswordRecoveryResponse,
} from '../../../contracts/storage';
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
import { handlePasswordResetConfirm } from '../password-reset-actions';
import { assertSameOriginMutation } from '../request-guards';
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
    uid?: string;
    displayName?: string;
    grade?: string;
    englishLevel?: string;
    studyMode?: string;
    diagnosticDeferredAt?: number;
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
  const loginEntry = (body as EmailAuthRequest & { loginEntry?: unknown }).loginEntry;
  if (loginEntry !== undefined && !isStaffLoginEntry(loginEntry)) {
    throw new HttpError(400, 'ログイン入口が正しくありません。');
  }
  if (body.isSignUp && loginEntry !== undefined) {
    throw new HttpError(400, '講師・管理者の入口からアカウントを登録することはできません。');
  }
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
  const existing = isStaffLoginEntry(loginEntry)
    ? await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DbUserRow>()
    : await findUserByEmail(env, email);
  if (!existing || !(await verifyPassword(password, existing.password_hash))) {
    await recordAuthFailure(env, authScopeKey);
    throw new HttpError(401, 'メールアドレスまたはパスワードが間違っています。');
  }

  let authenticatedUser = existing;
  if (isStaffLoginEntry(loginEntry)) {
    const denied = () => new HttpError(403, 'このログイン入口を利用する権限がありません。正しい入口をご確認ください。');
    if (loginEntry === 'service-admin') {
      if (!matchesStaffEntryRole(loginEntry, mapUserRowToProfile(existing))) throw denied();
    } else {
      // Membership is authoritative; stale user shadow columns cannot authorize entry.
      if (existing.role !== UserRole.INSTRUCTOR) throw denied();
      const membership = await env.DB.prepare(`
        SELECT o.id AS organization_id, o.display_name AS organization_name,
               o.subscription_plan AS subscription_plan, m.role AS organization_role
          FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
         WHERE m.user_id = ? AND m.status = 'ACTIVE' AND o.status = 'ACTIVE'
         LIMIT 1
      `).bind(existing.id).first<Pick<DbUserRow, 'organization_id' | 'organization_name' | 'subscription_plan' | 'organization_role'>>();
      if (!membership) throw denied();
      authenticatedUser = { ...existing, ...membership };
      if (!matchesStaffEntryRole(loginEntry, mapUserRowToProfile(authenticatedUser))) throw denied();
      // An active student membership never supplies instructor permission.
      if (membership.organization_role !== 'INSTRUCTOR' && membership.organization_role !== 'GROUP_ADMIN') throw denied();
    }
  }
  await clearAuthFailures(env, authScopeKey);
  const sessionCookie = await createSession(env, request, existing.id);

  return {
    response: createJsonResponse(mapUserRowToProfile(authenticatedUser), {
      headers: { 'Set-Cookie': sessionCookie },
    }),
  };
};

const normalizeRecoverySource = (value: unknown): string => (
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 80)
    : 'login'
);

const handlePasswordRecoveryRequest = async (
  context: Parameters<ApiRouteDefinition['handle']>[0],
  body: PasswordRecoveryRequest,
): Promise<ApiRouteResult> => {
  const { env, request } = context;
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new HttpError(400, '再設定に使うメールアドレスを入力してください。');
  }

  const authScopeKey = createAuthAttemptScopeKey(request, 'password-recovery', email);
  await assertAuthAttemptAllowed(env, authScopeKey);

  const existing = await findUserByEmail(env, email);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO auth_recovery_requests (
      email,
      has_matching_user,
      status,
      source,
      created_at,
      updated_at
    ) VALUES (?, ?, 'OPEN', ?, ?, ?)
  `).bind(
    email,
    existing ? 1 : 0,
    normalizeRecoverySource(body.source),
    now,
    now,
  ).run();

  await recordAuthFailure(env, authScopeKey, now);

  const response: PasswordRecoveryResponse = {
    message: '再設定リクエストを受け付けました。登録済みのアカウントの場合、運営から再設定手順を案内します。',
    requestedAt: now,
  };

  return {
    response: createJsonResponse(response),
  };
};

const handlePasswordResetConfirmRequest = async (
  context: Parameters<ApiRouteDefinition['handle']>[0],
  body: PasswordResetConfirmRequest,
): Promise<ApiRouteResult> => {
  const response: PasswordResetConfirmResponse = await handlePasswordResetConfirm(context.env, body);
  return {
    response: createJsonResponse(response),
  };
};

const handleProfileUpdate = async (
  context: Parameters<ApiRouteDefinition['handle']>[0],
  currentUser: DbUserRow,
): Promise<ApiRouteResult> => {
  const { env, request } = context;
  const body = await readJson<ProfileBody>(request);
  const nextUser = body.user || {};
  // Existing cloud clients send the complete profile. Keep legacy payloads
  // compatible while preventing another tab's cookie switch from changing the
  // account this user explicitly chose to update.
  if (nextUser.uid !== undefined && nextUser.uid !== currentUser.id) {
    throw new HttpError(409, 'ログイン中のアカウントが変わりました。ご本人のアカウントで再試行してください。');
  }
  if (nextUser.diagnosticDeferredAt !== undefined && (
    currentUser.role !== UserRole.STUDENT
    || !Number.isSafeInteger(nextUser.diagnosticDeferredAt)
    || nextUser.diagnosticDeferredAt <= 0
  )) {
    throw new HttpError(400, '診断を後で行う設定が正しくありません。');
  }
  // The marker is a choice, not a client-issued diagnostic level or timestamp.
  // Ordinary updates and completed diagnostics preserve the stored choice.
  const nextDiagnosticDeferredAt = currentUser.diagnostic_deferred_at
    || (nextUser.diagnosticDeferredAt !== undefined ? Date.now() : null);
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
    SET display_name = ?, grade = ?, english_level = ?, study_mode = ?, diagnostic_deferred_at = COALESCE(diagnostic_deferred_at, ?),
        updated_at = ?
    WHERE id = ?
  `).bind(
    nextDisplayName,
    nextGrade,
    nextEnglishLevel,
    nextStudyMode,
    nextDiagnosticDeferredAt,
    Date.now(),
    currentUser.id,
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(currentUser.id).first<DbUserRow>();
  return {
    logUser: currentUser,
    response: createJsonResponse(mapUserRowToProfile(updated)),
  };
};

export const authProfileRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'auth' && request.method === 'POST',
    handle: async (context) => {
      assertSameOriginMutation(context.request);
      const body = await readJson<AuthRequest>(context.request);
      if (body.action === 'demo-login') {
        return handleDemoLogin(context, body);
      }
      if (body.action === 'email-auth') {
        return handleEmailAuth(context, body);
      }
      if (body.action === 'password-recovery-request') {
        return handlePasswordRecoveryRequest(context, body);
      }
      if (body.action === 'password-reset-confirm') {
        return handlePasswordResetConfirmRequest(context, body);
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
      assertSameOriginMutation(request);
      const cookie = await clearSession(env, request);
      return {
        response: noContent({ headers: { 'Set-Cookie': cookie } }),
      };
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'profile' && request.method === 'POST',
    handle: async (context) => {
      assertSameOriginMutation(context.request);
      const user = await requireUser(context.env, context.request);
      return handleProfileUpdate(context, user);
    },
  },
];
