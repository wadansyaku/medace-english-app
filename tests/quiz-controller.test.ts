import { describe, expect, it } from 'vitest';

import {
  createPendingQuizAttempt,
  resolveQuizAdvanceTarget,
  shouldAutoAdvanceQuizAttempt,
  upsertQuestionFeedbackById,
} from '../hooks/useQuizModeController';
import type { JapaneseTranslationFeedback } from '../types';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';

const translationQuestion: GeneratedWorksheetQuestion = {
  id: 'translation-1',
  mode: 'JA_TRANSLATION_INPUT',
  interactionType: 'TEXT_INPUT',
  wordId: 'word-1',
  bookId: 'book-1',
  promptLabel: '和訳全文入力',
  promptText: 'The term is reviewed by students today.',
  answer: 'その語は 今日 生徒によって 復習される',
  sourceSentence: 'The term is reviewed by students today.',
  sourceTranslation: 'その語は 今日 生徒によって 復習される',
};

const buildFeedback = (overrides: Partial<JapaneseTranslationFeedback> = {}): JapaneseTranslationFeedback => ({
  isCorrect: false,
  score: 6,
  maxScore: 10,
  verdictLabel: '部分点',
  examTarget: 'UNIVERSITY_ENTRANCE',
  summaryJa: '意味の中心は取れていますが、受け身の関係が弱いです。',
  strengths: ['主要語を訳せています。'],
  issues: ['誰が何をされたかを補いましょう。'],
  improvedTranslation: 'その語は今日、生徒によって復習される。',
  grammarAdviceJa: 'be動詞 + 過去分詞を受け身として読みます。',
  nextDrillJa: '主語 / be+過去分詞 / by の3ますで確認しましょう。',
  criteria: [
    { label: '意味', score: 3, maxScore: 4, comment: '中心は取れています。' },
    { label: '文法構造', score: 1, maxScore: 3, comment: '受け身が曖昧です。' },
    { label: '答案として自然か', score: 2, maxScore: 3, comment: '答案として整えます。' },
  ],
  ...overrides,
});

describe('quiz controller translation advance policy', () => {
  it('does not auto-advance after Japanese translation scoring', () => {
    expect(shouldAutoAdvanceQuizAttempt('JA_TRANSLATION_INPUT')).toBe(false);
    expect(shouldAutoAdvanceQuizAttempt('SPELLING_HINT')).toBe(true);
    expect(shouldAutoAdvanceQuizAttempt('JA_TRANSLATION_ORDER')).toBe(true);
  });

  it('uses the explicit next action to move to the next question or result', () => {
    expect(resolveQuizAdvanceTarget(0, 2)).toBe('NEXT_QUESTION');
    expect(resolveQuizAdvanceTarget(1, 2)).toBe('RESULT');
  });

  it('preserves explicit advance behavior when retrying a saved translation attempt', () => {
    const feedback = buildFeedback();
    const pendingAttempt = createPendingQuizAttempt({
      mode: 'JA_TRANSLATION_INPUT',
      correct: false,
      responseTimeMs: 1200,
      feedback,
      advanceAutomatically: false,
    });
    const retryAttempt = createPendingQuizAttempt({
      mode: 'JA_TRANSLATION_INPUT',
      correct: pendingAttempt.correct,
      responseTimeMs: pendingAttempt.responseTimeMs,
      feedback: pendingAttempt.feedback,
      advanceAutomatically: pendingAttempt.advanceAutomatically,
    });

    expect(retryAttempt.advanceAutomatically).toBe(false);
    expect(retryAttempt.feedback).toBe(feedback);
  });

  it('keeps partial-score feedback in review/result lists without duplicating retries', () => {
    const partialCorrectFeedback = buildFeedback({
      isCorrect: true,
      score: 8,
      verdictLabel: '減点あり正答',
      issues: ['時制の自然さを整えましょう。'],
    });
    const incorrectFeedback = buildFeedback({ score: 5, verdictLabel: '要復習' });

    const withPartialCorrect = upsertQuestionFeedbackById([], translationQuestion, partialCorrectFeedback);
    const afterRetry = upsertQuestionFeedbackById(withPartialCorrect, translationQuestion, incorrectFeedback);

    expect(withPartialCorrect).toHaveLength(1);
    expect(withPartialCorrect[0].translationFeedback).toMatchObject({
      isCorrect: true,
      score: 8,
      verdictLabel: '減点あり正答',
    });
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0].translationFeedback).toMatchObject({
      isCorrect: false,
      score: 5,
      verdictLabel: '要復習',
    });
  });
});
