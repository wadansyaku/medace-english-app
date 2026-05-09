import { describe, expect, it } from 'vitest';

import { GRAMMAR_CURRICULUM_SCOPES } from '../config/grammarCurriculum';
import {
  getGrammarScopesForMode,
  inferGrammarScopeIdFromSentence,
  resolveGrammarScopeSelection,
} from '../utils/grammarScope';

describe('grammar scope curriculum helpers', () => {
  it('defines CEFR-backed Japanese labels for every grammar scope', () => {
    expect(GRAMMAR_CURRICULUM_SCOPES.length).toBeGreaterThanOrEqual(10);
    expect(GRAMMAR_CURRICULUM_SCOPES.every((scope) => (
      scope.id
      && scope.labelJa
      && scope.cefrLevel
      && scope.targetQuestionModes.length > 0
    ))).toBe(true);
  });

  it('maps grammar scopes to supported worksheet modes', () => {
    expect(getGrammarScopesForMode('GRAMMAR_CLOZE').map((scope) => scope.id)).toContain('to-infinitive');
    expect(getGrammarScopesForMode('JA_TRANSLATION_ORDER').map((scope) => scope.id)).not.toContain('to-infinitive');
  });

  it('infers scope from sentence when the scope is not explicit', () => {
    expect(inferGrammarScopeIdFromSentence('Doctors stabilize the patient before surgery.'))
      .toBe('time-preposition-phrase');
    expect(inferGrammarScopeIdFromSentence('Students can review words after class.'))
      .toBe('modal-base-verb');
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
});
