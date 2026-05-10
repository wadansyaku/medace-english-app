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
  it('renders an independent orange Japanese practice hub outside the vocabulary test flow', () => {
    const rendered = renderToStaticMarkup(
      <EnglishPracticeHub
        user={createUser()}
        onBack={() => undefined}
        onStartVocabulary={() => undefined}
      />,
    );

    expect(rendered).toContain('単語テストから独立した英語演習');
    expect(rendered).toContain('文法');
    expect(rendered).toContain('和訳');
    expect(rendered).toContain('長文');
    expect(rendered).toContain('B1 標準');
    expect(rendered).toContain('bg-medace-600');
    expect(rendered).toContain('english-practice-lane-grammar');
  });
});
