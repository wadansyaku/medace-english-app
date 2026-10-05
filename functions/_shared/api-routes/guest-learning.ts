import type { GuestLearningCatalogResponse, GuestLearningImportRequest, GuestLearningImportResponse, GuestLearningSummary } from '../../../contracts/guestLearning';
import { NARU_BOOK_ID } from '../../../shared/naruBook';
import { GUEST_LEARNING_VERSION, GUEST_LEARNING_TTL_MS, GUEST_LEARNING_MAX_RESPONSE_TIME_MS, GUEST_LEARNING_UUID_PATTERN } from '../../../shared/guestLearning';
import { studyAttemptFingerprint } from '../../../shared/srs';
import { BookAccessScope, BookCatalogSource, UserRole } from '../../../types';
import { isDemoEmail } from '../../../utils/demo';
import { requireRole, requireUser } from '../auth';
import { HttpError, readJson } from '../http';
import { assertSameOriginMutation } from '../request-guards';
import { assertBookLearningAccess, getBookRow, toBookMetadata, toWordData, type DbBookRow, type DbWordRow } from '../storage-support';
import { commitStudyAttempt } from '../study-attempt-receipts';
import type { AppEnv, DbUserRow } from '../types';
import { createJsonResponse, type ApiRouteDefinition } from './runtime';

const CONFLICT = 'この学習記録は保存できません。同じアカウントと回答で再試行してください。';
const UUID = GUEST_LEARNING_UUID_PATTERN;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);

export const validateGuestLearningImport = (candidate: unknown, now = Date.now()): GuestLearningImportRequest => {
  if (!isObject(candidate) || !onlyKeys(candidate, ['expectedUserId', 'sessionId', 'version', 'attempts'])
    || !isId(candidate.expectedUserId) || typeof candidate.sessionId !== 'string' || !UUID.test(candidate.sessionId)
    || candidate.version !== GUEST_LEARNING_VERSION || !Array.isArray(candidate.attempts)
    || candidate.attempts.length < 1 || candidate.attempts.length > 100) throw new HttpError(400, '学習記録の形式が正しくありません。');
  const ids = new Set<string>();
  for (const attempt of candidate.attempts) {
    if (!isObject(attempt) || !onlyKeys(attempt, ['attemptId', 'wordId', 'rating', 'responseTimeMs', 'answeredAt'])
      || typeof attempt.attemptId !== 'string' || !UUID.test(attempt.attemptId) || ids.has(attempt.attemptId)
      || !isId(attempt.wordId) || typeof attempt.rating !== 'number' || !Number.isInteger(attempt.rating) || attempt.rating < 0 || attempt.rating > 3
      || typeof attempt.responseTimeMs !== 'number' || !Number.isSafeInteger(attempt.responseTimeMs) || attempt.responseTimeMs < 0 || attempt.responseTimeMs > GUEST_LEARNING_MAX_RESPONSE_TIME_MS
      || typeof attempt.answeredAt !== 'number' || !Number.isSafeInteger(attempt.answeredAt) || attempt.answeredAt <= 0
      || attempt.answeredAt < now - GUEST_LEARNING_TTL_MS || attempt.answeredAt > now + 60_000) throw new HttpError(400, '学習回答の内容・有効期限が正しくありません。');
    ids.add(attempt.attemptId);
  }
  return candidate as unknown as GuestLearningImportRequest;
};

const assertOwner = (user: DbUserRow) => {
  requireRole(user, [UserRole.STUDENT]);
  if (isDemoEmail(user.email)) throw new HttpError(403, 'ご本人の生徒アカウントに保存してください。');
};

const assertPublicNaru = (row: DbBookRow | null): DbBookRow => {
  if (!row || row.id !== NARU_BOOK_ID || row.created_by !== null
    || row.catalog_source !== BookCatalogSource.STEADY_STUDY_ORIGINAL || row.access_scope !== BookAccessScope.ALL_PLANS
    || row.ledger_rights_status !== 'approved' || row.ledger_review_status !== 'approved'
    || !toBookMetadata(row).qualityGate?.isApprovedForLearner
    || row.ledger_qa_word_count !== row.word_count
    || row.word_count < 1 || row.word_count > 5000) throw new HttpError(503, 'Naruシストは現在確認中です。時間をおいて再試行してください。');
  return row;
};

