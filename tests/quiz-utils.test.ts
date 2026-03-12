import { describe, expect, it } from 'vitest';

import type { LearningHistory, WordData } from '../types';
import {
  buildQuizAttemptHistory,
  getActualQuizQuestionCount,
  getQuizCandidateWords,
  getStrictStudyWordIds,
  isDueMasteryHistory,
  isMasteryProgressHistory,
  normalizeQuizRange,
  resolveInteractionSource,
} from '../utils/quiz';

const words: WordData[] = [
  { id: 'w1', bookId: 'book-1', number: 1, word: 'triage', definition: 'トリアージ' },
  { id: 'w2', bookId: 'book-1', number: 2, word: 'stabilize', definition: '安定させる' },
  { id: 'w3', bookId: 'book-1', number: 3, word: 'monitor', definition: '観察する' },
  { id: 'w4', bookId: 'book-1', number: 4, word: 'diagnose', definition: '診断する' },
];

const histories: LearningHistory[] = [
  {
    wordId: 'w1',
    bookId: 'book-1',
    status: 'learning',
    lastStudiedAt: 1,
    nextReviewDate: 1,
    interval: 1,
    easeFactor: 2.5,
    correctCount: 1,
    attemptCount: 1,
    totalResponseTimeMs: 1200,
    interactionSource: 'STUDY',
  },
  {
    wordId: 'w2',
    bookId: 'book-1',
    status: 'learning',
    lastStudiedAt: 1,
    nextReviewDate: 1,
    interval: 0,
    easeFactor: 2.5,
    correctCount: 0,
    attemptCount: 1,
    totalResponseTimeMs: 900,
    interactionSource: 'QUIZ',
  },
  {
    wordId: 'w3',
    bookId: 'book-1',
    status: 'learning',
    lastStudiedAt: 1,
    nextReviewDate: 1,
    interval: 0,
    easeFactor: 2.5,
    correctCount: 0,
    attemptCount: 1,
    totalResponseTimeMs: 900,
  },
];

describe('quiz utils', () => {
  it('normalizes and clamps quiz ranges', () => {
    expect(normalizeQuizRange(8, 2, 1, 6)).toEqual({ start: 2, end: 6 });
    expect(normalizeQuizRange(-3, 4, 1, 6)).toEqual({ start: 1, end: 4 });
  });

  it('returns all words for full-random mode', () => {
    const candidates = getQuizCandidateWords({
      words,
      selectionMode: 'FULL_RANDOM',
      rangeStart: 1,
      rangeEnd: 4,
      minWordNumber: 1,
      maxWordNumber: 4,
      learnedWordIds: new Set<string>(),
    });

    expect(candidates.map((word) => word.id)).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('filters words by normalized range for range-random mode', () => {
    const candidates = getQuizCandidateWords({
      words,
      selectionMode: 'RANGE_RANDOM',
      rangeStart: 4,
      rangeEnd: 2,
      minWordNumber: 1,
      maxWordNumber: 4,
      learnedWordIds: new Set<string>(),
    });

    expect(candidates.map((word) => word.id)).toEqual(['w2', 'w3', 'w4']);
  });

  it('strictly keeps only study-rated words for learned-only mode', () => {
    const learnedWordIds = getStrictStudyWordIds(histories, 'book-1');
    const candidates = getQuizCandidateWords({
      words,
      selectionMode: 'LEARNED_ONLY',
      rangeStart: 1,
      rangeEnd: 4,
      minWordNumber: 1,
      maxWordNumber: 4,
      learnedWordIds: new Set<string>(learnedWordIds),
    });

    expect(learnedWordIds).toEqual(['w1']);
    expect(candidates.map((word) => word.id)).toEqual(['w1']);
  });

  it('caps actual question count by available candidates', () => {
    expect(getActualQuizQuestionCount(10, 3)).toBe(3);
    expect(getActualQuizQuestionCount(5, 8)).toBe(5);
  });

  it('preserves study as the strongest interaction source', () => {
    expect(resolveInteractionSource(undefined, 'QUIZ')).toBe('QUIZ');
    expect(resolveInteractionSource('QUIZ', 'STUDY')).toBe('STUDY');
    expect(resolveInteractionSource('STUDY', 'QUIZ')).toBe('STUDY');
  });

  it('keeps quiz-only history out of mastery progress and due counts', () => {
    const quizOnlyHistory = buildQuizAttemptHistory({
      wordId: 'w2',
      bookId: 'book-1',
      correct: false,
      responseTimeMs: 840,
      now: 5_000,
    });

    expect(quizOnlyHistory.status).toBe('new');
    expect(quizOnlyHistory.interactionSource).toBe('QUIZ');
    expect(isMasteryProgressHistory(quizOnlyHistory)).toBe(false);
    expect(isDueMasteryHistory(quizOnlyHistory, 5_000)).toBe(false);
  });

  it('preserves mastery fields when a studied word is answered in quiz mode', () => {
    const existingStudyHistory: LearningHistory = {
      wordId: 'w1',
      bookId: 'book-1',
      status: 'learning',
      lastStudiedAt: 100,
      nextReviewDate: 10_000,
      interval: 3,
      easeFactor: 2.65,
      correctCount: 2,
      attemptCount: 2,
      totalResponseTimeMs: 2_300,
      interactionSource: 'STUDY',
    };

    const updated = buildQuizAttemptHistory({
      existing: existingStudyHistory,
      wordId: existingStudyHistory.wordId,
      bookId: existingStudyHistory.bookId,
      correct: false,
      responseTimeMs: 900,
      now: 12_000,
    });

    expect(updated.status).toBe('learning');
    expect(updated.nextReviewDate).toBe(10_000);
    expect(updated.interval).toBe(3);
    expect(updated.easeFactor).toBe(2.65);
    expect(updated.attemptCount).toBe(3);
    expect(updated.correctCount).toBe(2);
    expect(updated.interactionSource).toBe('STUDY');
    expect(isMasteryProgressHistory(updated)).toBe(true);
    expect(isDueMasteryHistory(updated, 12_000)).toBe(true);
  });
});
