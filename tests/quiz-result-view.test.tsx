import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizResultView from '../components/quiz/QuizResultView';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';

const noop = () => {};

const feedbackQuestion: GeneratedWorksheetQuestion = {
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
  translationFeedback: {
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
      { label: '受験答案らしさ', score: 2, maxScore: 3, comment: '答案として整えます。' },
    ],
  },
};

const partialCorrectQuestion: GeneratedWorksheetQuestion = {
  ...feedbackQuestion,
  id: 'translation-partial-correct',
  promptText: 'Students should review the term again.',
  answer: '生徒は もう一度 その語を 復習すべきだ',
  translationFeedback: {
    ...feedbackQuestion.translationFeedback!,
    isCorrect: true,
    score: 8,
    verdictLabel: '減点あり正答',
    summaryJa: '意味は正しく取れています。答案としては語順と助動詞の訳を少し整えます。',
    issues: ['should の「すべきだ」を明確にしましょう。'],
    improvedTranslation: '生徒はもう一度その語を復習すべきだ。',
    nextDrillJa: 'should / must / have to の訳し分けを1問だけ確認しましょう。',
  },
};

const renderResult = (overrides: Partial<React.ComponentProps<typeof QuizResultView>> = {}) => renderToStaticMarkup(
  <QuizResultView
    percentage={50}
    currentModeLabel="日本語全文入力"
    activeSummary="復習 2問"
    score={1}
    questionsLength={2}
    reviewTargets={[]}
    translationFeedbackSummaries={[]}
    nextReviewCopy="10分後に確認します。"
    onRetry={noop}
    onReset={noop}
    onBack={noop}
    {...overrides}
  />,
);

describe('QuizResultView translation feedback summary', () => {
  it('keeps Japanese translation feedback on the result screen', () => {
    const rendered = renderResult({
      translationFeedbackSummaries: [feedbackQuestion],
    });

    expect(rendered).toContain('data-testid="quiz-result-translation-feedback-summary"');
    expect(rendered).toContain('6 / 10・部分点');
    expect(rendered).toContain('改善訳');
    expect(rendered).toContain('その語は今日、生徒によって復習される。');
    expect(rendered).toContain('次ドリル');
    expect(rendered).toContain('主語 / be+過去分詞 / by の3ますで確認しましょう。');
  });

  it('keeps partial-correct translation feedback in the result summary', () => {
    const rendered = renderResult({
      score: 1,
      questionsLength: 1,
      percentage: 100,
      translationFeedbackSummaries: [partialCorrectQuestion],
    });

    expect(rendered).toContain('減点あり正答');
    expect(rendered).toContain('8 / 10');
    expect(rendered).toContain('生徒はもう一度その語を復習すべきだ。');
    expect(rendered).toContain('should / must / have to の訳し分けを1問だけ確認しましょう。');
  });

  it('keeps incorrect Japanese translation feedback inside the review targets', () => {
    const rendered = renderResult({
      reviewTargets: [feedbackQuestion],
      translationFeedbackSummaries: [feedbackQuestion],
    });

    expect(rendered).toContain('data-testid="quiz-review-translation-feedback-summary"');
    expect(rendered).toContain('改善訳: その語は今日、生徒によって復習される。');
    expect(rendered).toContain('次ドリル: 主語 / be+過去分詞 / by の3ますで確認しましょう。');
  });
});
