import {
  ActivityLog,
  EnglishLevel,
  type GrammarCurriculumScopeId,
  type JapaneseTranslationFeedback,
  LearningPlan,
  LearningPreference,
  LearningPreferenceIntensity,
  LearningTaskIntentType,
  UserProfile,
  type WorksheetQuestionMode,
} from '../../types';
import type {
  EnglishPracticeAttemptPayload,
  EnglishPracticeAttemptResult,
} from '../../contracts/storage';
import {
  type EnglishPracticeAttemptMode,
  type EnglishPracticeLaneId,
} from '../../shared/englishPractice';
import { MASTERY_INTERACTION_SOURCE } from '../../shared/learningHistory';
import { isWorksheetQuestionMode } from '../../shared/worksheetQuestionMode';
import { isValidStudySessionXp, MAX_STUDY_SESSION_XP, resolveXpProgress } from '../../shared/xp';
import { resolveBookProgressionBand, rebuildWeaknessSignalsForUser } from './weakness-actions';
import { formatDateKey } from '../../utils/date';
import { getGrammarCurriculumScope } from '../../utils/grammarScope';
import { mapUserRowToProfile } from './auth';
import { readLearningPlanBookIds, syncLearningPlanBooks } from './learning-plan-books';
import { readActiveOrganizationContextForUser } from './organization-memberships';
import {
  readMissionAssignmentsByStudent,
  touchWeeklyMissionProgressFromQuiz,
  touchWeeklyMissionProgressFromStudy,
} from './storage-mission-actions';
import { rebuildOrganizationKpiSnapshots } from './organization-kpi';
import {
  AppEnv,
  DbUserRow,
} from './types';
import {
  DAY_MS,
  assertBookLearningAccess,
  defaultLearningPreference,
  getBookProgress,
  getLastTokyoDateKeys,
  getMasterySourceSql,
  getVisibleDueCount,
  readAll,
  readFirst,
  readVisibleLearningBookRows,
  type DbHistoryRow,
  type DbLearningPreferenceRow,
} from './storage-support';
import { HttpError } from './http';
import { commitStudyAttempt } from './study-attempt-receipts';
import { validateStudyAttempt } from '../../shared/srs';
import { commitQuizAttempt, readQuizAttemptReceipt, toQuizAttemptReceipt } from './quiz-attempt-receipts';
import { createEnglishPracticeQuizAttemptId, validateQuizAttempt, type QuizAttemptReceipt } from '../../shared/quizAttempt';

const rebuildOrganizationKpiForUser = async (env: AppEnv, userId: string, dateKeys: string[]): Promise<void> => {
  const organization = await readActiveOrganizationContextForUser(env, userId);
  if (!organization) return;
  await rebuildOrganizationKpiSnapshots(env, organization.organizationId, { dateKeys });
};

const MAX_SELECTED_PLAN_BOOKS = 5;

const normalizePlanDailyWordGoal = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 12;
  return Math.min(80, Math.max(1, Math.round(numeric)));
};

const normalizePlanStatus = (value: unknown): LearningPlan['status'] => (
  value === 'COMPLETED' || value === 'ABANDONED' ? value : 'ACTIVE'
);

const normalizePlanTargetDate = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 24);
  return formatDateKey(new Date(Date.now() + DAY_MS * 30));
};

const normalizePlanGoalDescription = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 240);
  return '学習プランを作成しました。';
};

const normalizePlanCreatedAt = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
};

const normalizeSelectedPlanBookIds = async (
  env: AppEnv,
  user: DbUserRow,
  selectedBookIds: unknown,
): Promise<string[]> => {
  if (!Array.isArray(selectedBookIds)) {
    throw new HttpError(400, '学習プランには少なくとも1冊の教材が必要です。');
  }

  const requestedBookIds = selectedBookIds
    .map((bookId) => (typeof bookId === 'string' ? bookId.trim() : ''))
    .filter(Boolean)
    .filter((bookId, index, array) => array.indexOf(bookId) === index);

  if (requestedBookIds.length === 0) {
    throw new HttpError(400, '学習プランには少なくとも1冊の教材が必要です。');
  }
  if (requestedBookIds.length > MAX_SELECTED_PLAN_BOOKS) {
    throw new HttpError(400, '学習プランの教材は5冊以内に絞ってください。');
  }

  const visibleBookRows = await readVisibleLearningBookRows(env, user);
  const visibleBookIds = new Set(visibleBookRows.map((book) => book.id));
  const inaccessibleBookIds = requestedBookIds.filter((bookId) => !visibleBookIds.has(bookId));
  if (inaccessibleBookIds.length > 0) {
    throw new HttpError(400, '学習プランには確認済みの教材だけを選んでください。');
  }

  return requestedBookIds;
};

