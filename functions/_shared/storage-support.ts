import {
  BookAccessScope,
  BookCatalogSource,
  BookMetadata,
  BookProgress,
  LearningHistory,
  LearningPreference,
  LearningPreferenceIntensity,
  OrganizationRole,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserRole,
  WordData,
} from '../../types';
import { formatDateKey, formatMonthKey, getTodayDateKey, shiftDateKey } from '../../utils/date';
import { isDemoEmail } from '../../utils/demo';
import { canAccessOfficialBook as canAccessOfficialBookForPlan, normalizeOfficialBookText } from '../../utils/bookAccess';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

export const DAY_MS = 86400000;
export const WORKSHEET_STATUSES: Array<StudentWorksheetSnapshot['words'][number]['status']> = ['graduated', 'review', 'learning'];
export const FALLBACK_WORKSHEET_WORD_LIMIT = 40;

export interface DbBookRow {
  id: string;
  title: string;
  word_count: number;
  is_priority: number;
  description: string | null;
  source_context: string | null;
  created_by: string | null;
  catalog_source: string | null;
  access_scope: string | null;
}

export interface DbWordRow {
  id: string;
  book_id: string;
  word_number: number;
  word: string;
  definition: string;
  search_key: string | null;
  example_sentence: string | null;
  example_meaning: string | null;
  is_reported: number;
}

export interface DbHistoryRow {
  user_id: string;
  word_id: string;
  book_id: string;
  status: LearningHistory['status'];
  last_studied_at: number;
  next_review_date: number;
  interval_days: number;
  ease_factor: number;
  correct_count: number;
  attempt_count: number;
  total_response_time_ms: number;
  interaction_source: LearningHistory['interactionSource'] | null;
}

export interface DbLearningPreferenceRow {
  user_id: string;
  target_exam: string | null;
  target_score: string | null;
  exam_date: string | null;
  weekly_study_days: number | null;
  daily_study_minutes: number | null;
  weak_skill_focus: string | null;
  motivation_note: string | null;
  intensity: string | null;
  updated_at: number;
}

export interface DbAssignmentEventRow {
  id: number;
  student_uid: string;
  student_name: string;
  previous_instructor_uid: string | null;
  previous_instructor_name: string | null;
  next_instructor_uid: string | null;
  next_instructor_name: string | null;
  changed_by_uid: string;
  changed_by_name: string;
  created_at: number;
}

const BOOK_LIST_SQL = 'SELECT * FROM books ORDER BY (created_by IS NOT NULL) ASC, is_priority DESC, title ASC';

const slugifySegment = (value: string): string => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')
  .slice(0, 48);

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const calculatePercentage = (learned: number, total: number): number => {
  if (total === 0 || learned === 0) return 0;
  if (learned === total) return 100;

  const pct = Math.round((learned / total) * 100);
  if (pct === 0 && learned > 0) return 1;
  if (pct === 100 && learned < total) return 99;
  return pct;
};

export const createBookId = (bookName: string, ownerId?: string, uniqueSalt?: string): string => {
  const slug = slugifySegment(bookName) || 'book';
  const ownerSegment = ownerId ? `${ownerId.slice(0, 8)}-` : '';
  const suffix = hashString(`${ownerId || 'official'}:${bookName}:${uniqueSalt || ''}`);
  return `${ownerSegment}${slug}-${suffix}`;
};

export const toBookMetadata = (row: DbBookRow): BookMetadata => ({
  id: row.id,
  title: row.title,
  wordCount: row.word_count,
  isPriority: Boolean(row.is_priority),
  description: normalizeOfficialBookText(row.description),
  sourceContext: normalizeOfficialBookText(row.source_context),
  catalogSource: (row.catalog_source as BookCatalogSource | null) || (row.created_by ? BookCatalogSource.USER_GENERATED : BookCatalogSource.LICENSED_PARTNER),
  accessScope: (row.access_scope as BookAccessScope | null) || (row.created_by ? BookAccessScope.ALL_PLANS : BookAccessScope.BUSINESS_ONLY),
});

export const toWordData = (row: DbWordRow): WordData => ({
  id: row.id,
  bookId: row.book_id,
  number: row.word_number,
  word: row.word,
  definition: row.definition,
  searchKey: row.search_key || undefined,
  exampleSentence: row.example_sentence,
  exampleMeaning: row.example_meaning,
  isReported: Boolean(row.is_reported),
});

export const normalizeHistoryStatus = (interval: number): LearningHistory['status'] => {
  if (interval > 20) return 'graduated';
  if (interval > 3) return 'review';
  return 'learning';
};

export const readAll = async <TRow>(env: AppEnv, sql: string, ...bindings: unknown[]): Promise<TRow[]> => {
  const result = await env.DB.prepare(sql).bind(...bindings).all();
  return (result.results || []) as TRow[];
};

export const readFirst = async <TRow>(env: AppEnv, sql: string, ...bindings: unknown[]): Promise<TRow | null> => {
  return env.DB.prepare(sql).bind(...bindings).first() as Promise<TRow | null>;
};

export const currentMonthKey = (): string => formatMonthKey(new Date());

export const toTokyoDateKey = (timestamp: number): string => formatDateKey(timestamp);

export const getLastTokyoDateKeys = (days: number): string[] => {
  const keys: string[] = [];
  const baseKey = getTodayDateKey();
  for (let index = days - 1; index >= 0; index -= 1) {
    keys.push(shiftDateKey(baseKey, -index));
  }
  return keys;
};

export const isPaidPlan = (plan: SubscriptionPlan | undefined): boolean => (
  plan === SubscriptionPlan.TOC_PAID || plan === SubscriptionPlan.TOB_PAID
);

