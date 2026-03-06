import { EnglishLevel, OrganizationRole, SubscriptionPlan, UserGrade, UserProfile, UserRole, UserStats, UserStudyMode } from '../../types';
import { getRelativeDateKey, getTodayDateKey } from '../../utils/date';
import { HttpError } from './http';
import { AppEnv, DbUserRow } from './types';

const SESSION_COOKIE_NAME = 'medace_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100000;

const todayString = (): string => getTodayDateKey();

const getYesterdayString = (): string => getRelativeDateKey(-1);

const encodeBase64 = (value: ArrayBuffer | Uint8Array): string => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Buffer.from(bytes).toString('base64');
};

const decodeBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'));

const parseCookies = (request: Request): Record<string, string> => {
  const header = request.headers.get('Cookie') || '';
  return Object.fromEntries(
    header
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const [key, ...rest] = part.split('=');
        return [key, decodeURIComponent(rest.join('='))];
      })
  );
};

const buildCookie = (request: Request, token: string, maxAgeSeconds: number): string => {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
};

const normalizeStats = (row: DbUserRow): UserStats => ({
  xp: row.stats_xp ?? 0,
  level: row.stats_level ?? 1,
  currentStreak: row.stats_current_streak ?? 0,
  lastLoginDate: row.stats_last_login_date || '',
});

const updateStreak = (stats: UserStats): UserStats => {
  const today = todayString();
  if (stats.lastLoginDate === today) {
    return stats;
  }

  const yesterday = getYesterdayString();
  const nextStreak = stats.lastLoginDate === yesterday ? stats.currentStreak + 1 : 1;
  return {
    ...stats,
    currentStreak: nextStreak,
    lastLoginDate: today,
  };
};

const resolveOrganizationRole = (row: Pick<DbUserRow, 'role' | 'subscription_plan' | 'organization_name' | 'organization_role'>): OrganizationRole | undefined => {
  if (row.organization_role) {
    return row.organization_role as OrganizationRole;
  }

  const plan = (row.subscription_plan as SubscriptionPlan | null) || SubscriptionPlan.TOC_FREE;
  if (!row.organization_name || (plan !== SubscriptionPlan.TOB_FREE && plan !== SubscriptionPlan.TOB_PAID)) {
    return undefined;
  }

  if (row.role === UserRole.INSTRUCTOR) return OrganizationRole.INSTRUCTOR;
  if (row.role === UserRole.STUDENT) return OrganizationRole.STUDENT;
  return undefined;
};

export const mapUserRowToProfile = (row: DbUserRow): UserProfile => ({
  uid: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role as UserRole,
  organizationRole: resolveOrganizationRole(row),
  grade: row.grade as UserGrade | undefined,
  englishLevel: row.english_level as EnglishLevel | undefined,
  subscriptionPlan: (row.subscription_plan as SubscriptionPlan | null) || SubscriptionPlan.TOC_FREE,
  organizationName: row.organization_name || undefined,
  studyMode: (row.study_mode as UserStudyMode | null) || UserStudyMode.FOCUS,
  needsOnboarding: row.role === UserRole.STUDENT && !row.english_level,
  stats: normalizeStats(row),
});

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256
  );

  return `pbkdf2$${PBKDF2_ITERATIONS}$${encodeBase64(salt)}$${encodeBase64(bits)}`;
};

export const verifyPassword = async (password: string, storedHash: string | null): Promise<boolean> => {
  if (!storedHash) return false;

  const [scheme, iterationsValue, saltValue, hashValue] = storedHash.split('$');
  if (scheme !== 'pbkdf2' || !iterationsValue || !saltValue || !hashValue) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: decodeBase64(saltValue),
      iterations: Number(iterationsValue),
    },
    key,
    256
  );

  return encodeBase64(bits) === hashValue;
};

export const findUserByEmail = async (env: AppEnv, email: string): Promise<DbUserRow | null> => {
  return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() as Promise<DbUserRow | null>;
};

export const findUserById = async (env: AppEnv, userId: string): Promise<DbUserRow | null> => {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first() as Promise<DbUserRow | null>;
};

