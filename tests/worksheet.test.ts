import { describe, expect, it } from 'vitest';

import {
  buildDeterministicTranslationFeedback,
  generateWorksheetQuestions,
  resolveJapaneseTranslationAttempt,
  resolveSpellingAttempt,
} from '../utils/worksheet';

const sourceWords = [
  {
    id: 'w1',
    word: 'organize',
    definition: '整理する',
    bookId: 'level4-book',
    bookTitle: 'レベル4',
    exampleSentence: 'Students organize their notes before class.',
    exampleMeaning: '生徒は 授業前に ノートを 整理する。',
  },
  {
    id: 'w2',
    word: 'compare',
    definition: '比較する',
    bookId: 'level4-book',
    bookTitle: 'レベル4',
    exampleSentence: 'Learners compare two answers after class.',
    exampleMeaning: '生徒は 授業後に 2つの答えを 比較する。',
  },
];

describe('generateWorksheetQuestions', () => {
  it('fills JA_TO_EN distractors with plausible rule-based variants instead of placeholders', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TO_EN', 2);
    const organizeQuestion = questions.find((question) => question.answer === 'organize');

    expect(organizeQuestion?.options).toHaveLength(4);
    expect(organizeQuestion?.options?.some((option) => option.includes('その他'))).toBe(false);
    expect(organizeQuestion?.options?.some((option) => option !== 'organize' && option.toLowerCase().startsWith('organ'))).toBe(true);
  });

  it('fills EN_TO_JA distractors with near-looking Japanese options instead of placeholders', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'EN_TO_JA', 2);
    const organizeQuestion = questions.find((question) => question.answer === '整理する');

    expect(organizeQuestion?.options).toHaveLength(4);
    expect(organizeQuestion?.options?.some((option) => option.includes('その他'))).toBe(false);
    expect(organizeQuestion?.options?.some((option) => option !== '整理する' && option.startsWith('整理'))).toBe(true);
  });

  it('requires a full spelling attempt before revealing the prefix hint', () => {
    expect(resolveSpellingAttempt({
      input: 'organise',
      answer: 'organize',
      hintPrefix: 'or',
      hintVisible: false,
    })).toBe('retry-with-hint');

    expect(resolveSpellingAttempt({
      input: 'ganize',
      answer: 'organize',
      hintPrefix: 'or',
      hintVisible: true,
    })).toBe('correct');

    expect(resolveSpellingAttempt({
      input: 'organic',
      answer: 'organize',
      hintPrefix: 'or',
      hintVisible: true,
    })).toBe('incorrect');
  });

  it('normalizes punctuation and spaces for Japanese full-translation input', () => {
    expect(resolveJapaneseTranslationAttempt({
      input: '生徒は授業前にノートを整理する',
      answer: '生徒は 授業前に ノートを 整理する。',
    })).toBe('correct');

    expect(resolveJapaneseTranslationAttempt({
      input: '生徒は授業前にノートを確認する',
      answer: '生徒は 授業前に ノートを 整理する。',
    })).toBe('unassessed');
  });

  it('preserves internal decimal and time punctuation when matching translation meaning', () => {
    for (const [answer, input] of [
      ['水を2.5リットル使いました。', '水を25リットル使いました。'],
      ['7.30時に到着します。', '730時に到着します。'],
    ]) {
      expect(resolveJapaneseTranslationAttempt({ answer, input })).toBe('unassessed');
      expect(buildDeterministicTranslationFeedback({ answer, input })).toBeNull();
    }
    expect(resolveJapaneseTranslationAttempt({ answer: '水を2.5リットル使いました。', input: '水を２．５リットル使いました' })).toBe('correct');
  });

  it('builds deterministic translation feedback when AI is bypassed or unavailable', () => {
    const feedback = buildDeterministicTranslationFeedback({
      input: '生徒は授業前にノートを整理する',
      answer: '生徒は 授業前に ノートを 整理する。',
    });

    expect(feedback).toMatchObject({
      isCorrect: true,
      score: 10,
      maxScore: 10,
      usedAi: false,
    });
  });

  it('does not invent an incorrect score for a wording outside the reviewed reference', () => {
    expect(buildDeterministicTranslationFeedback({ input: '授業が始まる前に生徒がノートを整理する。', answer: '生徒は 授業前に ノートを 整理する。' })).toBeNull();
  });

  it('generates grammar cloze questions from studied vocabulary examples', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'GRAMMAR_CLOZE', 2);
    const organizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(organizeQuestion).toMatchObject({
      interactionType: 'CHOICE',
      promptText: 'Students organize their notes ____ class.',
      answer: 'before',
      sourceSentence: 'Students organize their notes before class.',
    });
    expect(organizeQuestion?.options).toContain('before');
  });

  it('generates English word-order chip questions', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'EN_WORD_ORDER', 2);
    const compareQuestion = questions.find((question) => question.wordId === 'w2');

    expect(compareQuestion?.interactionType).toBe('ORDERING');
    expect(compareQuestion?.tokens?.map((token) => token.text)).not.toEqual([
      'learners',
      'compare',
      'two',
      'answers',
      'after',
      'class',
    ]);
    expect(compareQuestion?.answerTokenIds?.map((id) => compareQuestion.tokens?.find((token) => token.id === id)?.text)).toEqual([
      'learners',
      'compare',
      'two',
      'answers',
      'after',
      'class',
    ]);
    expect(compareQuestion?.answer).toBe('learners compare two answers after class');
    expect(compareQuestion?.tokens?.some((token) => /^[A-Z]/.test(token.text) || /[.!?。]$/.test(token.text))).toBe(false);
  });

  it('generates Japanese translation-order chip questions', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TRANSLATION_ORDER', 2);
    const organizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(organizeQuestion?.interactionType).toBe('ORDERING');
    expect(organizeQuestion?.sourceSentence).toBe('Students organize their notes before class.');
    expect(organizeQuestion?.sourceTranslation).toBe('生徒は 授業前に ノートを 整理する');
    expect(organizeQuestion?.answerTokenIds?.map((id) => organizeQuestion.tokens?.find((token) => token.id === id)?.text)).toEqual([
      '生徒は',
      '授業前に',
      'ノートを',
      '整理する',
    ]);
  });

  it('excludes unverified scoped translations instead of inventing fallback Japanese chips', () => {
    const questions = generateWorksheetQuestions([{ id: 'w-dup', word: 'repeat', definition: '繰り返す', bookId: 'book-1', bookTitle: 'Book', exampleSentence: 'Students repeat the drill after the class.', exampleMeaning: '生徒は 生徒は 授業後に 語を 繰り返す。' }], 'JA_TRANSLATION_ORDER', 1, { grammarScopeId: 'basic-svo' });
    expect(questions).toEqual([]);
  });

  it('generates Japanese full-translation text input questions', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TRANSLATION_INPUT', 2);
    const organizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(organizeQuestion).toMatchObject({
      interactionType: 'TEXT_INPUT',
      promptLabel: '和訳全文入力',
      promptText: 'Students organize their notes before class.',
      answer: '生徒は 授業前に ノートを 整理する',
      sourceTranslation: '生徒は 授業前に ノートを 整理する',
    });
  });

  it('does not pair a generated be-verb sentence with an unrelated example translation', () => {
    expect(generateWorksheetQuestions(sourceWords, 'JA_TRANSLATION_INPUT', 2, { grammarScopeId: 'be-verb' })).toEqual([]);
  });
});
