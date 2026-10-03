import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import EnglishPracticeHub from '../components/practice/EnglishPracticeHub';
import { EnglishLevel, UserGrade, UserRole, type UserProfile } from '../types';

const createUser = (): UserProfile => ({
  uid: 'student-english-practice',
  displayName: '英語 太郎',
  role: UserRole.STUDENT,
  email: 'student@example.test',
  grade: UserGrade.SHS2,
  englishLevel: EnglishLevel.B1,
});

describe('EnglishPracticeHub', () => {
  it('starts undiagnosed learners at introductory practice without claiming a diagnostic result', () => {
    const undiagnosed = { ...createUser(), englishLevel: undefined };
    const rendered = renderToStaticMarkup(<EnglishPracticeHub user={undiagnosed} initialLane="reading" />);
    expect(rendered).toMatch(/data-testid="english-practice-difficulty"[^>]*>A1 入門</);
    expect(rendered).toContain('未診断のため入門から始めます。');
    expect(rendered).toContain('練習の難しさで、診断結果ではありません');
    expect(rendered).toContain('あとから変更できます');
    expect(rendered).not.toContain('・挑戦');
    expect(undiagnosed.englishLevel).toBeUndefined();
  });

  it('renders the canonical integrated practice shell without a separate practice home', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        onBack={() => undefined}
      />,
    );

    [
      '英語演習',
      '参考書型の文法演習',
      '文法演習',
      '和訳',
      '長文',
      '英作文',
      '文法範囲を選ぶ',
      'B1 標準',
      '文法問題で練習',
    ].forEach((copy) => {
      expect(rendered).toContain(copy);
    });

    [
      '>76%<',
      '>58%<',
      '>40%<',
      '>61%<',
      '>28分<',
      '>3時間 25分<',
      '>45語<',
      '>18セット<',
    ].forEach((fakeMetric) => {
      expect(rendered).not.toContain(fakeMetric);
    });

    expect(rendered).not.toContain('今日の英語演習');
    expect(rendered).not.toContain('英語演習のおすすめ');
    expect(rendered).not.toContain('<main');
    expect(rendered).toContain('aria-label="英語演習"');
    expect(rendered).toMatch(/data-testid="english-practice-difficulty"[^>]*>B1 標準</);
    expect(rendered).not.toContain('english-practice-undiagnosed-note');
  });

  it('keeps the stable lane test ids and orange brand classes on the route shell', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        onBack={() => undefined}
      />,
    );

    [
      'english-practice-lane-grammar',
      'english-practice-lane-translation',
      'english-practice-lane-reading',
      'english-practice-lane-writing',
    ].forEach((testId) => {
      expect(rendered).toContain(`data-testid="${testId}"`);
    });

    expect(rendered).not.toContain('data-testid="english-practice-lane-overview"');
    expect(rendered).toMatch(/data-testid="english-practice-lane-grammar"[^>]*aria-pressed="true"/);

    [
      'border-medace-100',
      'bg-medace-50',
      'text-medace-700',
      'bg-medace-600',
    ].forEach((className) => {
      expect(rendered).toContain(className);
    });
  });

  it('can render as an embedded dashboard section without the standalone shell copy', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        variant="embedded"
      />,
    );

    expect(rendered).toContain('英語演習');
    expect(rendered).toContain('英作文');
    expect(rendered).not.toContain('別ページへ移動せず');
    expect(rendered).toContain('english-practice-hub');
    expect(rendered).not.toContain('Steady Study');
    expect(rendered).not.toContain('今日の英語演習');
  });

  it('can render as a focused dashboard drill without another practice home', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        variant="embedded"
        embeddedMode="drill"
        initialLane="grammar"
        closeLabel="ホームに戻る"
        onClose={() => undefined}
      />,
    );

    expect(rendered).toContain('英語演習');
    expect(rendered).toContain('参考書型の文法演習');
    expect(rendered).toContain('ホームに戻る');
    expect(rendered).toContain('english-practice-lane-grammar');
    expect(rendered).not.toContain('ホーム統合');
    expect(rendered).not.toContain('英語演習のおすすめ');
    expect(rendered).not.toContain('english-practice-lane-overview');
  });

  it('renders the writing lane with Eiken task controls and a draft area', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        initialLane="writing"
        onBack={() => undefined}
      />,
    );

    expect(rendered).toContain('english-practice-lane-writing-panel');
    expect(rendered).toContain('英検ライティング');
    expect(rendered).toContain('意見論述');
    expect(rendered).toContain('eiken-writing-draft');
    expect(rendered).toContain('eiken-writing-word-count');
    expect(rendered).toContain('aria-label="英検ライティング答案"');
    expect(rendered).toContain('role="progressbar"');
  });
});
