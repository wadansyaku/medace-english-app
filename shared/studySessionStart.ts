import type { LearningTaskIntent } from '../types';
import { normalizeStudySessionLimit } from './studySession';
import { normalizeStudyWordRange } from './studyScope';
import { normalizeTaskPreferredBookIds } from './learningTask';

/** An opaque retry key; user identity and the allocation day are server owned. */
export const normalizeStudySessionStartId = (input: unknown): string | undefined => {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input)) {
    throw new Error('学習開始の識別子が不正です。');
  }
  return input;
};

export interface StudySessionStartRequest {
  action: 'daily' | 'book';
  bookId?: string;
  limit: unknown;
  taskIntent?: LearningTaskIntent | null;
}

/** Explicit fixed fields make reordered JSON equivalent. Time is deliberately
 * absent: replay after midnight must retain the original allocation day. */
export const studySessionStartFingerprint = ({ action, bookId, limit, taskIntent }: StudySessionStartRequest): string => JSON.stringify({
  version: 1,
  action,
  bookId: action === 'book' ? bookId ?? null : null,
  limit: normalizeStudySessionLimit(limit),
  task: taskIntent ? {
    mode: taskIntent.mode,
    intentType: taskIntent.intentType,
    label: taskIntent.label,
    limit: normalizeStudySessionLimit(taskIntent.limit),
    selectionPolicy: taskIntent.selectionPolicy,
    bookId: taskIntent.bookId ?? null,
    wordRange: normalizeStudyWordRange(taskIntent.wordRange) ?? null,
    preferredBookIds: normalizeTaskPreferredBookIds(taskIntent.preferredBookIds),
    missionAssignmentId: taskIntent.missionAssignmentId ?? null,
    targetQuestionModes: taskIntent.targetQuestionModes ?? [],
    targetBandIndex: taskIntent.targetBandIndex ?? null,
    autoStart: taskIntent.autoStart ?? null,
  } : null,
});
