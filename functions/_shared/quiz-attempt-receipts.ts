import { quizAttemptFingerprint, validateQuizAttempt, type QuizAttemptInput, type QuizAttemptReceipt } from '../../shared/quizAttempt';
import { buildQuizAttemptHistory } from '../../utils/quiz';
import { prepareCbtProblemAttempt, prepareCbtScopeAttempt, prepareJapaneseTranslationFeedbackEvent } from './ai-cache-cbt';
import { HttpError } from './http';
import { buildHistorySnapshotCondition, type SqlSnapshotCondition } from './learning-history-state';
import { readFirst, toLearningHistory, type DbHistoryRow } from './storage-support';
import type { AppEnv, D1PreparedStatement } from './types';

export interface DbQuizAttemptReceipt {
  user_id: string;
  client_attempt_id: string;
  request_fingerprint: string;
  word_id: string;
  book_id: string;
  mission_assignment_id: string | null;
  created_at: number;
  projection_status: 'PENDING' | 'COMPLETE';
}

export const toQuizAttemptReceipt = (receipt: DbQuizAttemptReceipt): QuizAttemptReceipt => ({
  clientAttemptId: receipt.client_attempt_id, wordId: receipt.word_id,
  bookId: receipt.book_id, committedAt: receipt.created_at, storageMode: 'cloudflare',
  projectionStatus: receipt.projection_status,
});

export const readQuizAttemptReceipt = (env: AppEnv, userId: string, clientAttemptId: string) => (
  readFirst<DbQuizAttemptReceipt>(env,
    'SELECT * FROM quiz_attempt_receipts WHERE user_id = ? AND client_attempt_id = ?', userId, clientAttemptId)
);

