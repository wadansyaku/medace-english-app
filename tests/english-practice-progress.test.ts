import { describe, expect, it } from 'vitest';

import { EnglishLevel } from '../types';
import {
  clearEnglishPracticeProgress,
  createEmptyEnglishPracticeProgress,
  loadEnglishPracticeProgress,
  recordEnglishPracticeAttempt,
  saveEnglishPracticeProgress,
  summarizeEnglishPracticeProgress,
  type EnglishPracticeStorage,
} from '../utils/englishPracticeProgress';

const createMemoryStorage = (): EnglishPracticeStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};

describe('english practice progress', () => {
  it('summarizes grammar, translation, and reading attempts into weak points', () => {
    const base = createEmptyEnglishPracticeProgress('student-progress');
    const withGrammar = recordEnglishPracticeAttempt(base, {
      lane: 'grammar',
      mode: 'GRAMMAR_CLOZE',
      correct: false,
      scopeId: 'present-perfect',
      scopeLabelJa: '現在完了',
      level: EnglishLevel.B1,
      occurredAt: 100,
    });
    const withGrammarReview = recordEnglishPracticeAttempt(recordEnglishPracticeAttempt(withGrammar, {
      lane: 'grammar',
      mode: 'EN_WORD_ORDER',
      correct: true,
      scopeId: 'basic-svo',
      scopeLabelJa: '基本文型',
      level: EnglishLevel.B1,
      occurredAt: 150,
    }), {
      lane: 'grammar',
      mode: 'GRAMMAR_CLOZE',
      correct: true,
      scopeId: 'basic-svo',
      scopeLabelJa: '基本文型',
      level: EnglishLevel.B1,
      occurredAt: 175,
    });
    const withTranslation = recordEnglishPracticeAttempt(withGrammarReview, {
      lane: 'translation',
      mode: 'JA_TRANSLATION_INPUT',
      correct: false,
      score: 5,
      maxScore: 10,
      scopeId: 'present-perfect',
      scopeLabelJa: '現在完了',
      level: EnglishLevel.B1,
      occurredAt: 200,
    });
    const withReading = recordEnglishPracticeAttempt(withTranslation, {
      lane: 'reading',
      mode: 'READING',
      correct: false,
      readingQuestionKind: 'GRAMMAR_STRUCTURE',
      level: EnglishLevel.B1,
      occurredAt: 300,
    });

    const summary = summarizeEnglishPracticeProgress(withReading);

    expect(summary.total).toBe(5);
    expect(summary.accuracy).toBe(40);
    expect(summary.laneSummaries.translation.scoreRate).toBe(50);
    expect(summary.weakGrammarScopes[0]).toMatchObject({
      scopeId: 'present-perfect',
      labelJa: '現在完了',
      total: 2,
      accuracy: 0,
    });
    expect(summary.weakReadingKinds[0]).toMatchObject({
      kind: 'GRAMMAR_STRUCTURE',
      labelJa: '文法構造',
      total: 1,
    });
    expect(summary.recommendation.lane).toBe('translation');
  });

  it('saves, loads, clears, and survives missing storage', () => {
    const storage = createMemoryStorage();
    const progress = recordEnglishPracticeAttempt(createEmptyEnglishPracticeProgress('student-storage'), {
      lane: 'grammar',
      mode: 'EN_WORD_ORDER',
      correct: true,
      scopeId: 'basic-svo',
      scopeLabelJa: '基本文型',
      occurredAt: 100,
    });

    saveEnglishPracticeProgress(progress, storage);
    expect(loadEnglishPracticeProgress('student-storage', storage).attempts).toHaveLength(1);

    clearEnglishPracticeProgress('student-storage', storage);
    expect(loadEnglishPracticeProgress('student-storage', storage).attempts).toHaveLength(0);
    expect(loadEnglishPracticeProgress('student-storage', null).attempts).toHaveLength(0);
  });
});
