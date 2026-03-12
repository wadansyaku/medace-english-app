import type {
  LearningHistory,
  LearningInteractionSource,
  QuizSelectionMode,
  QuizSessionConfig,
  WordData,
} from '../types';

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

export const resolveInteractionSource = (
  existingSource?: LearningInteractionSource,
  nextSource?: LearningInteractionSource,
): LearningInteractionSource | undefined => {
  if (existingSource === 'STUDY' || nextSource === 'STUDY') return 'STUDY';
  if (nextSource === 'QUIZ') return 'QUIZ';
  if (existingSource === 'QUIZ') return 'QUIZ';
  return undefined;
};

export const getStrictStudyWordIds = (
  histories: Array<Pick<LearningHistory, 'wordId' | 'bookId' | 'interactionSource'>>,
  bookId: string,
): string[] => Array.from(new Set(
  histories
    .filter((history) => history.bookId === bookId && history.interactionSource === 'STUDY')
    .map((history) => history.wordId),
));

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
