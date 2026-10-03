import { describe, expect, it } from 'vitest';
import { buildNavigationPath, parseNavigationPath } from '../hooks/useAppNavigation';
import { buildTaskQueryString, createFollowUpSpellingTaskIntent, parseTaskIntent, parseTaskIntentFromSearch, serializeTaskIntent } from '../shared/learningTask';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../shared/naruBook';
import { createNaruChapterReturnTask, createNaruChapterTask, isNaruChapterStudyTask, resolveNaruStudyChapter } from '../shared/naruStudy';
import { LearningTaskIntentType, type LearningTaskIntent } from '../types';

describe('Naru chapter study intents and routes', () => {
  it.each([
    ['all', 1, 1530], ['verb', 1, 353], ['noun', 354, 1285],
    ['adverb', 1286, 1371], ['adjective', 1372, 1530],
  ] as const)('uses the published %s chapter boundaries for both study choices', (id, start, end) => {
    const chapter = NARU_RANGE_PRESETS.find(item => item.id === id)!;
    for (const kind of ['new', 'due'] as const) {
      const task = createNaruChapterTask(chapter, kind);
      expect(task).toMatchObject({ mode: 'study', intentType: LearningTaskIntentType.BOOK_STUDY,
        bookId: NARU_BOOK_ID, wordRange: { start, end }, limit: 10, autoStart: false,
        selectionPolicy: kind === 'due' ? 'BOOK_DUE_ONLY' : 'BOOK_NEW_ONLY' });
      expect(resolveNaruStudyChapter(task.wordRange)).toEqual(chapter);
      const running = createNaruChapterTask(chapter, kind, true);
      expect(running.autoStart).toBe(true);
      expect(createNaruChapterReturnTask(running)).toEqual(task);
    }
  });

  it('recognizes only this book’s ordinary study flow and keeps mission study separate', () => {
    const task = createNaruChapterTask(NARU_RANGE_PRESETS[2], 'new');
    expect(isNaruChapterStudyTask(NARU_BOOK_ID)).toBe(true);
    expect(isNaruChapterStudyTask(NARU_BOOK_ID, task)).toBe(true);
    expect(isNaruChapterStudyTask('another-book', task)).toBe(false);
    expect(isNaruChapterStudyTask(NARU_BOOK_ID, { ...task, bookId: 'another-book' })).toBe(false);
    expect(isNaruChapterStudyTask(NARU_BOOK_ID, { ...task, intentType: LearningTaskIntentType.MISSION_NEW, missionAssignmentId: 'mission' })).toBe(false);
    expect(isNaruChapterStudyTask(NARU_BOOK_ID, { ...task, missionAssignmentId: 'mission' })).toBe(false);
    expect(isNaruChapterStudyTask(NARU_BOOK_ID, createFollowUpSpellingTaskIntent(NARU_BOOK_ID, task.wordRange))).toBe(false);
  });

  it('round-trips chapter, choice and auto-start through encoded URL and auth overlays', () => {
    for (const chapter of NARU_RANGE_PRESETS) {
      for (const kind of ['new', 'due'] as const) {
        const task = createNaruChapterTask(chapter, kind, true);
        expect(parseTaskIntent(serializeTaskIntent(task))).toEqual(task);
        expect(parseTaskIntentFromSearch(buildTaskQueryString(task))).toEqual(task);
        const state = parseNavigationPath(`/study/${NARU_BOOK_ID}`, buildTaskQueryString(task));
        for (const authPanelMode of [undefined, 'LOGIN', 'SIGNUP'] as const) {
          const url = new URL(buildNavigationPath({ ...state, authPanelMode }), 'https://synthetic.invalid');
          expect(parseNavigationPath(url.pathname, url.search)).toMatchObject({ currentView: 'study', selectedTask: task });
        }
      }
    }
  });

  it.each([null, {}, { start: '354', end: 1285 }, { start: 1285, end: 354 },
    { start: 0, end: 1530 }, { start: 1.5, end: 353 }, { start: 1, end: 1_000_001 }, { start: NaN, end: Infinity }])
  ('rejects an explicit invalid range without retaining its automatic start: %j', wordRange => {
    const task = { ...createNaruChapterTask(NARU_RANGE_PRESETS[0], 'new', true), wordRange } as unknown as LearningTaskIntent;
    expect(parseTaskIntent(serializeTaskIntent(task))).toBeNull();
    const restored = parseNavigationPath(`/study/${NARU_BOOK_ID}`, buildTaskQueryString(task));
    expect(restored.selectedTask?.autoStart).not.toBe(true);
    expect(restored.selectedTask?.selectionPolicy).toBe('BOOK_DEFAULT');
  });

  it('distinguishes a legacy omitted range from an unrecognized explicit chapter', () => {
    expect(resolveNaruStudyChapter()).toEqual(NARU_RANGE_PRESETS[0]);
    expect(resolveNaruStudyChapter({ start: 10, end: 20 })).toBeNull();
    expect(resolveNaruStudyChapter({ start: 354, end: 1284 })).toBeNull();
  });

  it.each(NARU_RANGE_PRESETS)('keeps $label through the five-question spelling route and returns to setup', chapter => {
    const study = createNaruChapterTask(chapter, 'new', true);
    const spelling = createFollowUpSpellingTaskIntent(NARU_BOOK_ID, study.wordRange);
    expect(spelling).toMatchObject({ mode: 'quiz', intentType: LearningTaskIntentType.BOOK_QUIZ,
      wordRange: study.wordRange, targetQuestionModes: ['SPELLING_HINT'], limit: 5, autoStart: true });
    const state = parseNavigationPath(`/quiz/${NARU_BOOK_ID}`, buildTaskQueryString(spelling));
    const url = new URL(buildNavigationPath(state), 'https://synthetic.invalid');
    const restored = parseNavigationPath(url.pathname, url.search).selectedTask!;
    expect(restored.wordRange).toEqual(study.wordRange);
    const returnTask = createNaruChapterReturnTask(restored);
    expect(returnTask).toMatchObject({ mode: 'study', wordRange: study.wordRange, autoStart: false });
    expect(resolveNaruStudyChapter(returnTask.wordRange)).toEqual(chapter);
  });
});
