import { LearningTaskIntentType, type LearningTaskIntent, type StudyWordRange } from '../types';
import { isSmartSessionBookId } from './studySession';

export const MAX_STUDY_WORD_NUMBER = 1_000_000;

export const normalizeStudyWordRange = (value: unknown): StudyWordRange | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('単語範囲を開始番号と終了番号で指定してください。');
  }
  const { start, end } = value as Record<string, unknown>;
  if (typeof start !== 'number' || typeof end !== 'number'
    || !Number.isInteger(start) || !Number.isInteger(end)
    || start < 1 || end < start || end > MAX_STUDY_WORD_NUMBER) {
    throw new Error(`単語範囲は1から${MAX_STUDY_WORD_NUMBER}までの整数で、開始番号以下にならない終了番号を指定してください。`);
  }
  return { start, end };
};

export const isWordInStudyRange = (word: { number: number }, range?: StudyWordRange): boolean => {
  const normalized = normalizeStudyWordRange(range);
  return normalized === undefined || (word.number >= normalized.start && word.number <= normalized.end);
};

export const getBookTaskWordRange = (taskIntent?: LearningTaskIntent, bookId?: string): StudyWordRange | undefined => {
  const range = normalizeStudyWordRange(taskIntent?.wordRange);
  if (range === undefined) return undefined;
  if (taskIntent?.missionAssignmentId !== undefined
    || (taskIntent?.intentType !== LearningTaskIntentType.BOOK_STUDY && taskIntent?.intentType !== LearningTaskIntentType.BOOK_QUIZ)
    || (bookId && isSmartSessionBookId(bookId))
    || (bookId && taskIntent.bookId !== undefined && taskIntent.bookId !== bookId)) {
    throw new Error('章・単語範囲は指定した教材の通常学習や小テストでのみ利用できます。');
  }
  return range;
};

export const assertNoDailyStudyWordRange = (taskIntent?: LearningTaskIntent): void => {
  if (taskIntent?.wordRange !== undefined) {
    throw new Error('デイリー学習・苦手フォーカスには単語範囲を指定できません。');
  }
};
