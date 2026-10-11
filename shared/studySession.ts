export const DEFAULT_SMART_SESSION_ID = 'smart-session';
export const DEFAULT_SMART_SESSION_LIMIT = 20;
export const MAX_STUDY_SESSION_WORDS = 100;

export const normalizeStudySessionLimit = (
  value: unknown,
  fallback = DEFAULT_SMART_SESSION_LIMIT,
): number => {
  const candidate = typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
  const safeCandidate = Number.isFinite(candidate) && candidate > 0
    ? candidate
    : DEFAULT_SMART_SESSION_LIMIT;
  return Math.max(1, Math.min(MAX_STUDY_SESSION_WORDS, Math.floor(safeCandidate)));
};
export const WEAKNESS_FOCUS_SESSION_ID = 'smart-session-focus';
export const WEAKNESS_FOCUS_SESSION_LIMIT = 10;

export interface SmartSessionConfig {
  bookId: string;
  limit: number;
  badgeLabel: string;
  isWeaknessFocus: boolean;
}

export const getSmartSessionConfig = (bookId: string): SmartSessionConfig | null => {
  if (bookId === DEFAULT_SMART_SESSION_ID) {
    return {
      bookId,
      limit: DEFAULT_SMART_SESSION_LIMIT,
      badgeLabel: 'デイリークエスト',
      isWeaknessFocus: false,
    };
  }

  if (bookId === WEAKNESS_FOCUS_SESSION_ID) {
    return {
      bookId,
      limit: WEAKNESS_FOCUS_SESSION_LIMIT,
      badgeLabel: '苦手フォーカス',
      isWeaknessFocus: true,
    };
  }

  return null;
};

export const isSmartSessionBookId = (bookId: string): boolean => getSmartSessionConfig(bookId) !== null;

export interface LongTermReviewWord {
  id: string;
  bookId: string;
}

export interface LongTermReviewHistory {
  wordId: string;
  bookId: string;
  status: string;
  interactionSource?: string;
  nextReviewDate: number;
  lastStudiedAt: number;
}

/** Pure selection contract. Callers must authorize and approve real words,
 * apply book/range scope, and provide this user's current histories first.
 * This function grants no access and performs no history or quota persistence. */
export const selectBoundedLongTermReviewCandidates = <T extends LongTermReviewWord>({
  scopedWords,
  histories,
  now,
  limit,
  quota = 0,
}: {
  scopedWords: readonly T[];
  histories: readonly LongTermReviewHistory[];
  now: number;
  limit?: number;
  quota?: number;
}): { words: T[]; eligibleCount: number; remainingCount: number; quota: number; limit: number } => {
  if (!Number.isFinite(now)) throw new Error('長期復習の判定時刻が不正です。');
  const sessionLimit = normalizeStudySessionLimit(limit);
  const boundedQuota = Number.isFinite(quota) ? Math.min(sessionLimit, Math.max(0, Math.floor(quota))) : 0;
  const wordsById = new Map<string, T>();
  const ambiguousWordIds = new Set<string>();
  for (const word of scopedWords) {
    const existing = wordsById.get(word.id);
    if (existing && existing.bookId !== word.bookId) ambiguousWordIds.add(word.id);
    else if (!existing) wordsById.set(word.id, word);
  }
  const historyById = new Map<string, LongTermReviewHistory>();
  const ambiguousHistoryIds = new Set<string>();
  for (const history of histories) {
    const word = wordsById.get(history.wordId);
    if (!word || history.bookId !== word.bookId) continue;
    const existing = historyById.get(history.wordId);
    if (existing && (existing.status !== history.status
      || existing.interactionSource !== history.interactionSource
      || existing.nextReviewDate !== history.nextReviewDate
      || existing.lastStudiedAt !== history.lastStudiedAt)) ambiguousHistoryIds.add(history.wordId);
    else if (!existing) historyById.set(history.wordId, history);
  }
  const eligible = [...historyById.values()].filter(history => (
    !ambiguousWordIds.has(history.wordId) && !ambiguousHistoryIds.has(history.wordId)
    && history.status === 'graduated' && history.interactionSource === 'STUDY'
    && Number.isFinite(history.nextReviewDate) && Number.isFinite(history.lastStudiedAt)
    && history.nextReviewDate <= now
  )).sort((left, right) => left.nextReviewDate - right.nextReviewDate
    || left.lastStudiedAt - right.lastStudiedAt
    || (left.wordId < right.wordId ? -1 : left.wordId > right.wordId ? 1 : 0));
  const words = eligible.slice(0, boundedQuota).map(history => wordsById.get(history.wordId)!);
  return { words, eligibleCount: eligible.length, remainingCount: eligible.length - words.length,
    quota: boundedQuota, limit: sessionLimit };
};
