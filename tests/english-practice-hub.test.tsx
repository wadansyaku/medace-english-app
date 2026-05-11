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
  it('renders the generated-image style overview contract for the Japanese orange practice home', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        onBack={() => undefined}
        onStartVocabulary={() => undefined}
      />,
    );

    [
      '今日のおすすめ',
      '単語',
      '文法演習',
      '和訳トレーニング',
      '長文読解',
      '範囲を選ぶ',
      '長文読解のプレビュー',
      'この長文に挑戦',
      '受験レベルに合わせる',
      'B1 標準',
      '未演習',
      '準備中',
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
  });

  it('keeps the stable lane test ids and orange brand classes on the overview', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        onBack={() => undefined}
        onStartVocabulary={() => undefined}
      />,
    );

    [
      'english-practice-lane-overview',
      'english-practice-lane-grammar',
      'english-practice-lane-translation',
      'english-practice-lane-reading',
    ].forEach((testId) => {
      expect(rendered).toContain(`data-testid="${testId}"`);
    });

    [
      'border-orange-100',
      'bg-orange-50',
      'text-medace-700',
      'bg-medace-600',
    ].forEach((className) => {
      expect(rendered).toContain(className);
    });
  });
});
