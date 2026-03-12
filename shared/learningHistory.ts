import type {
  LearningHistory,
  LearningInteractionSource,
  MasteryDistribution,
} from '../types';

export const MASTERY_INTERACTION_SOURCE: LearningInteractionSource = 'STUDY';
export const MASTERY_REVIEW_INTERVAL_THRESHOLD = 3;

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

export const hasMasteryProgress = (
  attemptCount: number,
  interval: number,
): boolean => attemptCount > 0 || interval > 0;

export const isMasteryProgressHistory = (
  history: Pick<LearningHistory, 'interactionSource' | 'attemptCount' | 'interval'>,
): boolean => isMasteryHistoryRecord(history) && hasMasteryProgress(history.attemptCount, history.interval);

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

export const getMasteryDistributionBucket = (
  history: Pick<LearningHistory, 'interactionSource' | 'status' | 'interval'>,
): 'learning' | 'review' | 'graduated' | null => {
  if (!isMasteryHistoryRecord(history)) return null;
  if (history.status === 'graduated') return 'graduated';
  if (history.status === 'review' || (history.status === 'learning' && history.interval > MASTERY_REVIEW_INTERVAL_THRESHOLD)) {
    return 'review';
  }
  return 'learning';
};

export const buildMasteryDistribution = (
  histories: Array<Pick<LearningHistory, 'interactionSource' | 'status' | 'interval'>>,
): MasteryDistribution => {
  const distribution: MasteryDistribution = {
    new: 0,
    learning: 0,
    review: 0,
    graduated: 0,
    total: 0,
  };

  histories.forEach((history) => {
    const bucket = getMasteryDistributionBucket(history);
    if (!bucket) return;
    distribution[bucket] += 1;
    distribution.total += 1;
  });

  return distribution;
};

export const getMasteryProgressSqlCondition = (
  attemptCountExpression: string,
  intervalExpression: string,
): string => `(${attemptCountExpression} > 0 OR ${intervalExpression} > 0)`;
