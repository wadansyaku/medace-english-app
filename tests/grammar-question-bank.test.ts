import { describe, expect, it } from 'vitest';

import { GRAMMAR_CURRICULUM_SCOPES } from '../config/grammarCurriculum';
import { ORIGINAL_GRAMMAR_QUESTIONS } from '../config/grammarQuestionBank';
import { EnglishLevel, type GrammarCurriculumScopeId } from '../types';
import type { EnglishWordOrderPracticeItem } from '../utils/grammarPractice';
import { buildCuratedGrammarPracticeItems, isGrammarPracticeOrderCorrect } from '../utils/grammarQuestionBank';
import { compareEnglishLevels, getGrammarCurriculumScope } from '../utils/grammarScope';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/[“”‘’]/g, "'").replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
const originalId = (key: string) => `grammar-original-20261003-${key}`;
const orderItem = (key: string): EnglishWordOrderPracticeItem => {
  const question = ORIGINAL_GRAMMAR_QUESTIONS.find(candidate => candidate.id === originalId(key));
  if (!question) throw new Error(`Missing authored question ${key}`);
  const item = buildCuratedGrammarPracticeItems({
    mode: 'EN_WORD_ORDER', scopeIds: [question.scopeId], userLevel: EnglishLevel.C1,
    questionCount: 60, seed: 'content-review',
  }).find(candidate => candidate.feedback?.questionId === question.id);
  if (!item || item.kind !== 'ENGLISH_WORD_ORDER') throw new Error(`Missing order item ${key}`);
  return item;
};

