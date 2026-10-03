import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import DashboardTaskOverviewRail from '../components/dashboard/DashboardTaskOverviewRail';
import type { StudentDashboardTaskItem } from '../hooks/useStudentDashboardViewModel';

const makeTask = (overrides: Partial<StudentDashboardTaskItem> = {}): StudentDashboardTaskItem => ({
  id: 'today',
  command: { type: 'create_book' },
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
  const noop = () => undefined;
  it('has one entry per resource and leaves the learning command in the hero', () => {
    const rendered = renderToStaticMarkup(<DashboardTaskOverviewRail referenceTasks={['library', 'progress', 'library', 'plan'].map(id => makeTask({ id: id as StudentDashboardTaskItem['id'], group: 'reference' }))} onSelectReferenceTask={noop} />);
    expect(rendered.match(/data-testid="dashboard-task-reference-library"/g)).toHaveLength(1);
    expect(rendered).toContain('dashboard-task-reference-progress');
    expect(rendered).not.toContain('dashboard-task-overview-today');
    expect(rendered).not.toContain('教材を作る');
  });
  it('keeps every optional resource reachable in a closed menu instead of truncating the last resources', () => {
    const ids = ['weakness', 'announcements', 'plan', 'library', 'progress', 'account', 'writing', 'motivation', 'companion'] as const;
    const rendered = renderToStaticMarkup(<DashboardTaskOverviewRail referenceTasks={ids.map(id => makeTask({ id, group: 'reference' }))} onSelectReferenceTask={noop} />);
    for (const id of ids) expect(rendered).toContain(`dashboard-task-reference-${id}`);
    expect(rendered).toContain('<summary');
    expect(rendered).not.toMatch(/<details[^>]* open/);
    expect(rendered.indexOf('dashboard-task-reference-progress')).toBeLessThan(rendered.indexOf('<details'));
  });
  it('identifies the selected resource without creating a second primary action', () => {
    const rendered = renderToStaticMarkup(<DashboardTaskOverviewRail activeSection="library" referenceTasks={[makeTask({ id: 'library', group: 'reference' })]} onSelectReferenceTask={noop} />);
    expect(rendered).toContain('aria-pressed="true"');
    expect(rendered).not.toContain('今日の学習');
  });
});
