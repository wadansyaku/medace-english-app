import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizRunningView from '../components/quiz/QuizRunningView';
import { EnglishLevel } from '../types';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';

const noop = () => {};

const baseQuestion: GeneratedWorksheetQuestion = {
  id: 'question-1',
  mode: 'GRAMMAR_CLOZE',
  interactionType: 'CHOICE',
  wordId: 'word-1',
  bookId: 'book-1',
  promptLabel: '時を表す副詞句',
  promptText: 'Doctors ____ the patient before surgery.',
  answer: 'stabilize',
  options: ['stabilize', 'monitor', 'triage'],
  sourceSentence: 'Doctors stabilize the patient before surgery.',
  grammarFocus: '時を表す副詞句',
};

const renderQuiz = (overrides: Partial<React.ComponentProps<typeof QuizRunningView>> = {}) => renderToStaticMarkup(
  <QuizRunningView
    currentQuestion={baseQuestion}
    currentModeLabel="文法穴埋め"
    activeSummary="復習"
    currentQIndex={0}
    questionsLength={3}
    score={0}
    isHintMode={false}
    showSpellingHint={false}
    showOptions={false}
    selectedOption={null}
    orderedTokenIds={[]}
    orderFeedback={null}
    answerInput=""
    inputResult={null}
    spellingFeedbackTone={null}
    spellingFeedbackMessage={null}
    translationFeedback={null}
    checkingTranslationFeedback={false}
    translationAwaitingAdvance={false}
    persistingAttempt={false}
    saveError={null}
    hasPendingAttempt={false}
    onShowOptions={noop}
    onChangeAnswerInput={noop}
    onHintSubmit={(event) => event.preventDefault()}
    onRevealSpellingHint={noop}
    onOptionClick={noop}
    onOrderTokenSelect={noop}
    onOrderTokenRemove={noop}
    onOrderTokenMove={noop}
    onOrderTokensClear={noop}
    onOrderSubmit={noop}
    onRetrySave={noop}
    onAdvanceAfterTranslationFeedback={noop}
    {...overrides}
  />,
);

