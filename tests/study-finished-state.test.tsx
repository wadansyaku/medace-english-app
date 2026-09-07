import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StudyFinishedView from '../components/study/StudyFinishedView';

describe('study completion evidence', () => {
  it.each([false, true])('does not turn an unconfirmed reward into zero or an earned award (mobile: %s)', (isMobileViewport) => {
    const rendered = renderToStaticMarkup(<StudyFinishedView
      isMobileViewport={isMobileViewport}
      leveledUp={false}
      sessionWordCount={2}
      earnedXP={null}
      streakBonusXP={null}
      rewardNotice="学習は保存済みです。XPの反映は確認できませんでした。"
      nextReviewMessage="明日も復習しましょう。"
      weaknessSummary="取得できませんでした。"
      reviewPreview={[]}
      onStartSpellingCheck={() => undefined}
      onExit={() => undefined}
    />);
    expect(rendered).toContain('study-reward-unconfirmed');
    expect(rendered).toContain('学習は保存済み');
    expect(rendered).not.toMatch(/\+\d+ XP/);
    expect(rendered).toContain('study-finish-exit');
  });
});
