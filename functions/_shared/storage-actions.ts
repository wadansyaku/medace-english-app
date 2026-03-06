import { AI_ACTION_ESTIMATES, getSubscriptionPolicy } from '../../config/subscription';
import { AccountOverview, ActivityLog, AdminAiActionSummary, AdminBookInsight, AdminDashboardSnapshot, AdminOrganizationInsight, AdminPlanBreakdownItem, AdminRiskBreakdownItem, AdminTrendPoint, AdminWordReportSummary, BookAccessScope, BookCatalogSource, BookMetadata, BookProgress, DashboardSnapshot, InstructorNotification, LeaderboardEntry, LearningHistory, LearningPlan, LearningPreference, LearningPreferenceIntensity, MasteryDistribution, OrganizationDashboardSnapshot, OrganizationInstructorSummary, OrganizationRole, StudentRiskLevel, StudentSummary, StudentWorksheetSnapshot, SubscriptionPlan, UserProfile, UserRole, WordData } from '../../types';
import { mapUserRowToProfile, requireOrganizationRole, requireRole } from './auth';
import { HttpError } from './http';
import { AppEnv, DbUserRow } from './types';

const DAY_MS = 86400000;
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

interface StorageRequestBody {
  action: string;
  payload?: any;
}

interface DbBookRow {
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

interface DbWordRow {
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

interface DbHistoryRow {
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
}

interface DbLearningPreferenceRow {
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

const createBookId = (bookName: string, ownerId?: string, uniqueSalt?: string): string => {
  const slug = slugifySegment(bookName) || 'book';
  const ownerSegment = ownerId ? `${ownerId.slice(0, 8)}-` : '';
  const suffix = hashString(`${ownerId || 'official'}:${bookName}:${uniqueSalt || ''}`);
  return `${ownerSegment}${slug}-${suffix}`;
};

const calculatePercentage = (learned: number, total: number): number => {
  if (total === 0 || learned === 0) return 0;
  if (learned === total) return 100;

  const pct = Math.round((learned / total) * 100);
  if (pct === 0 && learned > 0) return 1;
  if (pct === 100 && learned < total) return 99;
  return pct;
};

const toBookMetadata = (row: DbBookRow): BookMetadata => ({
  id: row.id,
  title: row.title,
  wordCount: row.word_count,
  isPriority: Boolean(row.is_priority),
  description: row.description || undefined,
  sourceContext: row.source_context || undefined,
  catalogSource: (row.catalog_source as BookCatalogSource | null) || (row.created_by ? BookCatalogSource.USER_GENERATED : BookCatalogSource.LICENSED_PARTNER),
  accessScope: (row.access_scope as BookAccessScope | null) || (row.created_by ? BookAccessScope.ALL_PLANS : BookAccessScope.BUSINESS_ONLY),
});

const toWordData = (row: DbWordRow): WordData => ({
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

const normalizeHistoryStatus = (interval: number): LearningHistory['status'] => {
  if (interval > 20) return 'graduated';
  if (interval > 3) return 'review';
  return 'learning';
};

const readAll = async <TRow>(env: AppEnv, sql: string, ...bindings: unknown[]): Promise<TRow[]> => {
  const result = await env.DB.prepare(sql).bind(...bindings).all();
  return (result.results || []) as TRow[];
};

const readFirst = async <TRow>(env: AppEnv, sql: string, ...bindings: unknown[]): Promise<TRow | null> => {
  return env.DB.prepare(sql).bind(...bindings).first() as Promise<TRow | null>;
};

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

const toTokyoDateKey = (timestamp: number): string => {
  return new Date(timestamp + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
};

const getLastTokyoDateKeys = (days: number): string[] => {
  const keys: string[] = [];
  const base = new Date(Date.now() + TOKYO_OFFSET_MS);
  for (let index = days - 1; index >= 0; index -= 1) {
    const current = new Date(base);
    current.setUTCDate(base.getUTCDate() - index);
    keys.push(current.toISOString().slice(0, 10));
  }
  return keys;
};

const isPaidPlan = (plan: SubscriptionPlan | undefined): boolean => {
  return plan === SubscriptionPlan.TOC_PAID || plan === SubscriptionPlan.TOB_PAID;
};

const isBusinessPaidPlan = (plan: SubscriptionPlan | undefined): boolean => {
  return plan === SubscriptionPlan.TOB_PAID;
};

const canAccessOfficialBook = (user: DbUserRow, book: BookMetadata): boolean => {
  if (book.catalogSource === BookCatalogSource.USER_GENERATED) return false;
  if ((book.accessScope || BookAccessScope.ALL_PLANS) === BookAccessScope.ALL_PLANS) return true;
  return isBusinessPaidPlan(getUserSubscriptionPlan(user));
};

const BOOK_LIST_SQL = 'SELECT * FROM books ORDER BY (created_by IS NOT NULL) ASC, is_priority DESC, title ASC';

const getVisibleBookRows = (user: DbUserRow, rows: DbBookRow[]): DbBookRow[] => {
  if (user.role === UserRole.ADMIN) return rows;
  return rows.filter((row) => row.created_by === user.id || canAccessOfficialBook(user, toBookMetadata(row)));
};

const readVisibleBookRows = async (env: AppEnv, user: DbUserRow): Promise<DbBookRow[]> => {
  const rows = await readAll<DbBookRow>(env, BOOK_LIST_SQL);
  return getVisibleBookRows(user, rows);
};

const buildInClause = (count: number): string => Array.from({ length: count }, () => '?').join(', ');

const getVisibleBookIds = async (env: AppEnv, user: DbUserRow): Promise<string[]> => {
  const rows = await readVisibleBookRows(env, user);
  return rows.map((row) => row.id);
};

const getVisibleDueCount = async (env: AppEnv, user: DbUserRow): Promise<number> => {
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
    ...bookIds
  );

  return Number(row?.count || 0);
};

const defaultLearningPreference = (userId: string): LearningPreference => ({
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

const getUserSubscriptionPlan = (user: DbUserRow): SubscriptionPlan => {
  return (user.subscription_plan as SubscriptionPlan | null) || SubscriptionPlan.TOC_FREE;
};

const getUserOrganizationRole = (user: DbUserRow): OrganizationRole | undefined => {
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

const getBookOwnership = async (env: AppEnv, bookId: string): Promise<{ id: string; created_by: string | null; } | null> => {
  return readFirst<{ id: string; created_by: string | null; }>(env, 'SELECT id, created_by FROM books WHERE id = ?', bookId);
};

const getBookRow = async (env: AppEnv, bookId: string): Promise<DbBookRow | null> => {
  return readFirst<DbBookRow>(env, 'SELECT * FROM books WHERE id = ?', bookId);
};

const assertBookReadAccess = async (env: AppEnv, user: DbUserRow, bookId: string): Promise<void> => {
  const row = await getBookRow(env, bookId);
  if (!row) throw new HttpError(404, '単語帳が見つかりません。');

  if (row.created_by === user.id || user.role === UserRole.ADMIN) {
    return;
  }

  if (!canAccessOfficialBook(user, toBookMetadata(row))) {
    throw new HttpError(403, 'このプランでは対象教材を利用できません。');
  }
};

const assertBookWriteAccess = async (env: AppEnv, user: DbUserRow, bookId: string): Promise<void> => {
  const book = await getBookOwnership(env, bookId);
  if (!book) throw new HttpError(404, '単語帳が見つかりません。');

  const isOwner = book.created_by === user.id;
  if (!isOwner && user.role !== UserRole.ADMIN) {
    throw new HttpError(403, 'この単語帳を編集できません。');
  }
};

const getBookProgress = async (env: AppEnv, userId: string, bookId: string): Promise<BookProgress> => {
  const totalRow = await readFirst<{ total: number }>(env, 'SELECT COUNT(*) AS total FROM words WHERE book_id = ?', bookId);
  const learnedRow = await readFirst<{ learned: number }>(
    env,
    `SELECT COUNT(*) AS learned
     FROM learning_histories
     WHERE user_id = ? AND book_id = ? AND (attempt_count > 0 OR interval_days > 0)`,
    userId,
    bookId
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

const ensurePositiveLimit = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
};

const applyXpUpdate = async (env: AppEnv, user: DbUserRow, amount: number): Promise<{ user: UserProfile; leveledUp: boolean; }> => {
  let xp = Number(user.stats_xp || 0);
  let level = Number(user.stats_level || 1);
  xp += amount;

  let leveledUp = false;
  while (xp >= level * 100) {
    xp -= level * 100;
    level += 1;
    leveledUp = true;
  }

  await env.DB.prepare(`
    UPDATE users
    SET stats_xp = ?, stats_level = ?, updated_at = ?
    WHERE id = ?
  `).bind(xp, level, Date.now(), user.id).run();

  const updated = await readFirst<DbUserRow>(env, 'SELECT * FROM users WHERE id = ?', user.id);
  if (!updated) throw new HttpError(500, 'XP更新後のユーザー取得に失敗しました。');

  return {
    user: mapUserRowToProfile(updated),
    leveledUp,
  };
};

const handleBatchImportWords = async (env: AppEnv, user: DbUserRow, payload: any): Promise<void> => {
  const defaultBookName = String(payload?.defaultBookName || '').trim();
  const csvRows = Array.isArray(payload?.csvRows) ? payload.csvRows : [];
  const contextSummary = typeof payload?.contextSummary === 'string' ? payload.contextSummary : undefined;
  const createdByUid = typeof payload?.createdByUid === 'string' ? payload.createdByUid : undefined;
  const optionCatalogSource = payload?.options?.catalogSource as BookCatalogSource | undefined;
  const optionAccessScope = payload?.options?.accessScope as BookAccessScope | undefined;

  if (!defaultBookName || csvRows.length === 0) {
    throw new HttpError(400, 'インポート対象のデータが空です。');
  }

  const isOfficialImport = user.role === UserRole.ADMIN && !createdByUid;
  const ownerId = isOfficialImport ? null : user.id;
  const grouped = new Map<string, { meta: BookMetadata & { createdBy: string | null; }; words: WordData[]; }>();

  csvRows.forEach((row: any, index: number) => {
    let bookName = row?.BookName || row?.book_name || row?._col0 || defaultBookName;
    if (!bookName || typeof bookName !== 'string') bookName = defaultBookName;

    const key = `${ownerId || 'official'}:${bookName}`;
    if (!grouped.has(key)) {
      const bookId = createBookId(bookName, ownerId || undefined, ownerId ? Date.now().toString(36) : undefined);
      const description = ownerId
        ? JSON.stringify({ createdBy: ownerId, type: 'USER_GENERATED' })
        : 'Imported';

      grouped.set(key, {
        meta: {
          id: bookId,
          title: bookName,
          wordCount: 0,
          isPriority: !ownerId && /duo/i.test(bookName),
          description,
          sourceContext: contextSummary,
          catalogSource: ownerId
            ? BookCatalogSource.USER_GENERATED
            : (optionCatalogSource || BookCatalogSource.LICENSED_PARTNER),
          accessScope: ownerId
            ? BookAccessScope.ALL_PLANS
            : (optionAccessScope || BookAccessScope.BUSINESS_ONLY),
          createdBy: ownerId,
        },
        words: [],
      });
    }

    const group = grouped.get(key)!;
    const number = Number.parseInt(String(row?.Number || row?._col1 || group.words.length + 1), 10) || group.words.length + 1;
    const word = String(row?.Word || row?._col2 || '').trim();
    const definition = String(row?.Meaning || row?._col3 || '').trim();
    if (!word || !definition) return;

    group.words.push({
      id: `${group.meta.id}_${number}_${index}`,
      bookId: group.meta.id,
      number,
      word,
      definition,
      searchKey: word.toLowerCase(),
    });
  });

  for (const { meta, words } of grouped.values()) {
    meta.wordCount = words.length;

    if (!meta.createdBy) {
      await env.DB.prepare('DELETE FROM words WHERE book_id = ?').bind(meta.id).run();
    }

    await env.DB.prepare(`
      INSERT INTO books (id, title, word_count, is_priority, description, source_context, created_by, catalog_source, access_scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        word_count = excluded.word_count,
        is_priority = excluded.is_priority,
        description = excluded.description,
        source_context = excluded.source_context,
        created_by = excluded.created_by,
        catalog_source = excluded.catalog_source,
        access_scope = excluded.access_scope,
        updated_at = excluded.updated_at
    `).bind(
      meta.id,
      meta.title,
      meta.wordCount,
      meta.isPriority ? 1 : 0,
      meta.description || null,
      meta.sourceContext || null,
      meta.createdBy,
      meta.catalogSource || (meta.createdBy ? BookCatalogSource.USER_GENERATED : BookCatalogSource.LICENSED_PARTNER),
      meta.accessScope || (meta.createdBy ? BookAccessScope.ALL_PLANS : BookAccessScope.BUSINESS_ONLY),
      Date.now(),
      Date.now()
    ).run();

    const statements = words.map((word) => env.DB.prepare(`
      INSERT INTO words (
        id, book_id, word_number, word, definition, search_key, example_sentence, example_meaning, is_reported, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        word = excluded.word,
        definition = excluded.definition,
        search_key = excluded.search_key,
        updated_at = excluded.updated_at
    `).bind(
      word.id,
      word.bookId,
      word.number,
      word.word,
      word.definition,
      word.searchKey || word.word.toLowerCase(),
      word.exampleSentence || null,
      word.exampleMeaning || null,
      Date.now(),
      Date.now()
    ));

    for (let index = 0; index < statements.length; index += 200) {
      await env.DB.batch(statements.slice(index, index + 200));
    }
  }
};

const handleDeleteBook = async (env: AppEnv, user: DbUserRow, bookId: string): Promise<void> => {
  await assertBookWriteAccess(env, user, bookId);
  await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId).run();
};

const handleUpdateWord = async (env: AppEnv, user: DbUserRow, word: WordData): Promise<void> => {
  if (!word?.id) throw new HttpError(400, '単語IDが必要です。');

  const row = await readFirst<{ book_id: string }>(env, 'SELECT book_id FROM words WHERE id = ?', word.id);
  if (!row) throw new HttpError(404, '対象の単語が見つかりません。');

  await assertBookWriteAccess(env, user, row.book_id);
  await env.DB.prepare(`
    UPDATE words
    SET word = ?, definition = ?, search_key = ?, updated_at = ?
    WHERE id = ?
  `).bind(word.word, word.definition, word.word.toLowerCase(), Date.now(), word.id).run();
};

const handleReportWord = async (env: AppEnv, user: DbUserRow, wordId: string, reason: string): Promise<void> => {
  if (!reason.trim()) throw new HttpError(400, '報告理由を入力してください。');

  const word = await readFirst<{ id: string; book_id: string }>(env, 'SELECT id, book_id FROM words WHERE id = ?', wordId);
  if (!word) throw new HttpError(404, '対象の単語が見つかりません。');
  await assertBookReadAccess(env, user, word.book_id);

  await env.DB.prepare(`
    INSERT INTO word_reports (word_id, reporter_user_id, reason, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(wordId, user.id, reason.trim(), Date.now()).run();

  await env.DB.prepare('UPDATE words SET is_reported = 1, updated_at = ? WHERE id = ?').bind(Date.now(), wordId).run();
};

const handleUpdateWordCache = async (
  env: AppEnv,
  user: DbUserRow,
  wordId: string,
  sentence: string,
  translation: string
): Promise<void> => {
  const word = await readFirst<{ book_id: string }>(env, 'SELECT book_id FROM words WHERE id = ?', wordId);
  if (!word) throw new HttpError(404, '対象の単語が見つかりません。');
  await assertBookReadAccess(env, user, word.book_id);

  await env.DB.prepare(`
    UPDATE words
    SET example_sentence = ?, example_meaning = ?, updated_at = ?
    WHERE id = ?
  `).bind(sentence, translation, Date.now(), wordId).run();
};

const handleGetDailySessionWords = async (env: AppEnv, user: DbUserRow, limit: number): Promise<WordData[]> => {
  const visibleBookIds = await getVisibleBookIds(env, user);
  if (visibleBookIds.length === 0) return [];

  const dueRows = await readAll<DbWordRow>(
    env,
    `SELECT w.*
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     WHERE h.user_id = ? AND h.status != 'graduated' AND h.next_review_date <= ?
       AND w.book_id IN (${buildInClause(visibleBookIds.length)})
     ORDER BY h.next_review_date ASC
     LIMIT ?`,
    user.id,
    Date.now(),
    ...visibleBookIds,
    limit
  );

  if (dueRows.length >= limit) {
    return dueRows.map(toWordData);
  }

  const newRows = await readAll<DbWordRow>(
    env,
    `SELECT w.*
     FROM words w
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_histories h
       WHERE h.user_id = ? AND h.word_id = w.id
     )
       AND w.book_id IN (${buildInClause(visibleBookIds.length)})
     ORDER BY w.book_id ASC, w.word_number ASC
     LIMIT ?`,
    user.id,
    ...visibleBookIds,
    limit - dueRows.length
  );

  return [...dueRows, ...newRows].map(toWordData);
};

const handleGetBookSession = async (env: AppEnv, user: DbUserRow, bookId: string, limit: number): Promise<WordData[]> => {
  await assertBookReadAccess(env, user, bookId);
  const dueRows = await readAll<DbWordRow>(
    env,
    `SELECT w.*
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     WHERE h.user_id = ? AND h.book_id = ? AND h.status != 'graduated' AND h.next_review_date <= ?
     ORDER BY h.next_review_date ASC
     LIMIT ?`,
    user.id,
    bookId,
    Date.now(),
    limit
  );

  const result = [...dueRows];
  if (result.length < limit) {
    const newRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM words w
       WHERE w.book_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM learning_histories h
           WHERE h.user_id = ? AND h.word_id = w.id
         )
       ORDER BY w.word_number ASC
       LIMIT ?`,
      bookId,
      user.id,
      limit - result.length
    );
    result.push(...newRows);
  }

  if (result.length < limit) {
    const aheadRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM learning_histories h
       JOIN words w ON w.id = h.word_id
       WHERE h.user_id = ? AND h.book_id = ? AND h.status != 'graduated' AND h.next_review_date > ?
       ORDER BY h.next_review_date ASC
       LIMIT ?`,
      user.id,
      bookId,
      Date.now(),
      limit - result.length
    );
    result.push(...aheadRows);
  }

  return result.map(toWordData);
};

const handleSaveSrsHistory = async (env: AppEnv, user: DbUserRow, word: WordData, rating: number): Promise<void> => {
  await assertBookReadAccess(env, user, word.bookId);
  const existing = await readFirst<DbHistoryRow>(
    env,
    'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?',
    user.id,
    word.id
  );

  let interval = existing?.interval_days || 0;
  let easeFactor = existing?.ease_factor || 2.5;
  let attemptCount = (existing?.attempt_count || 0) + 1;
  let correctCount = (existing?.correct_count || 0) + (rating >= 2 ? 1 : 0);

  if (rating === 0) {
    interval = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === 1) {
    interval = 1;
  } else if (rating === 2) {
    interval = interval === 0 ? 1 : Math.ceil(interval * easeFactor);
  } else if (rating === 3) {
    interval = interval === 0 ? 3 : Math.ceil(interval * easeFactor * 1.3);
    easeFactor += 0.15;
  }

  if (interval > 365) interval = 365;

  const nextReviewDate = Date.now() + interval * DAY_MS;
  const status = normalizeHistoryStatus(interval);

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
    user.id,
    word.id,
    word.bookId,
    status,
    Date.now(),
    nextReviewDate,
    interval,
    easeFactor,
    correctCount,
    attemptCount
  ).run();
};

const handleSaveHistory = async (env: AppEnv, user: DbUserRow, result: Partial<LearningHistory> & { wordId: string; bookId: string; }): Promise<void> => {
  await assertBookReadAccess(env, user, result.bookId);
  const existing = await readFirst<DbHistoryRow>(
    env,
    'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?',
    user.id,
    result.wordId
  );

  const payload: DbHistoryRow = {
    user_id: user.id,
    word_id: result.wordId,
    book_id: result.bookId,
    status: (result.status || existing?.status || 'learning') as LearningHistory['status'],
    last_studied_at: Date.now(),
    next_review_date: result.nextReviewDate || existing?.next_review_date || Date.now(),
    interval_days: result.interval || existing?.interval_days || 0,
    ease_factor: result.easeFactor || existing?.ease_factor || 2.5,
    correct_count: result.correctCount || existing?.correct_count || 0,
    attempt_count: result.attemptCount || existing?.attempt_count || 0,
  };

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
    payload.user_id,
    payload.word_id,
    payload.book_id,
    payload.status,
    payload.last_studied_at,
    payload.next_review_date,
    payload.interval_days,
    payload.ease_factor,
    payload.correct_count,
    payload.attempt_count
  ).run();
};

const handleGetAllStudentsProgress = async (env: AppEnv, currentUser: DbUserRow): Promise<StudentSummary[]> => {
  const organizationName = currentUser.role === UserRole.ADMIN ? null : currentUser.organization_name || null;
  const bypassInstructorAssignment =
    currentUser.role === UserRole.ADMIN ||
    currentUser.organization_role === OrganizationRole.GROUP_ADMIN;
  const rows = await readAll<{
    uid: string;
    name: string;
    email: string;
    subscription_plan: string | null;
    organization_name: string | null;
    total_learned: number;
    total_correct: number;
    total_attempts: number;
    last_active: number | null;
    last_notification_at: number | null;
    last_notification_message: string | null;
    assigned_instructor_uid: string | null;
    assigned_instructor_name: string | null;
    has_learning_plan: number;
  }>(
    env,
    `SELECT
       u.id AS uid,
       u.display_name AS name,
       u.email AS email,
       u.subscription_plan AS subscription_plan,
       u.organization_name AS organization_name,
       COALESCE(SUM(CASE WHEN h.attempt_count > 0 OR h.interval_days > 0 THEN 1 ELSE 0 END), 0) AS total_learned,
       COALESCE(SUM(h.correct_count), 0) AS total_correct,
       COALESCE(SUM(h.attempt_count), 0) AS total_attempts,
       MAX(h.last_studied_at) AS last_active,
       (
         SELECT n.created_at
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_notification_at,
       (
         SELECT n.message
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_notification_message,
       assign.instructor_user_id AS assigned_instructor_uid,
       assigned.display_name AS assigned_instructor_name,
       CASE WHEN lp.user_id IS NULL THEN 0 ELSE 1 END AS has_learning_plan
     FROM users u
     LEFT JOIN learning_histories h ON h.user_id = u.id
     LEFT JOIN learning_plans lp ON lp.user_id = u.id
     LEFT JOIN student_instructor_assignments assign ON assign.student_user_id = u.id
     LEFT JOIN users assigned ON assigned.id = assign.instructor_user_id
     WHERE u.role = ?
       AND (? IS NULL OR u.organization_name = ?)
       AND (? = 1 OR assign.instructor_user_id = ? OR assign.instructor_user_id IS NULL)
     GROUP BY
       u.id,
       u.display_name,
       u.email,
       u.subscription_plan,
       u.organization_name,
       assign.instructor_user_id,
       assigned.display_name,
       has_learning_plan
     ORDER BY last_active DESC, name ASC`,
    UserRole.STUDENT,
    organizationName,
    organizationName,
    bypassInstructorAssignment ? 1 : 0,
    currentUser.id
  );

  return rows.map((row) => {
    const lastActive = Number(row.last_active || 0);
    const daysSinceActive = lastActive > 0 ? Math.floor((Date.now() - lastActive) / DAY_MS) : Number.POSITIVE_INFINITY;
    const accuracy = row.total_attempts ? Number(row.total_correct || 0) / Number(row.total_attempts || 1) : 0;
    const riskLevel =
      daysSinceActive >= 3
        ? StudentRiskLevel.DANGER
        : daysSinceActive >= 1
          ? StudentRiskLevel.WARNING
          : StudentRiskLevel.SAFE;
    const riskReasons: string[] = [];

    if (daysSinceActive >= 3) riskReasons.push('3日以上学習が空いています');
    else if (daysSinceActive >= 1) riskReasons.push('前回学習から1日以上空いています');
    if (accuracy > 0 && accuracy < 0.7) riskReasons.push(`正答率が ${Math.round(accuracy * 100)}% です`);
    if (!row.has_learning_plan) riskReasons.push('学習プランが未設定です');
    if (riskReasons.length === 0) riskReasons.push('学習ペースは安定しています');

    const recommendedAction =
      riskLevel === StudentRiskLevel.DANGER
        ? '短い復習タスクを講師から指定して再開を促す'
        : riskLevel === StudentRiskLevel.WARNING
          ? '前回教材の復習を小さく区切って続けてもらう'
          : '現状の教材進行を維持しつつ次の単元を提案する';

    return {
      uid: row.uid,
      name: row.name,
      email: row.email,
      totalLearned: Number(row.total_learned || 0),
      totalAttempts: Number(row.total_attempts || 0),
      lastActive,
      riskLevel,
      accuracy,
      subscriptionPlan: (row.subscription_plan as SubscriptionPlan | null) || SubscriptionPlan.TOC_FREE,
      organizationName: row.organization_name || undefined,
      lastNotificationAt: Number(row.last_notification_at || 0) || undefined,
      lastNotificationMessage: row.last_notification_message || undefined,
      assignedInstructorUid: row.assigned_instructor_uid || undefined,
      assignedInstructorName: row.assigned_instructor_name || undefined,
      hasLearningPlan: Boolean(row.has_learning_plan),
      riskReasons,
      recommendedAction,
    };
  });
};

const handleGetStudentWorksheetSnapshot = async (
  env: AppEnv,
  currentUser: DbUserRow,
  studentUid: string,
): Promise<StudentWorksheetSnapshot> => {
  if (!studentUid) {
    throw new HttpError(400, '対象生徒を指定してください。');
  }

  const visibleStudents = await handleGetAllStudentsProgress(env, currentUser);
  const visibleStudent = visibleStudents.find((student) => student.uid === studentUid);
  const student = await readFirst<{
    id: string;
    display_name: string;
    role: string;
    organization_name: string | null;
  }>(env, 'SELECT id, display_name, role, organization_name FROM users WHERE id = ?', studentUid);

  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '対象生徒が見つかりません。');
  }

  if (
    currentUser.role !== UserRole.ADMIN &&
    (!visibleStudent || currentUser.organization_name !== student.organization_name)
  ) {
    throw new HttpError(403, '担当範囲の生徒のみ問題印刷できます。');
  }

  const rows = await readAll<{
    word_id: string;
    book_id: string;
    book_title: string;
    word: string;
    definition: string;
    status: LearningHistory['status'];
    last_studied_at: number;
    attempt_count: number;
    correct_count: number;
  }>(
    env,
    `SELECT
       w.id AS word_id,
       w.book_id AS book_id,
       b.title AS book_title,
       w.word AS word,
       w.definition AS definition,
       h.status AS status,
       h.last_studied_at AS last_studied_at,
       h.attempt_count AS attempt_count,
       h.correct_count AS correct_count
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     JOIN books b ON b.id = h.book_id
     WHERE h.user_id = ?
       AND (h.attempt_count > 0 OR h.interval_days > 0)
     ORDER BY
       CASE h.status
         WHEN 'graduated' THEN 0
         WHEN 'review' THEN 1
         ELSE 2
       END,
       h.last_studied_at DESC,
       b.title ASC,
       w.word_number ASC`,
    studentUid
  );

  return {
    studentUid: student.id,
    studentName: student.display_name,
    organizationName: student.organization_name || undefined,
    words: rows.map((row) => ({
      wordId: row.word_id,
      bookId: row.book_id,
      bookTitle: row.book_title,
      word: row.word,
      definition: row.definition,
      status: row.status,
      lastStudiedAt: Number(row.last_studied_at || 0),
      attemptCount: Number(row.attempt_count || 0),
      correctCount: Number(row.correct_count || 0),
    })),
  };
};

const handleGetAdminDashboardSnapshot = async (env: AppEnv, user: DbUserRow): Promise<AdminDashboardSnapshot> => {
  const students = await handleGetAllStudentsProgress(env, user);
  const todayKey = toTokyoDateKey(Date.now());
  const recentKeys = new Set(getLastTokyoDateKeys(7));
  const trendKeys = getLastTokyoDateKeys(14);
  const trendStart = Date.now() - 15 * DAY_MS;

  const [
    planCountRow,
    bookSummaryRow,
    reportCountRow,
    notifications7dRow,
    aiUsageRows,
    topBookRows,
    recentNotificationRows,
    recentReportRows,
    historyTrendRows,
    notificationTrendRows,
    signupTrendRows,
  ] = await Promise.all([
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM learning_plans lp
       JOIN users u ON u.id = lp.user_id
       WHERE u.role = ?`,
      UserRole.STUDENT
    ),
    readFirst<{ official_book_count: number; custom_book_count: number; total_word_count: number }>(
      env,
      `SELECT
         SUM(CASE WHEN created_by IS NULL THEN 1 ELSE 0 END) AS official_book_count,
         SUM(CASE WHEN created_by IS NOT NULL THEN 1 ELSE 0 END) AS custom_book_count,
         COALESCE(SUM(word_count), 0) AS total_word_count
       FROM books`
    ),
    readFirst<{ count: number }>(env, 'SELECT COUNT(*) AS count FROM word_reports'),
    readFirst<{ count: number }>(
      env,
      'SELECT COUNT(*) AS count FROM instructor_notifications WHERE created_at >= ?',
      Date.now() - 7 * DAY_MS
    ),
    readAll<{ action: string; request_count: number; estimated_cost_milli_yen: number }>(
      env,
      `SELECT
         action,
         COUNT(*) AS request_count,
         COALESCE(SUM(estimated_cost_milli_yen), 0) AS estimated_cost_milli_yen
       FROM ai_usage_events
       WHERE month_key = ?
       GROUP BY action
       ORDER BY estimated_cost_milli_yen DESC, request_count DESC`,
      currentMonthKey()
    ),
    readAll<{
      book_id: string;
      title: string;
      word_count: number;
      created_by: string | null;
      learner_count: number;
      learned_entries: number;
      average_progress: number;
    }>(
      env,
      `SELECT
         b.id AS book_id,
         b.title AS title,
         b.word_count AS word_count,
         b.created_by AS created_by,
         COUNT(DISTINCT h.user_id) AS learner_count,
         COUNT(h.word_id) AS learned_entries,
         CASE
           WHEN COUNT(DISTINCT h.user_id) = 0 OR b.word_count = 0 THEN 0
           ELSE ROUND((COUNT(h.word_id) * 100.0) / (b.word_count * COUNT(DISTINCT h.user_id)), 1)
         END AS average_progress
       FROM books b
       LEFT JOIN learning_histories h
         ON h.book_id = b.id
        AND (h.attempt_count > 0 OR h.interval_days > 0)
       GROUP BY b.id, b.title, b.word_count, b.created_by
       ORDER BY learner_count DESC, average_progress DESC, learned_entries DESC, b.title ASC
       LIMIT 6`
    ),
    readAll<{
      id: number;
      student_user_id: string;
      student_name: string;
      instructor_user_id: string;
      instructor_name: string;
      message: string;
      trigger_reason: string;
      delivery_channel: 'IN_APP';
      used_ai: number;
      created_at: number;
    }>(
      env,
      `SELECT
         n.id,
         n.student_user_id,
         s.display_name AS student_name,
         n.instructor_user_id,
         i.display_name AS instructor_name,
         n.message,
         n.trigger_reason,
         n.delivery_channel,
         n.used_ai,
         n.created_at
       FROM instructor_notifications n
       JOIN users s ON s.id = n.student_user_id
       JOIN users i ON i.id = n.instructor_user_id
       ORDER BY n.created_at DESC
       LIMIT 6`
    ),
    readAll<{
      id: number;
      word_id: string;
      word: string;
      book_title: string;
      reporter_name: string;
      reason: string;
      created_at: number;
    }>(
      env,
      `SELECT
         r.id,
         r.word_id,
         w.word AS word,
         b.title AS book_title,
         u.display_name AS reporter_name,
         r.reason,
         r.created_at
       FROM word_reports r
       JOIN words w ON w.id = r.word_id
       JOIN books b ON b.id = w.book_id
       JOIN users u ON u.id = r.reporter_user_id
       ORDER BY r.created_at DESC
       LIMIT 6`
    ),
    readAll<{ user_id: string; last_studied_at: number }>(
      env,
      'SELECT user_id, last_studied_at FROM learning_histories WHERE last_studied_at >= ?',
      trendStart
    ),
    readAll<{ created_at: number }>(
      env,
      'SELECT created_at FROM instructor_notifications WHERE created_at >= ?',
      trendStart
    ),
    readAll<{ created_at: number }>(
      env,
      'SELECT created_at FROM users WHERE role = ? AND created_at >= ?',
      UserRole.STUDENT,
      trendStart
    ),
  ]);

  const aiActions: AdminAiActionSummary[] = aiUsageRows.map((row) => ({
    action: row.action,
    label: AI_ACTION_ESTIMATES[row.action as keyof typeof AI_ACTION_ESTIMATES]?.label || row.action,
    requestCount: Number(row.request_count || 0),
    estimatedCostMilliYen: Number(row.estimated_cost_milli_yen || 0),
  }));

  const trendMap = new Map<string, { activeUsers: Set<string>; studiedWords: number; notifications: number; newStudents: number }>();
  trendKeys.forEach((key) => {
    trendMap.set(key, {
      activeUsers: new Set<string>(),
      studiedWords: 0,
      notifications: 0,
      newStudents: 0,
    });
  });

  historyTrendRows.forEach((row) => {
    const key = toTokyoDateKey(Number(row.last_studied_at || 0));
    const bucket = trendMap.get(key);
    if (!bucket) return;
    bucket.activeUsers.add(row.user_id);
    bucket.studiedWords += 1;
  });

  notificationTrendRows.forEach((row) => {
    const key = toTokyoDateKey(Number(row.created_at || 0));
    const bucket = trendMap.get(key);
    if (!bucket) return;
    bucket.notifications += 1;
  });

  signupTrendRows.forEach((row) => {
    const key = toTokyoDateKey(Number(row.created_at || 0));
    const bucket = trendMap.get(key);
    if (!bucket) return;
    bucket.newStudents += 1;
  });

  const trend: AdminTrendPoint[] = trendKeys.map((key) => {
    const bucket = trendMap.get(key)!;
    return {
      date: key,
      activeStudents: bucket.activeUsers.size,
      studiedWords: bucket.studiedWords,
      notifications: bucket.notifications,
      newStudents: bucket.newStudents,
    };
  });

  const topBooks: AdminBookInsight[] = topBookRows.map((row) => ({
    bookId: row.book_id,
    title: row.title,
    wordCount: Number(row.word_count || 0),
    learnerCount: Number(row.learner_count || 0),
    learnedEntries: Number(row.learned_entries || 0),
    averageProgress: Number(row.average_progress || 0),
    isOfficial: !row.created_by,
  }));

  const recentNotifications: InstructorNotification[] = recentNotificationRows.map((row) => ({
    id: row.id,
    studentUid: row.student_user_id,
    studentName: row.student_name,
    instructorUid: row.instructor_user_id,
    instructorName: row.instructor_name,
    message: row.message,
    triggerReason: row.trigger_reason,
    deliveryChannel: row.delivery_channel,
    usedAi: Boolean(row.used_ai),
    createdAt: row.created_at,
  }));

  const recentReports: AdminWordReportSummary[] = recentReportRows.map((row) => ({
    id: row.id,
    wordId: row.word_id,
    word: row.word,
    bookTitle: row.book_title,
    reporterName: row.reporter_name,
    reason: row.reason,
    createdAt: row.created_at,
  }));

  const planBreakdown: AdminPlanBreakdownItem[] = Object.values(SubscriptionPlan).map((plan) => ({
    plan,
    count: students.filter((student) => (student.subscriptionPlan || SubscriptionPlan.TOC_FREE) === plan).length,
  }));

  const riskBreakdown: AdminRiskBreakdownItem[] = [
    { riskLevel: StudentRiskLevel.SAFE, count: students.filter((student) => student.riskLevel === StudentRiskLevel.SAFE).length },
    { riskLevel: StudentRiskLevel.WARNING, count: students.filter((student) => student.riskLevel === StudentRiskLevel.WARNING).length },
    { riskLevel: StudentRiskLevel.DANGER, count: students.filter((student) => student.riskLevel === StudentRiskLevel.DANGER).length },
  ];

  const allAtRiskStudents = [...students]
    .filter((student) => student.riskLevel !== StudentRiskLevel.SAFE)
    .sort((left, right) => {
      if (left.riskLevel !== right.riskLevel) {
        if (left.riskLevel === StudentRiskLevel.DANGER) return -1;
        if (right.riskLevel === StudentRiskLevel.DANGER) return 1;
      }
      return left.lastActive - right.lastActive;
    });
  const atRiskStudents = allAtRiskStudents.slice(0, 8);

  const organizationsMap = new Map<string, { studentCount: number; active7dCount: number; paidCount: number; totalLearned: number }>();
  students.forEach((student) => {
    const key = student.organizationName || '個人利用';
    if (!organizationsMap.has(key)) {
      organizationsMap.set(key, { studentCount: 0, active7dCount: 0, paidCount: 0, totalLearned: 0 });
    }

    const bucket = organizationsMap.get(key)!;
    bucket.studentCount += 1;
    bucket.totalLearned += student.totalLearned;
    if (student.lastActive && recentKeys.has(toTokyoDateKey(student.lastActive))) {
      bucket.active7dCount += 1;
    }
    if (isPaidPlan(student.subscriptionPlan || SubscriptionPlan.TOC_FREE)) {
      bucket.paidCount += 1;
    }
  });

  const organizations: AdminOrganizationInsight[] = [...organizationsMap.entries()]
    .map(([organizationName, value]) => ({
      organizationName,
      studentCount: value.studentCount,
      active7dCount: value.active7dCount,
      paidCount: value.paidCount,
      averageLearnedWords: value.studentCount ? Math.round(value.totalLearned / value.studentCount) : 0,
    }))
    .sort((left, right) => right.studentCount - left.studentCount || right.active7dCount - left.active7dCount)
    .slice(0, 6);

  const overview = {
    totalStudents: students.length,
    activeToday: students.filter((student) => student.lastActive && toTokyoDateKey(student.lastActive) === todayKey).length,
    active7d: students.filter((student) => student.lastActive && recentKeys.has(toTokyoDateKey(student.lastActive))).length,
    atRiskCount: allAtRiskStudents.length,
    studentsWithPlan: Number(planCountRow?.count || 0),
    averageLearnedWords: students.length ? Math.round(students.reduce((sum, student) => sum + student.totalLearned, 0) / students.length) : 0,
    averageAccuracyRate: students.length ? Math.round((students.reduce((sum, student) => sum + (student.accuracy || 0), 0) / students.length) * 100) : 0,
    officialBookCount: Number(bookSummaryRow?.official_book_count || 0),
    customBookCount: Number(bookSummaryRow?.custom_book_count || 0),
    totalWordCount: Number(bookSummaryRow?.total_word_count || 0),
    reportedWordCount: Number(reportCountRow?.count || 0),
    notifications7d: Number(notifications7dRow?.count || 0),
    aiRequestsThisMonth: aiActions.reduce((sum, action) => sum + action.requestCount, 0),
    aiCostThisMonthMilliYen: aiActions.reduce((sum, action) => sum + action.estimatedCostMilliYen, 0),
  };

  return {
    overview,
    planBreakdown,
    riskBreakdown,
    trend,
    topBooks,
    aiActions,
    recentNotifications,
    recentReports,
    organizations,
    atRiskStudents,
  };
};

const handleGetOrganizationDashboardSnapshot = async (env: AppEnv, user: DbUserRow): Promise<OrganizationDashboardSnapshot> => {
  const organizationName = user.organization_name || '';
  if (!organizationName) {
    throw new HttpError(403, '組織情報が設定されていません。');
  }

  const students = await handleGetAllStudentsProgress(env, user);
  const [memberCountRow, instructorCountRow, learningPlanCountRow, notifications7dRow, instructorRows] = await Promise.all([
    readFirst<{ count: number }>(
      env,
      'SELECT COUNT(*) AS count FROM users WHERE organization_name = ?',
      organizationName
    ),
    readFirst<{ count: number }>(
      env,
      'SELECT COUNT(*) AS count FROM users WHERE role = ? AND organization_name = ?',
      UserRole.INSTRUCTOR,
      organizationName
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM learning_plans lp
       JOIN users u ON u.id = lp.user_id
       WHERE u.role = ? AND u.organization_name = ?`,
      UserRole.STUDENT,
      organizationName
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM instructor_notifications n
       JOIN users s ON s.id = n.student_user_id
       WHERE s.organization_name = ? AND n.created_at >= ?`,
      organizationName,
      Date.now() - 7 * DAY_MS
    ),
    readAll<{
      uid: string;
      display_name: string;
      email: string;
      organization_role: string | null;
      notified_student_count: number;
      notifications_7d: number;
      assigned_student_count: number;
    }>(
      env,
      `SELECT
         u.id AS uid,
         u.display_name AS display_name,
         u.email AS email,
         u.organization_role AS organization_role,
         COALESCE(stats.notified_student_count, 0) AS notified_student_count,
         COALESCE(stats.notifications_7d, 0) AS notifications_7d,
         COALESCE(assignments.assigned_student_count, 0) AS assigned_student_count
       FROM users u
       LEFT JOIN (
         SELECT
           n.instructor_user_id AS instructor_user_id,
           COUNT(DISTINCT n.student_user_id) AS notified_student_count,
           SUM(CASE WHEN n.created_at >= ? THEN 1 ELSE 0 END) AS notifications_7d
         FROM instructor_notifications n
         JOIN users s ON s.id = n.student_user_id
         WHERE s.organization_name = ?
         GROUP BY n.instructor_user_id
       ) stats ON stats.instructor_user_id = u.id
       LEFT JOIN (
         SELECT
           instructor_user_id,
           COUNT(*) AS assigned_student_count
         FROM student_instructor_assignments
         GROUP BY instructor_user_id
       ) assignments ON assignments.instructor_user_id = u.id
       WHERE u.role = ? AND u.organization_name = ?
       ORDER BY
         CASE WHEN u.organization_role = ? THEN 0 ELSE 1 END,
         notifications_7d DESC,
         u.display_name ASC`,
      Date.now() - 7 * DAY_MS,
      organizationName,
      UserRole.INSTRUCTOR,
      organizationName,
      OrganizationRole.GROUP_ADMIN
    ),
  ]);

  const instructors: OrganizationInstructorSummary[] = instructorRows.map((row) => ({
    uid: row.uid,
    displayName: row.display_name,
    email: row.email,
    organizationRole: row.organization_role ? row.organization_role as OrganizationRole : undefined,
    notifiedStudentCount: Number(row.notified_student_count || 0),
    notifications7d: Number(row.notifications_7d || 0),
    assignedStudentCount: Number(row.assigned_student_count || 0),
  }));

  const assignedStudents = students.filter((student) => student.assignedInstructorUid).length;

  return {
    organizationName,
    subscriptionPlan: getUserSubscriptionPlan(user),
    totalMembers: Number(memberCountRow?.count || 0),
    totalStudents: students.length,
    totalInstructors: Number(instructorCountRow?.count || 0),
    activeStudents7d: students.filter((student) => student.lastActive && Date.now() - student.lastActive < 7 * DAY_MS).length,
    atRiskStudents: students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE).length,
    learningPlanCount: Number(learningPlanCountRow?.count || 0),
    notifications7d: Number(notifications7dRow?.count || 0),
    assignmentCoverageRate: students.length > 0 ? Math.round((assignedStudents / students.length) * 100) : 0,
    unassignedStudents: students.filter((student) => !student.assignedInstructorUid).length,
    instructors,
    atRiskStudentList: [...students]
      .filter((student) => student.riskLevel !== StudentRiskLevel.SAFE)
      .sort((left, right) => left.lastActive - right.lastActive)
      .slice(0, 8),
    studentAssignments: [...students].sort((left, right) => left.name.localeCompare(right.name)),
  };
};

const handleSendInstructorNotification = async (
  env: AppEnv,
  instructor: DbUserRow,
  studentUid: string,
  message: string,
  triggerReason: string,
  usedAi: boolean
): Promise<void> => {
  const trimmedMessage = message.trim();
  const trimmedReason = triggerReason.trim() || '学習フォローアップ';
  if (!trimmedMessage) {
    throw new HttpError(400, '通知メッセージを入力してください。');
  }

  const student = await readFirst<{ id: string; role: string; organization_name: string | null }>(
    env,
    'SELECT id, role, organization_name FROM users WHERE id = ?',
    studentUid
  );
  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '通知対象の生徒が見つかりません。');
  }
  if (instructor.role !== UserRole.ADMIN && instructor.organization_name && instructor.organization_name !== student.organization_name) {
    throw new HttpError(403, '同じ組織の生徒にのみ通知できます。');
  }
  if (instructor.role === UserRole.INSTRUCTOR && instructor.organization_role !== OrganizationRole.GROUP_ADMIN) {
    const assignment = await readFirst<{ instructor_user_id: string | null }>(
      env,
      'SELECT instructor_user_id FROM student_instructor_assignments WHERE student_user_id = ?',
      studentUid
    );
    if (assignment?.instructor_user_id && assignment.instructor_user_id !== instructor.id) {
      throw new HttpError(403, '担当外の生徒には通知できません。');
    }
  }

  await env.DB.prepare(`
    INSERT INTO instructor_notifications (
      student_user_id, instructor_user_id, message, trigger_reason, delivery_channel, used_ai, created_at
    ) VALUES (?, ?, ?, ?, 'IN_APP', ?, ?)
  `).bind(
    studentUid,
    instructor.id,
    trimmedMessage,
    trimmedReason,
    usedAi ? 1 : 0,
    Date.now()
  ).run();
};

const handleGetCoachNotifications = async (env: AppEnv, userId: string): Promise<InstructorNotification[]> => {
  const rows = await readAll<{
    id: number;
    student_user_id: string;
    student_name: string;
    instructor_user_id: string;
    instructor_name: string;
    message: string;
    trigger_reason: string;
    delivery_channel: 'IN_APP';
    used_ai: number;
    created_at: number;
  }>(
    env,
    `SELECT
       n.id,
       n.student_user_id,
       s.display_name AS student_name,
       n.instructor_user_id,
       i.display_name AS instructor_name,
       n.message,
       n.trigger_reason,
       n.delivery_channel,
       n.used_ai,
       n.created_at
     FROM instructor_notifications n
     JOIN users s ON s.id = n.student_user_id
     JOIN users i ON i.id = n.instructor_user_id
     WHERE n.student_user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 3`,
    userId
  );

  return rows.map((row) => ({
    id: row.id,
    studentUid: row.student_user_id,
    studentName: row.student_name,
    instructorUid: row.instructor_user_id,
    instructorName: row.instructor_name,
    message: row.message,
    triggerReason: row.trigger_reason,
    deliveryChannel: row.delivery_channel,
    usedAi: Boolean(row.used_ai),
    createdAt: row.created_at,
  }));
};

const handleGetAiUsageSummary = async (env: AppEnv, user: DbUserRow): Promise<AccountOverview['aiUsage']> => {
  const plan = getSubscriptionPolicy(getUserSubscriptionPlan(user));
  const monthKey = currentMonthKey();
  const rows = await readAll<{
    action: string;
    estimated_cost_milli_yen: number;
    request_count: number;
  }>(
    env,
    `SELECT
       action,
       COALESCE(SUM(estimated_cost_milli_yen), 0) AS estimated_cost_milli_yen,
       COUNT(*) AS request_count
     FROM ai_usage_events
     WHERE user_id = ? AND month_key = ?
     GROUP BY action`,
    user.id,
    monthKey
  );

  const actionCounts: Record<string, number> = {};
  const estimatedCostMilliYen = rows.reduce((total, row) => {
    actionCounts[row.action] = Number(row.request_count || 0);
    return total + Number(row.estimated_cost_milli_yen || 0);
  }, 0);

  return {
    monthKey,
    estimatedCostMilliYen,
    budgetMilliYen: plan.monthlyAiBudgetMilliYen,
    remainingMilliYen: Math.max(0, plan.monthlyAiBudgetMilliYen - estimatedCostMilliYen),
    actionCounts,
  };
};

const handleGetAccountOverview = async (env: AppEnv, user: DbUserRow): Promise<AccountOverview> => {
  const plan = getSubscriptionPolicy(getUserSubscriptionPlan(user));
  return {
    subscriptionPlan: plan.plan,
    organizationRole: getUserOrganizationRole(user),
    organizationName: user.organization_name || undefined,
    priceLabel: plan.priceLabel,
    pricingNote: plan.pricingNote,
    audienceLabel: plan.audienceLabel,
    featureSummary: plan.featureSummary,
    aiUsage: await handleGetAiUsageSummary(env, user),
  };
};

const handleResetAllData = async (env: AppEnv): Promise<void> => {
  const statements = [
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM ai_usage_events'),
    env.DB.prepare('DELETE FROM instructor_notifications'),
    env.DB.prepare('DELETE FROM word_reports'),
    env.DB.prepare('DELETE FROM learning_histories'),
    env.DB.prepare('DELETE FROM student_instructor_assignments'),
    env.DB.prepare('DELETE FROM learning_preferences'),
    env.DB.prepare('DELETE FROM learning_plans'),
    env.DB.prepare('DELETE FROM words'),
    env.DB.prepare('DELETE FROM books'),
    env.DB.prepare(`
      UPDATE users
      SET stats_xp = 0, stats_level = 1, stats_current_streak = 0, updated_at = ?
    `).bind(Date.now()),
  ];
  await env.DB.batch(statements);
};

const handleSaveLearningPlan = async (env: AppEnv, user: DbUserRow, plan: LearningPlan): Promise<void> => {
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
    user.id,
    plan.createdAt || Date.now(),
    plan.targetDate,
    plan.goalDescription,
    plan.dailyWordGoal,
    JSON.stringify(plan.selectedBookIds || []),
    plan.status,
    Date.now()
  ).run();
};

const handleGetLearningPlan = async (env: AppEnv, user: DbUserRow): Promise<LearningPlan | null> => {
  const row = await readFirst<{
    user_id: string;
    created_at: number;
    target_date: string;
    goal_description: string;
    daily_word_goal: number;
    selected_book_ids: string;
    status: LearningPlan['status'];
  }>(env, 'SELECT * FROM learning_plans WHERE user_id = ?', user.id);

  if (!row) return null;
  return {
    uid: row.user_id,
    createdAt: row.created_at,
    targetDate: row.target_date,
    goalDescription: row.goal_description,
    dailyWordGoal: row.daily_word_goal,
    selectedBookIds: JSON.parse(row.selected_book_ids || '[]'),
    status: row.status,
  };
};

const handleSaveLearningPreference = async (env: AppEnv, user: DbUserRow, preference: LearningPreference): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO learning_preferences (
      user_id, target_exam, target_score, exam_date, weekly_study_days, daily_study_minutes,
      weak_skill_focus, motivation_note, intensity, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      target_exam = excluded.target_exam,
      target_score = excluded.target_score,
      exam_date = excluded.exam_date,
      weekly_study_days = excluded.weekly_study_days,
      daily_study_minutes = excluded.daily_study_minutes,
      weak_skill_focus = excluded.weak_skill_focus,
      motivation_note = excluded.motivation_note,
      intensity = excluded.intensity,
      updated_at = excluded.updated_at
  `).bind(
    user.id,
    preference.targetExam || null,
    preference.targetScore || null,
    preference.examDate || null,
    preference.weeklyStudyDays || 4,
    preference.dailyStudyMinutes || 20,
    preference.weakSkillFocus || null,
    preference.motivationNote || null,
    preference.intensity || LearningPreferenceIntensity.BALANCED,
    Date.now()
  ).run();
};

const handleGetLearningPreference = async (env: AppEnv, user: DbUserRow): Promise<LearningPreference> => {
  const row = await readFirst<DbLearningPreferenceRow>(env, 'SELECT * FROM learning_preferences WHERE user_id = ?', user.id);
  if (!row) return defaultLearningPreference(user.id);

  return {
    userUid: row.user_id,
    targetExam: row.target_exam || '',
    targetScore: row.target_score || '',
    examDate: row.exam_date || '',
    weeklyStudyDays: Number(row.weekly_study_days || 4),
    dailyStudyMinutes: Number(row.daily_study_minutes || 20),
    weakSkillFocus: row.weak_skill_focus || '',
    motivationNote: row.motivation_note || '',
    intensity: (row.intensity as LearningPreferenceIntensity | null) || LearningPreferenceIntensity.BALANCED,
    updatedAt: row.updated_at,
  };
};

const handleAssignStudentInstructor = async (
  env: AppEnv,
  currentUser: DbUserRow,
  studentUid: string,
  instructorUid: string | null
): Promise<void> => {
  if (!studentUid) throw new HttpError(400, '生徒を指定してください。');
  if (currentUser.role !== UserRole.ADMIN) {
    requireOrganizationRole(currentUser, [OrganizationRole.GROUP_ADMIN]);
  }

  const student = await readFirst<{ id: string; organization_name: string | null; role: string }>(
    env,
    'SELECT id, organization_name, role FROM users WHERE id = ?',
    studentUid
  );
  if (!student || student.role !== UserRole.STUDENT) throw new HttpError(404, '対象生徒が見つかりません。');
  if (currentUser.role !== UserRole.ADMIN && student.organization_name !== currentUser.organization_name) {
    throw new HttpError(403, '同じ組織の生徒のみ担当変更できます。');
  }

  if (instructorUid) {
    const instructor = await readFirst<{ id: string; organization_name: string | null; role: string }>(
      env,
      'SELECT id, organization_name, role FROM users WHERE id = ?',
      instructorUid
    );
    if (!instructor || instructor.role !== UserRole.INSTRUCTOR) {
      throw new HttpError(404, '担当講師が見つかりません。');
    }
    if (!student.organization_name) {
      throw new HttpError(400, '組織に所属していない生徒には担当割当できません。');
    }
    if (instructor.organization_name !== student.organization_name) {
      throw new HttpError(400, '生徒と同じ組織の講師にのみ割り当てできます。');
    }
    if (currentUser.role !== UserRole.ADMIN && instructor.organization_name !== currentUser.organization_name) {
      throw new HttpError(403, '同じ組織の講師にのみ割り当てできます。');
    }
    await env.DB.prepare(`
      INSERT INTO student_instructor_assignments (student_user_id, instructor_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_user_id) DO UPDATE SET
        instructor_user_id = excluded.instructor_user_id,
        updated_at = excluded.updated_at
    `).bind(studentUid, instructorUid, Date.now(), Date.now()).run();
    return;
  }

  await env.DB.prepare('DELETE FROM student_instructor_assignments WHERE student_user_id = ?').bind(studentUid).run();
};

const handleGetLeaderboard = async (env: AppEnv, currentUserId: string): Promise<LeaderboardEntry[]> => {
  const users = await readAll<DbUserRow>(
    env,
    `SELECT * FROM users
     WHERE role = ?
     ORDER BY stats_level DESC, stats_xp DESC, display_name ASC`,
    UserRole.STUDENT
  );

  const topTen = users.slice(0, 10);
  const currentIndex = users.findIndex((user) => user.id === currentUserId);

  if (currentIndex >= 10) {
    topTen.push(users[currentIndex]);
  }

  return topTen.map((row, index) => ({
    uid: row.id,
    displayName: row.display_name,
    xp: Number(row.stats_xp || 0),
    level: Number(row.stats_level || 1),
    rank: users.findIndex((candidate) => candidate.id === row.id) + 1 || index + 1,
    isCurrentUser: row.id === currentUserId,
  }));
};

const handleGetMasteryDistribution = async (env: AppEnv, userId: string): Promise<MasteryDistribution> => {
  const rows = await readAll<DbHistoryRow>(
    env,
    'SELECT * FROM learning_histories WHERE user_id = ?',
    userId
  );

  const distribution: MasteryDistribution = {
    new: 0,
    learning: 0,
    review: 0,
    graduated: 0,
    total: rows.length,
  };

  rows.forEach((row) => {
    if (row.status === 'graduated') distribution.graduated += 1;
    else if (row.status === 'review' || (row.status === 'learning' && row.interval_days > 3)) distribution.review += 1;
    else distribution.learning += 1;
  });

  return distribution;
};

const handleGetActivityLogs = async (env: AppEnv, userId: string): Promise<ActivityLog[]> => {
  const rows = await readAll<{ last_studied_at: number }>(
    env,
    'SELECT last_studied_at FROM learning_histories WHERE user_id = ?',
    userId
  );

  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const date = new Date(row.last_studied_at).toISOString().split('T')[0];
    counts[date] = (counts[date] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([date, count]) => {
      let intensity: 0 | 1 | 2 | 3 | 4 = 0;
      if (count > 0) intensity = 1;
      if (count > 5) intensity = 2;
      if (count > 15) intensity = 3;
      if (count > 30) intensity = 4;
      return { date, count, intensity };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
};

const handleGetDashboardSnapshot = async (env: AppEnv, user: DbUserRow): Promise<DashboardSnapshot> => {
  const allBooks = await readVisibleBookRows(env, user);

  const officialBooks: BookMetadata[] = [];
  const myBooks: BookMetadata[] = [];

  allBooks.forEach((row) => {
    const mapped = toBookMetadata(row);
    if (row.created_by === user.id) myBooks.push(mapped);
    else if (canAccessOfficialBook(user, mapped)) officialBooks.push(mapped);
  });

  officialBooks.sort((a, b) => (a.isPriority === b.isPriority ? a.title.localeCompare(b.title) : a.isPriority ? -1 : 1));
  myBooks.sort((a, b) => b.id.localeCompare(a.id));

  const [progressResults, dueCount, learningPlan, learningPreference, leaderboard, masteryDist, activityLogs, coachNotifications, accountOverview] = await Promise.all([
    Promise.all([...officialBooks, ...myBooks].map((book) => getBookProgress(env, user.id, book.id))),
    getVisibleDueCount(env, user),
    handleGetLearningPlan(env, user),
    handleGetLearningPreference(env, user),
    handleGetLeaderboard(env, user.id),
    handleGetMasteryDistribution(env, user.id),
    handleGetActivityLogs(env, user.id),
    handleGetCoachNotifications(env, user.id),
    handleGetAccountOverview(env, user),
  ]);

  const progressMap: Record<string, BookProgress> = {};
  progressResults.forEach((progress) => {
    progressMap[progress.bookId] = progress;
  });

  return {
    dueCount,
    officialBooks,
    myBooks,
    progressMap,
    learningPlan,
    learningPreference,
    leaderboard,
    masteryDist,
    activityLogs,
    coachNotifications,
    accountOverview,
  };
};

export const handleStorageAction = async (env: AppEnv, user: DbUserRow, body: StorageRequestBody): Promise<unknown> => {
  const action = body?.action;
  const payload = body?.payload || {};

  switch (action) {
    case 'addXP':
      return applyXpUpdate(env, user, Number(payload.amount || 0));

    case 'batchImportWords':
      await handleBatchImportWords(env, user, payload);
      return null;

    case 'getBooks': {
      const rows = await readVisibleBookRows(env, user);
      return rows.map(toBookMetadata);
    }

    case 'deleteBook':
      await handleDeleteBook(env, user, String(payload.bookId || ''));
      return null;

    case 'getWordsByBook': {
      await assertBookReadAccess(env, user, String(payload.bookId || ''));
      const rows = await readAll<DbWordRow>(
        env,
        'SELECT * FROM words WHERE book_id = ? ORDER BY word_number ASC',
        String(payload.bookId || '')
      );
      return rows.map(toWordData);
    }

    case 'updateWord':
      await handleUpdateWord(env, user, payload.word as WordData);
      return null;

    case 'reportWord':
      await handleReportWord(env, user, String(payload.wordId || ''), String(payload.reason || ''));
      return null;

    case 'updateWordCache':
      await handleUpdateWordCache(env, user, String(payload.wordId || ''), String(payload.sentence || ''), String(payload.translation || ''));
      return null;

    case 'getDailySessionWords':
      return handleGetDailySessionWords(env, user, ensurePositiveLimit(payload.limit, 20));

    case 'getBookSession':
      return handleGetBookSession(env, user, String(payload.bookId || ''), ensurePositiveLimit(payload.limit, 10));

    case 'getDashboardSnapshot':
      return handleGetDashboardSnapshot(env, user);

    case 'getAdminDashboardSnapshot':
      requireRole(user, [UserRole.ADMIN]);
      return handleGetAdminDashboardSnapshot(env, user);

    case 'getOrganizationDashboardSnapshot':
      requireRole(user, [UserRole.INSTRUCTOR]);
      requireOrganizationRole(user, [OrganizationRole.GROUP_ADMIN]);
      return handleGetOrganizationDashboardSnapshot(env, user);

    case 'getDueCount': {
      return getVisibleDueCount(env, user);
    }

    case 'saveSRSHistory':
      await handleSaveSrsHistory(env, user, payload.word as WordData, Number(payload.rating || 0));
      return null;

    case 'saveHistory':
      await handleSaveHistory(env, user, payload.result as Partial<LearningHistory> & { wordId: string; bookId: string; });
      return null;

    case 'getBookProgress':
      await assertBookReadAccess(env, user, String(payload.bookId || ''));
      return getBookProgress(env, user.id, String(payload.bookId || ''));

    case 'getAllStudentsProgress':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleGetAllStudentsProgress(env, user);

    case 'getStudentWorksheetSnapshot':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleGetStudentWorksheetSnapshot(env, user, String(payload.studentUid || ''));

    case 'sendInstructorNotification':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      await handleSendInstructorNotification(
        env,
        user,
        String(payload.studentUid || ''),
        String(payload.message || ''),
        String(payload.triggerReason || ''),
        Boolean(payload.usedAi)
      );
      return null;

    case 'resetAllData':
      requireRole(user, [UserRole.ADMIN]);
      await handleResetAllData(env);
      return null;

    case 'saveLearningPlan':
      await handleSaveLearningPlan(env, user, payload.plan as LearningPlan);
      return null;

    case 'getLearningPlan':
      return handleGetLearningPlan(env, user);

    case 'saveLearningPreference':
      await handleSaveLearningPreference(env, user, payload.preference as LearningPreference);
      return null;

    case 'getLearningPreference':
      return handleGetLearningPreference(env, user);

    case 'assignStudentInstructor':
      await handleAssignStudentInstructor(env, user, String(payload.studentUid || ''), payload.instructorUid ? String(payload.instructorUid) : null);
      return null;

    case 'getLeaderboard':
      return handleGetLeaderboard(env, user.id);

    case 'getMasteryDistribution':
      return handleGetMasteryDistribution(env, user.id);

    case 'getActivityLogs':
      return handleGetActivityLogs(env, user.id);

    default:
      throw new HttpError(404, '未知のストレージ操作です。');
  }
};
