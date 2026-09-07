import type { LearningHistory, LearningTaskIntentType } from '../types';
import { MASTERY_INTERACTION_SOURCE } from './learningHistory';

export interface StudyAttemptInput {
  wordId: string;
  bookId: string;
  rating: number;
  responseTimeMs: number;
  missionAssignmentId?: string;
  taskIntentType?: LearningTaskIntentType;
  clientAttemptId?: string;
}

export const validateStudyAttempt = (input: StudyAttemptInput): void => {
  if (!input.wordId?.trim() || !input.bookId?.trim()) throw new Error('単語と教材を指定してください。');
  if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 3) {
    throw new Error('学習評価は 0 から 3 の整数で指定してください。');
  }
  if (!Number.isFinite(input.responseTimeMs) || input.responseTimeMs < 0 || input.responseTimeMs > 3_600_000) {
    throw new Error('解答時間が不正です。');
  }
  if (input.clientAttemptId !== undefined && (
    typeof input.clientAttemptId !== 'string'
    || input.clientAttemptId.length < 1
    || input.clientAttemptId.length > 160
    || !/^[a-zA-Z0-9_-]+$/.test(input.clientAttemptId)
  )) throw new Error('学習記録の識別子が不正です。');
};

export const studyAttemptFingerprint = (input: StudyAttemptInput): string => JSON.stringify([
  input.wordId, input.bookId, input.rating, Math.round(input.responseTimeMs),
  input.missionAssignmentId || null, input.taskIntentType || null,
]);

export const buildSrsHistory = (
  existing: LearningHistory | undefined,
  input: StudyAttemptInput,
  now: number,
): LearningHistory => {
  validateStudyAttempt(input);
  const studiedAt = Math.max(now, existing?.lastStudiedAt || 0);
  let interval = existing?.interval || 0;
  let easeFactor = existing?.easeFactor || 2.5;
  if (input.rating === 0) {
    interval = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (input.rating === 1) {
    interval = 1;
  } else if (input.rating === 2) {
    interval = interval === 0 ? 1 : Math.ceil(interval * easeFactor);
  } else {
    interval = interval === 0 ? 3 : Math.ceil(interval * easeFactor * 1.3);
    easeFactor += 0.15;
  }
  interval = Math.min(interval, 365);
  return {
    wordId: input.wordId,
    bookId: input.bookId,
    status: interval > 20 ? 'graduated' : interval > 3 ? 'review' : 'learning',
    lastStudiedAt: studiedAt,
    nextReviewDate: studiedAt + interval * 86_400_000,
    interval,
    easeFactor,
    correctCount: (existing?.correctCount || 0) + (input.rating >= 2 ? 1 : 0),
    attemptCount: (existing?.attemptCount || 0) + 1,
    totalResponseTimeMs: (existing?.totalResponseTimeMs || 0) + Math.round(input.responseTimeMs),
    interactionSource: MASTERY_INTERACTION_SOURCE,
  };
};
