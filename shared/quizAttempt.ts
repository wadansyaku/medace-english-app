import { LearningTaskIntentType, type GrammarCurriculumScopeId, type JapaneseTranslationFeedback, type WorksheetQuestionMode } from '../types';
import { isWorksheetQuestionMode } from './worksheetQuestionMode';

export interface QuizAttemptInput {
  wordId: string;
  bookId: string;
  correct: boolean;
  questionMode: WorksheetQuestionMode;
  responseTimeMs: number;
  missionAssignmentId?: string;
  taskIntentType?: LearningTaskIntentType;
  generatedProblemId?: string;
  grammarScopeId?: GrammarCurriculumScopeId;
  translationFeedback?: JapaneseTranslationFeedback;
  clientAttemptId?: string;
}

export interface QuizAttemptReceipt {
  clientAttemptId: string;
  wordId: string;
  bookId: string;
  committedAt: number;
  storageMode: 'cloudflare' | 'idb';
}

export const validateQuizAttempt = (input: QuizAttemptInput): void => {
  if (typeof input.wordId !== 'string' || !input.wordId.trim() || typeof input.bookId !== 'string' || !input.bookId.trim()) {
    throw new Error('単語と教材を指定してください。');
  }
  if (typeof input.correct !== 'boolean' || !isWorksheetQuestionMode(input.questionMode)) throw new Error('小テストの解答記録が不正です。');
  if (!Number.isFinite(input.responseTimeMs) || input.responseTimeMs < 0 || input.responseTimeMs > 3_600_000) throw new Error('解答時間が不正です。');
  if (input.clientAttemptId !== undefined && (typeof input.clientAttemptId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.clientAttemptId))) {
    throw new Error('小テスト記録の識別子が不正です。');
  }
  if (input.taskIntentType !== undefined && !Object.values(LearningTaskIntentType).includes(input.taskIntentType)) throw new Error('学習の目的が不正です。');
};

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, child]) => [key, sortJson(child)]));
  return value;
};

// Receipt fingerprint v1: preserve these keys/defaults when evolving the API.
// Object property order cannot change a receipt. Array order and every supplied
// feedback field remain part of the answer's identity. Text is never stored here.
export const quizAttemptFingerprint = async (input: QuizAttemptInput): Promise<string> => {
  validateQuizAttempt(input);
  const content = JSON.stringify(sortJson({
    wordId: input.wordId, bookId: input.bookId, correct: input.correct,
    questionMode: input.questionMode, responseTimeMs: input.responseTimeMs,
    missionAssignmentId: input.missionAssignmentId || null, taskIntentType: input.taskIntentType || null,
    generatedProblemId: input.generatedProblemId || null, grammarScopeId: input.grammarScopeId || null,
    translationFeedback: input.translationFeedback || null,
  }));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
