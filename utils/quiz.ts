import type {
  LearningHistory,
  QuizSelectionMode,
  QuizSessionConfig,
  WordData,
} from '../types';
import {
  getStrictStudyWordIds,
  isDueMasteryHistory,
  isMasteryHistoryRecord,
  isMasteryProgressHistory,
  isStudyInteractionSource,
  resolveInteractionSource,
} from '../shared/learningHistory';

export {
  getStrictStudyWordIds,
  isDueMasteryHistory,
  isMasteryHistoryRecord,
  isMasteryProgressHistory,
  isStudyInteractionSource,
  resolveInteractionSource,
} from '../shared/learningHistory';

export const clampQuizBoundary = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

export const normalizeQuizRange = (
  start: number,
  end: number,
  min: number,
  max: number,
): { start: number; end: number } => {
  const clampedStart = clampQuizBoundary(start, min, max);
  const clampedEnd = clampQuizBoundary(end, min, max);
  return {
    start: Math.min(clampedStart, clampedEnd),
    end: Math.max(clampedStart, clampedEnd),
  };
};

export const buildQuizAttemptHistory = ({
  existing,
  wordId,
  bookId,
  correct,
  responseTimeMs,
  now = Date.now(),
}: {
  existing?: Partial<LearningHistory>;
  wordId: string;
  bookId: string;
  correct: boolean;
  responseTimeMs: number;
  now?: number;
}): LearningHistory => ({
  wordId,
  bookId,
  status: (existing?.status || 'new') as LearningHistory['status'],
  lastStudiedAt: now,
  nextReviewDate: existing?.nextReviewDate || now,
  interval: existing?.interval || 0,
  easeFactor: existing?.easeFactor || 2.5,
  correctCount: (existing?.correctCount || 0) + (correct ? 1 : 0),
  attemptCount: (existing?.attemptCount || 0) + 1,
  totalResponseTimeMs: (existing?.totalResponseTimeMs || 0) + Math.max(0, Math.round(responseTimeMs)),
  interactionSource: resolveInteractionSource(existing?.interactionSource, 'QUIZ') || 'QUIZ',
});

export const getQuizCandidateWords = ({
  words,
  selectionMode,
  rangeStart,
  rangeEnd,
  minWordNumber,
  maxWordNumber,
  learnedWordIds,
}: {
  words: WordData[];
  selectionMode: QuizSelectionMode;
  rangeStart: number;
  rangeEnd: number;
  minWordNumber: number;
  maxWordNumber: number;
  learnedWordIds: Set<string>;
}): WordData[] => {
  if (selectionMode === 'FULL_RANDOM') return words;
  if (selectionMode === 'LEARNED_ONLY') {
    return words.filter((word) => learnedWordIds.has(word.id));
  }

  const normalizedRange = normalizeQuizRange(rangeStart, rangeEnd, minWordNumber, maxWordNumber);
  return words.filter((word) => word.number >= normalizedRange.start && word.number <= normalizedRange.end);
};

export const getActualQuizQuestionCount = (requestedCount: number, candidateCount: number): number => (
  Math.min(requestedCount, candidateCount)
);

export const formatQuizSelectionSummary = (
  config: Pick<QuizSessionConfig, 'selectionMode' | 'rangeStart' | 'rangeEnd'>,
  actualQuestionCount: number,
): string => {
  if (config.selectionMode === 'LEARNED_ONLY') {
    return `学習済みからランダム ${actualQuestionCount} 問`;
  }
  if (config.selectionMode === 'RANGE_RANDOM') {
    const normalizedRange = normalizeQuizRange(config.rangeStart, config.rangeEnd, config.rangeStart, config.rangeEnd);
    return `No. ${normalizedRange.start} - ${normalizedRange.end} からランダム ${actualQuestionCount} 問`;
  }
  return `全範囲からランダム ${actualQuestionCount} 問`;
};