export const createUser = async (
  env: AppEnv,
  input: {
    email: string;
    passwordHash: string | null;
    displayName: string;
    role: UserRole;
    organizationRole?: OrganizationRole;
    grade?: UserGrade;
    englishLevel?: EnglishLevel;
    subscriptionPlan?: SubscriptionPlan;
    organizationName?: string;
  }
): Promise<DbUserRow> => {
  const now = Date.now();
  const userId = crypto.randomUUID();
  const stats = {
    xp: 0,
    level: 1,
    currentStreak: 1,
    lastLoginDate: todayString(),
  };

  await env.DB.prepare(`
    INSERT INTO users (
      id, email, password_hash, display_name, role, grade, english_level, subscription_plan, organization_name, organization_role,
      stats_xp, stats_level, stats_current_streak, stats_last_login_date,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    input.email,
    input.passwordHash,
    input.displayName,
    input.role,
    input.grade || null,
    input.englishLevel || null,
    input.subscriptionPlan || SubscriptionPlan.TOC_FREE,
    input.organizationName || null,
    input.organizationRole || null,
    stats.xp,
    stats.level,
    stats.currentStreak,
    stats.lastLoginDate,
    now,
    now
  ).run();

  const user = await findUserById(env, userId);
  if (!user) throw new HttpError(500, 'ユーザー作成後の取得に失敗しました。');
  return user;
};

export const touchUserStreak = async (env: AppEnv, row: DbUserRow): Promise<DbUserRow> => {
  const nextStats = updateStreak(normalizeStats(row));
  const currentStats = normalizeStats(row);

  if (
    nextStats.currentStreak === currentStats.currentStreak &&
    nextStats.lastLoginDate === currentStats.lastLoginDate
  ) {
    return row;
  }

  await env.DB.prepare(`
    UPDATE users
    SET stats_current_streak = ?, stats_last_login_date = ?, updated_at = ?
    WHERE id = ?
  `).bind(nextStats.currentStreak, nextStats.lastLoginDate, Date.now(), row.id).run();

  const updated = await findUserById(env, row.id);
  if (!updated) throw new HttpError(500, 'ユーザー更新後の取得に失敗しました。');
  return updated;
};

export const createSession = async (env: AppEnv, request: Request, userId: string): Promise<string> => {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;

  await env.DB.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(token, userId, expiresAt, Date.now()).run();

  return buildCookie(request, token, Math.floor(SESSION_TTL_MS / 1000));
};

export const clearSession = async (env: AppEnv, request: Request): Promise<string> => {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }

  return buildCookie(request, '', 0);
};

export const getSessionUser = async (env: AppEnv, request: Request): Promise<DbUserRow | null> => {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const row = await env.DB.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).bind(token, Date.now()).first() as DbUserRow | null;

  if (!row) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }

  return touchUserStreak(env, row);
};

export const requireUser = async (env: AppEnv, request: Request): Promise<DbUserRow> => {
  const user = await getSessionUser(env, request);
  if (!user) {
    throw new HttpError(401, 'ログインが必要です。');
  }
  return user;
};

export const requireRole = (row: DbUserRow, roles: UserRole[]): void => {
  if (!roles.includes(row.role as UserRole)) {
    throw new HttpError(403, 'この操作を実行する権限がありません。');
  }
};

export const requireOrganizationRole = (row: DbUserRow, roles: OrganizationRole[]): void => {
  const organizationRole = resolveOrganizationRole(row);
  if (!organizationRole || !roles.includes(organizationRole)) {
    throw new HttpError(403, 'この組織操作を実行する権限がありません。');
  }
};

export const ensureDemoUser = async (env: AppEnv, role: UserRole, organizationRole?: OrganizationRole): Promise<DbUserRow> => {
  const demoKey = organizationRole ? organizationRole.toLowerCase() : role.toLowerCase();
  const email = `demo_${demoKey}@medace.app`;
  const displayName =
    role === UserRole.ADMIN
      ? 'システム管理者 (Demo)'
      : organizationRole === OrganizationRole.GROUP_ADMIN
        ? '朝比奈 由奈 (グループ管理者 Demo)'
        : organizationRole === OrganizationRole.INSTRUCTOR
          ? 'Oak 先生 (グループ講師 Demo)'
          : organizationRole === OrganizationRole.STUDENT
            ? '黒田 颯太 (グループ生徒 Demo)'
            : '鈴木 健太 (フリー Demo)';

  const existing = await findUserByEmail(env, email);
  if (existing) return existing;

  const passwordHash = await hashPassword(`demo-${role.toLowerCase()}-${crypto.randomUUID()}`);
  return createUser(env, {
    email,
    passwordHash,
    displayName,
    role,
    organizationRole,
    subscriptionPlan:
      organizationRole
        ? SubscriptionPlan.TOB_PAID
        : role === UserRole.STUDENT
        ? SubscriptionPlan.TOC_FREE
        : SubscriptionPlan.TOB_PAID,
    organizationName:
      role === UserRole.ADMIN
        ? 'Steady Study HQ'
        : organizationRole
          ? 'Steady Study Demo Academy'
          : undefined,
  });
};
