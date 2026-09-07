import { describe, expect, it } from 'vitest';

import { EnglishLevel, type GrammarCurriculumScopeId, type WordData } from '../types';
import { buildGrammarPracticeItemsForWord } from '../utils/grammarPractice';

const monitorWord: WordData = {
  id: 'word-monitor',
  bookId: 'book-core',
  number: 1,
  word: 'monitor',
  definition: '観察する',
  exampleSentence: null,
  exampleMeaning: null,
};

const normalizeEnglishTokens = (sentence: string): string[] => (
  sentence
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').toLowerCase())
    .filter(Boolean)
);

const toOrderedText = (
  item: Extract<ReturnType<typeof buildGrammarPracticeItemsForWord>[number], { kind: 'ENGLISH_WORD_ORDER' | 'JAPANESE_WORD_ORDER' }>,
): string[] => item.correctChipIds.map((id) => item.chips.find((chip) => chip.id === id)?.text || '');

const forbiddenFallbackContent = /\b(?:doctor|nurse|patient|surgery|medicine|hospital)\b/i;
const malformedVerbPhrase = /\b(?:check|review|discuss)\s+monitoring\s+the\s+process\b/i;

describe('grammar practice natural-language contracts', () => {
  it.each([
    {
      label: 'be verb',
      scopeId: 'be-verb' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A2,
      scopePattern: /\b(?:is|are|was|were)\b/i,
      clozeAnswerPattern: /^(?:is|are|was|were)$/i,
    },
    {
      label: 'modal base verb',
      scopeId: 'modal-base-verb' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A1,
      scopePattern: /\b(?:can|should|must)\b/i,
      clozeAnswerPattern: /^(?:can|should|must)$/i,
    },
    {
      label: 'time preposition phrase',
      scopeId: 'time-preposition-phrase' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A1,
      scopePattern: /\b(?:before|during|after|since)\b/i,
      clozeAnswerPattern: /^(?:before|during|after|since)$/i,
    },
    {
      label: 'progressive aspect',
      scopeId: 'progressive-aspect' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A2,
      scopePattern: /\b(?:are|were)\b/i,
      clozeAnswerPattern: /^(?:are|were)$/i,
    },
    {
      label: 'passive voice',
      scopeId: 'passive-voice' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A2,
      scopePattern: /\b(?:is|are|was|were)\s+monitored\b/i,
      clozeAnswerPattern: /^(?:is|are|was|were)\s+monitored$/i,
    },
  ])('keeps the $label fallback scoped, reconstructable, and natural', ({
    scopeId,
    userLevel,
    scopePattern,
    clozeAnswerPattern,
  }) => {
    const items = buildGrammarPracticeItemsForWord(monitorWord, {
      seed: `contract-${scopeId}`,
      requestedScopeId: scopeId,
      userLevel,
    });
    const english = items.find((item) => item.kind === 'ENGLISH_WORD_ORDER');
    const japanese = items.find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    const cloze = items.find((item) => item.kind === 'GRAMMAR_CLOZE');

    expect(english?.source).toBe('fallback');
    expect(english?.grammarScope).toMatchObject({ scopeId, source: 'EXPLICIT' });
    expect(english?.sourceSentence).toMatch(/\bmonitor(?:s|ed|ing)?\b/i);
    expect(english?.sourceSentence).toMatch(scopePattern);
    expect(english?.sourceSentence).not.toMatch(forbiddenFallbackContent);
    expect(english?.sourceSentence).not.toMatch(malformedVerbPhrase);
    expect(english ? toOrderedText(english) : []).toEqual(
      normalizeEnglishTokens(english?.sourceSentence || ''),
    );
    expect(english?.chips.map((chip) => chip.text)).not.toEqual(toOrderedText(english!));

    if (japanese) {
      expect(japanese.grammarScope).toMatchObject({ scopeId, source: 'EXPLICIT' });
      expect(japanese.answerText).toMatch(
        scopeId === 'passive-voice' ? /観察される/ : /観察する/,
      );
      expect(japanese.answerText).not.toMatch(/観察する\s+を/);
      expect(japanese.answerText).not.toMatch(forbiddenFallbackContent);
    }

    expect(cloze?.grammarScope).toMatchObject({ scopeId, source: 'EXPLICIT' });
    expect(cloze?.clozeSentence.match(/____/g)).toHaveLength(1);
    expect(cloze?.answer).toMatch(clozeAnswerPattern);
    expect(cloze?.options).toContain(cloze?.answer);
    expect(cloze?.clozeSentence).not.toMatch(forbiddenFallbackContent);
    expect(cloze?.options.join(' ')).not.toMatch(/monitor(?:ing|ed|s)(?:ing|ed|s)\b/i);
  });

  it('treats Japanese dictionary-form meanings as verbs instead of noun phrases', () => {
    const items = buildGrammarPracticeItemsForWord({
      ...monitorWord,
      id: 'word-recall',
      word: 'recall',
      definition: '思い出す',
    }, {
      seed: 'dictionary-form-verb',
      requestedScopeId: 'basic-tense',
      userLevel: EnglishLevel.A1,
    });
    const english = items.find((item) => item.kind === 'ENGLISH_WORD_ORDER');

    expect(english?.sourceSentence).toMatch(/\brecall(?:s|ed|ing)?\b/i);
    expect(english?.sourceSentence).not.toMatch(/\b(?:the\s+recall|studied\s+the\s+recall)\b/i);
  });

  it('uses irregular past participles in perfect and passive fallback sentences', () => {
    const writeWord: WordData = {
      ...monitorWord,
      id: 'word-write',
      word: 'write',
      definition: '書く',
    };

    const perfect = buildGrammarPracticeItemsForWord(writeWord, {
      seed: 'irregular-perfect',
      requestedScopeId: 'present-perfect',
      userLevel: EnglishLevel.A2,
    }).find((item) => item.kind === 'ENGLISH_WORD_ORDER');
    const passive = buildGrammarPracticeItemsForWord(writeWord, {
      seed: 'irregular-passive',
      requestedScopeId: 'passive-voice',
      userLevel: EnglishLevel.A2,
    }).find((item) => item.kind === 'ENGLISH_WORD_ORDER');

    expect(perfect?.sourceSentence).toMatch(/\bhave written\b/i);
    expect(passive?.sourceSentence).toMatch(/\bis written\b/i);
    expect(`${perfect?.sourceSentence} ${passive?.sourceSentence}`).not.toMatch(/\b(?:writed|have wrote)\b/i);
  });
});
