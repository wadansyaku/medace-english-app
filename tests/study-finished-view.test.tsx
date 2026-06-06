import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import StudyFinishedView from '../components/study/StudyFinishedView';
import type { WordData } from '../types';

const noop = () => {};

const reviewPreview: WordData[] = [{
  id: 'w1',
  bookId: 'b1',
  number: 1,
  word: 'care',
  definition: '注意',
}];

const renderFinished = (isMobileViewport: boolean) => renderToStaticMarkup(
  <StudyFinishedView
    isMobileViewport={isMobileViewport}
    leveledUp={false}
    sessionWordCount={5}
    earnedXP={10}
    streakBonusXP={0}
    nextReviewMessage="今夜もう一度見ます。"
    weaknessSummary="意味の確認を続けます。"
    reviewPreview={reviewPreview}
    onStartSpellingCheck={noop}
    onExit={noop}
  />,
);

describe('StudyFinishedView CTA contract', () => {
  it.each([
    ['mobile', true],
    ['desktop', false],
  ])('keeps the same primary and secondary actions on %s', (_label, isMobileViewport) => {
    const html = renderFinished(isMobileViewport);

    expect(html).toContain('data-testid="study-finish-exit"');
    expect(html).toContain('ダッシュボードに戻る');
    expect(html).toContain('スペル5問');
    expect(html).not.toContain('スペルチェックを5問');
  });
});
