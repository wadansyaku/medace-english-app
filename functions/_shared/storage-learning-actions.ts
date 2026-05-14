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
import { resolveBookProgressionBand, appendLearningInteractionEvent, rebuildWeaknessSignalsForUser } from './weakness-actions';
import { formatDateKey } from '../../utils/date';
import { getGrammarCurriculumScope } from '../../utils/grammarScope';
import { buildQuizAttemptHistory } from '../../utils/quiz';
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
  assertBookReadAccess,
  defaultLearningPreference,
  getBookProgress,
  getLastTokyoDateKeys,
  getMasterySourceSql,
  getVisibleDueCount,
  normalizeHistoryStatus,
  readAll,
  readFirst,
  type DbHistoryRow,
  type DbLearningPreferenceRow,
} from './storage-support';
import { HttpError } from './http';
import { recordCbtProblemAttempt, recordCbtScopeAttempt, recordJapaneseTranslationFeedbackEvent } from './ai-cache-cbt';

const rebuildOrganizationKpiForUser = async (env: AppEnv, userId: string, dateKeys: string[]): Promise<void> => {
  const organization = await readActiveOrganizationContextForUser(env, userId);
  if (!organization) return;
  await rebuildOrganizationKpiSnapshots(env, organization.organizationId, { dateKeys });
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
      typeof translationFeedback.score !== 'number'
      || typeof translationFeedback.maxScore !== 'number'
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
  generatedProblemId?: string,
  grammarScopeId?: GrammarCurriculumScopeId,
  translationFeedback?: JapaneseTranslationFeedback,
): Promise<void> => {
  await assertBookReadAccess(env, user, word.bookId);
  const now = Date.now();
  const existing = await readFirst<DbHistoryRow>(
    env,
    'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?',
    user.id,
    word.id,
  );

  let interval = existing?.interval_days || 0;
  let easeFactor = existing?.ease_factor || 2.5;
  const attemptCount = (existing?.attempt_count || 0) + 1;
  const correctCount = (existing?.correct_count || 0) + (rating >= 2 ? 1 : 0);
  const totalResponseTimeMs = (existing?.total_response_time_ms || 0) + Math.max(0, Math.round(responseTimeMs));

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

  const nextReviewDate = now + interval * DAY_MS;
  const status = normalizeHistoryStatus(interval);

  await env.DB.prepare(`
    INSERT INTO learning_histories (
      user_id, word_id, book_id, status, last_studied_at, next_review_date,
      interval_days, ease_factor, correct_count, attempt_count, total_response_time_ms, interaction_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, word_id) DO UPDATE SET
      book_id = excluded.book_id,
      status = excluded.status,
      last_studied_at = excluded.last_studied_at,
      next_review_date = excluded.next_review_date,
      interval_days = excluded.interval_days,
      ease_factor = excluded.ease_factor,
      correct_count = excluded.correct_count,
      attempt_count = excluded.attempt_count,
      total_response_time_ms = excluded.total_response_time_ms,
      interaction_source = excluded.interaction_source
  `).bind(
    user.id,
    word.id,
    word.bookId,
    status,
    now,
    nextReviewDate,
    interval,
    easeFactor,
    correctCount,
    attemptCount,
    totalResponseTimeMs,
    MASTERY_INTERACTION_SOURCE,
  ).run();

  const [bookProgressionBand, missionAssignments] = await Promise.all([
    resolveBookProgressionBand(env, word.bookId),
    readMissionAssignmentsByStudent(env, [user.id]),
  ]);
  const missionAssignment = missionAssignments.get(user.id);
  const effectiveMissionAssignmentId = missionAssignmentId || (
    !missionAssignment?.mission.bookId || missionAssignment.mission.bookId === word.bookId
      ? missionAssignment?.id
      : undefined
  );
  await appendLearningInteractionEvent(env, {
    userId: user.id,
    wordId: word.id,
    bookId: word.bookId,
    createdAt: now,
    interactionSource: 'STUDY',
    correct: rating >= 2,
    rating,
    responseTimeMs,
    intervalDaysBefore: existing?.interval_days || 0,
    bookProgressionBand,
    missionAssignmentId: effectiveMissionAssignmentId,
    taskIntentType,
  });
  await rebuildWeaknessSignalsForUser(env, user.id, user);

  await touchWeeklyMissionProgressFromStudy(env, user, {
    wordId: word.id,
    bookId: word.bookId,
    assignmentId: effectiveMissionAssignmentId,
    existingWasStudy: Boolean(existing?.interaction_source === MASTERY_INTERACTION_SOURCE),
    studiedAt: now,
  });

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
): Promise<void> => {
  await assertBookReadAccess(env, user, bookId);
  await validateQuizAttemptConsistency(
    env,
    wordId,
    bookId,
    correct,
    questionMode,
    responseTimeMs,
    generatedProblemId,
    grammarScopeId,
    translationFeedback,
  );
  const now = Date.now();
  const existing = await readFirst<DbHistoryRow>(
    env,
    'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?',
    user.id,
    wordId,
  );

  const nextHistory = buildQuizAttemptHistory({
    existing: existing
      ? {
          wordId: existing.word_id,
          bookId: existing.book_id,
          status: existing.status,
          lastStudiedAt: existing.last_studied_at,
          nextReviewDate: existing.next_review_date,
          interval: existing.interval_days,
          easeFactor: existing.ease_factor,
          correctCount: existing.correct_count,
          attemptCount: existing.attempt_count,
          totalResponseTimeMs: existing.total_response_time_ms,
          interactionSource: existing.interaction_source || undefined,
        }
      : undefined,
    wordId,
    bookId,
    correct,
    responseTimeMs,
    now,
  });

  await env.DB.prepare(`
    INSERT INTO learning_histories (
      user_id, word_id, book_id, status, last_studied_at, next_review_date,
      interval_days, ease_factor, correct_count, attempt_count, total_response_time_ms, interaction_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, word_id) DO UPDATE SET
      book_id = excluded.book_id,
      status = excluded.status,
      last_studied_at = excluded.last_studied_at,
      next_review_date = excluded.next_review_date,
      interval_days = excluded.interval_days,
      ease_factor = excluded.ease_factor,
      correct_count = excluded.correct_count,
      attempt_count = excluded.attempt_count,
      total_response_time_ms = excluded.total_response_time_ms,
      interaction_source = excluded.interaction_source
  `).bind(
    user.id,
    nextHistory.wordId,
    nextHistory.bookId,
    nextHistory.status,
    nextHistory.lastStudiedAt,
    nextHistory.nextReviewDate,
    nextHistory.interval,
    nextHistory.easeFactor,
    nextHistory.correctCount,
    nextHistory.attemptCount,
    nextHistory.totalResponseTimeMs,
    nextHistory.interactionSource || null,
  ).run();

  const [bookProgressionBand, missionAssignments] = await Promise.all([
    resolveBookProgressionBand(env, bookId),
    readMissionAssignmentsByStudent(env, [user.id]),
  ]);
  const missionAssignment = missionAssignments.get(user.id);
  const effectiveMissionAssignmentId = missionAssignmentId || (
    !missionAssignment?.mission.bookId || missionAssignment.mission.bookId === bookId
      ? missionAssignment?.id
      : undefined
  );
  await appendLearningInteractionEvent(env, {
    userId: user.id,
    wordId,
    bookId,
    createdAt: nextHistory.lastStudiedAt,
    interactionSource: 'QUIZ',
    questionMode,
    correct,
    responseTimeMs,
    intervalDaysBefore: existing?.interval_days || 0,
    bookProgressionBand,
    missionAssignmentId: effectiveMissionAssignmentId,
    taskIntentType,
  });
  if (generatedProblemId) {
    try {
      await recordCbtProblemAttempt(env, {
        userId: user.id,
        wordId,
        problemId: generatedProblemId,
        correct,
        responseTimeMs,
        now: nextHistory.lastStudiedAt,
      });
    } catch (error) {
      console.warn('CBT problem attempt update skipped:', error);
    }
  }
  if (grammarScopeId) {
    try {
      await recordCbtScopeAttempt(env, {
        userId: user.id,
        grammarScopeId,
        questionMode,
        correct,
        responseTimeMs,
        now: nextHistory.lastStudiedAt,
      });
    } catch (error) {
      console.warn('CBT scope attempt update skipped:', error);
    }
  }
  if (translationFeedback && questionMode === 'JA_TRANSLATION_INPUT') {
    try {
      await recordJapaneseTranslationFeedbackEvent(env, {
        userId: user.id,
        wordId,
        bookId,
        questionMode,
        grammarScopeId,
        sourceSentence: translationFeedback.sourceSentence || '',
        expectedTranslation: translationFeedback.expectedTranslation || translationFeedback.improvedTranslation || '',
        userTranslation: translationFeedback.userTranslation || '',
        feedback: translationFeedback,
        examTarget: translationFeedback.examTarget,
        organizationId: user.organization_id,
        model: translationFeedback.usedAi ? 'gemini' : 'deterministic',
        promptVersion: translationFeedback.usedAi ? 'translation-feedback-v1' : 'deterministic-v1',
        now: nextHistory.lastStudiedAt,
      });
    } catch (error) {
      console.warn('Japanese translation feedback event write skipped:', error);
    }
  }
  await rebuildWeaknessSignalsForUser(env, user.id, user);

  await touchWeeklyMissionProgressFromQuiz(env, user, {
    bookId,
    assignmentId: effectiveMissionAssignmentId,
    dateKey: formatDateKey(nextHistory.lastStudiedAt),
    attemptedAt: nextHistory.lastStudiedAt,
  });
};