// The caller authorizes the current user, material, word and explicit mission
// before entering this function, including on receipt reads/replays.
export const commitQuizAttempt = async (
  env: AppEnv,
  userId: string,
  input: QuizAttemptInput,
  context: { missionAssignmentId?: string; bookProgressionBand: number | null; organizationId?: string | null },
): Promise<DbQuizAttemptReceipt> => {
  try { validateQuizAttempt(input); } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : '小テスト記録が不正です。');
  }
  const clientAttemptId = input.clientAttemptId || crypto.randomUUID();
  const fingerprint = await quizAttemptFingerprint(input);
  const commitToken = crypto.randomUUID();
  const readReceipt = () => readQuizAttemptReceipt(env, userId, clientAttemptId);
  const checkReceipt = (receipt: DbQuizAttemptReceipt) => {
    if (receipt.request_fingerprint !== fingerprint) throw new HttpError(409, '同じ小テスト記録の識別子で異なる解答は保存できません。');
    return receipt;
  };
  const recorded = await readReceipt();
  if (recorded) return checkReceipt(recorded);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await readFirst<DbHistoryRow>(env,
      'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?', userId, input.wordId);
    const now = Math.max(Date.now(), existing?.last_studied_at || 0);
    const next = buildQuizAttemptHistory({ existing: existing ? toLearningHistory(existing) : undefined, ...input, now });
    const snapshots: SqlSnapshotCondition[] = [buildHistorySnapshotCondition(userId, input.wordId, existing)];
    const won = { sql: 'EXISTS (SELECT 1 FROM quiz_attempt_receipts WHERE user_id = ? AND client_attempt_id = ? AND commit_token = ?)', bindings: [userId, clientAttemptId, commitToken] };
    const effects: D1PreparedStatement[] = [];
    if (input.generatedProblemId) {
      const prepared = await prepareCbtProblemAttempt(env, {
        userId, wordId: input.wordId, problemId: input.generatedProblemId,
        correct: input.correct, responseTimeMs: input.responseTimeMs, now,
      }, won);
      snapshots.push(...prepared.snapshots);
      effects.push(...prepared.statements);
    }
    if (input.grammarScopeId) {
      const prepared = await prepareCbtScopeAttempt(env, {
        userId, grammarScopeId: input.grammarScopeId, questionMode: input.questionMode,
        correct: input.correct, responseTimeMs: input.responseTimeMs, now,
      }, won);
      snapshots.push(...prepared.snapshots);
      effects.push(...prepared.statements);
    }
    if (input.translationFeedback) {
      const feedback = input.translationFeedback;
      effects.push(prepareJapaneseTranslationFeedbackEvent(env, {
        userId, wordId: input.wordId, bookId: input.bookId, questionMode: input.questionMode,
        grammarScopeId: input.grammarScopeId, sourceSentence: feedback.sourceSentence || '',
        expectedTranslation: feedback.expectedTranslation || feedback.improvedTranslation || '',
        userTranslation: feedback.userTranslation || '', feedback, examTarget: feedback.examTarget,
        organizationId: context.organizationId, model: feedback.usedAi ? 'gemini' : 'deterministic',
        promptVersion: feedback.usedAi ? 'translation-feedback-v1' : 'deterministic-v1', now,
        eventId: `quiz-translation-${commitToken}`,
      }, won));
    }
    const receipt: DbQuizAttemptReceipt = {
      user_id: userId, client_attempt_id: clientAttemptId, request_fingerprint: fingerprint,
      word_id: input.wordId, book_id: input.bookId, mission_assignment_id: context.missionAssignmentId || null,
      created_at: now, projection_status: 'PENDING',
    };
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO quiz_attempt_receipts (
        user_id, client_attempt_id, request_fingerprint, commit_token, word_id, book_id, mission_assignment_id, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${snapshots.map((snapshot) => `(${snapshot.sql})`).join(' AND ')}
      ON CONFLICT(user_id, client_attempt_id) DO NOTHING`).bind(
        userId, clientAttemptId, fingerprint, commitToken, input.wordId, input.bookId, receipt.mission_assignment_id, now,
        ...snapshots.flatMap((snapshot) => snapshot.bindings)),
      env.DB.prepare(`INSERT INTO learning_histories (
        user_id, word_id, book_id, status, last_studied_at, next_review_date,
        interval_days, ease_factor, correct_count, attempt_count, total_response_time_ms, interaction_source
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${won.sql}
      ON CONFLICT(user_id, word_id) DO UPDATE SET book_id = excluded.book_id, status = excluded.status,
        last_studied_at = excluded.last_studied_at, next_review_date = excluded.next_review_date,
        interval_days = excluded.interval_days, ease_factor = excluded.ease_factor,
        correct_count = excluded.correct_count, attempt_count = excluded.attempt_count,
        total_response_time_ms = excluded.total_response_time_ms, interaction_source = excluded.interaction_source`).bind(
        userId, next.wordId, next.bookId, next.status, next.lastStudiedAt, next.nextReviewDate,
        next.interval, next.easeFactor, next.correctCount, next.attemptCount, next.totalResponseTimeMs, next.interactionSource, ...won.bindings),
      env.DB.prepare(`INSERT INTO learning_interaction_events (
        user_id, word_id, book_id, created_at, interaction_source, question_mode, correct,
        rating, response_time_ms, interval_days_before, book_progression_band, mission_assignment_id, task_intent_type
      ) SELECT ?, ?, ?, ?, 'QUIZ', ?, ?, NULL, ?, ?, ?, ?, ? WHERE ${won.sql}`).bind(
        userId, input.wordId, input.bookId, now, input.questionMode, input.correct ? 1 : 0,
        input.responseTimeMs, existing?.interval_days || 0, context.bookProgressionBand,
        receipt.mission_assignment_id, input.taskIntentType || null, ...won.bindings),
      ...effects,
    ]);
    if (results[0]?.meta.changes === 1) return receipt;
    const raced = await readReceipt();
    if (raced) return checkReceipt(raced);
  }
  throw new HttpError(409, '学習記録が別の操作で更新されました。同じ解答をもう一度保存してください。');
};