// This fixed route never accepts a caller-selected book or account scope.
export const readGuestLearningCatalog = async (env: AppEnv): Promise<GuestLearningCatalogResponse> => {
  const row = assertPublicNaru(await getBookRow(env, NARU_BOOK_ID));
  const result = await env.DB.prepare(`SELECT w.*,
    EXISTS (SELECT 1 FROM catalog_word_source_links l JOIN catalog_source_entries e ON e.id = l.source_entry_id
      JOIN catalog_workbook_sources s ON s.id = e.source_id WHERE l.word_id = w.id AND e.ready = 1) AS source_ready,
    EXISTS (SELECT 1 FROM catalog_word_source_links l JOIN catalog_source_entries e ON e.id = l.source_entry_id
      WHERE l.word_id = w.id AND e.ready <> 1) AS source_blocked
    FROM words w WHERE w.book_id = ?
      AND EXISTS (SELECT 1 FROM material_source_ledger m WHERE m.book_id = w.book_id
        AND m.catalog_source = 'STEADY_STUDY_ORIGINAL' AND m.rights_status = 'approved' AND m.review_status = 'approved')
    ORDER BY w.word_number, w.id LIMIT 5001`).bind(NARU_BOOK_ID)
    .all<DbWordRow & { source_ready: number; source_blocked: number }>();
  if (result.success === false || !result.results) throw new HttpError(500, '教材の取得に失敗しました。');
  const words = result.results;
  if (words.length !== row.word_count || words.some((word) => !word.word?.trim() || !word.definition?.trim()
    || !word.source_sheet?.trim()
    || word.source_ready !== 1 || word.source_blocked !== 0)) {
    throw new HttpError(503, 'Naruシストは現在確認中です。時間をおいて再試行してください。');
  }
  const metadata = toBookMetadata(row);
  // Keep ledger/report details in the authorized catalog, and use the existing
  // audited-asset projection. Images use an authenticated route, so omit URLs.
  const book = { id: metadata.id, title: metadata.title, wordCount: metadata.wordCount,
    isPriority: metadata.isPriority, description: metadata.description,
    catalogSource: metadata.catalogSource, accessScope: metadata.accessScope };
  return { serverTimeMs: Date.now(), book, words: words.map((word) => ({ ...toWordData(word), exampleImageUrl: null })) };
};

const clientId = (sessionId: string, attemptId: string) => `guest_naru_${sessionId}_${attemptId}`;

export const readGuestLearningSummary = async (env: AppEnv, user: DbUserRow, sessionId: string): Promise<GuestLearningSummary | null> => {
  assertOwner(user);
  if (!UUID.test(sessionId)) throw new HttpError(400, '学習記録の識別子が正しくありません。');
  const claim = await env.DB.prepare(`SELECT session_id AS sessionId, version, imported_at AS importedAt
    FROM guest_learning_claims WHERE session_id = ? AND user_id = ?`).bind(sessionId, user.id).first<Omit<GuestLearningSummary, 'importedAttemptIds'>>();
  if (!claim) return null;
  const result = await env.DB.prepare(`SELECT a.attempt_id AS attemptId, a.word_id AS wordId, a.rating,
    a.response_time_ms AS responseTimeMs, r.request_fingerprint AS fingerprint FROM guest_learning_attempts a
    JOIN guest_learning_claims c ON c.session_id = a.session_id
    JOIN study_attempt_receipts r ON r.user_id = c.user_id AND r.client_attempt_id = a.client_attempt_id
    WHERE c.session_id = ? AND c.user_id = ? ORDER BY a.answered_at, a.attempt_id`).bind(sessionId, user.id)
    .all<{ attemptId: string; wordId: string; rating: number; responseTimeMs: number; fingerprint: string }>();
  if (result.success === false || !result.results) throw new HttpError(500, '保存済み学習記録の確認に失敗しました。');
  return { ...claim, importedAttemptIds: result.results.filter((attempt) => attempt.fingerprint === studyAttemptFingerprint({
    wordId: attempt.wordId, bookId: NARU_BOOK_ID, rating: attempt.rating, responseTimeMs: attempt.responseTimeMs,
  })).map(({ attemptId }) => attemptId) };
};

