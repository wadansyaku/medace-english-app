import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Run the real load, selection and receipt callbacks; this is not layout evidence.
const harness = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0,
  effects: new Map<number, () => void | (() => void)>(),
  cleanups: new Map<number, () => void>(),
}));
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  const hooks = {
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.slots[index], (next: any) => {
        harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
    useReducer: (reducer: any, initial: unknown, init?: any) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = init ? init(initial) : initial;
      return [harness.slots[index], (action: unknown) => { harness.slots[index] = reducer(harness.slots[index], action); }];
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = harness.cursor++;
      const previous = harness.slots[index] as unknown[] | undefined;
      if (!previous || deps.some((value, position) => !Object.is(value, previous[position]))) {
        harness.slots[index] = deps;
        harness.effects.set(index, effect);
      }
    },
  };
  return { ...original, ...hooks, default: { ...original.default, ...hooks } };
});
const api = vi.hoisted(() => ({
  getWordsByBook: vi.fn(), getStudiedWordIdsByBook: vi.fn(), getBookSession: vi.fn(),
  getBooks: vi.fn(), recordQuizAttempt: vi.fn(), recordClientProductEvent: vi.fn(),
}));
vi.mock('../services/learning', () => ({ learningService: api }));
vi.mock('../services/productEvents', () => ({ recordClientProductEvent: api.recordClientProductEvent }));
vi.mock('../services/gemini', () => ({ generateGrammarPracticeQuestions: vi.fn(), evaluateJapaneseTranslationAnswer: vi.fn() }));

import QuizMode from '../components/QuizMode';
import ModalOverlay from '../components/ModalOverlay';
import QuizExitConfirmDialog from '../components/quiz/QuizExitConfirmDialog';
import QuizHeader from '../components/quiz/QuizHeader';
import QuizResultView from '../components/quiz/QuizResultView';
import QuizSetupView from '../components/quiz/QuizSetupView';
import { useQuizModeController } from '../hooks/useQuizModeController';
import { createFollowUpSpellingTaskIntent } from '../shared/learningTask';
import { NARU_BOOK_ID } from '../shared/naruBook';
import { normalizeNaruChapterQuizTask } from '../shared/naruStudy';
import { UserRole, type LearningTaskIntent, type UserProfile, type WordData } from '../types';

const user: UserProfile = { uid: 'synthetic', email: 'synthetic@example.invalid', displayName: '架空生徒', role: UserRole.STUDENT };
const task = createFollowUpSpellingTaskIntent(NARU_BOOK_ID, { start: 1, end: 353 });
const words: WordData[] = ['study', 'read', 'write', 'walk', 'speak'].map((word, index) => ({
  id: `verb-${index}`, bookId: NARU_BOOK_ID, number: 16 + index * 20, word, definition: '動詞の意味',
}));
const noun: WordData = { id: 'noun', bookId: NARU_BOOK_ID, number: 354, word: 'book', definition: '本' };
const render = <T,>(fn: () => T): T => { harness.cursor = 0; return fn(); };
const controller = (intent: LearningTaskIntent | null = task) => render(() => useQuizModeController({ user, bookId: NARU_BOOK_ID, taskIntent: intent }));
const view = (onBack = vi.fn(), intent: LearningTaskIntent | null = task) => render(() => QuizMode({ user, bookId: NARU_BOOK_ID, taskIntent: intent, onBack })) as ReactElement;
const flushEffects = () => {
  const effects = [...harness.effects]; harness.effects.clear();
  effects.forEach(([index, effect]) => {
    harness.cleanups.get(index)?.();
    const cleanup = effect();
    if (cleanup) harness.cleanups.set(index, cleanup);
  });
};
const findElement = (tree: ReactElement, type: unknown): ReactElement<any> | undefined => {
  if (tree.type === type) return tree;
  for (const child of React.Children.toArray((tree.props as any).children)) {
    if (React.isValidElement(child)) {
      const found = findElement(child, type);
      if (found) return found;
    }
  }
  return undefined;
};
const load = async (intent: LearningTaskIntent | null = task) => {
  controller(intent); flushEffects();
  await vi.waitFor(() => expect(controller(intent).loading).toBe(false));
};

beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects.clear(); harness.cleanups.clear();
  vi.clearAllMocks();
  vi.stubGlobal('window', { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  api.getBookSession.mockResolvedValue(words);
  api.getWordsByBook.mockResolvedValue([...words, noun]);
  api.getStudiedWordIdsByBook.mockResolvedValue([]);
  api.getBooks.mockResolvedValue([]);
  api.recordClientProductEvent.mockResolvedValue(undefined);
  api.recordQuizAttempt.mockImplementation(async (...args: unknown[]) => ({
    clientAttemptId: args[11], wordId: args[1], bookId: args[2], committedAt: 1, projectionStatus: 'COMPLETE',
  }));
});
afterEach(() => {
  harness.cleanups.forEach(cleanup => cleanup());
  vi.unstubAllGlobals();
});

