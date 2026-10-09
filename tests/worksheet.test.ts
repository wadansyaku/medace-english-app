import { describe, expect, it } from 'vitest';

import {
  buildDeterministicTranslationFeedback,
  canGenerateWorksheetQuestionForWord,
  filterWorksheetQuestionCandidates,
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


describe('Japanese worksheet eligibility matches real generated examples', () => {
  const cases = [
    ['valid', {}, true],
    ['missing-example', { exampleSentence: null }, false],
    ['missing-meaning', { exampleMeaning: null }, false],
    ['target-absent', { exampleSentence: 'Students clean their notes before class.' }, false],
    ['multiple-sentences', { exampleSentence: 'Students organize their notes before class. They read them later.' }, false],
    ['untokenizable-meaning', { exampleMeaning: '整理' }, false],
    ['duplicate-Japanese-chips', { exampleMeaning: 'ノート ノート' }, false],
    ['duplicate-English-chips', { exampleSentence: 'Students organize the notes before the class.' }, false],
    ['missing-definition', { definition: '' }, false],
  ] as const;
  it.each(['JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'] as const)('%s counts exactly the examples it generates', mode => {
    const words = cases.map(([id, overrides]) => ({ ...sourceWords[0], id, ...overrides }));
    cases.forEach(([, , eligible], index) => {
      expect(canGenerateWorksheetQuestionForWord(words[index], mode)).toBe(eligible);
      expect(generateWorksheetQuestions([words[index]], mode, 1)).toHaveLength(eligible ? 1 : 0);
    });
    const candidates = filterWorksheetQuestionCandidates(words, mode);
    expect(candidates.map(word => word.id)).toEqual(['valid']);
    for (const count of [1, 3, words.length]) {
      const generated = generateWorksheetQuestions(words, mode, count);
      expect(generated).toHaveLength(Math.min(count, candidates.length));
      expect(generated.map(question => question.wordId)).toEqual(['valid']);
    }
  });
  it.each(['EN_TO_JA', 'JA_TO_EN', 'SPELLING_HINT', 'EN_WORD_ORDER', 'GRAMMAR_CLOZE'] as const)(
    'preserves %s availability when bilingual examples are missing', mode => {
      const word = { ...sourceWords[0], exampleSentence: null, exampleMeaning: null };
      expect(canGenerateWorksheetQuestionForWord(word, mode)).toBe(true);
      expect(generateWorksheetQuestions([word], mode, 1)).toHaveLength(1);
    },
  );
});
