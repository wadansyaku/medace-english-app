import { describe, expect, it } from 'vitest';

import { STORAGE_ACTIONS } from '../contracts/storage';
import {
  resolveStorageActionDefinition,
  storageActionAliases,
  storageActionCompatibilityDefinitions,
  storageActionDomainGroups,
} from '../functions/_shared/storage-action-domains';

const summarizeStorageActionContracts = () => {
  const domainByAction = new Map<string, string>();
  for (const group of storageActionDomainGroups) {
    for (const action of Object.keys(group.definitions)) {
      domainByAction.set(action, group.name);
    }
  }

  return STORAGE_ACTIONS.map((action) => {
    const definition = storageActionCompatibilityDefinitions[action];
    return {
      action,
      alias: storageActionAliases[action],
      domain: domainByAction.get(action) ?? null,
      roles: definition.roles ?? null,
      requiresDestructiveAdminFlag: Boolean(definition.requiresDestructiveAdminFlag),
    };
  });
};

describe('storage action contract', () => {
  it('keeps every public storage action resolvable through the compatibility layer', () => {
    expect(new Set(STORAGE_ACTIONS).size).toBe(STORAGE_ACTIONS.length);

    for (const action of STORAGE_ACTIONS) {
      expect(storageActionAliases[action]).toBe(action);
      expect(resolveStorageActionDefinition(action)).toBe(storageActionCompatibilityDefinitions[action]);
    }
  });

  it('keeps domain groups covering the full public storage surface exactly once', () => {
    const groupedActions = storageActionDomainGroups.flatMap((group) => Object.keys(group.definitions));

    expect(groupedActions).toHaveLength(STORAGE_ACTIONS.length);
    expect(new Set(groupedActions).size).toBe(STORAGE_ACTIONS.length);
    expect([...groupedActions].sort()).toEqual([...STORAGE_ACTIONS].sort());
  });

  it('matches the storage action contract snapshot', () => {
    expect(summarizeStorageActionContracts()).toMatchSnapshot();
  });

  it('accepts only declared worksheet question modes for quiz attempts', () => {
    const definition = resolveStorageActionDefinition('recordQuizAttempt');

    expect(definition.parse({
      wordId: 'word-1',
      bookId: 'book-1',
      correct: true,
      questionMode: 'GRAMMAR_CLOZE',
      responseTimeMs: 1200,
    })).toMatchObject({
      questionMode: 'GRAMMAR_CLOZE',
    });
    expect(definition.parse({
      wordId: 'word-1',
      bookId: 'book-1',
      correct: true,
      questionMode: 'EN_WORD_ORDER',
      responseTimeMs: 1200,
    })).toMatchObject({
      questionMode: 'EN_WORD_ORDER',
    });
    expect(definition.parse({
      wordId: 'word-1',
      bookId: 'book-1',
      correct: true,
      questionMode: 'JA_TRANSLATION_ORDER',
      responseTimeMs: 1200,
    })).toMatchObject({
      questionMode: 'JA_TRANSLATION_ORDER',
    });
    expect(definition.parse({
      wordId: 'word-1',
      bookId: 'book-1',
      correct: true,
      questionMode: 'JA_TRANSLATION_INPUT',
      responseTimeMs: 1200,
    })).toMatchObject({
      questionMode: 'JA_TRANSLATION_INPUT',
    });

    expect(() => definition.parse({
      wordId: 'word-1',
      bookId: 'book-1',
      correct: true,
      questionMode: 'FREE_TEXT_MODE',
      responseTimeMs: 1200,
    })).toThrow('questionMode が不正です。');
  });

  it('declares AI generated problem review actions for teacher/admin operation', () => {
    const listDefinition = resolveStorageActionDefinition('listAiGeneratedProblemReviewQueue');
    const reviewDefinition = resolveStorageActionDefinition('reviewAiGeneratedProblem');

    expect(listDefinition.roles).toEqual(['ADMIN', 'INSTRUCTOR']);
    expect(reviewDefinition.roles).toEqual(['ADMIN', 'INSTRUCTOR']);
    expect(listDefinition.parse({
      status: 'PENDING',
      questionMode: 'GRAMMAR_CLOZE',
      limit: 10,
    })).toMatchObject({
      status: 'PENDING',
      questionMode: 'GRAMMAR_CLOZE',
      limit: 10,
    });
    expect(reviewDefinition.parse({
      problemId: 'ai-problem-1',
      decision: 'APPROVE',
      reviewNote: '講師確認済み',
    })).toEqual({
      problemId: 'ai-problem-1',
      decision: 'APPROVE',
      reviewNote: '講師確認済み',
    });
    expect(() => reviewDefinition.parse({
      problemId: 'ai-problem-1',
      decision: 'PUBLISH',
    })).toThrow('decision が不正です。');
  });

  it('declares classroom worksheet lifecycle recording for teacher/admin operation', () => {
    const definition = resolveStorageActionDefinition('recordClassroomWorksheetLifecycleEvent');

    expect(definition.roles).toEqual(['ADMIN', 'INSTRUCTOR']);
    expect(definition.parse({
      studentUid: 'student-1',
      worksheetSource: 'catalog_fallback',
      lifecycleStatus: 'printed',
      payload: {
        generatedQuestionCount: 20,
      },
      occurredAt: 123,
    })).toMatchObject({
      studentUid: 'student-1',
      worksheetSource: 'catalog_fallback',
      lifecycleStatus: 'printed',
      occurredAt: 123,
    });
    expect(() => definition.parse({
      studentUid: 'student-1',
      worksheetSource: 'unknown',
      lifecycleStatus: 'printed',
    })).toThrow('worksheetSource が不正です。');
    expect(() => definition.parse({
      studentUid: 'student-1',
      worksheetSource: 'history',
      lifecycleStatus: 'archived',
    })).toThrow('lifecycleStatus が不正です。');
  });
});