describe('QuizRunningView answer-bearing context', () => {
  it('hides the original sentence for grammar cloze questions until the learner answers', () => {
    const beforeAnswer = renderQuiz();

    expect(beforeAnswer).toContain('元の英文は、判定後に表示します。');
    expect(beforeAnswer).not.toContain('Doctors stabilize the patient before surgery.');

    const afterAnswer = renderQuiz({
      showOptions: true,
      selectedOption: 'stabilize',
    });

    expect(afterAnswer).toContain('Doctors stabilize the patient before surgery.');
  });

  it('hides the full English sentence for English word-order questions until scoring', () => {
    const question: GeneratedWorksheetQuestion = {
      ...baseQuestion,
      mode: 'EN_WORD_ORDER',
      interactionType: 'ORDERING',
      promptLabel: '英語語順',
      promptText: 'チップを正しい英文に並べ替えます。',
      answer: 'Doctors stabilize the patient before surgery.',
      tokens: [
        { id: 't2', text: 'stabilize', learnedWord: 'stabilize' },
        { id: 't1', text: 'Doctors' },
        { id: 't4', text: 'patient' },
        { id: 't3', text: 'the' },
        { id: 't5', text: 'before' },
        { id: 't6', text: 'surgery.' },
      ],
      answerTokenIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
      sourceSentence: 'Doctors stabilize the patient before surgery.',
      grammarFocus: undefined,
      options: undefined,
    };

    const beforeAnswer = renderQuiz({ currentQuestion: question });

    expect(beforeAnswer).toContain('元の英文は、判定後に表示します。');
    expect(beforeAnswer).not.toContain('Doctors stabilize the patient before surgery.');

    const afterAnswer = renderQuiz({
      currentQuestion: question,
      orderFeedback: 'correct',
      orderedTokenIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
    });

    expect(afterAnswer).toContain('Doctors stabilize the patient before surgery.');
  });

  it('keeps the English clue but hides the Japanese answer for translation ordering until scoring', () => {
    const question: GeneratedWorksheetQuestion = {
      ...baseQuestion,
      mode: 'JA_TRANSLATION_ORDER',
      interactionType: 'ORDERING',
      promptLabel: '日本語語順',
      promptText: '英文をもとに日本語チップを並べ替えます。',
      answer: '医師は 手術前に 患者を 安定させる',
      tokens: [
        { id: 'j2', text: '手術前に' },
        { id: 'j1', text: '医師は' },
        { id: 'j4', text: '安定させる', learnedWord: 'stabilize' },
        { id: 'j3', text: '患者を' },
      ],
      answerTokenIds: ['j1', 'j2', 'j3', 'j4'],
      sourceSentence: 'Doctors stabilize the patient before surgery.',
      sourceTranslation: '医師は 手術前に 患者を 安定させる',
      grammarFocus: undefined,
      options: undefined,
    };

    const beforeAnswer = renderQuiz({ currentQuestion: question });

    expect(beforeAnswer).toContain('Doctors stabilize the patient before surgery.');
    expect(beforeAnswer).toContain('日本語訳は、判定後に表示します。');
    expect(beforeAnswer).not.toContain('医師は 手術前に 患者を 安定させる');

    const afterAnswer = renderQuiz({
      currentQuestion: question,
      orderFeedback: 'incorrect',
      orderedTokenIds: ['j2', 'j1', 'j4', 'j3'],
    });

    expect(afterAnswer).toContain('医師は 手術前に 患者を 安定させる');
  });

  it('renders a Japanese full-translation input flow and hides the answer until feedback', () => {
    const question: GeneratedWorksheetQuestion = {
      ...baseQuestion,
      mode: 'JA_TRANSLATION_INPUT',
      interactionType: 'TEXT_INPUT',
      promptLabel: '和訳全文入力',
      promptText: 'Doctors stabilize the patient before surgery.',
      answer: '医師は 手術前に 患者を 安定させる',
      sourceSentence: 'Doctors stabilize the patient before surgery.',
      sourceTranslation: '医師は 手術前に 患者を 安定させる',
      grammarFocus: undefined,
      options: undefined,
      instruction: '英文を読み、日本語訳を全文で入力します。',
    };

    const beforeAnswer = renderQuiz({
      currentQuestion: question,
      answerInput: '',
    });

    expect(beforeAnswer).toContain('和訳全文入力');
    expect(beforeAnswer).toContain('日本語訳を入力');
    expect(beforeAnswer).toContain('日本語訳は、判定後に表示します。');
    expect(beforeAnswer).not.toContain('正解例');

    const afterAnswer = renderQuiz({
      currentQuestion: question,
      answerInput: '医師は手術前に患者を安定させる',
      inputResult: 'correct',
      spellingFeedbackTone: 'correct',
      spellingFeedbackMessage: '正解です。日本語訳を最後まで入力できました。',
    });

    expect(afterAnswer).toContain('医師は 手術前に 患者を 安定させる');
    expect(afterAnswer).toContain('正解です。日本語訳を最後まで入力できました。');
  });

  it('reveals the hidden grammar scope after Japanese translation feedback', () => {
    const question: GeneratedWorksheetQuestion = {
      ...baseQuestion,
      mode: 'JA_TRANSLATION_INPUT',
      interactionType: 'TEXT_INPUT',
      promptLabel: '和訳全文入力',
      promptText: 'monitor is reviewed by students today.',
      answer: '観察する という語は 生徒に 復習される',
      sourceSentence: 'monitor is reviewed by students today.',
      sourceTranslation: '観察する という語は 生徒に 復習される',
      grammarFocus: undefined,
      grammarScope: {
        scopeId: 'passive-voice',
        cefrLevel: EnglishLevel.B1,
        labelJa: '受け身',
        isExplicitScope: true,
        source: 'EXPLICIT',
      },
      showGrammarScopeHint: false,
      options: undefined,
    };

    const beforeAnswer = renderQuiz({ currentQuestion: question });
    expect(beforeAnswer).toContain('文法範囲は、判定後に表示します。');
    expect(beforeAnswer).not.toContain('受け身');

    const afterAnswer = renderQuiz({
      currentQuestion: question,
      answerInput: '観察するという語は生徒に復習される',
      inputResult: 'correct',
    });

    expect(afterAnswer).toContain('観察する という語は 生徒に 復習される');
    expect(afterAnswer).toContain('受け身');
  });

  it('renders exam-oriented translation feedback and grammar explanation after scoring', () => {
    const question: GeneratedWorksheetQuestion = {
      ...baseQuestion,
      mode: 'JA_TRANSLATION_INPUT',
      interactionType: 'TEXT_INPUT',
      promptLabel: '和訳全文入力',
      promptText: 'The term is reviewed by students today.',
      answer: 'その語は 今日 生徒によって 復習される',
      sourceSentence: 'The term is reviewed by students today.',
      sourceTranslation: 'その語は 今日 生徒によって 復習される',
      grammarFocus: '受け身',
      grammarScope: {
        scopeId: 'passive-voice',
        cefrLevel: EnglishLevel.B1,
        labelJa: '受け身',
        isExplicitScope: true,
        source: 'EXPLICIT',
      },
      grammarExplanation: {
        scopeId: 'passive-voice',
        cefrLevel: EnglishLevel.B1,
        labelJa: '受け身',
        patternJa: 'be動詞 + 過去分詞で、される側を主語にします。',
        examFocusJa: '誰が何をされたのかを補って訳します。',
        commonMistakeJa: '過去形と過去分詞を混同しやすいです。',
        automationDrillJa: 'be + 過去分詞をまとまりで反復します。',
        threeSlotFrameJa: 'されるもの / be+過去分詞 / by+行為者',
      },
      options: undefined,
    };

    const rendered = renderQuiz({
      currentQuestion: question,
      answerInput: '生徒は今日その語を復習します',
      inputResult: 'incorrect',
      spellingFeedbackTone: 'incorrect',
      spellingFeedbackMessage: '部分点: 受け身の関係を確認しましょう。',
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
        usedAi: false,
        criteria: [
          { label: '意味', score: 3, maxScore: 4, comment: '中心は取れています。' },
          { label: '文法構造', score: 1, maxScore: 3, comment: '受け身が曖昧です。' },
          { label: '受験答案らしさ', score: 2, maxScore: 3, comment: '答案として整えます。' },
        ],
      },
    });

    expect(rendered).toContain('6 / 10・部分点');
    expect(rendered).toContain('大学受験');
    expect(rendered).toContain('改善訳');
    expect(rendered).toContain('その語は今日、生徒によって復習される。');
    expect(rendered).toContain('3ます: されるもの / be+過去分詞 / by+行為者');
  });

  it('shows an explicit next action after Japanese translation feedback instead of another submit action', () => {
    const question: GeneratedWorksheetQuestion = {
      ...baseQuestion,
      mode: 'JA_TRANSLATION_INPUT',
      interactionType: 'TEXT_INPUT',
      promptLabel: '和訳全文入力',
      promptText: 'The term is reviewed by students today.',
      answer: 'その語は 今日 生徒によって 復習される',
      sourceSentence: 'The term is reviewed by students today.',
      sourceTranslation: 'その語は 今日 生徒によって 復習される',
      grammarFocus: '受け身',
      options: undefined,
    };

    const rendered = renderQuiz({
      currentQuestion: question,
      answerInput: '生徒は今日その語を復習します',
      inputResult: 'incorrect',
      translationAwaitingAdvance: true,
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
        usedAi: false,
        criteria: [
          { label: '意味', score: 3, maxScore: 4, comment: '中心は取れています。' },
          { label: '文法構造', score: 1, maxScore: 3, comment: '受け身が曖昧です。' },
          { label: '受験答案らしさ', score: 2, maxScore: 3, comment: '答案として整えます。' },
        ],
      },
    });

    expect(rendered).toContain('data-testid="translation-feedback-next"');
    expect(rendered).toContain('簡易判定');
    expect(rendered).toContain('正解例との一致を中心に簡易判定しています');
    expect(rendered).toContain('フィードバックを読んだので次へ');
    expect(rendered).not.toContain('type="submit"');
    expect(rendered).not.toContain('和訳を判定する');
    expect(rendered).not.toContain('ヒントを見る');
  });

  it('does not reveal unstructured AI grammar focus before answering', () => {
    const question: GeneratedWorksheetQuestion = {
      ...baseQuestion,
      grammarScope: undefined,
      grammarFocus: 'stabilize の語形',
      showGrammarScopeHint: true,
    };

    const beforeAnswer = renderQuiz({ currentQuestion: question });
    expect(beforeAnswer).not.toContain('stabilize の語形');

    const afterAnswer = renderQuiz({
      currentQuestion: question,
      showOptions: true,
      selectedOption: 'stabilize',
    });
    expect(afterAnswer).toContain('stabilize の語形');
  });
});
