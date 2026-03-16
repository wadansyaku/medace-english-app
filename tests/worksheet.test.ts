import { describe, expect, it } from 'vitest';

import { generateWorksheetQuestions } from '../utils/worksheet';

const sourceWords = [
  {
    id: 'w1',
    word: 'stabilize',
    definition: '安定させる',
    bookId: 'level4-book',
    bookTitle: 'レベル4',
  },
  {
    id: 'w2',
    word: 'triage',
    definition: 'トリアージ',
    bookId: 'level4-book',
    bookTitle: 'レベル4',
  },
];

describe('generateWorksheetQuestions', () => {
  it('fills JA_TO_EN distractors with plausible rule-based variants instead of placeholders', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TO_EN', 2);
    const stabilizeQuestion = questions.find((question) => question.answer === 'stabilize');

    expect(stabilizeQuestion?.options).toHaveLength(4);
    expect(stabilizeQuestion?.options?.some((option) => option.includes('その他'))).toBe(false);
    expect(stabilizeQuestion?.options?.some((option) => option !== 'stabilize' && option.toLowerCase().startsWith('stabil'))).toBe(true);
  });

  it('fills EN_TO_JA distractors with near-looking Japanese options instead of placeholders', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'EN_TO_JA', 2);
    const stabilizeQuestion = questions.find((question) => question.answer === '安定させる');

    expect(stabilizeQuestion?.options).toHaveLength(4);
    expect(stabilizeQuestion?.options?.some((option) => option.includes('その他'))).toBe(false);
    expect(stabilizeQuestion?.options?.some((option) => option !== '安定させる' && option.startsWith('安定'))).toBe(true);
  });
});
