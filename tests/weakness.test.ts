import { describe, expect, it } from 'vitest';

import {
  EnglishLevel,
  InterventionKind,
  LearningTrack,
  RecommendedActionType,
  UserGrade,
  WeaknessDimension,
  WeaknessSignalLevel,
  type WeaknessSignalSummary,
} from '../types';
import {
  buildWeaknessProfile,
  deriveWeaknessSignals,
  getDefaultInterventionKindFromWeakness,
  getWeaknessMissionDefaults,
  rankWeaknessFocusedWords,
  type WeaknessInteractionEvent,
} from '../shared/weakness';

const now = Date.now();

const makeEvent = (overrides: Partial<WeaknessInteractionEvent>): WeaknessInteractionEvent => ({
  userId: 'student-1',
  wordId: overrides.wordId || `word-${Math.random().toString(36).slice(2)}`,
  bookId: overrides.bookId || 'book-1',
  createdAt: overrides.createdAt || now,
  interactionSource: overrides.interactionSource || 'QUIZ',
  questionMode: overrides.questionMode,
  correct: overrides.correct,
  rating: overrides.rating,
  responseTimeMs: overrides.responseTimeMs || 900,
  intervalDaysBefore: overrides.intervalDaysBefore,
  bookProgressionBand: overrides.bookProgressionBand ?? 4,
  missionAssignmentId: overrides.missionAssignmentId,
});

describe('weakness intelligence', () => {
  it('classifies the five weakness dimensions from recent events', () => {
    const events: WeaknessInteractionEvent[] = [
      ...Array.from({ length: 6 }, (_, index) => makeEvent({
        wordId: `meaning-recall-${index}`,
        questionMode: 'JA_TO_EN',
        correct: index < 2,
      })),
      ...Array.from({ length: 6 }, (_, index) => makeEvent({
        wordId: `meaning-recognition-${index}`,
        questionMode: 'EN_TO_JA',
        correct: true,
      })),
      ...Array.from({ length: 6 }, (_, index) => makeEvent({
        wordId: `spelling-${index}`,
        questionMode: 'SPELLING_HINT',
        correct: index < 3,
      })),
      ...Array.from({ length: 6 }, (_, index) => makeEvent({
        interactionSource: 'STUDY',
        wordId: `retention-${index}`,
        rating: index < 3 ? 1 : 3,
        intervalDaysBefore: 4,
      })),
      ...Array.from({ length: 6 }, (_, index) => makeEvent({
        interactionSource: index < 3 ? 'QUIZ' : 'STUDY',
        wordId: `advanced-${index}`,
        questionMode: index < 3 ? 'JA_TO_EN' : undefined,
        correct: index < 2,
        rating: index >= 3 ? 1 : undefined,
        bookProgressionBand: 5,
      })),
    ];

    const signals = deriveWeaknessSignals({
      events,
      histories: [],
      grade: UserGrade.SHS2,
      level: EnglishLevel.B2,
      now,
    });

    expect(signals).toHaveLength(5);
    expect(signals.find((signal) => signal.dimension === WeaknessDimension.MEANING_RECALL)?.level).toBe(WeaknessSignalLevel.HIGH);
    expect(signals.find((signal) => signal.dimension === WeaknessDimension.MEANING_RECOGNITION)?.level).toBe(WeaknessSignalLevel.LOW);
    expect(signals.find((signal) => signal.dimension === WeaknessDimension.SPELLING_RECALL)?.sampleSize).toBe(6);
    expect(signals.find((signal) => signal.dimension === WeaknessDimension.RETENTION_STABILITY)?.level).not.toBe(WeaknessSignalLevel.INSUFFICIENT_DATA);
    expect(signals.find((signal) => signal.dimension === WeaknessDimension.ADVANCED_BAND_CONFIDENCE)?.targetBandIndex).toBeGreaterThanOrEqual(1);
  });

  it('marks signals as insufficient when fewer than six samples exist', () => {
    const signals = deriveWeaknessSignals({
      events: Array.from({ length: 5 }, (_, index) => makeEvent({
        wordId: `too-few-${index}`,
        questionMode: 'JA_TO_EN',
        correct: false,
      })),
      histories: [],
      now,
    });

    expect(signals.find((signal) => signal.dimension === WeaknessDimension.MEANING_RECALL)?.level).toBe(WeaknessSignalLevel.INSUFFICIENT_DATA);
  });

  it('ranks weakness-focused words by target band without breaking deterministic order', () => {
    const profile = buildWeaknessProfile([
      {
        dimension: WeaknessDimension.ADVANCED_BAND_CONFIDENCE,
        level: WeaknessSignalLevel.HIGH,
        score: 67,
        sampleSize: 8,
        reason: 'advanced band',
        nextActionLabel: '今日のプランに戻る',
        recommendedActionType: RecommendedActionType.OPEN_PLAN,
        targetQuestionModes: ['JA_TO_EN'],
        targetBandIndex: 4,
        updatedAt: now,
      },
    ]);

    const ranked = rankWeaknessFocusedWords({
      uid: 'student-1',
      words: [
        { id: 'word-band-2', bookId: 'book-2', number: 1, word: 'alpha', definition: 'a' },
        { id: 'word-band-4', bookId: 'book-4', number: 1, word: 'beta', definition: 'b' },
        { id: 'word-band-5', bookId: 'book-5', number: 1, word: 'gamma', definition: 'c' },
      ],
      weaknessProfile: profile,
      grade: UserGrade.SHS2,
      level: EnglishLevel.B2,
      dateKey: '2026-03-16',
      bookBandsById: {
        'book-2': 2,
        'book-4': 4,
        'book-5': 5,
      },
    });

    expect(ranked[0].id).toBe('word-band-4');
  });

  it('maps weakness summaries to instructor intervention and mission defaults', () => {
    const spellingWeakness: WeaknessSignalSummary = {
      dimension: WeaknessDimension.SPELLING_RECALL,
      level: WeaknessSignalLevel.HIGH,
      score: 61,
      sampleSize: 9,
      reason: 'spelling',
      nextActionLabel: '復習を10語始める',
      recommendedActionType: RecommendedActionType.START_REVIEW,
      targetQuestionModes: ['SPELLING_HINT'],
      updatedAt: now,
    };

    expect(getDefaultInterventionKindFromWeakness(spellingWeakness)).toBe(InterventionKind.REVIEW_RESTART);
    expect(getWeaknessMissionDefaults({
      topWeakness: spellingWeakness,
      track: LearningTrack.EIKEN_2,
      current: {
        newWordsTarget: 20,
        reviewWordsTarget: 12,
        quizTargetCount: 1,
      },
    })).toEqual({
      newWordsTarget: 20,
      reviewWordsTarget: 12,
      quizTargetCount: 2,
    });
  });
});