describe('authored grammar content integrity', () => {
  it('contains 64 distinct authored sentences, covering all 26 scopes at least twice', () => {
    expect(ORIGINAL_GRAMMAR_QUESTIONS).toHaveLength(64);
    expect(new Set(ORIGINAL_GRAMMAR_QUESTIONS.map(question => question.id)).size).toBe(64);
    expect(new Set(ORIGINAL_GRAMMAR_QUESTIONS.map(question => normalize(question.sourceSentence))).size).toBe(64);
    expect(new Set(ORIGINAL_GRAMMAR_QUESTIONS.map(question => normalize(question.clozeSentence))).size).toBe(64);
    for (const scope of GRAMMAR_CURRICULUM_SCOPES) {
      expect(ORIGINAL_GRAMMAR_QUESTIONS.filter(question => question.scopeId === scope.id).length, scope.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps each question within the declared curriculum range and supplies answer-specific feedback', () => {
    for (const question of ORIGINAL_GRAMMAR_QUESTIONS) {
      const scope = getGrammarCurriculumScope(question.scopeId);
      expect(question.id).toMatch(/^grammar-original-20261003-[a-z-]+-\d{2}$/);
      expect(compareEnglishLevels(question.level, scope.levelMin), question.id).toBeGreaterThanOrEqual(0);
      expect(compareEnglishLevels(question.level, scope.levelMax), question.id).toBeLessThanOrEqual(0);
      expect(question.contextJa.length, question.id).toBeGreaterThan(10);
      expect(question.explanationJa.length, question.id).toBeGreaterThan(20);
      expect(question.translationJa.length, question.id).toBeGreaterThan(4);
      expect(question.recommendedGradeJa).not.toBe('');
      expect(question.clozeSentence.match(/____/g), question.id).toHaveLength(1);
      expect(question.options, question.id).toHaveLength(4);
      expect(new Set(question.options).size, question.id).toBe(4);
      expect(question.options.filter(option => option === question.answer), question.id).toHaveLength(1);
      expect(Object.keys(question.distractorReasons).sort(), question.id)
        .toEqual(question.options.filter(option => option !== question.answer).sort());
      for (const reason of Object.values(question.distractorReasons)) expect(reason.length, question.id).toBeGreaterThan(10);
      expect(question.sourceSentence).toBe(question.clozeSentence.replace('____', question.answer));
      expect(normalize(question.orderChunks.join(' ')), question.id).toBe(normalize(question.sourceSentence));
      for (const order of question.alternateOrders) {
        expect([...order].sort((left, right) => left - right), question.id)
          .toEqual(question.orderChunks.map((_, index) => index));
      }
    }
  });

  it('retains the meaning-defining comma in the nonrestrictive relative-clause chips', () => {
    const item = orderItem('relative-03');
    const byId = new Map(item.chips.map(chip => [chip.id, chip.text]));
    expect(item.correctChipIds.map(id => byId.get(id))).toEqual([
      'my bike,', 'which i bought last week,', 'is already', 'broken',
    ]);
    expect(item.prompt).toContain('非制限用法');
  });

  it('keeps time phrases with their intended action and discloses required conversation order before answering', () => {
    const item = orderItem('verb-pattern-02');
    expect(item.chips.map(chip => chip.text)).toContain('seeing you next week');
    expect(item.acceptedChipOrders).toHaveLength(1);
    expect(orderItem('progressive-01').prompt).toContain('Look! から始めて');
    expect(orderItem('conversation-02').prompt).toContain('質問→承諾→行動');
  });
});

describe('curated grammar selection', () => {
  it('balances distinct scopes first, then returns additional nonrepeating questions', () => {
    const scopes: GrammarCurriculumScopeId[] = ['present-perfect', 'gerund', 'subjunctive-mood'];
    const items = buildCuratedGrammarPracticeItems({
      mode: 'GRAMMAR_CLOZE', scopeIds: scopes, userLevel: EnglishLevel.C1, seed: 'balanced', questionCount: 11,
    });
    expect(items).toHaveLength(11);
    expect(new Set(items.slice(0, 3).map(item => item.grammarScope.scopeId)).size).toBe(3);
    expect(new Set(items.map(item => item.feedback?.questionId)).size).toBe(11);
    expect(items.every(item => scopes.includes(item.grammarScope.scopeId))).toBe(true);
  });

  it('filters difficulty and exclusions without duplicating easy filler or changing the requested scope', () => {
    const options = { mode: 'GRAMMAR_CLOZE' as const, scopeIds: ['subjunctive-mood'] as const, questionCount: 20 };
    expect(buildCuratedGrammarPracticeItems({ ...options, userLevel: EnglishLevel.A2 })).toEqual([]);
    const atB1 = buildCuratedGrammarPracticeItems({ ...options, userLevel: EnglishLevel.B1 });
    expect(atB1.map(item => item.feedback?.questionId)).toEqual([originalId('subjunctive-01')]);
    const excluded = buildCuratedGrammarPracticeItems({
      ...options, userLevel: EnglishLevel.C1, excludeQuestionIds: [originalId('subjunctive-01')],
    });
    expect(excluded).toHaveLength(3);
    expect(excluded.every(item => item.grammarScope.scopeId === 'subjunctive-mood')).toBe(true);
    expect(excluded.some(item => item.feedback?.questionId === originalId('subjunctive-01'))).toBe(false);
    const easy = buildCuratedGrammarPracticeItems({ mode: 'GRAMMAR_CLOZE', userLevel: EnglishLevel.A1, questionCount: 60 });
    expect(easy).toHaveLength(10);
    expect(easy.every(item => item.feedback?.level === EnglishLevel.A1)).toBe(true);
  });

  it('is reproducible with a seed, varies with another seed, and never fabricates Word/Book associations', () => {
    const options = { mode: 'GRAMMAR_CLOZE' as const, userLevel: EnglishLevel.B2, questionCount: 10, seed: 'session-a' };
    const first = buildCuratedGrammarPracticeItems(options);
    expect(buildCuratedGrammarPracticeItems(options)).toEqual(first);
    expect(buildCuratedGrammarPracticeItems({ ...options, seed: 'session-b' })).not.toEqual(first);
    for (const item of first) {
      expect(item.source).toBe('curated');
      expect(item.wordId).toBe('');
      expect(item.bookId).toBe('');
      expect(item.feedback?.questionId).toMatch(/^grammar-original-20261003-/);
      expect(item.id).toBe(`${item.feedback?.questionId}:GRAMMAR_CLOZE`);
      expect(item.kind).toBe('GRAMMAR_CLOZE');
      if (item.kind === 'GRAMMAR_CLOZE') {
        const original = ORIGINAL_GRAMMAR_QUESTIONS.find(question => question.id === item.feedback?.questionId)!;
        expect(item.prompt).toBe(original.contextJa);
        expect(item.options).toContain(original.answer);
        expect(item.feedback?.explanationJa).toBe(original.explanationJa);
      }
    }
  });

  it('honors empty selection, zero and invalid counts, and bounds oversized requests', () => {
    expect(buildCuratedGrammarPracticeItems({ mode: 'GRAMMAR_CLOZE', scopeIds: [] })).toEqual([]);
    for (const questionCount of [0, -3, NaN, Infinity]) {
      expect(buildCuratedGrammarPracticeItems({ mode: 'GRAMMAR_CLOZE', questionCount })).toHaveLength(0);
    }
    expect(buildCuratedGrammarPracticeItems({ mode: 'GRAMMAR_CLOZE', questionCount: 1000, userLevel: EnglishLevel.C1 })).toHaveLength(60);
  });
});

describe('authored English order grading', () => {
  it('accepts every reviewed complete order and rejects missing, repeated or foreign chip IDs', () => {
    for (const scope of GRAMMAR_CURRICULUM_SCOPES) {
      const items = buildCuratedGrammarPracticeItems({
        mode: 'EN_WORD_ORDER', scopeIds: [scope.id], userLevel: EnglishLevel.C1, questionCount: 60, seed: 'orders',
      });
      for (const item of items) {
        if (item.kind !== 'ENGLISH_WORD_ORDER') throw new Error('Unexpected item');
        for (const order of item.acceptedChipOrders ?? []) expect(isGrammarPracticeOrderCorrect(item, order), item.id).toBe(true);
        expect(isGrammarPracticeOrderCorrect(item, item.correctChipIds.slice(1)), item.id).toBe(false);
        expect(isGrammarPracticeOrderCorrect(item, item.correctChipIds.map(() => item.correctChipIds[0])), item.id).toBe(false);
        expect(isGrammarPracticeOrderCorrect(item, ['foreign', ...item.correctChipIds.slice(1)]), item.id).toBe(false);
        expect(item.chips.map(chip => chip.id), item.id).not.toEqual(item.correctChipIds);
      }
    }
  });

  it('accepts the natural time and manner positions found during independent review', () => {
    const cases: [string, number[]][] = [
      ['modal-01', [3, 0, 1, 2]], ['passive-02', [0, 1, 3, 2]],
      ['perfect-02', [0, 1, 3, 2]], ['adverb-01', [0, 2, 1]],
      ['agreement-03', [0, 3, 1, 2]],
    ];
    for (const [key, order] of cases) {
      const item = orderItem(key);
      expect(isGrammarPracticeOrderCorrect(item, order.map(index => item.correctChipIds[index])), key).toBe(true);
    }
    const passive = orderItem('passive-02');
    expect(isGrammarPracticeOrderCorrect(passive, [2, 0, 1, 3].map(index => passive.correctChipIds[index]))).toBe(false);
  });

  it('accepts swaps of identically displayed chips and supports legacy single-answer items', () => {
    const item: EnglishWordOrderPracticeItem = {
      ...orderItem('svo-01'),
      chips: ['we', 'had', 'had', 'lunch'].map((text, index) => ({ id: String(index), text })),
      correctChipIds: ['0', '1', '2', '3'], acceptedChipOrders: undefined,
    };
    expect(isGrammarPracticeOrderCorrect(item, ['0', '2', '1', '3'])).toBe(true);
    expect(isGrammarPracticeOrderCorrect(item, ['1', '0', '2', '3'])).toBe(false);
  });
});