describe('chapter spelling session preserves its actual range and return destination', () => {
  it('loads the five-word session with its task and displays the original chapter, not the fetched subset or full book', async () => {
    await load();
    expect(api.getBookSession).toHaveBeenCalledWith(user.uid, NARU_BOOK_ID, 5, task);
    expect(api.getWordsByBook).not.toHaveBeenCalled();
    expect(controller().screen).toBe('RUNNING');
    expect(controller().questions).toHaveLength(5);
    expect(controller().activeSummary).toBe('No. 1 - 353 からランダム 5 問');
    const markup = renderToStaticMarkup(view());
    expect(markup).toContain('No. 1 - 353 からランダム 5 問');
    expect(markup).not.toContain('全範囲からランダム');
    expect(findElement(view(), QuizSetupView)).toBeUndefined();
  });

  it('returns confirmed exits to App onBack and never exposes a mutable noun preset over five verbs', async () => {
    await load();
    const onBack = vi.fn();
    findElement(view(onBack), QuizHeader)!.props.onBack();
    const dialog = findElement(view(onBack), QuizExitConfirmDialog)!;
    expect(dialog.props.returnDestinationLabel).toBe('章・範囲選択');
    dialog.props.onConfirm();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(findElement(view(onBack), QuizSetupView)).toBeUndefined();
    expect(renderToStaticMarkup(view(onBack))).toContain('quiz-scoped-session-setup');
    const config = controller().setupConfig;
    controller().updateSetupConfig({ selectionMode: 'RANGE_RANDOM', rangeStart: 354, rangeEnd: 1285 });
    controller().goToReady();
    expect(controller().setupConfig).toEqual(config);
    expect(controller().screen).toBe('SETUP');
  });

  it('keeps result retry on the same five verbs and routes both condition changes and back to the chapter chooser', async () => {
    await load();
    controller().setScreen('RESULT');
    const onBack = vi.fn();
    const result = findElement(view(onBack), QuizResultView)!;
    expect(result.props.resetLabel).toBe('章・範囲を選び直す');
    expect(result.props.backLabel).toBe('章・範囲選択へ戻る');
    result.props.onReset(); result.props.onBack();
    expect(onBack).toHaveBeenCalledTimes(2);
    result.props.onRetry();
    expect(controller().screen).toBe('RUNNING');
    expect(controller().questions).toHaveLength(5);
    expect(controller().questions.every(question => words.some(word => word.id === question.wordId))).toBe(true);
    expect(controller().activeSummary).toContain('No. 1 - 353');
  });

  it('filters an out-of-chapter response and keeps an empty chapter distinct from full-book setup', async () => {
    api.getBookSession.mockResolvedValue([noun]);
    await load();
    expect(controller().allWords).toEqual([]);
    expect(controller().questions).toEqual([]);
    const markup = renderToStaticMarkup(view());
    expect(markup).toContain('この章・範囲には出題できる単語がありません');
    expect(findElement(view(), QuizSetupView)).toBeUndefined();
  });

  it('rejects an invalid task range before requesting material and retains the retryable load failure', async () => {
    const invalidTask = { ...task, wordRange: { start: 354, end: 16 } };
    await load(invalidTask);
    expect(controller(invalidTask).loadError).toBeTruthy();
    expect(api.getBookSession).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(view(vi.fn(), invalidTask))).toContain('quiz-load-error');
  });

  it('rejects a task for a different book without silently converting it to this book’s chapter session', async () => {
    const foreignTask = { ...task, bookId: 'another-book' };
    await load(foreignTask);
    expect(controller(foreignTask).isScopedSession).toBe(false);
    expect(controller(foreignTask).loadError).toBeTruthy();
    expect(api.getBookSession).not.toHaveBeenCalled();
  });

  it('keeps a committed answer pending until its progress projection is confirmed and retries the identical request', async () => {
    api.recordQuizAttempt.mockImplementationOnce(async (...args: unknown[]) => ({
      clientAttemptId: args[11], wordId: args[1], bookId: args[2], committedAt: 1, projectionStatus: 'PENDING',
    }));
    await load();
    controller().setAnswerInput(controller().currentQuestion.answer);
    await controller().handleHintSubmit({ preventDefault: vi.fn() } as any);
    expect(controller().score).toBe(0);
    expect(controller().currentQIndex).toBe(0);
    expect(controller().exitBlocked).toBe(true);
    expect(controller().saveError).toContain('解答は保存済み');
    expect(window.setTimeout).not.toHaveBeenCalled();
    const original = [...api.recordQuizAttempt.mock.calls[0]];
    await controller().handleRetrySave();
    expect(api.recordQuizAttempt.mock.calls[1]).toEqual(original);
    expect(controller().score).toBe(1);
    expect(controller().saveError).toBeNull();
    expect(controller().pendingAttempt).toBeNull();
    expect(window.setTimeout).toHaveBeenCalledTimes(1);
    await controller().handleRetrySave();
    expect(api.recordQuizAttempt).toHaveBeenCalledTimes(2);
    expect(controller().score).toBe(1);
  });

  it('blocks same-tick and failed-save exit without discarding the answer, then retries the identical receipt request', async () => {
    let reject!: (error: Error) => void;
    api.recordQuizAttempt.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    await load();
    controller().setAnswerInput(controller().currentQuestion.answer);
    const beforeSubmit = controller();
    const submitting = beforeSubmit.handleHintSubmit({ preventDefault: vi.fn() } as any);
    expect(beforeSubmit.confirmExitRunning()).toBe(false);
    expect(controller().exitBlocked).toBe(true);
    const onBack = vi.fn();
    findElement(view(onBack), QuizHeader)!.props.onBack();
    const dialog = findElement(view(onBack), QuizExitConfirmDialog)!;
    expect(dialog.props.exitBlocked).toBe(true);
    dialog.props.onConfirm();
    expect(onBack).not.toHaveBeenCalled();
    reject(new Error('synthetic save failure')); await submitting;
    const pendingId = controller().pendingAttempt!.clientAttemptId;
    expect(controller().confirmExitRunning()).toBe(false);
    expect(controller().saveError).toBeTruthy();
    const modal = QuizExitConfirmDialog(dialog.props) as ReactElement<any>;
    expect(modal.type).toBe(ModalOverlay);
    expect(modal.props).toMatchObject({
      ariaLabel: '今のテストをやめますか？',
      initialFocusSelector: '[data-testid="quiz-exit-cancel"]',
      align: 'center', mobileBehavior: 'default', onClose: dialog.props.onCancel,
    });
    const dialogMarkup = renderToStaticMarkup(modal.props.children);
    expect(dialogMarkup).toContain('quiz-exit-confirm-dialog');
    expect(dialogMarkup).toMatch(/<button[^>]*data-testid="quiz-exit-confirm"[^>]*disabled=""/);
    // ModalOverlay's Escape and backdrop route both close only the dialog.
    modal.props.onClose();
    expect(controller().showExitConfirm).toBe(false);
    expect(controller().pendingAttempt!.clientAttemptId).toBe(pendingId);
    expect(controller().screen).toBe('RUNNING');
    expect(onBack).not.toHaveBeenCalled();
    const firstRequest = [...api.recordQuizAttempt.mock.calls[0]];
    await controller().handleRetrySave();
    await vi.waitFor(() => expect(controller().pendingAttempt).toBeNull());
    expect(api.recordQuizAttempt.mock.calls[1]).toEqual(firstRequest);
    expect(firstRequest[11]).toBe(pendingId);
    expect(controller().score).toBe(1);
    expect(controller().confirmExitRunning()).toBe(true);
  });

  it('retains full-book setup and ordinary exit behavior for a standard quiz', async () => {
    await load(null);
    expect(controller(null).isScopedSession).toBe(false);
    expect(api.getWordsByBook).toHaveBeenCalledWith(NARU_BOOK_ID);
    controller(null).updateSetupConfig({ selectionMode: 'RANGE_RANDOM', rangeStart: 354, rangeEnd: 1285 });
    expect(controller(null).setupCandidateWords).toEqual([noun]);
    const ready = controller(null); ready.startQuiz(ready.setupConfig);
    const onBack = vi.fn();
    findElement(view(onBack, null), QuizHeader)!.props.onBack();
    findElement(view(onBack, null), QuizExitConfirmDialog)!.props.onConfirm();
    expect(onBack).not.toHaveBeenCalled();
    expect(controller(null).screen).toBe('SETUP');
    expect(findElement(view(onBack, null), QuizSetupView)).toBeDefined();
  });
});


