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
