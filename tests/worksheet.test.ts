import { describe, expect, it } from 'vitest';

import {
  generateWorksheetQuestions,
  resolveJapaneseTranslationAttempt,
  resolveSpellingAttempt,
} from '../utils/worksheet';

const sourceWords = [
  {
    id: 'w1',
    word: 'stabilize',
    definition: '安定させる',
    bookId: 'level4-book',
    bookTitle: 'レベル4',
    exampleSentence: 'Doctors stabilize the patient before surgery.',
    exampleMeaning: '医師は 手術前に 患者を 安定させる。',
  },
  {
    id: 'w2',
    word: 'triage',
    definition: 'トリアージ',
    bookId: 'level4-book',
    bookTitle: 'レベル4',
    exampleSentence: 'Nurses triage patients in the emergency room.',
    exampleMeaning: '看護師は 救急室で 患者を トリアージする。',
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

  it('requires a full spelling attempt before revealing the prefix hint', () => {
    expect(resolveSpellingAttempt({
      input: 'stabilise',
      answer: 'stabilize',
      hintPrefix: 'st',
      hintVisible: false,
    })).toBe('retry-with-hint');

    expect(resolveSpellingAttempt({
      input: 'abilize',
      answer: 'stabilize',
      hintPrefix: 'st',
      hintVisible: true,
    })).toBe('correct');

    expect(resolveSpellingAttempt({
      input: 'stable',
      answer: 'stabilize',
      hintPrefix: 'st',
      hintVisible: true,
    })).toBe('incorrect');
  });

  it('normalizes punctuation and spaces for Japanese full-translation input', () => {
    expect(resolveJapaneseTranslationAttempt({
      input: '医師は手術前に患者を安定させる',
      answer: '医師は 手術前に 患者を 安定させる。',
    })).toBe('correct');

    expect(resolveJapaneseTranslationAttempt({
      input: '医師は手術前に患者を確認する',
      answer: '医師は 手術前に 患者を 安定させる。',
    })).toBe('incorrect');
  });

  it('generates grammar cloze questions from studied vocabulary examples', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'GRAMMAR_CLOZE', 2);
    const stabilizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(stabilizeQuestion).toMatchObject({
      interactionType: 'CHOICE',
      promptText: 'Doctors ____ the patient before surgery.',
      answer: 'stabilize',
      sourceSentence: 'Doctors stabilize the patient before surgery.',
    });
    expect(stabilizeQuestion?.options).toContain('stabilize');
  });

  it('generates English word-order chip questions', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'EN_WORD_ORDER', 2);
    const triageQuestion = questions.find((question) => question.wordId === 'w2');

    expect(triageQuestion?.interactionType).toBe('ORDERING');
    expect(triageQuestion?.tokens?.map((token) => token.text)).not.toEqual([
      'nurses',
      'triage',
      'patients',
      'in',
      'the',
      'emergency',
      'room',
    ]);
    expect(triageQuestion?.answerTokenIds?.map((id) => triageQuestion.tokens?.find((token) => token.id === id)?.text)).toEqual([
      'nurses',
      'triage',
      'patients',
      'in',
      'the',
      'emergency',
      'room',
    ]);
    expect(triageQuestion?.answer).toBe('nurses triage patients in the emergency room');
    expect(triageQuestion?.tokens?.some((token) => /^[A-Z]/.test(token.text) || /[.!?。]$/.test(token.text))).toBe(false);
  });

  it('generates Japanese translation-order chip questions', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TRANSLATION_ORDER', 2);
    const stabilizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(stabilizeQuestion?.interactionType).toBe('ORDERING');
    expect(stabilizeQuestion?.sourceSentence).toBe('Doctors stabilize the patient before surgery.');
    expect(stabilizeQuestion?.sourceTranslation).toBe('医師は 手術前に 患者を 安定させる');
    expect(stabilizeQuestion?.answerTokenIds?.map((id) => stabilizeQuestion.tokens?.find((token) => token.id === id)?.text)).toEqual([
      '医師は',
      '手術前に',
      '患者を',
      '安定させる',
    ]);
  });

  it('generates Japanese full-translation text input questions', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TRANSLATION_INPUT', 2);
    const stabilizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(stabilizeQuestion).toMatchObject({
      interactionType: 'TEXT_INPUT',
      promptLabel: '和訳全文入力',
      promptText: 'Doctors stabilize the patient before surgery.',
      answer: '医師は 手術前に 患者を 安定させる',
      sourceTranslation: '医師は 手術前に 患者を 安定させる',
    });
  });

  it('resolves Japanese full-translation scopes with the input mode, not ordering mode', () => {
    const questions = generateWorksheetQuestions(sourceWords, 'JA_TRANSLATION_INPUT', 2, {
      grammarScopeId: 'be-verb',
    });
    const stabilizeQuestion = questions.find((question) => question.wordId === 'w1');

    expect(stabilizeQuestion).toMatchObject({
      interactionType: 'TEXT_INPUT',
      promptText: 'The term stabilize is useful today.',
      answer: '安定させる という語は 役に立つ',
      grammarScope: {
        scopeId: 'be-verb',
        labelJa: 'be動詞を使った文',
        source: 'EXPLICIT',
      },
    });
  });
});
