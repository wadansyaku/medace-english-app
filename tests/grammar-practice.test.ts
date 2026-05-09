import { describe, expect, it } from 'vitest';

import type { WordData } from '../types';
import {
  buildGrammarPracticeItems,
  buildGrammarPracticeItemsForWord,
  hasEnoughGrammarPracticeData,
} from '../utils/grammarPractice';

const createWord = (overrides: Partial<WordData> = {}): WordData => ({
  id: 'word-stabilize',
  bookId: 'book-medical',
  number: 12,
  word: 'stabilize',
  definition: '安定させる',
  exampleSentence: 'Doctors stabilize the patient before surgery.',
  exampleMeaning: '医師は 手術前に 患者を 安定させる。',
  ...overrides,
});

describe('grammar practice helpers', () => {
  it('builds English reorder, Japanese reorder, and grammar cloze items from example data', () => {
    const items = buildGrammarPracticeItemsForWord(createWord(), { seed: 'unit' });

    expect(items.map((item) => item.kind)).toEqual([
      'ENGLISH_WORD_ORDER',
      'JAPANESE_WORD_ORDER',
      'GRAMMAR_CLOZE',
    ]);

    const english = items.find((item) => item.kind === 'ENGLISH_WORD_ORDER');
    expect(english?.source).toBe('example');
    expect(english?.sourceSentence).toBe('Doctors stabilize the patient before surgery.');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toEqual([
      'doctors',
      'stabilize',
      'the',
      'patient',
      'before',
      'surgery',
    ]);
    expect(english?.chips.map((chip) => chip.text)).not.toEqual([
      'doctors',
      'stabilize',
      'the',
      'patient',
      'before',
      'surgery',
    ]);
    expect(english?.chips.some((chip) => /^[A-Z]/.test(chip.text) || /[.!?。]$/.test(chip.text))).toBe(false);

    const japanese = items.find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    expect(japanese?.source).toBe('example');
    expect(japanese?.answerText).toBe('医師は 手術前に 患者を 安定させる');
    expect(japanese?.correctChipIds.map((id) => japanese.chips.find((chip) => chip.id === id)?.text)).toEqual([
      '医師は',
      '手術前に',
      '患者を',
      '安定させる',
    ]);

    const cloze = items.find((item) => item.kind === 'GRAMMAR_CLOZE');
    expect(cloze?.source).toBe('example');
    expect(cloze?.clozeSentence).toBe('Doctors ____ the patient before surgery.');
    expect(cloze?.answer).toBe('stabilize');
    expect(cloze?.grammarFocus).toBe('時を表す副詞句');
    expect(cloze?.options).toContain('stabilize');
  });

  it('falls back to short deterministic practice when examples are missing or unusable', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-monitor',
      word: 'monitor',
      definition: '観察する',
      exampleSentence: 'This sentence does not include the target.',
      exampleMeaning: null,
    }), { seed: 'fallback' });

    const english = items.find((item) => item.kind === 'ENGLISH_WORD_ORDER');
    const japanese = items.find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    const cloze = items.find((item) => item.kind === 'GRAMMAR_CLOZE');

    expect(english?.source).toBe('fallback');
    expect(english?.sourceSentence).toBe('Students learn the term monitor today.');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toEqual([
      'students',
      'learn',
      'the',
      'term',
      'monitor',
      'today',
    ]);

    expect(japanese?.source).toBe('fallback');
    expect(japanese?.answerText).toBe('生徒は 観察する という語を 学ぶ');
    expect(japanese?.chips.length).toBeGreaterThanOrEqual(2);

    expect(cloze?.source).toBe('fallback');
    expect(cloze?.clozeSentence).toBe('Students learn the term ____ today.');
    expect(cloze?.grammarFocus).toBe('主語 + 動詞 + 目的語');
  });

  it('rejects English ordering examples that would produce duplicate visible chips', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-protect',
      word: 'protect',
      definition: '守る',
      exampleSentence: 'Doctors protect the patient before the operation.',
      exampleMeaning: '医師は 患者を 守る。',
    }), { seed: 'duplicate-token' });

    const english = items.find((item) => item.kind === 'ENGLISH_WORD_ORDER');

    expect(english?.source).toBe('fallback');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toEqual([
      'students',
      'learn',
      'the',
      'term',
      'protect',
      'today',
    ]);
  });

  it('uses a sentence that matches the explicitly selected grammar scope', () => {
    const passiveItems = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-monitor',
      word: 'monitor',
      definition: '観察する',
      exampleSentence: null,
      exampleMeaning: null,
    }), { seed: 'scope-passive', requestedScopeId: 'passive-voice' });

    const english = passiveItems.find((item) => item.kind === 'ENGLISH_WORD_ORDER');
    const japanese = passiveItems.find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    const cloze = passiveItems.find((item) => item.kind === 'GRAMMAR_CLOZE');

    expect(english?.grammarScope).toMatchObject({
      scopeId: 'passive-voice',
      source: 'EXPLICIT',
      labelJa: '受け身',
    });
    expect(english?.sourceSentence).toBe('The term monitor is introduced by teachers today.');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toEqual([
      'the',
      'term',
      'monitor',
      'is',
      'introduced',
      'by',
      'teachers',
      'today',
    ]);
    expect(japanese?.answerText).toBe('観察する という語は 先生に 紹介される');
    expect(cloze?.grammarFocus).toBe('受け身');
    expect(cloze?.clozeSentence).toBe('The term ____ is introduced by teachers today.');
  });

  it('keeps chip order deterministic for the same seed', () => {
    const word = createWord({ id: 'word-acute', word: 'acute', definition: '鋭い' });

    const first = buildGrammarPracticeItemsForWord(word, { seed: 'same-seed' });
    const second = buildGrammarPracticeItemsForWord(word, { seed: 'same-seed' });
    const third = buildGrammarPracticeItemsForWord(word, { seed: 'different-seed' });

    expect(first).toEqual(second);
    expect(first.find((item) => item.kind === 'ENGLISH_WORD_ORDER')?.chips)
      .not.toEqual(third.find((item) => item.kind === 'ENGLISH_WORD_ORDER')?.chips);
  });

  it('filters records that cannot produce vocabulary-backed grammar practice', () => {
    const invalidWords = [
      createWord({ id: 'missing-word', word: '', definition: '安定させる' }),
      createWord({ id: 'missing-definition', word: 'stabilize', definition: '' }),
      createWord({ id: 'unsupported-word', word: '安定', definition: '安定させる' }),
    ];

    expect(invalidWords.every((word) => !hasEnoughGrammarPracticeData(word))).toBe(true);
    expect(buildGrammarPracticeItems(invalidWords, { seed: 'invalid' })).toEqual([]);
  });

  it('honors maxItemsPerWord without changing the generated item priority', () => {
    const items = buildGrammarPracticeItemsForWord(createWord(), {
      seed: 'limit',
      maxItemsPerWord: 2,
    });

    expect(items.map((item) => item.kind)).toEqual([
      'ENGLISH_WORD_ORDER',
      'JAPANESE_WORD_ORDER',
    ]);
  });
});
