import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SMART_SESSION_ID,
  DEFAULT_SMART_SESSION_LIMIT,
  WEAKNESS_FOCUS_SESSION_ID,
  WEAKNESS_FOCUS_SESSION_LIMIT,
  getSmartSessionConfig,
  isSmartSessionBookId,
} from '../shared/studySession';

describe('study session presets', () => {
  it('keeps the default smart session on the regular 20-word limit', () => {
    expect(getSmartSessionConfig(DEFAULT_SMART_SESSION_ID)).toEqual({
      bookId: DEFAULT_SMART_SESSION_ID,
      limit: DEFAULT_SMART_SESSION_LIMIT,
      badgeLabel: 'デイリークエスト',
      isWeaknessFocus: false,
    });
  });

  it('keeps the weakness focus session on a dedicated 10-word limit', () => {
    expect(getSmartSessionConfig(WEAKNESS_FOCUS_SESSION_ID)).toEqual({
      bookId: WEAKNESS_FOCUS_SESSION_ID,
      limit: WEAKNESS_FOCUS_SESSION_LIMIT,
      badgeLabel: '苦手フォーカス',
      isWeaknessFocus: true,
    });
  });

  it('recognizes only supported smart session ids', () => {
    expect(isSmartSessionBookId(DEFAULT_SMART_SESSION_ID)).toBe(true);
    expect(isSmartSessionBookId(WEAKNESS_FOCUS_SESSION_ID)).toBe(true);
    expect(isSmartSessionBookId('phrasebook-1')).toBe(false);
  });
});
