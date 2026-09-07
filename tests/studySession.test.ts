import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SMART_SESSION_ID,
  DEFAULT_SMART_SESSION_LIMIT,
  WEAKNESS_FOCUS_SESSION_ID,
  WEAKNESS_FOCUS_SESSION_LIMIT,
  getSmartSessionConfig,
  normalizeStudySessionLimit,
  isSmartSessionBookId,
} from '../shared/studySession';

describe('study session presets', () => {
  it.each([[25, 25], [100, 100], [101, 100], [25.9, 25], [0.5, 1], [0, 20], [-1, 20], [Number.NaN, 20], [Number.POSITIVE_INFINITY, 20], ['25', 20], [undefined, 20]])('normalizes a session request %s to %s words', (value, expected) => {
    expect(normalizeStudySessionLimit(value)).toBe(expected);
  });

  it('preserves the default book session size for an absent limit', () => {
    expect(normalizeStudySessionLimit(undefined, 10)).toBe(10);
  });
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