const ENGLISH_PRACTICE_QUIZ_MODES = [
  'GRAMMAR_CLOZE',
  'EN_WORD_ORDER',
  'JA_TRANSLATION_INPUT',
  'JA_TRANSLATION_ORDER',
] as const satisfies readonly WorksheetQuestionMode[];

const isEnglishPracticeQuizMode = (
  mode: EnglishPracticeAttemptMode,
): mode is typeof ENGLISH_PRACTICE_QUIZ_MODES[number] => (
  (ENGLISH_PRACTICE_QUIZ_MODES as readonly string[]).includes(mode)
);

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const createEnglishPracticeAttemptId = (userId: string, clientAttemptId: string): string => (
  `english-practice-${hashString(`${userId}:${clientAttemptId}`)}`
);

const assertWordBelongsToBook = async (
  env: AppEnv,
  wordId: string,
  bookId: string,
): Promise<void> => {
  const row = await readFirst<{ book_id: string }>(
    env,
    'SELECT book_id FROM words WHERE id = ?',
    wordId,
  );
  if (!row) throw new HttpError(404, '単語が見つかりません。');
  if (row.book_id !== bookId) {
    throw new HttpError(400, '単語と単語帳の組み合わせが一致しません。');
  }
};

const validateQuizAttemptConsistency = async (
  env: AppEnv,
  wordId: string,
  bookId: string,
  correct: boolean,
  questionMode: WorksheetQuestionMode,
  responseTimeMs: number,
  generatedProblemId?: string,
  grammarScopeId?: GrammarCurriculumScopeId,
  translationFeedback?: JapaneseTranslationFeedback,
): Promise<void> => {
  if (!Number.isFinite(responseTimeMs) || responseTimeMs < 0 || responseTimeMs > 3_600_000) {
    throw new HttpError(400, 'responseTimeMs が不正です。');
  }
  await assertWordBelongsToBook(env, wordId, bookId);

  if (grammarScopeId) {
    try {
      getGrammarCurriculumScope(grammarScopeId);
    } catch {
      throw new HttpError(400, 'grammarScopeId が不正です。');
    }
    if (!(ENGLISH_PRACTICE_QUIZ_MODES as readonly string[]).includes(questionMode)) {
      throw new HttpError(400, 'grammarScopeId は文法・和訳系の問題でのみ指定できます。');
    }
  }

  if (generatedProblemId) {
    const row = await readFirst<{
      word_id: string;
      book_id: string;
      question_mode: string;
      grammar_scope_id: string | null;
    }>(
      env,
      `SELECT word_id, book_id, question_mode, grammar_scope_id
       FROM ai_generated_problems
       WHERE id = ?`,
      generatedProblemId,
    );
    if (
      !row
      || row.word_id !== wordId
      || row.book_id !== bookId
      || row.question_mode !== questionMode
      || (grammarScopeId && row.grammar_scope_id !== grammarScopeId)
    ) {
      throw new HttpError(400, 'AI生成問題と解答記録の組み合わせが一致しません。');
    }
  }

  if (translationFeedback) {
    if (questionMode !== 'JA_TRANSLATION_INPUT') {
      throw new HttpError(400, 'translationFeedback は全文和訳入力でのみ保存できます。');
    }
    if (
      !Number.isFinite(translationFeedback.score)
      || !Number.isFinite(translationFeedback.maxScore)
      || typeof translationFeedback.verdictLabel !== 'string'
      || translationFeedback.score < 0
      || translationFeedback.maxScore <= 0
      || translationFeedback.score > translationFeedback.maxScore
      || translationFeedback.isCorrect !== correct
    ) {
      throw new HttpError(400, 'translationFeedback の採点値が不正です。');
    }
  }
};

