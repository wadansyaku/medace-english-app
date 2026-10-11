import type { LearningTaskIntent, StudyWordRange, WordData } from '../../types';
import { GRADUATED_REVIEW_DAILY_LIMIT, getGraduatedReviewDayKey } from '../../shared/graduatedReview';
import { selectBoundedLongTermReviewCandidates } from '../../shared/studySession';
import { normalizeStudySessionStartId, studySessionStartFingerprint } from '../../shared/studySessionStart';
import { normalizeStudyWordRange } from '../../shared/studyScope';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';
import { assertBookLearningAccess, buildInClause, readAll, readFirst, toWordData, type DbWordRow } from './storage-support';

// Re-evaluate access using the canonical current user, book and source ledger.
// The same predicate is used inside the allocation transaction and on replay.
const currentLearningAccessSql = `
  (u.role = 'ADMIN' OR b.created_by = u.id OR (
    COALESCE(NULLIF(b.catalog_source, ''), CASE WHEN NULLIF(b.created_by, '') IS NOT NULL THEN 'USER_GENERATED' ELSE 'LICENSED_PARTNER' END) != 'USER_GENERATED'
    AND (COALESCE(NULLIF(b.access_scope, ''), CASE WHEN NULLIF(b.created_by, '') IS NOT NULL THEN 'ALL_PLANS' ELSE 'BUSINESS_ONLY' END) = 'ALL_PLANS'
      OR u.subscription_plan = 'TOB_PAID')
  ))
  AND (COALESCE(NULLIF(b.catalog_source, ''), CASE WHEN NULLIF(b.created_by, '') IS NOT NULL THEN 'USER_GENERATED' ELSE 'LICENSED_PARTNER' END) = 'USER_GENERATED'
    OR (m.rights_status = 'approved' AND m.review_status = 'approved'
      AND m.qa_word_count > 0 AND b.word_count > 0
      AND m.qa_required_blank_rows <= 0 AND m.qa_rows_with_sentinel <= 0 AND m.qa_sentinel_value_count <= 0))`;

const materialJoins = `
  JOIN books b ON b.id = w.book_id
  JOIN users u ON u.id = ?
  LEFT JOIN material_source_ledger m ON m.book_id = b.id`;
const dueGraduateSql = `h.status = 'graduated' AND h.interaction_source = 'STUDY'
  AND typeof(h.next_review_date) IN ('integer', 'real')
  AND typeof(h.last_studied_at) IN ('integer', 'real')
  AND ABS(h.next_review_date) <= 1.7976931348623157e308
  AND ABS(h.last_studied_at) <= 1.7976931348623157e308
  AND h.next_review_date <= ?`;

interface StartRow {
  user_id: string;
  client_session_id: string;
  request_fingerprint: string;
  day_key: string;
  start_ordinal: number;
  session_limit: number;
  session_quota: number;
  result_word_ids_json: string;
  graduate_word_ids_json: string;
}

interface CandidateRow extends DbWordRow {
  history_next_review_date: number;
  history_last_studied_at: number;
}

export interface GraduatedReviewStartOptions {
  action: 'daily' | 'book';
  bookId?: string;
  limit: number;
  taskIntent?: LearningTaskIntent;
  clientSessionId?: string;
  normalWords: WordData[];
  ordinaryDueCount: number;
  scopedBookIds: string[];
  wordRange?: StudyWordRange;
}

const scopeCondition = (bookIds: string[], range?: StudyWordRange) => ({
  sql: `w.book_id IN (${buildInClause(bookIds.length)}) ${range ? 'AND w.word_number BETWEEN ? AND ?' : ''}`,
  bindings: [...bookIds, ...(range ? [range.start, range.end] : [])],
});

const parseIds = (json: string): string[] => {
  const ids: unknown = JSON.parse(json);
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('学習開始の保存内容が不正です。');
  return ids;
};

