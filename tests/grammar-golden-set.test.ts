import { describe, expect, it } from 'vitest';

import { EnglishLevel, type WordData, type GrammarCurriculumScopeId } from '../types';
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

const toOrderedText = (
  item: Extract<ReturnType<typeof buildGrammarPracticeItemsForWord>[number], { kind: 'ENGLISH_WORD_ORDER' | 'JAPANESE_WORD_ORDER' }>,
): string[] => item.correctChipIds.map((id) => item.chips.find((chip) => chip.id === id)?.text || '');

describe('grammar practice golden set', () => {
  it.each([
    {
      label: 'modal base verb',
      scopeId: 'modal-base-verb' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A1,
      englishSentence: 'Learners can monitor the process today.',
      englishTokens: ['learners', 'can', 'monitor', 'the', 'process', 'today'],
      japaneseAnswer: null,
      japaneseTokens: [],
      clozeSentence: 'Learners ____ monitor the process today.',
      clozeAnswer: 'can',
    },
    {
      label: 'time preposition phrase',
      scopeId: 'time-preposition-phrase' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A1,
      englishSentence: 'Learners check monitoring the process before class.',
      englishTokens: ['learners', 'check', 'monitoring', 'the', 'process', 'before', 'class'],
      japaneseAnswer: '生徒は 授業前に 観察する を 確認する',
      japaneseTokens: ['生徒は', '授業前に', '観察する', 'を', '確認する'],
      clozeSentence: 'Learners check monitoring the process ____ class.',
      clozeAnswer: 'before',
    },
    {
      label: 'passive voice',
      scopeId: 'passive-voice' as GrammarCurriculumScopeId,
      userLevel: EnglishLevel.A2,
      englishSentence: 'monitoring the process is checked by teachers today.',
      englishTokens: ['monitoring', 'the', 'process', 'is', 'checked', 'by', 'teachers', 'today'],
      japaneseAnswer: '観察する は 今日 先生に 確認される',
      japaneseTokens: ['観察する', 'は', '今日', '先生に', '確認される'],
      clozeSentence: 'monitoring the process ____ by teachers today.',
      clozeAnswer: 'is checked',
    },
  ])('keeps the $label item shape stable', ({
    scopeId,
    userLevel,
    englishSentence,
    englishTokens,
    japaneseAnswer,
    japaneseTokens,
    clozeSentence,
    clozeAnswer,
  }) => {
    const items = buildGrammarPracticeItemsForWord(monitorWord, {
      seed: `golden-${scopeId}`,
      requestedScopeId: scopeId,
      userLevel,
    });
    const english = items.find((item) => item.kind === 'ENGLISH_WORD_ORDER');
    const japanese = items.find((item) => item.kind === 'JAPANESE_WORD_ORDER');
    const cloze = items.find((item) => item.kind === 'GRAMMAR_CLOZE');

    expect(english?.grammarScope).toMatchObject({ scopeId, source: 'EXPLICIT' });
    expect(english?.sourceSentence).toBe(englishSentence);
    expect(english ? toOrderedText(english) : []).toEqual(englishTokens);
    expect(english?.chips.map((chip) => chip.text)).not.toEqual(englishTokens);

    if (japaneseAnswer) {
      expect(japanese?.grammarScope).toMatchObject({ scopeId, source: 'EXPLICIT' });
      expect(japanese?.answerText).toBe(japaneseAnswer);
      expect(japanese ? toOrderedText(japanese) : []).toEqual(japaneseTokens);
    } else {
      expect(japanese).toBeUndefined();
    }

    expect(cloze?.grammarScope).toMatchObject({ scopeId, source: 'EXPLICIT' });
    expect(cloze?.clozeSentence).toBe(clozeSentence);
    expect(cloze?.answer).toBe(clozeAnswer);
    expect(cloze?.options).toContain(clozeAnswer);
  });
});
