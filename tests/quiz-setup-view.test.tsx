import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import QuizHeader from '../components/quiz/QuizHeader';
import QuizSetupView from '../components/quiz/QuizSetupView';
import { getDefaultGrammarScopeIdForMode } from '../config/quizFlow';
import { NARU_BOOK_ID } from '../shared/naruBook';
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
  it('keeps the setup header and start action inside their parent width', () => {
    const header = renderToStaticMarkup(<QuizHeader title="4問クイズ" subtitle="必要なときだけ条件を変えて、すぐ始めます。" bookLabel="Synthetic overflow diagnostic" onBack={noop} />);
    const setup = renderSetup();
    expect(header).not.toContain('-mx-4');
    expect(setup).not.toContain('-mx-4');
    expect(header).toContain('min-w-0');
    expect(header).toContain('h-11 w-11');
    expect(setup).toContain('mobile-sticky-action-bar min-w-0 px-0');
    expect(header).toContain('Synthetic overflow diagnostic');
    expect(setup).toContain('5問はじめる');
  });

  it('applies preset button clicks through the existing setup update callback', () => {
    const update = vi.fn();
    const view = QuizSetupView({
      bookId: NARU_BOOK_ID, setupConfig: baseConfig, setupSummary: '全範囲から5問',
      setupCandidateWordsLength: 1531, setupActualQuestionCount: 5,
      setupEmptyCopy: '', allWordsLength: 1531, normalizedSetupRange: { start: 1, end: 1531 },
      minWordNumber: 1, maxWordNumber: 1531, onUpdateSetupConfig: update, onAdvanceToReady: noop,
    });
    if (!React.isValidElement(view)) throw new Error('Quiz setup did not return an element.');
    const buttons = new Map<string, () => void>();
    const visit = (node: React.ReactNode) => React.Children.forEach(node, (child) => {
      if (!React.isValidElement<{ children?: React.ReactNode; 'data-testid'?: string; onClick?: () => void }>(child)) return;
      if (child.type === 'button' && child.props['data-testid']?.startsWith('naru-range-') && child.props.onClick) {
        buttons.set(child.props['data-testid'], child.props.onClick);
      }
      visit(child.props.children);
    });
    visit(view);
    for (const [id, start, end] of [
      ['verb', 1, 353], ['noun', 354, 1285], ['adverb', 1286, 1372], ['adjective', 1373, 1531],
    ] as const) {
      buttons.get(`naru-range-${id}`)!();
      expect(update).toHaveBeenLastCalledWith({ selectionMode: 'RANGE_RANDOM', rangeStart: start, rangeEnd: end });
    }
    buttons.get('naru-range-all')!();
    expect(update).toHaveBeenLastCalledWith({ selectionMode: 'FULL_RANDOM', rangeStart: 1, rangeEnd: 1531 });
  });

  it('offers part-of-speech ranges only for the canonical Naru book', () => {
    const rendered = renderSetup({ bookId: NARU_BOOK_ID });
    for (const id of ['all', 'verb', 'noun', 'adverb', 'adjective']) {
      expect(rendered).toContain(`data-testid="naru-range-${id}"`);
    }
    expect(rendered).toContain('No. 354–1285');
    expect(rendered).toContain('同じ1冊の中から出題します。');
    expect(renderSetup({ bookId: 'other-book' })).not.toContain('naru-range-presets');
    expect(renderSetup({ bookId: 'naru-shisto-original-v2' })).not.toContain('naru-range-presets');
    expect(renderSetup()).not.toContain('naru-range-presets');
  });

  it('marks the exact preset and keeps custom number ranges available', () => {
    const nounConfig: QuizSessionConfig = { ...baseConfig, selectionMode: 'RANGE_RANDOM', rangeStart: 354, rangeEnd: 1285 };
    const rendered = renderSetup({ bookId: NARU_BOOK_ID, setupConfig: nounConfig, normalizedSetupRange: { start: 354, end: 1285 } });
    expect(rendered).toContain('data-testid="naru-range-noun" aria-pressed="true"');
    expect(rendered).toContain('開始番号');
    expect(rendered).toContain('value="354"');
    const custom = renderSetup({ bookId: NARU_BOOK_ID, setupConfig: { ...nounConfig, rangeEnd: 400 } });
    expect(custom).toContain('data-testid="naru-range-noun" aria-pressed="false"');
  });

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
