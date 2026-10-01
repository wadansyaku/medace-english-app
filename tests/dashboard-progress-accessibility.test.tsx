import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BookCard from '../components/dashboard/BookCard';
import DashboardProgressSection from '../components/dashboard/DashboardProgressSection';
import { BookCatalogSource } from '../types';
import { getRelativeDateKey, getTodayDateKey } from '../utils/date';

describe('learner progress display', () => {
  it('does not present missing book progress as a confirmed zero', () => {
    const rendered = renderToStaticMarkup(<BookCard book={{ id: 'fixture-book', title: '検証用単語帳', wordCount: 30, isPriority: false, catalogSource: BookCatalogSource.USER_GENERATED }} onDelete={() => undefined} onSelect={() => undefined} />);
    expect(rendered).toContain('進捗未確認');
    expect(rendered).not.toContain('0% 学習済み');
    expect(rendered).toContain('小テスト');
  });

  it('totals only the displayed seven days and exposes daily counts to assistive technology', () => {
    const rendered = renderToStaticMarkup(<DashboardProgressSection open activityLogs={[{ date: getTodayDateKey(), count: 7, intensity: 1 }, { date: getRelativeDateKey(-6), count: 3, intensity: 1 }, { date: getRelativeDateKey(-8), count: 100, intensity: 4 }]} masteryDist={null} isGameMode={false} leaderboard={[]} todayCount={7} todayWordGoal={20} todayProgressPercent={35} weekTotal={10} weeklyGoal={100} weeklyRemaining={90} currentStreak={1} onToggle={() => undefined} />);
    expect(rendered).toContain('7日間合計: 10 語');
    expect(rendered).not.toContain('7日間合計: 110 語');
    expect(rendered).toContain('aria-label="7日間の学習記録。');
    expect(rendered).toContain(getTodayDateKey() + '、7語');
    expect(rendered).toContain('aria-expanded="true"');
  });
});
