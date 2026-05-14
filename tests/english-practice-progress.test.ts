import { describe, expect, it } from 'vitest';

import { EnglishLevel, type JapaneseTranslationFeedback } from '../types';
import {
  clearEnglishPracticeProgress,
  createEmptyEnglishPracticeProgress,
  ENGLISH_PRACTICE_SAMPLE_BOOK_ID,
  loadEnglishPracticeProgress,
  markEnglishPracticeAttemptSynced,
  recordEnglishPracticeAttempt,
  saveEnglishPracticeProgress,
  summarizeEnglishPracticeProgress,
  toEnglishPracticeCloudQuizAttempt,
  toEnglishPracticeStoragePayload,
  type EnglishPracticeStorage,
  getEnglishPracticeLaneLabel,
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
  it('summarizes grammar, translation, reading, and writing attempts into weak points', () => {
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
    const withWriting = recordEnglishPracticeAttempt(withReading, {
      lane: 'writing',
      mode: 'WRITING',
      correct: true,
      score: 14,
      maxScore: 16,
      level: EnglishLevel.B1,
      occurredAt: 400,
    });

    const summary = summarizeEnglishPracticeProgress(withWriting);

    expect(summary.total).toBe(6);
    expect(summary.accuracy).toBe(50);
    expect(summary.laneSummaries.translation.scoreRate).toBe(50);
    expect(summary.laneSummaries.writing).toMatchObject({
      total: 1,
      correct: 1,
      scoreRate: 88,
    });
    expect(getEnglishPracticeLaneLabel('writing')).toBe('英検英作文');
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

  it('converts word-backed grammar and translation attempts into canonical quiz attempts', () => {
    const feedback: JapaneseTranslationFeedback = {
      isCorrect: false,
      score: 6,
      maxScore: 10,
      verdictLabel: '要復習',
      examTarget: 'UNIVERSITY_ENTRANCE',
      sourceSentence: 'Students monitor symptoms carefully.',
      expectedTranslation: '生徒は症状を注意深く観察する。',
      userTranslation: '生徒は症状を見る。',
      summaryJa: '副詞の処理が不足しています。',
      strengths: ['主語と動詞は対応しています。'],
      issues: ['carefully の訳出が不足しています。'],
      improvedTranslation: '生徒は症状を注意深く観察する。',
      grammarAdviceJa: '副詞が動詞を修飾する形を確認します。',
      nextDrillJa: '副詞を含む文をもう1問訳します。',
      criteria: [],
    };

    const payload = toEnglishPracticeCloudQuizAttempt('student-cloud', {
      lane: 'translation',
      mode: 'JA_TRANSLATION_INPUT',
      correct: false,
      score: 6,
      maxScore: 10,
      wordId: 'word-monitor',
      bookId: 'book-medical',
      scopeId: 'basic-svo',
      responseTimeMs: 1200.4,
    }, feedback);

    expect(payload).toMatchObject({
      uid: 'student-cloud',
      wordId: 'word-monitor',
      bookId: 'book-medical',
      correct: false,
      questionMode: 'JA_TRANSLATION_INPUT',
      responseTimeMs: 1200,
      grammarScopeId: 'basic-svo',
      translationFeedback: feedback,
    });
  });

  it('keeps a stable client attempt id and marks cloud-synced attempts', () => {
    const progress = recordEnglishPracticeAttempt(createEmptyEnglishPracticeProgress('student-sync'), {
      lane: 'reading',
      mode: 'READING',
      correct: false,
      score: 0,
      maxScore: 1,
      readingQuestionKind: 'REFERENCE_OR_MAIN_IDEA',
      occurredAt: 500,
    });
    const attempt = progress.attempts[0];

    expect(attempt.clientAttemptId).toBe(attempt.id);
    expect(attempt.syncStatus).toBe('pending');
    expect(toEnglishPracticeStoragePayload(attempt)).toMatchObject({
      clientAttemptId: attempt.clientAttemptId,
      lane: 'reading',
      mode: 'READING',
      readingQuestionKind: 'REFERENCE_OR_MAIN_IDEA',
      occurredAt: 500,
    });

    const synced = markEnglishPracticeAttemptSynced(progress, attempt.clientAttemptId, 700);
    expect(synced.attempts[0]).toMatchObject({
      syncStatus: 'synced',
      syncedAt: 700,
    });
  });

  it('keeps reading and fallback-only attempts out of the canonical quiz stream', () => {
    expect(toEnglishPracticeCloudQuizAttempt('student-cloud', {
      lane: 'reading',
      mode: 'READING',
      correct: true,
      readingQuestionKind: 'REFERENCE_OR_MAIN_IDEA',
    })).toBeNull();

    expect(toEnglishPracticeCloudQuizAttempt('student-cloud', {
      lane: 'writing',
      mode: 'WRITING',
      correct: true,
      score: 13,
      maxScore: 16,
    })).toBeNull();

    expect(toEnglishPracticeCloudQuizAttempt('student-cloud', {
      lane: 'grammar',
      mode: 'GRAMMAR_CLOZE',
      correct: true,
      wordId: 'word-without-book',
    })).toBeNull();

    expect(toEnglishPracticeCloudQuizAttempt('student-cloud', {
      lane: 'grammar',
      mode: 'GRAMMAR_CLOZE',
      correct: true,
      wordId: 'sample-word',
      bookId: ENGLISH_PRACTICE_SAMPLE_BOOK_ID,
    })).toBeNull();
  });
});
