import { describe, expect, it } from 'vitest';

import { GRAMMAR_CURRICULUM_CATEGORY_LABELS, GRAMMAR_CURRICULUM_SCOPES } from '../config/grammarCurriculum';
import { EnglishLevel } from '../types';
import {
  compareEnglishLevels,
  getGrammarScopesForPracticeSelection,
  getGrammarScopesForMode,
  inferGrammarScopeIdFromSentence,
  resolveGrammarScopeSelection,
} from '../utils/grammarScope';

describe('grammar scope curriculum helpers', () => {
  it('defines reference-book style metadata for every grammar scope', () => {
    expect(GRAMMAR_CURRICULUM_SCOPES.length).toBeGreaterThanOrEqual(20);
    expect(GRAMMAR_CURRICULUM_SCOPES.every((scope) => (
      scope.id
      && scope.labelJa
      && scope.cefrLevel
      && scope.groupId
      && scope.groupLabelJa
      && scope.curriculumCategoryId
      && scope.curriculumCategoryLabelJa
      && compareEnglishLevels(scope.levelMin, scope.levelMax) <= 0
      && scope.targetQuestionModes.length > 0
    ))).toBe(true);
    expect(Object.values(GRAMMAR_CURRICULUM_CATEGORY_LABELS)).toEqual(expect.arrayContaining([
      '時制',
      '態',
      '助動詞',
      '仮定法',
      '不定詞',
      '動名詞',
      '分詞',
      '比較',
      '関係詞',
      'イディオム',
      '会話表現',
    ]));
  });

  it('maps grammar scopes to supported worksheet modes', () => {
    expect(getGrammarScopesForMode('GRAMMAR_CLOZE').map((scope) => scope.id)).toContain('to-infinitive');
    expect(getGrammarScopesForMode('JA_TRANSLATION_ORDER').map((scope) => scope.id)).not.toContain('to-infinitive');
  });

  it('filters scopes for multi-select and random practice pools', () => {
    const scopes = getGrammarScopesForPracticeSelection({
      mode: 'GRAMMAR_CLOZE',
      curriculumCategoryIds: ['tense'],
      levelMax: EnglishLevel.B1,
    });

    expect(scopes.map((scope) => scope.id)).toEqual(expect.arrayContaining([
      'basic-tense',
      'progressive-aspect',
      'present-perfect',
    ]));
    expect(scopes.every((scope) => scope.curriculumCategoryId === 'tense')).toBe(true);
    expect(scopes.every((scope) => compareEnglishLevels(scope.levelMin, EnglishLevel.B1) <= 0)).toBe(true);
  });

  it('infers scope from sentence when the scope is not explicit', () => {
    expect(inferGrammarScopeIdFromSentence('Doctors stabilize the patient before surgery.'))
      .toBe('time-preposition-phrase');
    expect(inferGrammarScopeIdFromSentence('Students can review words after class.'))
      .toBe('modal-base-verb');
    expect(inferGrammarScopeIdFromSentence('Teachers said that students reviewed the word.'))
      .toBe('reported-speech');
    expect(inferGrammarScopeIdFromSentence('If students knew the word, they would answer quickly.'))
      .toBe('subjunctive-mood');
    expect(inferGrammarScopeIdFromSentence('How do learners use this word?'))
      .toBe('interrogative-word-order');
  });

  it('preserves explicit scope flags only when the requested scope supports the mode', () => {
    expect(resolveGrammarScopeSelection({
      mode: 'GRAMMAR_CLOZE',
      requestedScopeId: 'to-infinitive',
      sentence: 'I want to review this word.',
    })).toMatchObject({
      scopeId: 'to-infinitive',
      isExplicitScope: true,
      source: 'EXPLICIT',
    });

    expect(resolveGrammarScopeSelection({
      mode: 'JA_TRANSLATION_ORDER',
      requestedScopeId: 'to-infinitive',
      sentence: 'I want to review this word.',
    })).toMatchObject({
      scopeId: 'basic-svo',
      isExplicitScope: false,
      source: 'FALLBACK',
    });
  });

  it('keeps Japanese translation input scope metadata as a reference instead of a locked drill', () => {
    expect(resolveGrammarScopeSelection({
      mode: 'JA_TRANSLATION_INPUT',
      requestedScopeId: 'be-verb',
      sentence: 'The term stabilize is useful today.',
    })).toMatchObject({
      scopeId: 'be-verb',
      isExplicitScope: true,
      isScopeLocked: false,
      source: 'EXPLICIT',
    });
  });
});
