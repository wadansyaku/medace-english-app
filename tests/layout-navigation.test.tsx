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

  it.each(['study', 'quiz', 'guestLearning', 'guestTrial'])('keeps home and logout available without duplicate navigation or footer during %s', currentView => {
    const rendered = renderToStaticMarkup(<Layout user={student} currentView={currentView}
      onLogout={() => undefined} onChangeView={() => undefined}>question</Layout>);
    expect(rendered).toContain('ホームへ戻る');
    expect(rendered).toContain('aria-label="ログアウト"');
    expect(rendered).not.toContain('data-testid="layout-nav-home"');
    expect(rendered).not.toContain('<footer');
    expect(rendered).toContain('question');
  });

  it.each(['login', 'study', 'quiz', 'instructor', 'dashboard'])('offers one small header question entry without altering the content during %s', currentView => {
    const rendered = renderToStaticMarkup(<Layout user={currentView === 'login' ? null : student} currentView={currentView}
      onOpenProductSupport={() => undefined} onLogout={() => undefined} onChangeView={() => undefined}>four rating controls or login inputs</Layout>);
    expect(rendered.match(/data-product-support-trigger/g)).toHaveLength(1);
    expect(rendered).toContain('aria-label="使い方について質問する"'); expect(rendered).toContain('min-h-11 min-w-11 shrink-0');
    expect(rendered).toContain('four rating controls or login inputs');
    expect(rendered).not.toContain('公開案内の会話');
    if (currentView === 'login') { expect(rendered).not.toContain('/teacher'); expect(rendered).not.toContain('/school-admin'); }
    if (currentView === 'study' || currentView === 'quiz') expect(rendered).not.toContain('<footer');
  });

  it('keeps the immersive password reset free of header actions', () => {
    const rendered = renderToStaticMarkup(<Layout user={null} currentView="resetPassword" immersiveContent
      onOpenProductSupport={() => undefined} onLogout={() => undefined} onChangeView={() => undefined}>reset inputs</Layout>);
    expect(rendered).not.toContain('data-product-support-trigger'); expect(rendered).toContain('reset inputs');
  });
});