export const handleAddXP = async (
  env: AppEnv,
  user: DbUserRow,
  amount: number,
): Promise<{ user: UserProfile; leveledUp: boolean; }> => {
  if (!isValidStudySessionXp(amount)) {
    throw new HttpError(400, `XP は 1 から ${MAX_STUDY_SESSION_XP} までの整数で指定してください。`);
  }

  const currentXp = Number(user.stats_xp ?? 0);
  const currentLevel = Number(user.stats_level ?? 1);
  if (
    !Number.isSafeInteger(currentXp)
    || currentXp < 0
    || !Number.isSafeInteger(currentLevel)
    || currentLevel < 1
    || !Number.isSafeInteger(currentLevel * 100)
    || currentXp >= currentLevel * 100
  ) {
    throw new HttpError(500, 'XP状態が破損しています。');
  }

  const progress = resolveXpProgress(currentLevel, currentXp, amount);
  if (!progress) {
    throw new HttpError(500, 'XP状態が安全な数値範囲を超えています。');
  }
  const { xp, level } = progress;
  const leveledUp = level > currentLevel;

  const updateResult = await env.DB.prepare(`
    UPDATE users
    SET stats_xp = ?, stats_level = ?, updated_at = ?
    WHERE id = ? AND stats_xp = ? AND stats_level = ?
  `).bind(xp, level, Date.now(), user.id, currentXp, currentLevel).run();
  if ((updateResult.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, 'XPが別のセッションで更新されました。最新状態でやり直してください。');
  }

  const updated = await readFirst<DbUserRow>(env, 'SELECT * FROM users WHERE id = ?', user.id);
  if (!updated) throw new HttpError(500, 'XP更新後のユーザー取得に失敗しました。');

  return {
    user: mapUserRowToProfile(updated),
    leveledUp,
  };
};

export const handleGetDueCount = async (env: AppEnv, user: DbUserRow): Promise<number> => (
  getVisibleDueCount(env, user)
);

export const handleSaveSrsHistory = async (
  env: AppEnv,
  user: DbUserRow,
  word: { id: string; bookId: string; },
  rating: number,
  responseTimeMs = 0,
  missionAssignmentId?: string,
  taskIntentType?: LearningTaskIntentType,
  clientAttemptId?: string,
): Promise<void> => {
  const input = { wordId: word?.id, bookId: word?.bookId, rating, responseTimeMs, missionAssignmentId, taskIntentType, clientAttemptId };
  try { validateStudyAttempt(input); } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : '学習記録が不正です。');
  }
  await assertBookLearningAccess(env, user, word.bookId);
  await assertWordBelongsToBook(env, word.id, word.bookId);
  const [bookProgressionBand, missionAssignments] = await Promise.all([
    resolveBookProgressionBand(env, word.bookId),
    readMissionAssignmentsByStudent(env, [user.id]),
  ]);
  if (missionAssignmentId) {
    const ownedAssignment = await readFirst<{ id: string }>(env, `
      SELECT a.id FROM weekly_mission_assignments a
      JOIN weekly_missions m ON m.id = a.mission_id
      WHERE a.id = ? AND a.student_user_id = ? AND (m.book_id IS NULL OR m.book_id = ?)
    `, missionAssignmentId, user.id, word.bookId);
    if (!ownedAssignment) throw new HttpError(400, '学習記録とミッションの組み合わせが一致しません。');
  }
  const missionAssignment = missionAssignments.get(user.id);
  const effectiveMissionAssignmentId = missionAssignmentId || (
    !missionAssignment?.mission.bookId || missionAssignment.mission.bookId === word.bookId
      ? missionAssignment?.id
      : undefined
  );
  const receipt = await commitStudyAttempt(env, user.id, input, {
    missionAssignmentId: effectiveMissionAssignmentId,
    bookProgressionBand,
  });

  // These derived views may be rebuilt safely after a lost response. The receipt
  // preserves the original new/review classification and mission assignment.
  await rebuildWeaknessSignalsForUser(env, user.id, user);
  if (receipt.mission_assignment_id) {
    await touchWeeklyMissionProgressFromStudy(env, user, {
      wordId: receipt.word_id,
      bookId: receipt.book_id,
      assignmentId: receipt.mission_assignment_id || undefined,
      existingWasStudy: Boolean(receipt.existing_was_study),
      studiedAt: receipt.created_at,
    });
  }
  await rebuildOrganizationKpiForUser(env, user.id, getLastTokyoDateKeys(4));
};

