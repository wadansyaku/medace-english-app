import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizRunningView from '../components/quiz/QuizRunningView';
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
});
