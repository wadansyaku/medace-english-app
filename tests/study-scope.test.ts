import { describe, expect, it } from 'vitest';
import { assertNoDailyStudyWordRange, getBookTaskWordRange, isWordInStudyRange, normalizeStudyWordRange } from '../shared/studyScope';
import { LearningTaskIntentType, type LearningTaskIntent } from '../types';

const intent: LearningTaskIntent = { mode: 'study', intentType: LearningTaskIntentType.BOOK_STUDY, label: '章', selectionPolicy: 'BOOK_NEW_ONLY', limit: 10, bookId: 'book', wordRange: { start: 11, end: 20 } };

describe('explicit study word scope', () => {
  it('keeps an omitted range unlimited and normalizes a valid inclusive range without mutating it', () => {
    expect(normalizeStudyWordRange(undefined)).toBeUndefined();
    expect(isWordInStudyRange({ number: 200 })).toBe(true);
    const value = { start: 11, end: 20, ignored: true };
    expect(normalizeStudyWordRange(value)).toEqual({ start: 11, end: 20 });
    expect(normalizeStudyWordRange(value)).not.toBe(value);
    expect([10, 11, 20, 21].map(number => isWordInStudyRange({ number }, value))).toEqual([false, true, true, false]);
  });
  it.each([null, false, [], {}, { start: '11', end: 20 }, { start: 0, end: 20 }, { start: -1, end: 20 }, { start: 1.5, end: 20 }, { start: 20, end: 11 }, { start: NaN, end: 20 }, { start: 11, end: Infinity }, { start: 1, end: 1_000_001 }])('rejects explicit invalid range %j', value => {
    expect(() => normalizeStudyWordRange(value)).toThrow();
    expect(() => isWordInStudyRange({ number: 15 }, value as never)).toThrow();
  });
  it('supports a single word and the bounded maximum', () => {
    expect(normalizeStudyWordRange({ start: 1, end: 1 })).toEqual({ start: 1, end: 1 });
    expect(normalizeStudyWordRange({ start: 1_000_000, end: 1_000_000 })).toBeDefined();
  });
  it.each([LearningTaskIntentType.MISSION_REVIEW, LearningTaskIntentType.MISSION_NEW, LearningTaskIntentType.MISSION_QUIZ, LearningTaskIntentType.TODAY_FOCUS, LearningTaskIntentType.WEAKNESS_STUDY])('rejects range with %s', intentType => {
    expect(() => getBookTaskWordRange({ ...intent, intentType }, 'book')).toThrow();
  });
  it('rejects mission assignments, mismatched books, and smart sessions', () => {
    expect(() => getBookTaskWordRange({ ...intent, missionAssignmentId: 'assignment' }, 'book')).toThrow();
    expect(() => getBookTaskWordRange(intent, 'other')).toThrow();
    expect(() => getBookTaskWordRange(intent, 'smart-session')).toThrow();
    expect(() => assertNoDailyStudyWordRange(intent)).toThrow();
    expect(() => assertNoDailyStudyWordRange({ ...intent, wordRange: undefined })).not.toThrow();
  });
});