export const handleRecordQuizAttempt = async (
  env: AppEnv,
  user: DbUserRow,
  wordId: string,
  bookId: string,
  correct: boolean,
  questionMode: WorksheetQuestionMode,
  responseTimeMs = 0,
  missionAssignmentId?: string,
  taskIntentType?: LearningTaskIntentType,
  generatedProblemId?: string,
  grammarScopeId?: GrammarCurriculumScopeId,
  translationFeedback?: JapaneseTranslationFeedback,
  clientAttemptId?: string,
): Promise<QuizAttemptReceipt | null> => {
  const input = { wordId, bookId, correct, questionMode, responseTimeMs, missionAssignmentId,
    taskIntentType, generatedProblemId, grammarScopeId, translationFeedback, clientAttemptId };
  try { validateQuizAttempt(input); } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : '小テスト記録が不正です。');
  }
  // Authorization is evaluated for every request, including receipt replays.
  await assertBookLearningAccess(env, user, bookId);
  await validateQuizAttemptConsistency(env, wordId, bookId, correct, questionMode,
    responseTimeMs, generatedProblemId, grammarScopeId, translationFeedback);
  if (missionAssignmentId) {
    const ownedAssignment = await readFirst<{ id: string }>(env, `
      SELECT a.id FROM weekly_mission_assignments a
      JOIN weekly_missions m ON m.id = a.mission_id
      WHERE a.id = ? AND a.student_user_id = ? AND (m.book_id IS NULL OR m.book_id = ?)
    `, missionAssignmentId, user.id, bookId);
    if (!ownedAssignment) throw new HttpError(400, '小テスト記録とミッションの組み合わせが一致しません。');
  }
  const [bookProgressionBand, missionAssignments] = await Promise.all([
    resolveBookProgressionBand(env, bookId), readMissionAssignmentsByStudent(env, [user.id]),
  ]);
  const missionAssignment = missionAssignments.get(user.id);
  const effectiveMissionAssignmentId = missionAssignmentId || (
    !missionAssignment?.mission.bookId || missionAssignment.mission.bookId === bookId
      ? missionAssignment?.id : undefined
  );
  const receipt = await commitQuizAttempt(env, user.id, input, {
    missionAssignmentId: effectiveMissionAssignmentId, bookProgressionBand, organizationId: user.organization_id,
  });
  // Canonical history/event/CBT writes have committed. Derived projections are
  // idempotent and may be rebuilt on replay; failures never imply the answer was lost.
  if (receipt.projection_status === 'PENDING') {
    try {
      await rebuildWeaknessSignalsForUser(env, user.id, user);
      if (receipt.mission_assignment_id) {
        await touchWeeklyMissionProgressFromQuiz(env, user, {
          bookId: receipt.book_id, assignmentId: receipt.mission_assignment_id,
          dateKey: formatDateKey(receipt.created_at), attemptedAt: receipt.created_at,
        });
      }
      await env.DB.prepare(`UPDATE quiz_attempt_receipts SET projection_status = 'COMPLETE', projection_failed_at = NULL
        WHERE user_id = ? AND client_attempt_id = ?`).bind(user.id, receipt.client_attempt_id).run();
    } catch (error) {
      console.warn('Quiz projections pending rebuild:', error);
      try {
        await env.DB.prepare(`UPDATE quiz_attempt_receipts SET projection_failed_at = ?
          WHERE user_id = ? AND client_attempt_id = ? AND projection_status = 'PENDING'`)
          .bind(Date.now(), user.id, receipt.client_attempt_id).run();
      } catch (metadataError) { console.warn('Quiz projection status update failed:', metadataError); }
    }
  }
  // Read the durable status after projection attempts. Another replay may have
  // completed it concurrently; failed metadata/readback never implies COMPLETE.
  let confirmedReceipt = receipt;
  if (receipt.projection_status === 'PENDING') {
    try {
      confirmedReceipt = await readQuizAttemptReceipt(env, user.id, receipt.client_attempt_id) || receipt;
    } catch { console.warn('Quiz projection confirmation pending readback.'); }
  }
  // Legacy callers keep their successful 204. A pending legacy answer instead
  // exposes its generated ID for recovery; throwing after commit would invite
  // an ID-less retry that writes the same canonical answer again.
  return clientAttemptId || confirmedReceipt.projection_status === 'PENDING'
    ? toQuizAttemptReceipt(confirmedReceipt) : null;
};

