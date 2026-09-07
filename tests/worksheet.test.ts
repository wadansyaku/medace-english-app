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
    })).toBe('incorrect');
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

  it('falls back instead of generating Japanese order questions with duplicate visible chips', () => {
    const questions = generateWorksheetQuestions([
      {
        id: 'w-dup',
        word: 'repeat',
        definition: '繰り返す',
        bookId: 'book-1',
        bookTitle: 'Book',
        exampleSentence: 'Students repeat the drill after the class.',
        exampleMeaning: '生徒は 生徒は 授業後に 語を 繰り返す。',
      },
    ], 'JA_TRANSLATION_ORDER', 1, {
      grammarScopeId: 'basic-svo',
    });

    expect(questions[0]?.answer).toContain('繰り返す');
    expect(questions[0]?.answer).not.toContain('という語');
    expect(questions[0]?.tokens?.map((token) => token.text)).not.toContain('生徒は 生徒は');
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

  it('resolves Japanese full-translation scopes with the input mode, not ordering mode', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TRANSLATION_INPUT', 2, {
      grammarScopeId: 'be-verb',
    });
    const organizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(organizeQuestion).toMatchObject({
      interactionType: 'TEXT_INPUT',
      grammarScope: {
        scopeId: 'be-verb',
        labelJa: 'be動詞を使った文',
        source: 'EXPLICIT',
      },
    });
    expect(organizeQuestion?.promptText).toMatch(/\b(?:is|are|was|were)\b/i);
    expect(organizeQuestion?.promptText).toMatch(/\borganize(?:s|d|ing)?\b/i);
    expect(organizeQuestion?.answer).toContain('整理する');
    expect(organizeQuestion?.answer).not.toMatch(/整理する\s+を/);
  });
});