const validateEnglishPracticeAttemptPayload = (payload: EnglishPracticeAttemptPayload): void => {
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
    await assertBookReadAccess(env, user, payload.bookId);
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

  if (shouldDelegateQuizAttempt && (!existing || !existing.delegated_quiz_attempt)) {
    await handleRecordQuizAttempt(
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
    );
    await env.DB.prepare(`
      UPDATE english_practice_attempts
      SET delegated_quiz_attempt = 1, synced_at = ?
      WHERE user_id = ? AND client_attempt_id = ?
    `).bind(now, user.id, payload.clientAttemptId).run();
  }

  return {
    id: existing?.id || id,
    deduplicated: Boolean(existing),
    delegatedQuizAttempt: shouldDelegateQuizAttempt,
  };
};

export const handleGetStudiedWordIdsByBook = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
): Promise<string[]> => {
  await assertBookReadAccess(env, user, bookId);
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

export const handleGetBookProgress = async (env: AppEnv, user: DbUserRow, bookId: string) => (
  getBookProgress(env, user.id, bookId)
);

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
  const createdAt = plan.createdAt || Date.now();
  const updatedAt = Date.now();
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
    plan.targetDate,
    plan.goalDescription,
    plan.dailyWordGoal,
    JSON.stringify(plan.selectedBookIds || []),
    plan.status,
    updatedAt,
  ).run();
  await syncLearningPlanBooks(env, user.id, plan.selectedBookIds || [], updatedAt, createdAt);

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
