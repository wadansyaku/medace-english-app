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
      'Doctors',
      'stabilize',
      'the',
      'patient',
      'before',
      'surgery.',
    ]);
    expect(english?.chips.map((chip) => chip.text)).not.toEqual([
      'Doctors',
      'stabilize',
      'the',
      'patient',
      'before',
      'surgery.',
    ]);

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
    expect(english?.sourceSentence).toBe('I reviewed the word monitor after class.');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toEqual([
      'I',
      'reviewed',
      'the',
      'word',
      'monitor',
      'after',
      'class.',
    ]);

    expect(japanese?.source).toBe('fallback');
    expect(japanese?.answerText).toBe('「monitor」は観察するという意味です。');
    expect(japanese?.chips.length).toBeGreaterThanOrEqual(2);

    expect(cloze?.source).toBe('fallback');
    expect(cloze?.clozeSentence).toBe('I reviewed the word ____ after class.');
    expect(cloze?.grammarFocus).toBe('時を表す副詞句');
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
