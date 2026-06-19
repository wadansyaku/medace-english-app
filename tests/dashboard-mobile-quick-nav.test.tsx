import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import DashboardMobileQuickNav from '../components/dashboard/DashboardMobileQuickNav';

describe('DashboardMobileQuickNav', () => {
  it('keeps the primary launcher first, active, and limited to three actions', () => {
    const rendered = renderToStaticMarkup(
      <DashboardMobileQuickNav
        items={[
          {
            id: 'mission',
            label: 'ミッション',
            kind: 'mission',
            active: true,
            onClick: () => undefined,
          },
          {
            id: 'coach',
            label: '講師',
            kind: 'coach',
            active: false,
            onClick: () => undefined,
          },
          {
            id: 'library',
            label: '教材',
            kind: 'library',
            active: false,
            onClick: () => undefined,
          },
          {
            id: 'today',
            label: '今日',
            kind: 'today',
            active: false,
            onClick: () => undefined,
          },
        ]}
      />,
    );

    expect(rendered.match(/data-testid="dashboard-quicknav-/g)).toHaveLength(3);
    expect(rendered).toContain('data-testid="dashboard-quicknav-mission"');
    expect(rendered).toContain('aria-pressed="true"');
    expect(rendered.indexOf('dashboard-quicknav-mission')).toBeLessThan(rendered.indexOf('dashboard-quicknav-coach'));
    expect(rendered).not.toContain('dashboard-quicknav-today');
  });
});
