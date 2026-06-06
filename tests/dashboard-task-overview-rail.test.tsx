import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import DashboardTaskOverviewRail from '../components/dashboard/DashboardTaskOverviewRail';
import type { StudentDashboardTaskItem } from '../hooks/useStudentDashboardViewModel';

const makeTask = (overrides: Partial<StudentDashboardTaskItem> = {}): StudentDashboardTaskItem => ({
  id: 'today',
  routeId: 'today',
  title: '今日の学習',
  body: 'My単語帳を1冊作ると、学習を始められます。',
  ctaLabel: '教材を作る',
  metricLabel: '教材未作成',
  stateLabel: '準備',
  tone: 'primary',
  group: 'primary',
  isPrimary: true,
  mobileLabel: '始める',
  ...overrides,
});

describe('DashboardTaskOverviewRail', () => {
  it('can keep the first setup action in the hero only', () => {
    const rendered = renderToStaticMarkup(
      <DashboardTaskOverviewRail
        primaryTask={makeTask()}
        urgentTasks={[]}
        supportingTasks={[]}
        referenceTasks={[
          makeTask({
            id: 'library',
            routeId: undefined,
            title: '教材',
            body: '教材と記録を確認します。',
            ctaLabel: '教材を見る',
            metricLabel: '0冊',
            stateLabel: '確認',
            tone: 'reference',
            group: 'reference',
            isPrimary: false,
            mobileLabel: '教材',
          }),
        ]}
        showPrimaryAction={false}
        onSelectTask={() => undefined}
        onSelectReferenceTask={() => undefined}
        onStartPrimary={() => undefined}
      />,
    );

    expect(rendered).toContain('教材・記録');
    expect(rendered).toContain('教材');
    expect(rendered).not.toContain('今日の学習');
    expect(rendered).not.toContain('data-testid="dashboard-task-overview-today"');
    expect(rendered).toContain('data-testid="dashboard-task-reference-library"');
  });

  it('can keep any primary action out of the rail while showing supporting actions', () => {
    const rendered = renderToStaticMarkup(
      <DashboardTaskOverviewRail
        primaryTask={makeTask({
          id: 'coach',
          routeId: undefined,
          title: '講師メッセージ',
          ctaLabel: '復習を10語始める',
          metricLabel: 'Coach',
          stateLabel: 'フォロー',
          tone: 'coach',
          mobileLabel: '講師',
        })}
        urgentTasks={[]}
        supportingTasks={[
          makeTask({
            id: 'englishPractice',
            routeId: 'englishPractice',
            title: '文法演習',
            ctaLabel: '文法を5問',
            metricLabel: '5問',
            stateLabel: '文法',
            tone: 'practice',
            group: 'supporting',
            isPrimary: false,
            mobileLabel: '演習',
          }),
        ]}
        referenceTasks={[]}
        showPrimaryAction={false}
        onSelectTask={() => undefined}
        onSelectReferenceTask={() => undefined}
        onStartPrimary={() => undefined}
      />,
    );

    expect(rendered).toContain('文法演習');
    expect(rendered).toContain('data-testid="dashboard-task-overview-englishPractice"');
    expect(rendered).not.toContain('講師メッセージ');
    expect(rendered).not.toContain('data-testid="dashboard-task-overview-coach"');
  });
});
