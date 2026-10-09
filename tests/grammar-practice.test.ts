import { describe, expect, it } from 'vitest';

import { GRAMMAR_CURRICULUM_SCOPES } from '../config/grammarCurriculum';
import { EnglishLevel, type WordData } from '../types';
import {
  buildGrammarPracticeItems,
  buildGrammarPracticeItemsForWord,
  hasEnoughGrammarPracticeData,
} from '../utils/grammarPractice';

const createWord = (overrides: Partial<WordData> = {}): WordData => ({
  id: 'word-organize',
  bookId: 'book-core',
  number: 12,
  word: 'organize',
  definition: '整理する',
  exampleSentence: 'Students organize their notes before class.',
  exampleMeaning: '生徒は 授業前に ノートを 整理する。',
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
    expect(english?.sourceSentence).toBe('Students organize their notes before class.');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toEqual([
      'students',
      'organize',
      'their',
      'notes',
      'before',
      'class',
    ]);
    expect(english?.chips.map((chip) => chip.text)).not.toEqual([
      'students',
      'organize',
      'their',
      'notes',
      'before',
      'class',
    ]);
    expect(english?.chips.some((chip) => /^[A-Z]/.test(chip.text) || /[.!?。]$/.test(chip.text))).toBe(false);

    const japanese = items.find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    expect(japanese?.source).toBe('example');
    expect(japanese?.answerText).toBe('生徒は 授業前に ノートを 整理する');
    expect(japanese?.correctChipIds.map((id) => japanese.chips.find((chip) => chip.id === id)?.text)).toEqual([
      '生徒は',
      '授業前に',
      'ノートを',
      '整理する',
    ]);

    const cloze = items.find((item) => item.kind === 'GRAMMAR_CLOZE');
    expect(cloze?.source).toBe('example');
    expect(cloze?.clozeSentence).toBe('Students organize their notes ____ class.');
    expect(cloze?.answer).toBe('before');
    expect(cloze?.grammarFocus).toBe('時を表す副詞句');
    expect(cloze?.options).toContain('before');
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
    expect(english?.sourceSentence).toContain('monitor');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toContain('monitor');

    expect(japanese).toBeUndefined();

    expect(cloze?.source).toBe('fallback');
    expect(cloze?.clozeSentence).toContain('____');
    expect(cloze?.grammarFocus).toBe('主語 + 動詞 + 目的語');
  });

  it('varies fallback grammar sentences by seed while keeping the target word', () => {
    const word = createWord({
      id: 'word-monitor',
      word: 'monitor',
      definition: '観察する',
      exampleSentence: null,
      exampleMeaning: null,
    });
    const generatedSentences = new Set(
      Array.from({ length: 8 }, (_, index) => buildGrammarPracticeItemsForWord(word, { seed: `variation-${index}` })
        .find((item) => item.kind === 'ENGLISH_WORD_ORDER')?.sourceSentence),
    );

    expect(generatedSentences.size).toBeGreaterThan(1);
    expect([...generatedSentences].every((sentence) => sentence?.includes('monitor'))).toBe(true);
  });

  it('does not wrap studied items as words or terms in fallback grammar sentences', () => {
    const sampleWords = [
      createWord({
        id: 'word-monitor',
        word: 'monitor',
        definition: '観察する',
        exampleSentence: null,
        exampleMeaning: null,
      }),
      createWord({
        id: 'word-acute',
        word: 'acute',
        definition: '鋭い',
        exampleSentence: null,
        exampleMeaning: null,
      }),
      createWord({
        id: 'word-protocol',
        word: 'protocol',
        definition: '手順',
        exampleSentence: null,
        exampleMeaning: null,
      }),
    ];

    sampleWords.forEach((word) => {
      GRAMMAR_CURRICULUM_SCOPES.forEach((scope) => {
        const items = buildGrammarPracticeItemsForWord(word, {
          seed: `no-meta-${word.id}-${scope.id}`,
          requestedScopeId: scope.id,
          userLevel: EnglishLevel.C1,
        });

        items.forEach((item) => {
          if ('sourceSentence' in item) {
            expect(item.sourceSentence).not.toMatch(/\b(?:word|term)\b/i);
          }
          if (item.kind === 'GRAMMAR_CLOZE') {
            expect(item.clozeSentence).not.toMatch(/\b(?:word|term)\b/i);
          }
        });
      });
    });
  });

  it('uses lower-level sentence templates when the learner level is lower than the scope range', () => {
    const lowLevelItems = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-monitor',
      word: 'monitor',
      definition: '観察する',
      exampleSentence: null,
      exampleMeaning: null,
    }), {
      seed: 'verb-pattern-low-level',
      requestedScopeId: 'verb-patterns',
      userLevel: EnglishLevel.A2,
    });

    const english = lowLevelItems.find((item) => item.kind === 'ENGLISH_WORD_ORDER');

    expect(english?.sourceSentence).toBe('Teachers ask learners to monitor the material.');
    expect(english?.sourceSentence).not.toMatch(/\b(?:word|term)\s+monitor\b/i);
    expect(english?.grammarScope).toMatchObject({
      scopeId: 'verb-patterns',
      curriculumCategoryLabelJa: '動詞語法',
    });
  });

  it('rejects English ordering examples that would produce duplicate visible chips', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-protect',
      word: 'protect',
      definition: '守る',
      exampleSentence: 'Students protect the project before the presentation.',
      exampleMeaning: '生徒は 発表前に プロジェクトを 守る。',
    }), { seed: 'duplicate-token' });

    const english = items.find((item) => item.kind === 'ENGLISH_WORD_ORDER');

    expect(english?.source).toBe('fallback');
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toContain('protect');
  });

  it('uses a sentence that matches the explicitly selected grammar scope', () => {
    const passiveItems = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-monitor',
      word: 'monitor',
      definition: '観察する',
      exampleSentence: null,
      exampleMeaning: null,
    }), { seed: 'scope-passive', requestedScopeId: 'passive-voice', userLevel: EnglishLevel.A2 });

    const english = passiveItems.find((item) => item.kind === 'ENGLISH_WORD_ORDER');
    const japanese = passiveItems.find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    const cloze = passiveItems.find((item) => item.kind === 'GRAMMAR_CLOZE');

    expect(english?.grammarScope).toMatchObject({
      scopeId: 'passive-voice',
      source: 'EXPLICIT',
      labelJa: '受け身',
    });
    expect(english?.sourceSentence).toBe('The material is monitored by teachers today.');
    expect(english?.sourceSentence).not.toMatch(/\b(?:word|term)\s+monitor\b/i);
    expect(english?.correctChipIds.map((id) => english.chips.find((chip) => chip.id === id)?.text)).toEqual([
      'the',
      'material',
      'is',
      'monitored',
      'by',
      'teachers',
      'today',
    ]);
    expect(japanese).toBeUndefined();
    expect(cloze?.grammarFocus).toBe('受け身');
    expect(cloze?.clozeSentence).toBe('The material ____ by teachers today.');
    expect(cloze?.answer).toBe('is monitored');
  });

  it.each([
    { word: 'monitor', definition: '観察する', passive: '観察される' },
    { word: 'write', definition: '書く', passive: '書かれる' },
    { word: 'protect', definition: '守る', passive: '守られる' },
  ])('does not treat an inferred passive template as a Japanese answer for $word', ({ word, definition }) => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      id: `word-${word}`,
      word,
      definition,
      exampleSentence: null,
      exampleMeaning: null,
    }), {
      seed: `japanese-passive-${word}`,
      requestedScopeId: 'passive-voice',
      userLevel: EnglishLevel.A2,
    });
    const japanese = items.find((item) => item.kind === 'JAPANESE_WORD_ORDER');

    expect(japanese).toBeUndefined();
  });

  it('does not infer a Japanese answer for a past fallback sentence', () => {
    const pastVariant = Array.from({ length: 40 }, (_, index) => (
      buildGrammarPracticeItemsForWord(createWord({
        id: 'word-monitor-past-passive',
        word: 'monitor',
        definition: '観察する',
        exampleSentence: null,
        exampleMeaning: null,
      }), {
        seed: `japanese-passive-past-${index}`,
        requestedScopeId: 'passive-voice',
        userLevel: EnglishLevel.B1,
      })
    )).find((items) => items.some((item) => (
      item.kind === 'ENGLISH_WORD_ORDER' && item.sourceSentence.includes('yesterday')
    )));

    expect(pastVariant).toBeDefined();
    expect(pastVariant?.find((item) => item.kind === 'JAPANESE_WORD_ORDER')).toBeUndefined();
  });

  it('does not invent a Japanese passive form for a non-passivizable definition', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-understand',
      word: 'understand',
      definition: '理解できる',
      exampleSentence: null,
      exampleMeaning: null,
    }), {
      seed: 'japanese-passive-unsupported',
      requestedScopeId: 'passive-voice',
      userLevel: EnglishLevel.A2,
    });

    expect(items.some((item) => item.kind === 'JAPANESE_WORD_ORDER')).toBe(false);
  });

  it('does not create Japanese order items for an explicit scope that does not support ordering', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-monitor',
      word: 'monitor',
      definition: '観察する',
      exampleSentence: null,
      exampleMeaning: null,
    }), { seed: 'scope-to-infinitive', requestedScopeId: 'to-infinitive', userLevel: EnglishLevel.A2 });

    expect(items.map((item) => item.kind)).toEqual([
      'ENGLISH_WORD_ORDER',
      'GRAMMAR_CLOZE',
    ]);
    expect(items.every((item) => item.grammarScope.scopeId === 'to-infinitive')).toBe(true);
  });

  it('requires an actual translated example for Japanese full-translation input', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      id: 'word-monitor',
      word: 'monitor',
      definition: '観察する',
      exampleSentence: null,
      exampleMeaning: null,
    }), {
      seed: 'scope-to-infinitive-input',
      requestedScopeId: 'to-infinitive',
      japaneseQuestionMode: 'JA_TRANSLATION_INPUT',
      userLevel: EnglishLevel.A2,
    });

    const japanese = items.find((item) => item.kind === 'JAPANESE_WORD_ORDER');

    expect(japanese).toBeUndefined();
  });

  it('does not turn a missing example translation into a vocabulary definition answer', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({ exampleMeaning: null }), { seed: 0 });

    expect(items.find((item) => item.kind === 'ENGLISH_WORD_ORDER')?.source).toBe('example');
    expect(items.some((item) => item.kind === 'JAPANESE_WORD_ORDER')).toBe(false);
  });

  it('does not pair an example translation with a generated sentence for a requested scope', () => {
    const items = buildGrammarPracticeItemsForWord(createWord(), {
      requestedScopeId: 'passive-voice', userLevel: EnglishLevel.A2, seed: 0,
    });

    expect(items.find((item) => item.kind === 'ENGLISH_WORD_ORDER')?.source).toBe('fallback');
    expect(items.some((item) => item.kind === 'JAPANESE_WORD_ORDER')).toBe(false);
  });

  it('does not pair a first English sentence with a translation of multiple sentences', () => {
    const items = buildGrammarPracticeItemsForWord(createWord({
      exampleSentence: 'Students organize their notes before class. They read them later.',
      exampleMeaning: '生徒は 授業前に ノートを 整理し、後で 読む。',
    }));

    expect(items.some((item) => item.kind === 'JAPANESE_WORD_ORDER')).toBe(false);
  });

  it.each([
    '生徒は 今日 授業前に 教室で 先生と 一緒に 自分の ノートを 丁寧に 整理する。',
    '生徒は 授業前に 自分が昨日書いた大切なノートを 丁寧に整理するための手順を 確認して 最後まで 整理する。',
    '生徒は 授業前に 「授業・復習用」の ノートを 整理する。',
    '生徒は ノートを 整理するが、今日も 作業は 終わらない。',
  ])('keeps the entire translation in the correct chip order: %s', (exampleMeaning) => {
    const japanese = buildGrammarPracticeItemsForWord(createWord({ exampleMeaning }), { seed: 'full-answer' })
      .find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    expect(japanese).toBeDefined();
    if (!japanese || japanese.kind !== 'JAPANESE_WORD_ORDER') return;
    const reconstructed = japanese.correctChipIds.map((id) => japanese.chips.find((chip) => chip.id === id)?.text).join('');

    expect(japanese.chips.length).toBeLessThanOrEqual(7);
    expect(reconstructed.replace(/\s+/g, '')).toBe(japanese.answerText.replace(/\s+/g, ''));
    expect(reconstructed).toContain(japanese.answerText.replace(/\s+/g, '').slice(-4));
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
      createWord({ id: 'missing-definition', word: 'organize', definition: '' }),
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