const validateEnglishPracticeAttemptPayload = (payload: EnglishPracticeAttemptPayload): void => {
  if (typeof payload.clientAttemptId !== 'string' || !payload.clientAttemptId.trim()) {
    throw new HttpError(400, '英語演習の記録識別子が不正です。');
  }
  const laneModeAllowed: Record<EnglishPracticeLaneId, readonly EnglishPracticeAttemptMode[]> = {
    grammar: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER'],
    translation: ['JA_TRANSLATION_INPUT', 'JA_TRANSLATION_ORDER'],
    reading: ['READING'],
    writing: ['WRITING'],
  };
  if (!laneModeAllowed[payload.lane]?.includes(payload.mode)) {
    throw new HttpError(400, '英語演習のレーンと問題種別の組み合わせが不正です。');
  }
  if (payload.score != null && (!Number.isFinite(payload.score) || payload.score < 0)) {
    throw new HttpError(400, 'score が不正です。');
  }
  if (payload.maxScore != null && (!Number.isFinite(payload.maxScore) || payload.maxScore <= 0)) {
    throw new HttpError(400, 'maxScore が不正です。');
  }
  if (payload.score != null && payload.maxScore != null && payload.score > payload.maxScore) {
    throw new HttpError(400, 'score は maxScore 以下である必要があります。');
  }
  if (payload.responseTimeMs != null && (!Number.isFinite(payload.responseTimeMs) || payload.responseTimeMs < 0 || payload.responseTimeMs > 3_600_000)) {
    throw new HttpError(400, 'responseTimeMs が不正です。');
  }
  if ((payload.wordId && !payload.bookId) || (!payload.wordId && payload.bookId)) {
    throw new HttpError(400, 'wordId と bookId は同時に指定してください。');
  }
  if (payload.level && !Object.values(EnglishLevel).includes(payload.level)) {
    throw new HttpError(400, 'level が不正です。');
  }
};

