import { MASTERY_INTERACTION_SOURCE } from '../../shared/learningHistory';
import { buildSrsHistory, studyAttemptFingerprint, validateStudyAttempt, type StudyAttemptInput } from '../../shared/srs';
import { HttpError } from './http';
import { readFirst, toLearningHistory, type DbHistoryRow } from './storage-support';
import type { AppEnv } from './types';
import { buildHistorySnapshotCondition } from './learning-history-state';

export interface StudyAttemptReceipt {
  user_id: string;
  client_attempt_id: string;
  request_fingerprint: string;
  word_id: string;
  book_id: string;
  mission_assignment_id: string | null;
  existing_was_study: number;
  created_at: number;
}

export const commitStudyAttempt = async (
  env: AppEnv,
  userId: string,
  input: StudyAttemptInput,
  context: { missionAssignmentId?: string; bookProgressionBand: number | null },
): Promise<StudyAttemptReceipt> => {
  try { validateStudyAttempt(input); } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : '学習記録が不正です。');
  }
  const clientAttemptId = input.clientAttemptId || crypto.randomUUID();
  const fingerprint = studyAttemptFingerprint(input);
  const commitToken = crypto.randomUUID();
  const readReceipt = () => readFirst<StudyAttemptReceipt>(env,
    'SELECT * FROM study_attempt_receipts WHERE user_id = ? AND client_attempt_id = ?',
    userId, clientAttemptId);
  const checkReceipt = (receipt: StudyAttemptReceipt): StudyAttemptReceipt => {
    if (receipt.request_fingerprint !== fingerprint) {
      throw new HttpError(409, '同じ学習記録の識別子で異なる解答は保存できません。');
    }
    return receipt;
  };
  const existingReceipt = await readReceipt();
  if (existingReceipt) return checkReceipt(existingReceipt);

  // Every effect is conditional on this invocation winning the receipt insert.
  // D1 batch makes the receipt, canonical history and event one transaction.
  // The full history predicate also detects writes from legacy quiz clients.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await readFirst<DbHistoryRow>(env,
      'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?', userId, input.wordId);
    const now = Math.max(Date.now(), existing?.last_studied_at || 0);
    const next = buildSrsHistory(existing ? toLearningHistory(existing) : undefined, input, now);
    const snapshot = buildHistorySnapshotCondition(userId, input.wordId, existing);
    const wonReceipt = `EXISTS (SELECT 1 FROM study_attempt_receipts WHERE user_id = ? AND client_attempt_id = ? AND commit_token = ?)`;
    const wonBindings = [userId, clientAttemptId, commitToken];
    const receipt: StudyAttemptReceipt = {
      user_id: userId, client_attempt_id: clientAttemptId, request_fingerprint: fingerprint,
      word_id: input.wordId, book_id: input.bookId,
      mission_assignment_id: context.missionAssignmentId || null,
      existing_was_study: existing?.interaction_source === MASTERY_INTERACTION_SOURCE ? 1 : 0,
      created_at: now,
    };
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO study_attempt_receipts (
          user_id, client_attempt_id, request_fingerprint, commit_token, word_id, book_id,
          mission_assignment_id, existing_was_study, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${snapshot.sql}
        ON CONFLICT(user_id, client_attempt_id) DO NOTHING
      `).bind(userId, clientAttemptId, fingerprint, commitToken, input.wordId, input.bookId,
        receipt.mission_assignment_id, receipt.existing_was_study, now, ...snapshot.bindings),
      env.DB.prepare(`
        INSERT INTO learning_histories (
          user_id, word_id, book_id, status, last_studied_at, next_review_date,
          interval_days, ease_factor, correct_count, attempt_count, total_response_time_ms, interaction_source
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${wonReceipt}
        ON CONFLICT(user_id, word_id) DO UPDATE SET
          book_id = excluded.book_id, status = excluded.status,
          last_studied_at = excluded.last_studied_at, next_review_date = excluded.next_review_date,
          interval_days = excluded.interval_days, ease_factor = excluded.ease_factor,
          correct_count = excluded.correct_count, attempt_count = excluded.attempt_count,
          total_response_time_ms = excluded.total_response_time_ms, interaction_source = excluded.interaction_source
      `).bind(userId, next.wordId, next.bookId, next.status, next.lastStudiedAt, next.nextReviewDate,
        next.interval, next.easeFactor, next.correctCount, next.attemptCount,
        next.totalResponseTimeMs, next.interactionSource, ...wonBindings),
      env.DB.prepare(`
        INSERT INTO learning_interaction_events (
          user_id, word_id, book_id, created_at, interaction_source, question_mode, correct,
          rating, response_time_ms, interval_days_before, book_progression_band, mission_assignment_id, task_intent_type
        ) SELECT ?, ?, ?, ?, 'STUDY', NULL, ?, ?, ?, ?, ?, ?, ? WHERE ${wonReceipt}
      `).bind(userId, input.wordId, input.bookId, now, input.rating >= 2 ? 1 : 0,
        input.rating, Math.round(input.responseTimeMs), existing?.interval_days || 0,
        context.bookProgressionBand, receipt.mission_assignment_id, input.taskIntentType || null, ...wonBindings),
    ]);
    if (results[0]?.meta.changes === 1) return receipt;
    const racedReceipt = await readReceipt();
    if (racedReceipt) return checkReceipt(racedReceipt);
  }
  throw new HttpError(409, '学習記録が別の操作で更新されました。同じ解答をもう一度保存してください。');
};
