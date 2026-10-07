import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFollowUpSpellingTaskIntent, buildTaskQueryString, parseTaskIntentFromSearch } from '../shared/learningTask';
import { NARU_BOOK_ID } from '../shared/naruBook';
import { normalizeNaruChapterQuizTask } from '../shared/naruStudy';
import { LearningTaskIntentType, UserRole, type LearningTaskIntent, type UserProfile } from '../types';

const useController = vi.hoisted(() => vi.fn((_input: unknown) => ({ loading: true, loadingMessage: '読込中' })));
vi.mock('../hooks/useQuizModeController', () => ({ useQuizModeController: useController }));
import QuizMode from '../components/QuizMode';

const user: UserProfile = { uid: 'synthetic-quiz-range', email: 'synthetic@example.invalid', displayName: '架空生徒', role: UserRole.STUDENT };
beforeEach(() => vi.clearAllMocks());

describe('persisted Naru chapter quiz ranges', () => {
  it.each([
    ['all', { start: 1, end: 1530 }, { start: 1, end: 1531 }],
    ['adverb', { start: 1286, end: 1371 }, { start: 1286, end: 1372 }],
    ['adjective', { start: 1372, end: 1530 }, { start: 1373, end: 1531 }],
  ] as const)('passes the restored %s chapter from its real spelling URL into the controller', (_chapter, oldRange, currentRange) => {
    const oldTask = createFollowUpSpellingTaskIntent(NARU_BOOK_ID, oldRange);
    const persisted = parseTaskIntentFromSearch(buildTaskQueryString(oldTask))!;
    expect(persisted.wordRange).toEqual(oldRange);
    renderToStaticMarkup(<QuizMode user={user} bookId={NARU_BOOK_ID} taskIntent={persisted} onBack={() => {}} />);
    const received = useController.mock.calls[0][0] as unknown as { taskIntent: LearningTaskIntent };
    expect(received.taskIntent).toEqual({ ...persisted, wordRange: currentRange });
    expect(persisted.wordRange).toEqual(oldRange);
    expect(received.taskIntent.targetQuestionModes).toEqual(['SPELLING_HINT']);
    expect(received.taskIntent.limit).toBe(5);
  });

  it.each([{ start: 1300, end: 1361 }, { start: 1361, end: 1361 }, { start: 1372, end: 1531 }])('keeps exact custom scope %j and task identity', range => {
    const task = createFollowUpSpellingTaskIntent(NARU_BOOK_ID, range);
    expect(normalizeNaruChapterQuizTask(NARU_BOOK_ID, task)).toBe(task);
  });

  it('keeps already current chapters and absent scope as the same task', () => {
    for (const range of [{ start: 1286, end: 1372 }, { start: 1373, end: 1531 }, undefined]) {
      const task = createFollowUpSpellingTaskIntent(NARU_BOOK_ID, range);
      expect(normalizeNaruChapterQuizTask(NARU_BOOK_ID, task)).toBe(task);
    }
    expect(normalizeNaruChapterQuizTask(NARU_BOOK_ID, null)).toBeNull();
    expect(normalizeNaruChapterQuizTask(NARU_BOOK_ID, undefined)).toBeUndefined();
  });

  it('preserves mission and non-chapter intents even when their numeric range equals a legacy chapter', () => {
    const task = createFollowUpSpellingTaskIntent(NARU_BOOK_ID, { start: 1372, end: 1530 });
    for (const scoped of [
      { ...task, missionAssignmentId: 'synthetic-mission' },
      { ...task, intentType: LearningTaskIntentType.MISSION_QUIZ },
      { ...task, intentType: LearningTaskIntentType.WEAKNESS_QUIZ },
      { ...task, mode: 'study' as const, intentType: LearningTaskIntentType.BOOK_STUDY },
      { ...task, bookId: 'another-book' },
    ]) expect(normalizeNaruChapterQuizTask(NARU_BOOK_ID, scoped)).toBe(scoped);
    expect(normalizeNaruChapterQuizTask('another-book', task)).toBe(task);
  });
});
