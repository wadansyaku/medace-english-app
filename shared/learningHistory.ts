import type {
  LearningHistory,
  LearningInteractionSource,
} from '../types';

export const MASTERY_INTERACTION_SOURCE: LearningInteractionSource = 'STUDY';

export const resolveInteractionSource = (
  existingSource?: LearningInteractionSource,
  nextSource?: LearningInteractionSource,
): LearningInteractionSource | undefined => {
  if (existingSource === MASTERY_INTERACTION_SOURCE || nextSource === MASTERY_INTERACTION_SOURCE) {
    return MASTERY_INTERACTION_SOURCE;
  }
  if (nextSource === 'QUIZ') return 'QUIZ';
  if (existingSource === 'QUIZ') return 'QUIZ';
  return undefined;
};

export const isStudyInteractionSource = (
  source?: LearningInteractionSource | null,
): source is typeof MASTERY_INTERACTION_SOURCE => source === MASTERY_INTERACTION_SOURCE;

export const isMasteryHistoryRecord = (
  history: Pick<LearningHistory, 'interactionSource'>,
): boolean => isStudyInteractionSource(history.interactionSource);

export const isMasteryProgressHistory = (
  history: Pick<LearningHistory, 'interactionSource' | 'attemptCount' | 'interval'>,
): boolean => isMasteryHistoryRecord(history) && (history.attemptCount > 0 || history.interval > 0);

export const isDueMasteryHistory = (
  history: Pick<LearningHistory, 'interactionSource' | 'status' | 'nextReviewDate'>,
  now: number,
): boolean => (
  isStudyInteractionSource(history.interactionSource)
  && history.status !== 'graduated'
  && history.nextReviewDate <= now
);

export const getStrictStudyWordIds = (
  histories: Array<Pick<LearningHistory, 'wordId' | 'bookId' | 'interactionSource'>>,
  bookId: string,
): string[] => Array.from(new Set(
  histories
    .filter((history) => history.bookId === bookId && isStudyInteractionSource(history.interactionSource))
    .map((history) => history.wordId),
));