export const handleRecordEnglishPracticeAttempt = async (
  env: AppEnv,
  user: DbUserRow,
  payload: EnglishPracticeAttemptPayload,
): Promise<EnglishPracticeAttemptResult> => {
  validateEnglishPracticeAttemptPayload(payload);
  const now = Date.now();
  const occurredAt = payload.occurredAt && Number.isFinite(payload.occurredAt)
    ? Math.max(0, Math.round(payload.occurredAt))
    : now;
  const responseTimeMs = Math.max(0, Math.round(payload.responseTimeMs || 0));
  const id = createEnglishPracticeAttemptId(user.id, payload.clientAttemptId);
  const shouldDelegateQuizAttempt = Boolean(
    payload.wordId
    && payload.bookId
    && isEnglishPracticeQuizMode(payload.mode)
    && isWorksheetQuestionMode(payload.mode),
  );

  const existing = await readFirst<{ id: string; delegated_quiz_attempt: number }>(
    env,
    `SELECT id, delegated_quiz_attempt
     FROM english_practice_attempts
     WHERE user_id = ? AND client_attempt_id = ?`,
    user.id,
    payload.clientAttemptId,
  );

  if (payload.wordId && payload.bookId) {
    await assertBookLearningAccess(env, user, payload.bookId);
    await assertWordBelongsToBook(env, payload.wordId, payload.bookId);
  }

  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO english_practice_attempts (
        id, user_id, client_attempt_id, lane, mode, correct, score, max_score,
        response_time_ms, word_id, book_id, grammar_scope_id, scope_label_ja,
        reading_question_kind, level, payload_json, delegated_quiz_attempt, created_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_id, client_attempt_id) DO NOTHING
    `).bind(
      id,
      user.id,
      payload.clientAttemptId,
      payload.lane,
      payload.mode,
      payload.correct ? 1 : 0,
      payload.score ?? null,
      payload.maxScore ?? null,
      responseTimeMs,
      payload.wordId || null,
      payload.bookId || null,
      payload.grammarScopeId || null,
      payload.scopeLabelJa || null,
      payload.readingQuestionKind || null,
      payload.level || null,
      JSON.stringify({
        word: payload.word || null,
        translationFeedback: payload.translationFeedback || null,
      }),
      occurredAt,
      now,
    ).run();
  }

  let projectionStatus: EnglishPracticeAttemptResult['projectionStatus'] = 'COMPLETE';
  const delegatedAttemptId = shouldDelegateQuizAttempt
    ? await createEnglishPracticeQuizAttemptId(user.id, payload.clientAttemptId) : undefined;
  const delegatedReceipt = delegatedAttemptId
    ? await readQuizAttemptReceipt(env, user.id, delegatedAttemptId) : null;
  // Replays of new delegated records reauthorize and check the immutable quiz
  // fingerprint even after completion. Legacy completed records have no stable
  // receipt mapping; do not create a second canonical answer for those rows.
  if (shouldDelegateQuizAttempt && (!existing?.delegated_quiz_attempt || delegatedReceipt)) {
    const receipt = await handleRecordQuizAttempt(
      env,
      user,
      payload.wordId!,
      payload.bookId!,
      payload.correct,
      payload.mode as WorksheetQuestionMode,
      responseTimeMs,
      undefined,
      undefined,
      payload.generatedProblemId,
      payload.grammarScopeId,
      payload.translationFeedback,
      delegatedAttemptId,
    );
    projectionStatus = receipt?.projectionStatus || 'PENDING';
    if (projectionStatus === 'COMPLETE' && !existing?.delegated_quiz_attempt) {
      try {
        const result = await env.DB.prepare(`
          UPDATE english_practice_attempts
          SET delegated_quiz_attempt = 1, synced_at = ?
          WHERE user_id = ? AND client_attempt_id = ?
        `).bind(now, user.id, payload.clientAttemptId).run();
        if (result.success === false || (result.meta.changes ?? 0) !== 1) {
          projectionStatus = 'PENDING';
        }
      } catch {
        // The canonical answer is already durable. Keep the original English
        // attempt queued until its delegation confirmation can be written.
        console.warn('English practice delegation confirmation pending.');
        projectionStatus = 'PENDING';
      }
    }
  }

  return {
    id: existing?.id || id,
    deduplicated: Boolean(existing),
    delegatedQuizAttempt: shouldDelegateQuizAttempt,
    projectionStatus,
  };
};

export const handleGetStudiedWordIdsByBook = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
): Promise<string[]> => {
  await assertBookLearningAccess(env, user, bookId);
  const rows = await readAll<{ word_id: string }>(
    env,
    `SELECT word_id
     FROM learning_histories
     WHERE user_id = ? AND book_id = ? AND ${getMasterySourceSql()}`,
    user.id,
    bookId,
  );
  return Array.from(new Set(rows.map((row) => row.word_id)));
};

export const handleGetBookProgress = async (env: AppEnv, user: DbUserRow, bookId: string) => {
  await assertBookLearningAccess(env, user, bookId);
  return getBookProgress(env, user.id, bookId);
};

export const handleResetAllData = async (env: AppEnv): Promise<void> => {
  const [writingAssetRows, wordHintRows] = await Promise.all([
    readAll<{ r2_key: string | null }>(
      env,
      `SELECT r2_key
       FROM writing_submission_assets
       WHERE r2_key IS NOT NULL
         AND TRIM(r2_key) != ''`,
    ),
    readAll<{ example_image_key: string | null }>(
      env,
      `SELECT example_image_key
       FROM words
       WHERE example_image_key IS NOT NULL
         AND TRIM(example_image_key) != ''`,
    ),
  ]);
  const r2Keys = Array.from(new Set([
    ...writingAssetRows.map((row) => row.r2_key).filter((key): key is string => Boolean(key)),
    ...wordHintRows.map((row) => row.example_image_key).filter((key): key is string => Boolean(key)),
  ]));
  if (env.WRITING_ASSETS && r2Keys.length > 0) {
    await Promise.all(r2Keys.map((key) => env.WRITING_ASSETS!.delete(key)));
  }

  const statements = [
    env.DB.prepare('DELETE FROM product_feedback_reports'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM writing_teacher_reviews'),
    env.DB.prepare('DELETE FROM writing_ai_evaluations'),
    env.DB.prepare('DELETE FROM writing_submission_assets'),
    env.DB.prepare('DELETE FROM writing_submissions'),
    env.DB.prepare('DELETE FROM writing_assignments'),
    env.DB.prepare('DELETE FROM ai_usage_events'),
    env.DB.prepare('DELETE FROM product_events'),
    env.DB.prepare('DELETE FROM product_kpi_daily_snapshots'),
    env.DB.prepare('DELETE FROM instructor_notifications'),
    env.DB.prepare('DELETE FROM product_announcement_receipts'),
    env.DB.prepare('DELETE FROM product_announcements'),
    env.DB.prepare('DELETE FROM commercial_requests'),
    env.DB.prepare('DELETE FROM student_instructor_assignment_events'),
    env.DB.prepare('DELETE FROM organization_audit_logs'),
    env.DB.prepare('DELETE FROM organization_memberships'),
    env.DB.prepare('DELETE FROM organization_kpi_daily_snapshots'),
    env.DB.prepare('DELETE FROM weekly_mission_assignments'),
    env.DB.prepare('DELETE FROM weekly_missions'),
    env.DB.prepare('DELETE FROM student_weakness_signals'),
    env.DB.prepare('DELETE FROM study_attempt_receipts'),
    env.DB.prepare('DELETE FROM learning_interaction_events'),
    env.DB.prepare('DELETE FROM english_practice_attempts'),
    env.DB.prepare('DELETE FROM word_reports'),
    env.DB.prepare('DELETE FROM learning_histories'),
    env.DB.prepare('DELETE FROM student_instructor_assignments'),
    env.DB.prepare('DELETE FROM learning_preferences'),
    env.DB.prepare('DELETE FROM learning_plan_books'),
    env.DB.prepare('DELETE FROM learning_plans'),
    env.DB.prepare('DELETE FROM words'),
    env.DB.prepare('DELETE FROM books'),
    env.DB.prepare('DELETE FROM organizations'),
    env.DB.prepare(`
      UPDATE users
      SET stats_xp = 0,
          stats_level = 1,
          stats_current_streak = 0,
          organization_id = NULL,
          organization_name = NULL,
          organization_role = NULL,
          updated_at = ?
    `).bind(Date.now()),
  ];
  await env.DB.batch(statements);
};

export const handleSaveLearningPlan = async (env: AppEnv, user: DbUserRow, plan: LearningPlan): Promise<void> => {
  const selectedBookIds = await normalizeSelectedPlanBookIds(env, user, plan.selectedBookIds);
  const createdAt = normalizePlanCreatedAt(plan.createdAt);
  const updatedAt = Date.now();
  const normalizedPlan: LearningPlan = {
    uid: user.id,
    createdAt,
    targetDate: normalizePlanTargetDate(plan.targetDate),
    goalDescription: normalizePlanGoalDescription(plan.goalDescription),
    dailyWordGoal: normalizePlanDailyWordGoal(plan.dailyWordGoal),
    selectedBookIds,
    status: normalizePlanStatus(plan.status),
  };

  await env.DB.prepare(`
    INSERT INTO learning_plans (
      user_id, created_at, target_date, goal_description, daily_word_goal, selected_book_ids, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      target_date = excluded.target_date,
      goal_description = excluded.goal_description,
      daily_word_goal = excluded.daily_word_goal,
      selected_book_ids = excluded.selected_book_ids,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    user.id,
    createdAt,
    normalizedPlan.targetDate,
    normalizedPlan.goalDescription,
    normalizedPlan.dailyWordGoal,
    JSON.stringify(normalizedPlan.selectedBookIds),
    normalizedPlan.status,
    updatedAt,
  ).run();
  await syncLearningPlanBooks(env, user.id, normalizedPlan.selectedBookIds, updatedAt, createdAt);

  await rebuildOrganizationKpiForUser(env, user.id, getLastTokyoDateKeys(1));
};

export const handleGetLearningPlan = async (env: AppEnv, user: DbUserRow): Promise<LearningPlan | null> => {
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
  const selectedBookIds = await readLearningPlanBookIds(env, user.id);
  return {
    uid: row.user_id,
    createdAt: row.created_at,
    targetDate: row.target_date,
    goalDescription: row.goal_description,
    dailyWordGoal: row.daily_word_goal,
    selectedBookIds: selectedBookIds.length > 0
      ? selectedBookIds
      : JSON.parse(row.selected_book_ids || '[]'),
    status: row.status,
  };
};

export const handleSaveLearningPreference = async (env: AppEnv, user: DbUserRow, preference: LearningPreference): Promise<void> => {
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
    Date.now(),
  ).run();
};

export const handleGetLearningPreference = async (env: AppEnv, user: DbUserRow): Promise<LearningPreference> => {
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

export const handleGetActivityLogs = async (env: AppEnv, userId: string): Promise<ActivityLog[]> => {
  const rows = await readAll<{ last_studied_at: number }>(
    env,
    'SELECT last_studied_at FROM learning_histories WHERE user_id = ?',
    userId,
  );

  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const date = formatDateKey(row.last_studied_at);
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
    .sort((left, right) => left.date.localeCompare(right.date));
};
