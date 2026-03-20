import { EnglishLevel, OrganizationRole, SubscriptionPlan, UserGrade, UserProfile, UserRole, UserStats, UserStudyMode } from '../../types';
import { getRelativeDateKey, getTodayDateKey } from '../../utils/date';
import { buildDemoEmail, DEMO_RETENTION_TTL_MS, getDemoDisplayName } from '../../utils/demo';
import { HttpError } from './http';
import {
  hydrateUserOrganizationFromMembership,
  isBusinessSubscriptionPlan,
  maybeSyncBusinessMembershipFromUser,
  resolveOrCreateOrganization,
  upsertActiveOrganizationMembership,
} from './organization-memberships';
import { AppEnv, DbUserRow } from './types';

const SESSION_COOKIE_NAME = 'medace_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100000;
const DAY_MS = 86400000;
const SESSION_TOKEN_DELIMITER = '.';
const DEMO_ORGANIZATION_NAME = 'Steady Study Demo Academy';
const DEMO_ORGANIZATION_STAFF: Array<{
  email: string;
  displayName: string;
  role: UserRole;
  organizationRole: OrganizationRole;
}> = [
  {
    email: 'shiina@demo-school.jp',
    displayName: '椎名 先生',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.INSTRUCTOR,
  },
];

const DEMO_ORGANIZATION_STUDENTS: Array<{
  email: string;
  displayName: string;
  grade: UserGrade;
  englishLevel: EnglishLevel;
  daysSinceActive: number;
  attemptBase: number;
  correctOffset: number;
  hasLearningPlan: boolean;
}> = [
  {
    email: 'sota@demo-school.jp',
    displayName: '黒田 颯太',
    grade: UserGrade.JHS3,
    englishLevel: EnglishLevel.B1,
    daysSinceActive: 1,
    attemptBase: 4,
    correctOffset: 1,
    hasLearningPlan: true,
  },
  {
    email: 'hina@demo-school.jp',
    displayName: '田中 陽葵',
    grade: UserGrade.JHS2,
    englishLevel: EnglishLevel.A2,
    daysSinceActive: 4,
    attemptBase: 3,
    correctOffset: 2,
    hasLearningPlan: false,
  },
  {
    email: 'yuzuki@demo-school.jp',
    displayName: '森 結月',
    grade: UserGrade.SHS1,
    englishLevel: EnglishLevel.B2,
    daysSinceActive: 0,
    attemptBase: 5,
    correctOffset: 0,
    hasLearningPlan: true,
  },
];

const todayString = (): string => getTodayDateKey();

const getYesterdayString = (): string => getRelativeDateKey(-1);

const bytesToBinary = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return binary;
};

const encodeBase64 = (value: ArrayBuffer | Uint8Array): string => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(bytesToBinary(bytes));
};

const decodeBase64 = (value: string): Uint8Array => (
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
);

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

const hashSessionToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return encodeBase64(digest);
};