describe('restored Naru quiz chapter content through the real controller', () => {
  const boundaryWords: WordData[] = [
    { id: 'adverb-before', bookId: NARU_BOOK_ID, number: 1371, word: 'elsewhere', definition: '他の場所で', partOfSpeech: 'adverb' },
    { id: 'adverb-last', bookId: NARU_BOOK_ID, number: 1372, word: 'away', definition: '離れて', partOfSpeech: 'adverb' },
    { id: 'adjective-first', bookId: NARU_BOOK_ID, number: 1373, word: 'able', definition: 'できる', partOfSpeech: 'adjective' },
    { id: 'adjective-last', bookId: NARU_BOOK_ID, number: 1531, word: 'young', definition: '若い', partOfSpeech: 'adjective' },
  ];
  it.each([
    [{ start: 1286, end: 1371 }, ['adverb-before', 'adverb-last']],
    [{ start: 1372, end: 1530 }, ['adjective-first', 'adjective-last']],
  ] as const)('requests and quizzes complete same-POS content after restoring %j', async (oldRange, expectedIds) => {
    const legacy = createFollowUpSpellingTaskIntent(NARU_BOOK_ID, oldRange);
    const restored = normalizeNaruChapterQuizTask(NARU_BOOK_ID, legacy)!;
    api.getBookSession.mockResolvedValue(boundaryWords);
    await load(restored);
    expect(api.getBookSession).toHaveBeenCalledWith(user.uid, NARU_BOOK_ID, 5, restored);
    expect(controller(restored).allWords.map(word => word.id)).toEqual(expectedIds);
    expect(controller(restored).questions.map(question => question.wordId).sort()).toEqual([...expectedIds].sort());
    expect(controller(restored).screen).toBe('RUNNING');
  });
});
