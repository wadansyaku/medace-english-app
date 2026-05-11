export const DEFAULT_SMART_SESSION_ID = 'smart-session';
export const DEFAULT_SMART_SESSION_LIMIT = 20;
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
