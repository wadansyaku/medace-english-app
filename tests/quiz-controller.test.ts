import { describe, expect, it } from 'vitest';

import {
  applyCuratedStaticQualityState,
  buildAiGrammarQuestionSourceNotice,
  createInitialQuizAttemptState,
  createPendingQuizAttempt,
  quizAttemptReducer,
  resolveQuizAdvanceTarget,
  shouldAutoAdvanceQuizAttempt,
  upsertQuestionFeedbackById,
} from '../hooks/useQuizModeController';
import { getLearnerAiQuestionQualityState } from '../shared/aiCacheCbt';
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

  it('describes approved-AI shortage without exposing review internals', () => {
    expect(buildAiGrammarQuestionSourceNotice(2, 1)).toBe('確認済みのAI問題が足りないため、例文ベースの問題も使います。');
    expect(buildAiGrammarQuestionSourceNotice(0, 3)).toBe('確認済みのAI問題がまだないため、今回は例文ベースの問題を使います。');
    expect(buildAiGrammarQuestionSourceNotice(3, 0)).toBeNull();
  });

  it('marks static grammar fallbacks as curated without overwriting existing quality state', () => {
    const approvedState = getLearnerAiQuestionQualityState('APPROVED_REUSE');
    const questions = applyCuratedStaticQualityState([
      {
        ...translationQuestion,
        id: 'static-fallback-1',
        qualityState: undefined,
      },
      {
        ...translationQuestion,
        id: 'approved-reuse-1',
        qualityState: approvedState,
      },
    ]);

    expect(questions[0].qualityState).toMatchObject({
      status: 'CURATED_STATIC',
      labelJa: '教材問題',
      tone: 'curated',
      isLearnerApproved: true,
      isReusable: true,
    });
    expect(questions[1].qualityState).toBe(approvedState);
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

describe('quiz attempt reducer', () => {
  it('resets the full attempt state for a new session', () => {
    const feedback = buildFeedback();
    const pendingAttempt = createPendingQuizAttempt({
      mode: 'JA_TRANSLATION_INPUT',
      correct: false,
      responseTimeMs: 1400,
      feedback,
      advanceAutomatically: false,
    });
    let state = createInitialQuizAttemptState();
    state = quizAttemptReducer(state, { type: 'SET_SHOW_OPTIONS', value: true });
    state = quizAttemptReducer(state, { type: 'SELECT_OPTION', option: 'choice-a' });
    state = quizAttemptReducer(state, { type: 'ADD_ORDER_TOKEN', tokenId: 'token-1', answerTokenCount: 2 });
    state = quizAttemptReducer(state, { type: 'SET_ORDER_FEEDBACK', value: 'incorrect' });
    state = quizAttemptReducer(state, { type: 'SET_ANSWER_INPUT', value: 'その語は復習される' });
    state = quizAttemptReducer(state, {
      type: 'SET_INPUT_FEEDBACK',
      result: 'incorrect',
      tone: 'incorrect',
      message: '不正解です。',
    });
    state = quizAttemptReducer(state, { type: 'SHOW_SPELLING_HINT', message: 'ヒントを表示しました。' });
    state = quizAttemptReducer(state, {
      type: 'SET_CHECKING_TRANSLATION_FEEDBACK',
      value: true,
      message: '受験答案として採点中です...',
    });
    state = quizAttemptReducer(state, {
      type: 'SET_TRANSLATION_RESULT',
      feedback,
      result: 'incorrect',
      message: '部分点: 受け身を補います。',
    });
    state = quizAttemptReducer(state, { type: 'PERSIST_STARTED', attempt: pendingAttempt });
    state = quizAttemptReducer(state, { type: 'PERSIST_FAILED', message: '保存できませんでした。' });
    state = quizAttemptReducer(state, { type: 'SET_TRANSLATION_AWAITING_ADVANCE', value: true });

    expect(quizAttemptReducer(state, { type: 'RESET_FOR_SESSION' })).toEqual(createInitialQuizAttemptState());
  });

  it('resets question UI state while preserving retryable save state between questions', () => {
    const pendingAttempt = createPendingQuizAttempt({
      mode: 'JA_TRANSLATION_ORDER',
      correct: false,
      responseTimeMs: 900,
    });
    let state = createInitialQuizAttemptState();
    state = quizAttemptReducer(state, { type: 'SET_SHOW_OPTIONS', value: true });
    state = quizAttemptReducer(state, { type: 'SELECT_OPTION', option: 'choice-a' });
    state = quizAttemptReducer(state, { type: 'ADD_ORDER_TOKEN', tokenId: 'token-1', answerTokenCount: 2 });
    state = quizAttemptReducer(state, { type: 'SET_ORDER_FEEDBACK', value: 'incorrect' });
    state = quizAttemptReducer(state, { type: 'SET_ANSWER_INPUT', value: 'wrong answer' });
    state = quizAttemptReducer(state, { type: 'SHOW_SPELLING_HINT', message: 'hint' });
    state = quizAttemptReducer(state, { type: 'PERSIST_STARTED', attempt: pendingAttempt });
    state = { ...state, saveError: '保存できませんでした。' };

    const nextState = quizAttemptReducer(state, { type: 'RESET_FOR_NEXT_QUESTION' });

    expect(nextState).toMatchObject({
      showOptions: false,
      selectedOption: null,
      orderedTokenIds: [],
      orderFeedback: null,
      answerInput: '',
      inputResult: null,
      showSpellingHint: false,
      spellingFeedbackTone: null,
      spellingFeedbackMessage: null,
      translationFeedback: null,
      checkingTranslationFeedback: false,
      translationAwaitingAdvance: false,
      saveError: null,
      pendingAttempt,
      persistingAttempt: true,
    });
    expect(nextState.pendingAttempt).toBe(pendingAttempt);
  });

  it('updates ordering tokens with duplicate, limit, movement, removal, and clear guards', () => {
    let state = createInitialQuizAttemptState();

    state = quizAttemptReducer(state, { type: 'ADD_ORDER_TOKEN', tokenId: 'a', answerTokenCount: 3 });
    state = quizAttemptReducer(state, { type: 'ADD_ORDER_TOKEN', tokenId: 'b', answerTokenCount: 3 });
    state = quizAttemptReducer(state, { type: 'ADD_ORDER_TOKEN', tokenId: 'b', answerTokenCount: 3 });
    state = quizAttemptReducer(state, { type: 'ADD_ORDER_TOKEN', tokenId: 'c', answerTokenCount: 3 });
    state = quizAttemptReducer(state, { type: 'ADD_ORDER_TOKEN', tokenId: 'd', answerTokenCount: 3 });
    expect(state.orderedTokenIds).toEqual(['a', 'b', 'c']);

    state = quizAttemptReducer(state, { type: 'MOVE_ORDER_TOKEN', tokenId: 'c', direction: -1 });
    expect(state.orderedTokenIds).toEqual(['a', 'c', 'b']);

    state = quizAttemptReducer(state, { type: 'MOVE_ORDER_TOKEN', tokenId: 'a', direction: -1 });
    expect(state.orderedTokenIds).toEqual(['a', 'c', 'b']);

    state = quizAttemptReducer(state, { type: 'REMOVE_ORDER_TOKEN', tokenId: 'c' });
    expect(state.orderedTokenIds).toEqual(['a', 'b']);

    state = quizAttemptReducer(state, { type: 'CLEAR_ORDER_TOKENS' });
    expect(state.orderedTokenIds).toEqual([]);
  });

  it('keeps translation scoring state compatible with explicit advance and retry metadata', () => {
    const feedback = buildFeedback({
      isCorrect: false,
      score: 7,
      verdictLabel: '惜しい',
      summaryJa: '意味は近いですが、受け身の訳出が不足しています。',
    });
    const pendingAttempt = createPendingQuizAttempt({
      mode: 'JA_TRANSLATION_INPUT',
      correct: false,
      responseTimeMs: 1600,
      feedback,
      advanceAutomatically: false,
    });
    let state = createInitialQuizAttemptState();
    state = {
      ...state,
      pendingAttempt,
      saveError: '保存できませんでした。',
      persistingAttempt: false,
    };

    state = quizAttemptReducer(state, {
      type: 'SET_CHECKING_TRANSLATION_FEEDBACK',
      value: true,
      message: '受験答案として採点中です...',
    });
    expect(state).toMatchObject({
      checkingTranslationFeedback: true,
      spellingFeedbackTone: 'info',
      spellingFeedbackMessage: '受験答案として採点中です...',
      saveError: '保存できませんでした。',
      persistingAttempt: false,
    });
    expect(state.pendingAttempt).toBe(pendingAttempt);

    state = quizAttemptReducer(state, { type: 'SET_CHECKING_TRANSLATION_FEEDBACK', value: false });
    state = quizAttemptReducer(state, {
      type: 'SET_TRANSLATION_RESULT',
      feedback,
      result: 'incorrect',
      message: '惜しい: 意味は近いですが、受け身の訳出が不足しています。',
    });
    state = quizAttemptReducer(state, { type: 'SET_TRANSLATION_AWAITING_ADVANCE', value: true });

    expect(state).toMatchObject({
      checkingTranslationFeedback: false,
      translationFeedback: feedback,
      inputResult: 'incorrect',
      spellingFeedbackTone: 'incorrect',
      spellingFeedbackMessage: '惜しい: 意味は近いですが、受け身の訳出が不足しています。',
      translationAwaitingAdvance: true,
      pendingAttempt,
      persistingAttempt: false,
      saveError: '保存できませんでした。',
    });
    expect(state.pendingAttempt).toBe(pendingAttempt);
  });

  it('keeps a pending attempt available when persistence fails', () => {
    const pendingAttempt = createPendingQuizAttempt({
      mode: 'SPELLING_HINT',
      correct: false,
      responseTimeMs: 700,
    });
    let state = createInitialQuizAttemptState();

    state = quizAttemptReducer(state, { type: 'PERSIST_STARTED', attempt: pendingAttempt });
    state = quizAttemptReducer(state, { type: 'PERSIST_FAILED', message: '保存できませんでした。' });

    expect(state).toMatchObject({
      pendingAttempt,
      persistingAttempt: false,
      saveError: '保存できませんでした。',
    });
  });
});
