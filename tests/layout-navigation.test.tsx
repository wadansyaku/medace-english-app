import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Layout from '../components/Layout';
import { UserRole, type UserProfile } from '../types';

const student: UserProfile = {
  uid: 'student-layout',
  displayName: 'Student Layout',
  role: UserRole.STUDENT,
  email: 'student-layout@example.test',
};

describe('Layout navigation', () => {
  it('shows English practice as the current location instead of highlighting home', () => {
    const rendered = renderToStaticMarkup(
      <Layout
        user={student}
        currentView="englishPractice"
        onLogout={() => undefined}
        onChangeView={() => undefined}
      >
        <main>practice</main>
      </Layout>,
    );

    expect(rendered).toContain('data-testid="layout-nav-home"');
    expect(rendered).toContain('data-testid="layout-nav-english-practice-current"');
    expect(rendered).toContain('aria-current="page"');
    expect(rendered).toContain('英語演習');
  });

  it('keeps the regular home navigation on the dashboard', () => {
    const rendered = renderToStaticMarkup(
      <Layout
        user={student}
        currentView="dashboard"
        onLogout={() => undefined}
        onChangeView={() => undefined}
      >
        <main>dashboard</main>
      </Layout>,
    );

    expect(rendered).toContain('data-testid="layout-nav-home"');
    expect(rendered).not.toContain('data-testid="layout-nav-english-practice-current"');
  });
});