export const getUserSubscriptionPlan = (user: DbUserRow): SubscriptionPlan => (
  (user.subscription_plan as SubscriptionPlan | null) || SubscriptionPlan.TOC_FREE
);

export const getUserOrganizationRole = (user: DbUserRow): OrganizationRole | undefined => {
  if (user.organization_role) {
    return user.organization_role as OrganizationRole;
  }

  const plan = getUserSubscriptionPlan(user);
  if (!user.organization_name || (plan !== SubscriptionPlan.TOB_FREE && plan !== SubscriptionPlan.TOB_PAID)) {
    return undefined;
  }

  if (user.role === UserRole.INSTRUCTOR) return OrganizationRole.INSTRUCTOR;
  if (user.role === UserRole.STUDENT) return OrganizationRole.STUDENT;
  return undefined;
};

export const canBypassInstructorAssignment = (user: Pick<DbUserRow, 'role' | 'organization_role' | 'email'>): boolean => {
  if (user.role === UserRole.ADMIN) return true;
  if (user.organization_role === OrganizationRole.GROUP_ADMIN) return true;
  return user.role === UserRole.INSTRUCTOR
    && user.organization_role === OrganizationRole.INSTRUCTOR
    && isDemoEmail(user.email);
};

export const canAccessOfficialBook = (user: DbUserRow, book: BookMetadata): boolean => (
  canAccessOfficialBookForPlan(getUserSubscriptionPlan(user), book)
);

export const getVisibleBookRows = (user: DbUserRow, rows: DbBookRow[]): DbBookRow[] => {
  if (user.role === UserRole.ADMIN) return rows;
  return rows.filter((row) => row.created_by === user.id || canAccessOfficialBook(user, toBookMetadata(row)));
};

export const readVisibleBookRows = async (env: AppEnv, user: DbUserRow): Promise<DbBookRow[]> => {
  const rows = await readAll<DbBookRow>(env, BOOK_LIST_SQL);
  return getVisibleBookRows(user, rows);
};

export const buildInClause = (count: number): string => Array.from({ length: count }, () => '?').join(', ');

export const getVisibleBookIds = async (env: AppEnv, user: DbUserRow): Promise<string[]> => {
  const rows = await readVisibleBookRows(env, user);
  return rows.map((row) => row.id);
};

export const getVisibleDueCount = async (env: AppEnv, user: DbUserRow): Promise<number> => {
  const bookIds = await getVisibleBookIds(env, user);
  if (bookIds.length === 0) return 0;

  const row = await readFirst<{ count: number }>(
    env,
    `SELECT COUNT(*) AS count
     FROM learning_histories
     WHERE user_id = ? AND next_review_date <= ? AND status != 'graduated'
       AND book_id IN (${buildInClause(bookIds.length)})`,
    user.id,
    Date.now(),
    ...bookIds,
  );

  return Number(row?.count || 0);
};

export const defaultLearningPreference = (userId: string): LearningPreference => ({
  userUid: userId,
  targetExam: '',
  targetScore: '',
  examDate: '',
  weeklyStudyDays: 4,
  dailyStudyMinutes: 20,
  weakSkillFocus: '',
  motivationNote: '',
  intensity: LearningPreferenceIntensity.BALANCED,
  updatedAt: Date.now(),
});

export const getBookOwnership = async (env: AppEnv, bookId: string): Promise<{ id: string; created_by: string | null; } | null> => (
  readFirst<{ id: string; created_by: string | null; }>(env, 'SELECT id, created_by FROM books WHERE id = ?', bookId)
);

export const getBookRow = async (env: AppEnv, bookId: string): Promise<DbBookRow | null> => (
  readFirst<DbBookRow>(env, 'SELECT * FROM books WHERE id = ?', bookId)
);

export const assertBookReadAccess = async (env: AppEnv, user: DbUserRow, bookId: string): Promise<void> => {
  const row = await getBookRow(env, bookId);
  if (!row) throw new HttpError(404, '単語帳が見つかりません。');

  if (row.created_by === user.id || user.role === UserRole.ADMIN) {
    return;
  }

  if (!canAccessOfficialBook(user, toBookMetadata(row))) {
    throw new HttpError(403, 'このプランでは対象教材を利用できません。');
  }
};

export const assertBookWriteAccess = async (env: AppEnv, user: DbUserRow, bookId: string): Promise<void> => {
  const book = await getBookOwnership(env, bookId);
  if (!book) throw new HttpError(404, '単語帳が見つかりません。');

  const isOwner = book.created_by === user.id;
  if (!isOwner && user.role !== UserRole.ADMIN) {
    throw new HttpError(403, 'この単語帳を編集できません。');
  }
};

export const getBookProgress = async (env: AppEnv, userId: string, bookId: string): Promise<BookProgress> => {
  const totalRow = await readFirst<{ total: number }>(env, 'SELECT COUNT(*) AS total FROM words WHERE book_id = ?', bookId);
  const learnedRow = await readFirst<{ learned: number }>(
    env,
    `SELECT COUNT(*) AS learned
     FROM learning_histories
     WHERE user_id = ? AND book_id = ? AND (attempt_count > 0 OR interval_days > 0)`,
    userId,
    bookId,
  );

  const totalCount = Number(totalRow?.total || 0);
  const learnedCount = Number(learnedRow?.learned || 0);

  return {
    bookId,
    learnedCount,
    totalCount,
    percentage: calculatePercentage(learnedCount, totalCount),
  };
};

export const ensurePositiveLimit = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
};