const readCurrentStartWords = async (
  env: AppEnv, user: DbUserRow, start: StartRow, options: GraduatedReviewStartOptions,
): Promise<WordData[]> => {
  if (options.action === 'book' && options.bookId) {
    const currentUser = await readFirst<DbUserRow>(env, 'SELECT * FROM users WHERE id = ?', user.id);
    if (!currentUser) throw new HttpError(401, '現在のセッションを確認できませんでした。');
    await assertBookLearningAccess(env, currentUser, options.bookId);
  }
  const ids = parseIds(start.result_word_ids_json);
  if (ids.length === 0 || options.scopedBookIds.length === 0) return [];
  const graduateIds = new Set(parseIds(start.graduate_word_ids_json));
  const scope = scopeCondition(options.scopedBookIds, options.wordRange);
  const rows = await readAll<DbWordRow & { current_status: string | null; current_source: string | null; current_due: number | null; current_last: number | null; current_attempts: number | null; current_interval: number | null }>(env,
    `SELECT w.*, h.status AS current_status, h.interaction_source AS current_source,
      h.next_review_date AS current_due, h.last_studied_at AS current_last,
      h.attempt_count AS current_attempts, h.interval_days AS current_interval
     FROM words w ${materialJoins}
     LEFT JOIN learning_histories h ON h.user_id = u.id AND h.word_id = w.id AND h.book_id = w.book_id
     WHERE w.id IN (${buildInClause(ids.length)}) AND ${scope.sql} AND ${currentLearningAccessSql}`,
    user.id, ...ids, ...scope.bindings);
  const now = Date.now();
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.flatMap(id => {
    const row = byId.get(id);
    if (!row) return [];
    if (graduateIds.has(id)) {
      if (row.current_status !== 'graduated' || row.current_source !== 'STUDY'
        || !Number.isFinite(row.current_due) || !Number.isFinite(row.current_last) || row.current_due! > now) return [];
      return [{ ...toWordData(row), longTermReview: true }];
    }
    if (row.current_status === 'graduated') return [];
    if (options.taskIntent?.selectionPolicy === 'BOOK_DUE_ONLY'
      && (row.current_source !== 'STUDY' || !Number.isFinite(row.current_due) || row.current_due! > now
        || !(row.current_attempts! > 0 || row.current_interval! > 0))) return [];
    return [toWordData(row)];
  });
};

/** A new start and all of its assignments commit in one D1 batch. All writes
 * are conditional on this invocation winning the immutable start receipt.
 * Five unique day slots enforce the cap across tabs and different materials;
 * answer saves never read or consume these slots. */