const parseSessionCredential = (
  value: string | undefined,
): { sessionId: string; rawToken: string; isLegacy: boolean } | null => {
  if (!value) return null;

  const delimiterIndex = value.indexOf(SESSION_TOKEN_DELIMITER);
  if (delimiterIndex === -1) {
    return {
      sessionId: value,
      rawToken: value,
      isLegacy: true,
    };
  }

  const sessionId = value.slice(0, delimiterIndex);
  const secret = value.slice(delimiterIndex + 1);
  if (!sessionId || !secret) {
    return {
      sessionId: value,
      rawToken: value,
      isLegacy: true,
    };
  }

  return {
    sessionId,
    rawToken: value,
    isLegacy: false,
  };
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

const resolveOrganizationRole = (
  row: Pick<DbUserRow, 'organization_role'>,
): OrganizationRole | undefined => (
  row.organization_role
    ? row.organization_role as OrganizationRole
    : undefined
);

export const mapUserRowToProfile = (row: DbUserRow): UserProfile => ({
  uid: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role as UserRole,
  organizationId: row.organization_id || undefined,
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
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DbUserRow>();
  if (!row) return null;
  await maybeSyncBusinessMembershipFromUser(env, row);
  return hydrateUserOrganizationFromMembership(env, row);
};

export const findUserById = async (env: AppEnv, userId: string): Promise<DbUserRow | null> => {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUserRow>();
  if (!row) return null;
  await maybeSyncBusinessMembershipFromUser(env, row);
  return hydrateUserOrganizationFromMembership(env, row);
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
  const subscriptionPlan = input.subscriptionPlan || SubscriptionPlan.TOC_FREE;
  const shouldCreateBusinessMembership = Boolean(
    input.organizationName
    && input.organizationRole
    && input.role !== UserRole.ADMIN
    && isBusinessSubscriptionPlan(subscriptionPlan)
  );
  const organization = shouldCreateBusinessMembership
    ? await resolveOrCreateOrganization(env, {
        targetOrganizationName: input.organizationName,
        subscriptionPlan,
      })
    : null;
  const stats = {
    xp: 0,
    level: 1,
    currentStreak: 1,
    lastLoginDate: todayString(),
  };

  await env.DB.prepare(`
    INSERT INTO users (
      id, email, password_hash, display_name, role, grade, english_level, subscription_plan, organization_id, organization_name, organization_role,
      stats_xp, stats_level, stats_current_streak, stats_last_login_date,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    input.email,
    input.passwordHash,
    input.displayName,
    input.role,
    input.grade || null,
    input.englishLevel || null,
    subscriptionPlan,
    organization?.id || null,
    organization?.display_name || input.organizationName || null,
    input.organizationRole || null,
    stats.xp,
    stats.level,
    stats.currentStreak,
    stats.lastLoginDate,
    now,
    now
  ).run();

  if (organization && input.organizationRole) {
    await upsertActiveOrganizationMembership(env, {
      userId,
      organizationId: organization.id,
      organizationRole: input.organizationRole,
      subscriptionPlan,
    });
  }

  const user = await findUserById(env, userId);
  if (!user) throw new HttpError(500, 'ユーザー作成後の取得に失敗しました。');
  return user;
};

const ensureDemoOrganizationSeed = async (env: AppEnv, organizationName?: string): Promise<void> => {
  if (organizationName !== DEMO_ORGANIZATION_NAME) return;

  const now = Date.now();
  const seededStudents: DbUserRow[] = [];

  for (const staff of DEMO_ORGANIZATION_STAFF) {
    const existing = await findUserByEmail(env, staff.email);
    if (existing) continue;
    await createUser(env, {
      email: staff.email,
      passwordHash: null,
      displayName: staff.displayName,
      role: staff.role,
      organizationRole: staff.organizationRole,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationName,
    });
  }

  for (const config of DEMO_ORGANIZATION_STUDENTS) {
    const existing = await findUserByEmail(env, config.email);
    if (existing) {
      seededStudents.push(existing);
      continue;
    }

    const created = await createUser(env, {
      email: config.email,
      passwordHash: null,
      displayName: config.displayName,
      role: UserRole.STUDENT,
      organizationRole: OrganizationRole.STUDENT,
      grade: config.grade,
      englishLevel: config.englishLevel,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationName,
    });
    seededStudents.push(created);
  }

  const wordResult = await env.DB.prepare(`
    SELECT
      w.id AS word_id,
      w.book_id AS book_id
    FROM words w
    JOIN books b ON b.id = w.book_id
    WHERE b.created_by IS NULL
    ORDER BY b.is_priority DESC, b.title ASC, w.word_number ASC
    LIMIT 48
  `).all();

  const seededWords = ((wordResult?.results as Array<{ word_id: string; book_id: string }> | undefined) || []);
  if (seededWords.length === 0) return;

  for (const [studentIndex, student] of seededStudents.entries()) {
    const config = DEMO_ORGANIZATION_STUDENTS[studentIndex];
    const studentWords = seededWords.slice(studentIndex * 12, studentIndex * 12 + 12);
    const planBookIds = Array.from(new Set(studentWords.map((row) => row.book_id))).slice(0, 3);

    for (const [wordIndex, word] of studentWords.entries()) {
      const attemptCount = config.attemptBase + (wordIndex % 3);
      const correctCount = Math.max(1, attemptCount - config.correctOffset - (wordIndex % 2 === 0 ? 0 : 1));
      const status =
        config.daysSinceActive === 0
          ? (wordIndex % 4 === 0 ? 'graduated' : 'review')
          : config.daysSinceActive >= 4
            ? (wordIndex % 3 === 0 ? 'learning' : 'review')
            : (wordIndex % 5 === 0 ? 'graduated' : 'review');
      const intervalDays = status === 'graduated' ? 14 : status === 'review' ? 6 : 2;
      const lastStudiedAt = now - (config.daysSinceActive * DAY_MS) - wordIndex * 45 * 60 * 1000;
      const nextReviewDate = lastStudiedAt + intervalDays * DAY_MS;

      await env.DB.prepare(`
        INSERT INTO learning_histories (
          user_id, word_id, book_id, status, last_studied_at, next_review_date,
          interval_days, ease_factor, correct_count, attempt_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, word_id) DO UPDATE SET
          book_id = excluded.book_id,
          status = excluded.status,
          last_studied_at = excluded.last_studied_at,
          next_review_date = excluded.next_review_date,
          interval_days = excluded.interval_days,
          ease_factor = excluded.ease_factor,
          correct_count = excluded.correct_count,
          attempt_count = excluded.attempt_count
      `).bind(
        student.id,
        word.word_id,
        word.book_id,
        status,
        lastStudiedAt,
        nextReviewDate,
        intervalDays,
        2.5,
        correctCount,
        attemptCount
      ).run();
    }

    if (config.hasLearningPlan && planBookIds.length > 0) {
      await env.DB.prepare(`
        INSERT INTO learning_plans (
          user_id, created_at, target_date, goal_description, daily_word_goal, selected_book_ids, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          created_at = excluded.created_at,
          target_date = excluded.target_date,
          goal_description = excluded.goal_description,
          daily_word_goal = excluded.daily_word_goal,
          selected_book_ids = excluded.selected_book_ids,
          status = excluded.status,
          updated_at = excluded.updated_at
      `).bind(
        student.id,
        now - DAY_MS,
        getRelativeDateKey(45),
        '体験デモ用の標準学習プラン',
        config.daysSinceActive === 0 ? 14 : 12,
        JSON.stringify(planBookIds),
        'ACTIVE',
        now
      ).run();
    } else {
      await env.DB.prepare('DELETE FROM learning_plans WHERE user_id = ?').bind(student.id).run();
    }
  }
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

const deleteExpiredSessions = async (env: AppEnv): Promise<void> => {
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()).run();
};

export const createSession = async (
  env: AppEnv,
  request: Request,
  userId: string,
  ttlMs: number = SESSION_TTL_MS
): Promise<string> => {
  await deleteExpiredSessions(env);

  const sessionId = crypto.randomUUID();
  const sessionSecret = crypto.randomUUID();
  const token = `${sessionId}${SESSION_TOKEN_DELIMITER}${sessionSecret}`;
  const tokenHash = await hashSessionToken(token);
  const expiresAt = Date.now() + ttlMs;

  await env.DB.prepare(`
    INSERT INTO sessions (token, token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(sessionId, tokenHash, userId, expiresAt, Date.now()).run();

  return buildCookie(request, token, Math.floor(ttlMs / 1000));
};

export const clearSession = async (env: AppEnv, request: Request): Promise<string> => {
  const cookies = parseCookies(request);
  const credential = parseSessionCredential(cookies[SESSION_COOKIE_NAME]);
  if (credential) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(credential.sessionId).run();
  }

  return buildCookie(request, '', 0);
};

export const getSessionUser = async (env: AppEnv, request: Request): Promise<DbUserRow | null> => {
  const cookies = parseCookies(request);
  const credential = parseSessionCredential(cookies[SESSION_COOKIE_NAME]);
  if (!credential) return null;

  await deleteExpiredSessions(env);

  const row = await env.DB.prepare(`
    SELECT s.token_hash AS session_token_hash, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).bind(credential.sessionId, Date.now()).first() as (DbUserRow & { session_token_hash?: string | null }) | null;

  if (!row) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(credential.sessionId).run();
    return null;
  }

  if (!credential.isLegacy) {
    const expectedHash = row.session_token_hash;
    if (!expectedHash || expectedHash !== await hashSessionToken(credential.rawToken)) {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(credential.sessionId).run();
      return null;
    }
  }

  await maybeSyncBusinessMembershipFromUser(env, row);
  const hydrated = await hydrateUserOrganizationFromMembership(env, row);
  return touchUserStreak(env, hydrated);
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
  await deleteExpiredSessions(env);
  await env.DB.prepare(`
    DELETE FROM users
    WHERE email GLOB 'demo_*@medace.app'
      AND created_at < ?
  `).bind(Date.now() - DEMO_RETENTION_TTL_MS).run();

  const email = buildDemoEmail(role, organizationRole);
  const displayName = getDemoDisplayName(role, organizationRole);

  const passwordHash = await hashPassword(`demo-${role.toLowerCase()}-${crypto.randomUUID()}`);
  const created = await createUser(env, {
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
  await ensureDemoOrganizationSeed(env, created.organization_name || undefined);
  return created;
};
