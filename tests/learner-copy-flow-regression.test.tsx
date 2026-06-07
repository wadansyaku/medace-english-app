import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizReadyView from '../components/quiz/QuizReadyView';
import QuizSetupView from '../components/quiz/QuizSetupView';
import StudyFinishedView from '../components/study/StudyFinishedView';
import type { QuizSessionConfig, WordData } from '../types';

const root = process.cwd();
const noop = () => {};

const readText = (relativePath: string): string => (
  fs.readFileSync(`${root}/${relativePath}`, 'utf8')
);

const stripHtml = (html: string): string => (
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
);

const getButtonByTestId = (html: string, testId: string): string => {
  const match = html.match(new RegExp(`<button(?=[^>]*data-testid="${testId}")[^>]*>[\\s\\S]*?<\\/button>`));
  return match?.[0] ?? '';
};

const getButtonText = (html: string, testId: string): string => (
  stripHtml(getButtonByTestId(html, testId))
);

const getPrimaryButtonText = (html: string): string => {
  const match = html.match(/<button(?=[^>]*bg-medace-600)[^>]*>[\s\S]*?<\/button>/);
  return stripHtml(match?.[0] ?? '');
};

const baseQuizConfig: QuizSessionConfig = {
  selectionMode: 'FULL_RANDOM',
  questionMode: 'EN_TO_JA',
  questionCount: 5,
  rangeStart: 1,
  rangeEnd: 120,
  grammarScopeId: undefined,
  showGrammarScopeHint: true,
};

const reviewPreview: WordData[] = [
  {
    id: 'word-1',
    bookId: 'book-1',
    number: 1,
    word: 'review',
    definition: '復習する',
  },
];

const renderQuizSetup = () => renderToStaticMarkup(
  <QuizSetupView
    setupConfig={baseQuizConfig}
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
  />,
);

const renderQuizReady = () => renderToStaticMarkup(
  <QuizReadyView
    setupConfig={baseQuizConfig}
    setupSummary="全範囲から5問"
    setupCandidateWordsLength={120}
    setupActualQuestionCount={5}
    onStart={noop}
  />,
);

const renderStudyFinished = (isMobileViewport: boolean) => renderToStaticMarkup(
  <StudyFinishedView
    isMobileViewport={isMobileViewport}
    leveledUp={false}
    sessionWordCount={5}
    earnedXP={50}
    streakBonusXP={0}
    nextReviewMessage="今夜もう一度だけ見直します。"
    weaknessSummary="スペルを少しだけ確認します。"
    reviewPreview={reviewPreview}
    onStartSpellingCheck={noop}
    onExit={noop}
  />,
);

describe('learner-facing study copy guardrails', () => {
  it('keeps internal product and cost rationale out of learning screens', () => {
    const learnerFacingFiles = [
      'components/StudyMode.tsx',
      'components/study/StudyFinishedView.tsx',
      'components/quiz/QuizSetupView.tsx',
      'components/quiz/QuizReadyView.tsx',
      'components/quiz/QuizRunningView.tsx',
      'components/quiz/QuizResultView.tsx',
    ];
    const bannedCopy = [
      { label: 'internal cost rationale', pattern: /コストが高い|基礎コスト|コストを回収|推定コスト/ },
      { label: 'internal business rationale', pattern: /内部事情|事業側/ },
    ];

    const violations = learnerFacingFiles.flatMap((relativePath) => {
      const source = readText(relativePath);
      const lines = source.split('\n');
      return bannedCopy.flatMap(({ label, pattern }) => {
        const lineIndex = lines.findIndex((line) => pattern.test(line));
        return lineIndex === -1
          ? []
          : [`${relativePath}:${lineIndex + 1} ${label}`];
      });
    });

    expect(violations).toEqual([]);
  });
});

describe('StudyFinishedView primary CTA stability', () => {
  it.each([
    { viewport: 'mobile', isMobileViewport: true },
    { viewport: 'desktop', isMobileViewport: false },
  ])('keeps the same primary completion CTA on $viewport', ({ isMobileViewport }) => {
    const rendered = renderStudyFinished(isMobileViewport);
    const exitButton = getButtonByTestId(rendered, 'study-finish-exit');

    expect(getPrimaryButtonText(rendered)).toBe('ダッシュボードに戻る');
    expect(exitButton).toContain('bg-medace-600');
    expect(stripHtml(exitButton)).toBe('ダッシュボードに戻る');
  });
});

describe('quiz start path guardrails', () => {
  it('keeps quiz start to the setup CTA and one ready start action only', () => {
    const controllerSource = readText('hooks/useQuizModeController.ts');
    const screenUnion = controllerSource.match(/export type QuizScreen = ([^;]+);/);
    const screens = [...(screenUnion?.[1].matchAll(/'([^']+)'/g) ?? [])].map((match) => match[1]);
    const preRunningScreens = screens.slice(0, screens.indexOf('RUNNING'));

    expect(preRunningScreens.every((screen) => ['SETUP', 'READY'].includes(screen))).toBe(true);
    expect(preRunningScreens.length).toBeLessThanOrEqual(2);

    const setup = renderQuizSetup();
    const ready = renderQuizReady();
    expect(getButtonText(setup, 'quiz-setup-primary-cta')).toBe('5問はじめる');
    expect(getButtonText(ready, 'quiz-ready-start')).toBe('この条件で始める');
    expect(stripHtml(`${setup} ${ready}`)).not.toMatch(/本当に開始|最終確認|確認画面|承認して開始/);
  });
});