export const allocateGraduatedReviewSession = async (
  env: AppEnv, user: DbUserRow, options: GraduatedReviewStartOptions,
): Promise<WordData[]> => {
  let clientSessionId: string | undefined;
  try { clientSessionId = normalizeStudySessionStartId(options.clientSessionId); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '学習開始の識別子が不正です。'); }
  if (!clientSessionId || options.taskIntent?.mode === 'quiz' || options.taskIntent?.selectionPolicy === 'BOOK_NEW_ONLY') {
    return options.normalWords;
  }
  const fingerprint = studySessionStartFingerprint({ action: options.action, bookId: options.bookId, limit: options.limit, taskIntent: options.taskIntent });
  const readStart = () => readFirst<StartRow>(env,
    'SELECT * FROM long_term_review_starts WHERE user_id = ? AND client_session_id = ?', user.id, clientSessionId);
  const replay = (start: StartRow) => {
    if (start.request_fingerprint !== fingerprint) throw new HttpError(409, '同じ学習開始の識別子で異なる学習は開始できません。');
    return readCurrentStartWords(env, user, start, options);
  };
  const previous = await readStart();
  if (previous) return replay(previous);

  const now = Date.now();
  const dayKey = getGraduatedReviewDayKey(now);
  const scope = scopeCondition(options.scopedBookIds, options.wordRange);
  const candidateRows = options.scopedBookIds.length === 0 ? [] : await readAll<CandidateRow>(env,
    `SELECT w.*, h.next_review_date AS history_next_review_date, h.last_studied_at AS history_last_studied_at
     FROM learning_histories h JOIN words w ON w.id = h.word_id AND w.book_id = h.book_id
     ${materialJoins}
     WHERE h.user_id = u.id AND ${dueGraduateSql} AND ${scope.sql} AND ${currentLearningAccessSql}
       AND NOT EXISTS (SELECT 1 FROM graduated_review_allocations a WHERE a.user_id = u.id AND a.day_key = ? AND a.word_id = w.id)
     ORDER BY h.next_review_date, h.last_studied_at, w.id LIMIT ?`,
    user.id, now, ...scope.bindings, dayKey, GRADUATED_REVIEW_DAILY_LIMIT);
  const candidates = selectBoundedLongTermReviewCandidates({
    scopedWords: candidateRows.map(toWordData),
    histories: candidateRows.map(row => ({ wordId: row.id, bookId: row.book_id, status: 'graduated' as const,
      interactionSource: 'STUDY' as const, nextReviewDate: row.history_next_review_date, lastStudiedAt: row.history_last_studied_at })),
    now, limit: GRADUATED_REVIEW_DAILY_LIMIT, quota: GRADUATED_REVIEW_DAILY_LIMIT,
  }).words;
  const token = crypto.randomUUID();
  const normalWordIds = [...new Set(options.normalWords.map(word => word.id))];
  const won = 's.user_id = ? AND s.client_session_id = ? AND s.commit_token = ?';
  const wonValues = [user.id, clientSessionId, token];
  const statements = [env.DB.prepare(`
    INSERT INTO long_term_review_starts(user_id, client_session_id, request_fingerprint, commit_token,
      day_key, start_ordinal, session_limit, session_quota, normal_word_ids_json, created_at)
    SELECT ?, ?, ?, ?, ?, ordinal, ?, CASE
      WHEN ? >= 5 THEN MIN(3, CAST(? / 5 AS INTEGER))
      WHEN ? >= 2 THEN 1 WHEN ? <= 0 OR ordinal % 5 = 0 THEN 1 ELSE 0 END, ?, ?
    FROM (SELECT COALESCE(MAX(start_ordinal), 0) + 1 AS ordinal FROM long_term_review_starts WHERE user_id = ? AND day_key = ?)
    WHERE 1 ON CONFLICT(user_id, client_session_id) DO NOTHING
  `).bind(user.id, clientSessionId, fingerprint, token, dayKey, options.limit,
    options.limit, options.limit, options.limit, options.ordinaryDueCount,
    JSON.stringify(normalWordIds), now, user.id, dayKey)];
  for (const candidate of candidates) {
    statements.push(env.DB.prepare(`
      INSERT INTO graduated_review_allocations(user_id, day_key, word_id, book_id, slot_number, client_session_id, allocated_at)
      SELECT s.user_id, s.day_key, w.id, w.book_id,
        (SELECT MIN(slot_number) FROM (SELECT 1 AS slot_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) slots
          WHERE NOT EXISTS (SELECT 1 FROM graduated_review_allocations used
            WHERE used.user_id = s.user_id AND used.day_key = s.day_key AND used.slot_number = slots.slot_number)),
        s.client_session_id, ?
      FROM words w ${materialJoins}
      JOIN learning_histories h ON h.user_id = u.id AND h.word_id = w.id AND h.book_id = w.book_id
      JOIN long_term_review_starts s ON s.user_id = u.id
      WHERE ${won} AND w.id = ? AND w.book_id = ? AND ${scope.sql}
        AND ${dueGraduateSql} AND ${currentLearningAccessSql}
        AND (SELECT COUNT(*) FROM graduated_review_allocations a WHERE a.user_id = s.user_id AND a.client_session_id = s.client_session_id) < s.session_quota
        AND (SELECT COUNT(*) FROM graduated_review_allocations a WHERE a.user_id = s.user_id AND a.day_key = s.day_key) < 5
        AND NOT EXISTS (SELECT 1 FROM graduated_review_allocations a WHERE a.user_id = s.user_id AND a.day_key = s.day_key AND a.word_id = w.id)
      ON CONFLICT(user_id, day_key, word_id) DO NOTHING
    `).bind(now, user.id, ...wonValues, candidate.id, candidate.bookId, ...scope.bindings, now));
  }
  statements.push(env.DB.prepare(`
    UPDATE long_term_review_starts AS s SET
      graduate_word_ids_json = (SELECT json_group_array(word_id) FROM (
        SELECT word_id FROM graduated_review_allocations a WHERE a.user_id = s.user_id AND a.client_session_id = s.client_session_id ORDER BY slot_number)),
      result_word_ids_json = (SELECT json_group_array(word_id) FROM (
        SELECT CAST(n.key AS INTEGER) AS position, n.value AS word_id FROM json_each(s.normal_word_ids_json) n
        WHERE CAST(n.key AS INTEGER) < s.session_limit - (SELECT COUNT(*) FROM graduated_review_allocations a WHERE a.user_id = s.user_id AND a.client_session_id = s.client_session_id)
          AND CAST(n.key AS INTEGER) = (SELECT MIN(CAST(duplicate.key AS INTEGER)) FROM json_each(s.normal_word_ids_json) duplicate WHERE duplicate.value = n.value)
          AND NOT EXISTS (SELECT 1 FROM graduated_review_allocations a WHERE a.user_id = s.user_id AND a.client_session_id = s.client_session_id AND a.word_id = n.value)
        UNION ALL SELECT s.session_limit + a.slot_number AS position, a.word_id FROM graduated_review_allocations a
          WHERE a.user_id = s.user_id AND a.client_session_id = s.client_session_id
        ORDER BY position))
    WHERE ${won}
  `).bind(...wonValues));
  await env.DB.batch(statements);
  const start = await readStart();
  if (!start) throw new Error('学習開始の保存を確認できませんでした。同じ操作を再試行してください。');
  return replay(start);
};

