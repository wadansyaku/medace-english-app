import { formatDateKey } from '../utils/date';
import {
  normalizeStudySessionLimit,
  type LongTermReviewHistory,
  type LongTermReviewWord,
} from './studySession';

export const GRADUATED_REVIEW_DAILY_LIMIT = 5;
export const GRADUATED_REVIEW_MAX_SESSION_WORDS = 3;

/** The percentage uses requested capacity, not the number of words returned.
 * Capacities 2..4 allow one long-term word and leave at least one normal slot.
 * For capacity 1 with normal due words, only every fifth new daily start may
 * reserve that slot. The persistence layer must atomically assign the ordinal
 * once per user/JST day and retain it on retries. */
export const getGraduatedReviewSessionQuota = (
  limit: unknown,
  ordinaryDueCount = 0,
  startOrdinal = 1,
): number => {
  const capacity = normalizeStudySessionLimit(limit);
  if (capacity >= 5) {
    return Math.min(GRADUATED_REVIEW_MAX_SESSION_WORDS, Math.floor(capacity / 5));
  }
  if (capacity >= 2) return 1;
  if (Number.isFinite(ordinaryDueCount) && ordinaryDueCount <= 0) return 1;
  return Number.isSafeInteger(startOrdinal) && startOrdinal > 0 && startOrdinal % 5 === 0 ? 1 : 0;
};

/** Uses the same JST boundary as existing daily learning records. */
export const getGraduatedReviewDayKey = (now: number): string => {
  if (!Number.isFinite(now)) throw new Error('長期復習の判定時刻が不正です。');
  return formatDateKey(now);
};

export const isDueGraduatedHistory = (
  history: Pick<LongTermReviewHistory, 'status' | 'interactionSource' | 'nextReviewDate' | 'lastStudiedAt'>,
  now: number,
): boolean => Number.isFinite(now)
  && history.status === 'graduated'
  && history.interactionSource === 'STUDY'
  && Number.isFinite(history.nextReviewDate)
  && Number.isFinite(history.lastStudiedAt)
  && history.nextReviewDate <= now;

/** Composes already scoped normal words and atomically allocated long-term
 * words. It does not authorize, allocate, change flags, or persist anything.
 * Both inputs keep their order; a full normal queue cannot consume the reserved
 * long-term slots. Contradictory book membership is excluded defensively. */
export const composeGraduatedReviewSession = <T extends LongTermReviewWord>(
  normalWords: readonly T[],
  graduateWords: readonly T[],
  limit: unknown,
): T[] => {
  const capacity = normalizeStudySessionLimit(limit);
  const booksById = new Map<string, string>();
  const ambiguousIds = new Set<string>();
  for (const word of [...normalWords, ...graduateWords]) {
    const bookId = booksById.get(word.id);
    if (bookId !== undefined && bookId !== word.bookId) ambiguousIds.add(word.id);
    else booksById.set(word.id, word.bookId);
  }

  const unique = (words: readonly T[]): T[] => {
    const seen = new Set<string>();
    return words.filter((word) => {
      if (ambiguousIds.has(word.id) || seen.has(word.id)) return false;
      seen.add(word.id);
      return true;
    });
  };
  const graduates = unique(graduateWords).slice(0, getGraduatedReviewSessionQuota(capacity));
  const graduateIds = new Set(graduates.map((word) => word.id));
  const normal = unique(normalWords).filter((word) => !graduateIds.has(word.id));
  return [...normal.slice(0, capacity - graduates.length), ...graduates];
};
