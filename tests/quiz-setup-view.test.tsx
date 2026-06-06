import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizSetupView from '../components/quiz/QuizSetupView';
import { getDefaultGrammarScopeIdForMode } from '../config/quizFlow';
import type { QuizSessionConfig } from '../types';

const noop = () => {};

const baseConfig: QuizSessionConfig = {
  selectionMode: 'FULL_RANDOM',
  questionMode: 'EN_TO_JA',
  questionCount: 5,
  rangeStart: 1,
  rangeEnd: 120,
  grammarScopeId: undefined,
  showGrammarScopeHint: true,
};

const renderSetup = (overrides: Partial<React.ComponentProps<typeof QuizSetupView>> = {}) => renderToStaticMarkup(
  <QuizSetupView
    setupConfig={baseConfig}
    setupSummary="全範囲から5問"
    setupCandidateWordsLength={120}
    setupActualQuestionCount={5}
    setupEmptyCopy="出題条件に合う単語がありません。"
    allWordsLength={120}
    normalizedSetupRange={{ start: 1, end: 120 }}
    minWordNumber={1}
    maxWordNumber={120}
    onUpdateSetupConfig={noop}
    onAdvanceToReady={noop}
    {...overrides}
  />,
);

describe('QuizSetupView compact setup', () => {
  it('centers the default path on a five-question start and keeps details collapsed', () => {
    const rendered = renderSetup();

    expect(rendered).toContain('5問クイズ');
    expect(rendered).toContain('必要なときだけ詳細設定で条件を変えます。');
    expect(rendered).toContain('5問はじめる');
    expect(rendered).toContain('data-testid="quiz-setup-compact-summary"');
    expect(rendered).toContain('data-testid="quiz-advanced-settings"');
    expect(rendered).not.toContain('<details data-testid="quiz-advanced-settings" open');
    expect(rendered).not.toContain('Step 1');
    expect(rendered).not.toContain('Step 2');
    expect(rendered).not.toContain('Step 3');
  });

  it('keeps range, learned-only, direction, and question-count controls in advanced settings', () => {
    const rendered = renderSetup({
      setupConfig: {
        ...baseConfig,
        selectionMode: 'RANGE_RANDOM',
        rangeStart: 10,
        rangeEnd: 40,
      },
      setupSummary: 'No. 10 - 40から5問',
      normalizedSetupRange: { start: 10, end: 40 },
    });

    expect(rendered).toContain('data-testid="quiz-selection-range_random"');
    expect(rendered).toContain('data-testid="quiz-selection-learned_only"');
    expect(rendered).toContain('開始番号');
    expect(rendered).toContain('value="10"');
    expect(rendered).toContain('data-testid="quiz-direction-ja_translation_input"');
    expect(rendered).toContain('data-testid="quiz-count-10"');
    expect(rendered).toContain('data-testid="quiz-count-20"');
  });

  it('keeps grammar scope controls when a grammar mode is selected', () => {
    const rendered = renderSetup({
      setupConfig: {
        ...baseConfig,
        questionMode: 'GRAMMAR_CLOZE',
        grammarScopeId: getDefaultGrammarScopeIdForMode('GRAMMAR_CLOZE'),
      },
    });

    expect(rendered).toContain('文法範囲');
    expect(rendered).toContain('data-testid="quiz-grammar-scope-visibility-show"');
    expect(rendered).toContain('data-testid="quiz-grammar-scope-visibility-hide"');
    expect(rendered).toContain('data-testid="quiz-grammar-scope-');
  });
});