/** Read-only bounded availability; the full backlog never becomes a daily goal. */
export const getVisibleLongTermReviewAvailableCount = async (
  env: AppEnv, user: DbUserRow, bookId?: string, wordRange?: StudyWordRange,
): Promise<number> => {
  const range = normalizeStudyWordRange(wordRange);
  const now = Date.now();
  const dayKey = getGraduatedReviewDayKey(now);
  const row = await readFirst<{ count: number }>(env, `
    SELECT MAX(0, MIN(5 - (SELECT COUNT(*) FROM graduated_review_allocations a WHERE a.user_id = ? AND a.day_key = ?),
      (SELECT COUNT(*) FROM (
        SELECT w.id FROM learning_histories h JOIN words w ON w.id = h.word_id AND w.book_id = h.book_id
        ${materialJoins}
        WHERE h.user_id = u.id AND ${dueGraduateSql} AND ${currentLearningAccessSql}
          ${bookId ? 'AND w.book_id = ?' : ''} ${range ? 'AND w.word_number BETWEEN ? AND ?' : ''}
          AND NOT EXISTS (SELECT 1 FROM graduated_review_allocations a WHERE a.user_id = u.id AND a.day_key = ? AND a.word_id = w.id)
        LIMIT 5)))) AS count`,
    user.id, dayKey, user.id, now, ...(bookId ? [bookId] : []), ...(range ? [range.start, range.end] : []), dayKey);
  if (!row || !Number.isFinite(Number(row.count))) throw new Error('長期復習の状況を取得できませんでした。');
  return Number(row.count);
};
