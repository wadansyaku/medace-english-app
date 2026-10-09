import type { JapaneseTranslationFeedback } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isText = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === 'string')
);

const isScore = (value: unknown, maximum: number): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum
);

/** Reject inconsistent assessments instead of inventing or repairing a score. */
export const isValidJapaneseTranslationFeedback = (value: unknown): value is JapaneseTranslationFeedback => {
  if (!isRecord(value)) return false;
  if (value.maxScore !== 10 || !isScore(value.score, 10)) return false;
  if (typeof value.isCorrect !== 'boolean' || value.isCorrect !== (value.score >= 8)) return false;
  if (typeof value.examTarget !== 'string' || !['GENERAL', 'HIGH_SCHOOL_ENTRANCE', 'UNIVERSITY_ENTRANCE'].includes(value.examTarget)) return false;
  if (!['verdictLabel', 'summaryJa', 'improvedTranslation', 'grammarAdviceJa', 'nextDrillJa'].every((key) => isText(value[key]))) return false;
  if (!isStringArray(value.strengths) || !isStringArray(value.issues)) return false;
  if (!['sourceSentence', 'expectedTranslation', 'userTranslation'].every((key) => value[key] === undefined || typeof value[key] === 'string')) return false;
  if (value.usedAi !== undefined && typeof value.usedAi !== 'boolean') return false;
  if (!Array.isArray(value.criteria) || value.criteria.length === 0) return false;

  let score = 0;
  let maximum = 0;
  for (const criterion of value.criteria) {
    if (!isRecord(criterion) || !isText(criterion.label) || typeof criterion.comment !== 'string') return false;
    if (!isScore(criterion.maxScore, 10) || criterion.maxScore < 1) return false;
    if (!isScore(criterion.score, criterion.maxScore)) return false;
    maximum += criterion.maxScore;
    score += criterion.score;
  }
  return maximum === 10 && score === value.score;
};