export const commitGuestLearningImport = async (env: AppEnv, user: DbUserRow, candidate: unknown): Promise<GuestLearningImportResponse> => {
  assertOwner(user);
  const input = validateGuestLearningImport(candidate);
  if (input.expectedUserId !== user.id) throw new HttpError(409, CONFLICT);
  // Validate the entire batch and canonical membership before claiming anything.
  const catalog = await readGuestLearningCatalog(env);
  await assertBookLearningAccess(env, user, NARU_BOOK_ID);
  const ids = [...new Set(input.attempts.map(({ wordId }) => wordId))];
  const canonicalIds = new Set(catalog.words.map(({ id }) => id));
  if (ids.some((id) => !canonicalIds.has(id))) throw new HttpError(400, 'Naruシストの回答だけを保存できます。');
  const statements = [env.DB.prepare(`INSERT INTO guest_learning_claims (session_id, user_id, version, imported_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET session_id = CASE WHEN guest_learning_claims.user_id = excluded.user_id
    AND guest_learning_claims.version = excluded.version THEN guest_learning_claims.session_id ELSE NULL END`)
    .bind(input.sessionId, user.id, input.version, Date.now())];
  for (const attempt of input.attempts) {
    statements.push(env.DB.prepare(`INSERT INTO guest_learning_attempts (session_id, attempt_id, word_id, rating, response_time_ms, answered_at, client_attempt_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, attempt_id) DO UPDATE SET attempt_id = CASE
      WHEN guest_learning_attempts.word_id = excluded.word_id AND guest_learning_attempts.rating = excluded.rating
      AND guest_learning_attempts.response_time_ms = excluded.response_time_ms AND guest_learning_attempts.answered_at = excluded.answered_at
      THEN guest_learning_attempts.attempt_id ELSE NULL END`).bind(input.sessionId, attempt.attemptId,
      attempt.wordId, attempt.rating, attempt.responseTimeMs, attempt.answeredAt, clientId(input.sessionId, attempt.attemptId)));
  }
  // A count overflow deliberately fails NOT NULL and rolls back the full claim batch.
  statements.push(env.DB.prepare(`UPDATE guest_learning_claims SET session_id = NULL WHERE session_id = ?
    AND (SELECT COUNT(*) FROM guest_learning_attempts WHERE session_id = ?) > 5000`).bind(input.sessionId, input.sessionId));
  try {
    const results = await env.DB.batch(statements);
    if (results.some((result) => result.success === false)) throw new Error('Guest learning claim failed');
  } catch (error) {
    if (error instanceof Error && /constraint|unique|not null/i.test(error.message)) throw new HttpError(409, CONFLICT);
    throw error;
  }
  const failedAttempts: GuestLearningImportResponse['failedAttempts'] = [];
  // Each answer has its own canonical SRS receipt transaction. Stable IDs make
  // retries safe after partial success; XP/mission rewards are never granted.
  const ordered = [...input.attempts].sort((a, b) => a.answeredAt - b.answeredAt || a.attemptId.localeCompare(b.attemptId));
  for (const [index, attempt] of ordered.entries()) {
    try {
      await commitStudyAttempt(env, user.id, { wordId: attempt.wordId, bookId: NARU_BOOK_ID, rating: attempt.rating,
        responseTimeMs: attempt.responseTimeMs, clientAttemptId: clientId(input.sessionId, attempt.attemptId) }, { bookProgressionBand: null });
    } catch (error) {
      let retryable = !(error instanceof HttpError && error.status === 400);
      if (error instanceof HttpError && error.status === 409) {
        const receipt = await env.DB.prepare('SELECT request_fingerprint FROM study_attempt_receipts WHERE user_id = ? AND client_attempt_id = ?')
          .bind(user.id, clientId(input.sessionId, attempt.attemptId)).first<{ request_fingerprint: string }>();
        // A stale-history conflict remains retryable; a reused ID with different
        // content cannot be repaired by replaying the same guest answer.
        retryable = !receipt || receipt.request_fingerprint === studyAttemptFingerprint({
          wordId: attempt.wordId, bookId: NARU_BOOK_ID, rating: attempt.rating, responseTimeMs: attempt.responseTimeMs,
        });
      }
      failedAttempts.push({ attemptId: attempt.attemptId, retryable });
      // Preserve sequence after a failed answer; later answers can be retried.
      failedAttempts.push(...ordered.slice(index + 1).map((entry) => ({ attemptId: entry.attemptId, retryable: true })));
      break;
    }
  }
  const summary = await readGuestLearningSummary(env, user, input.sessionId);
  if (!summary) throw new HttpError(500, '保存確認に失敗しました。同じ回答で再試行してください。');
  const successful = new Set(summary.importedAttemptIds);
  return { ...summary, importedAttemptIds: input.attempts.filter(({ attemptId }) => successful.has(attemptId)).map(({ attemptId }) => attemptId),
    failedAttempts: failedAttempts.filter(({ attemptId }) => !successful.has(attemptId)) };
};

export const guestLearningRoutes: ApiRouteDefinition[] = [
  { matches: ({ pathname, request }) => pathname === 'guest-learning/naru' && request.method === 'GET',
    handle: async ({ env, request }) => {
      if (new URL(request.url).search) throw new HttpError(400, '教材の取得条件が正しくありません。');
      return { response: createJsonResponse(await readGuestLearningCatalog(env)) };
    } },
  { matches: ({ pathname, request }) => pathname === 'guest-learning/import' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      return { logUser: user, response: createJsonResponse(await commitGuestLearningImport(env, user, await readJson<unknown>(request, { maxBytes: 32768 }))) };
    } },
  { matches: ({ pathname, request }) => pathname === 'guest-learning/summary' && request.method === 'GET',
    handle: async ({ env, request }) => {
      const user = await requireUser(env, request);
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some((key) => key !== 'sessionId') || query.getAll('sessionId').length !== 1) throw new HttpError(400, '学習記録の取得条件が正しくありません。');
      return { logUser: user, response: createJsonResponse(await readGuestLearningSummary(env, user, query.get('sessionId') || '')) };
    } },
];
