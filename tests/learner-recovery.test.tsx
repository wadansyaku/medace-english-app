import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A hook-level harness, like the existing pending-input tests. It runs the real
// controller callbacks and effects without claiming browser/layout evidence.
const harness = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0,
  pendingEffects: new Map<number, () => void | (() => void)>(),
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
        harness.pendingEffects.set(index, effect);
      }
    },
  };
  return { ...original, ...hooks, default: { ...original.default, ...hooks } };
});
const api = vi.hoisted(() => ({
  getWordsByBook: vi.fn(), getStudiedWordIdsByBook: vi.fn(),
  getBookSession: vi.fn(), getDailySessionWords: vi.fn(),
  generateGrammarPracticeQuestions: vi.fn(),
  saveLearningPreference: vi.fn(), updateSessionUser: vi.fn(),
  getBooks: vi.fn(), recordClientProductEvent: vi.fn(),
}));
vi.mock('../services/learning', () => ({ learningService: api }));
vi.mock('../services/gemini', () => ({ generateGrammarPracticeQuestions: api.generateGrammarPracticeQuestions, evaluateJapaneseTranslationAnswer: vi.fn() }));
vi.mock('../services/dashboard', () => ({ dashboardService: api }));
vi.mock('../services/session', () => ({ sessionService: api }));
vi.mock('../services/productEvents', () => ({ recordClientProductEvent: api.recordClientProductEvent }));

import QuizMode from '../components/QuizMode';
import OfficialCatalogAccessPanel from '../components/OfficialCatalogAccessPanel';
import OnboardingResultStep from '../components/onboarding/OnboardingResultStep';
import { useQuizModeController } from '../hooks/useQuizModeController';
import { useOnboardingController } from '../hooks/useOnboardingController';
import { DIAGNOSTIC_QUESTIONS } from '../data/diagnostic';
import { UserRole, type UserProfile, type WordData } from '../types';

const user: UserProfile = { uid: 'synthetic-learner', email: 'learner@example.invalid', displayName: '架空生徒', role: UserRole.STUDENT, needsOnboarding: true };
const words: WordData[] = [{ id: 'w1', bookId: 'b1', number: 1, word: 'study', definition: '学習する', exampleSentence: 'I study English.' }];
const renderHook = <T,>(hook: () => T): T => { harness.cursor = 0; return hook(); };
const flushEffects = () => {
  const pending = [...harness.pendingEffects];
  harness.pendingEffects.clear();
  pending.forEach(([index, effect]) => {
    harness.cleanups.get(index)?.();
    const cleanup = effect();
    if (cleanup) harness.cleanups.set(index, cleanup);
  });
};
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const quiz = () => renderHook(() => useQuizModeController({ user, bookId: 'b1' }));
const quizMarkup = () => renderToStaticMarkup(renderHook(() => QuizMode({ user, bookId: 'b1', onBack: vi.fn() })));
const catalogMarkup = () => renderToStaticMarkup(renderHook(() => OfficialCatalogAccessPanel({ user: { ...user, role: UserRole.INSTRUCTOR }, onSelectBook: vi.fn() })));
const resultController = (onComplete = vi.fn()) => {
  const render = () => renderHook(() => useOnboardingController({ user, onComplete }));
  render().setSelfAssessment('FOUNDATION');
  render().handleStart();
  DIAGNOSTIC_QUESTIONS.forEach((question) => {
    render().handleSelectAnswer(question.answer);
    render().handleNext();
  });
  expect(render().step).toBe('RESULT');
  return { render, onComplete };
};

beforeEach(() => {
  harness.cleanups.forEach((cleanup) => cleanup());
  harness.slots = []; harness.cursor = 0; harness.pendingEffects.clear(); harness.cleanups.clear();
  vi.clearAllMocks();
  api.getWordsByBook.mockResolvedValue(words);
  api.getStudiedWordIdsByBook.mockResolvedValue([]);
  api.getBooks.mockResolvedValue([]);
  api.generateGrammarPracticeQuestions.mockResolvedValue([]);
  api.saveLearningPreference.mockResolvedValue(undefined);
  api.updateSessionUser.mockResolvedValue(undefined);
  api.recordClientProductEvent.mockResolvedValue(undefined);
});

describe('quiz recovery keeps failure distinct from confirmed empty material', () => {
  it('renders a retryable load failure and recovers to the confirmed material', async () => {
    api.getWordsByBook.mockRejectedValueOnce(new Error('synthetic transport failure'));
    quiz(); flushEffects();
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    const failed = quizMarkup();
    expect(failed).toContain('quiz-load-error');
    expect(failed).toContain('もう一度読み込む');
    expect(failed).not.toContain('先に単語帳を1冊用意');
    quiz().retryLoad(); quiz(); flushEffects();
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    expect(quiz().loadError).toBeNull();
    expect(quiz().allWords).toEqual(words);
    expect(quizMarkup()).not.toContain('quiz-load-error');
  });

  it('continues to show an actual empty book as empty after a successful read', async () => {
    api.getWordsByBook.mockResolvedValue([]);
    quiz(); flushEffects();
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    const empty = quizMarkup();
    expect(empty).toContain('quiz-empty-state');
    expect(empty).toContain('先に単語帳を1冊用意');
    expect(empty).not.toContain('quiz-load-error');
  });

  it('keeps full-range quizzes available when the optional learned-history read fails', async () => {
    api.getStudiedWordIdsByBook.mockRejectedValueOnce(new Error('synthetic history failure'));
    quiz(); flushEffects();
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    expect(quiz().loadError).toBeNull();
    expect(quiz().allWords).toEqual(words);
    expect(quiz().setupConfig.selectionMode).toBe('FULL_RANDOM');
    expect(quiz().setupActualQuestionCount).toBe(1);
    const markup = quizMarkup();
    expect(markup).toContain('quiz-history-error');
    expect(markup).toMatch(/<button[^>]*data-testid="quiz-selection-learned_only"[^>]*disabled=""/);
    const ready = quiz();
    ready.startQuiz(ready.setupConfig);
    expect(quiz().screen).toBe('RUNNING');
  });

  it('does not claim zero learned words after failed history and retries without resetting the chosen conditions', async () => {
    api.getStudiedWordIdsByBook.mockRejectedValueOnce(new Error('synthetic history failure'));
    quiz(); flushEffects();
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    quiz().updateSetupConfig({ selectionMode: 'LEARNED_ONLY', questionCount: 10 });
    const unavailable = quiz();
    expect(unavailable.setupEmptyCopy).toContain('学習済みの記録を確認できませんでした');
    expect(unavailable.setupEmptyCopy).not.toContain('先にカード学習で評価');
    unavailable.startQuiz(unavailable.setupConfig);
    expect(quiz().screen).toBe('SETUP');
    expect(quizMarkup()).toContain('全範囲から出題する');
    api.getStudiedWordIdsByBook.mockResolvedValueOnce(['w1']);
    const first = unavailable.retryStudiedWords();
    const second = unavailable.retryStudiedWords();
    expect(api.getStudiedWordIdsByBook).toHaveBeenCalledTimes(2);
    await Promise.all([first, second]);
    expect(quiz().studiedWordsError).toBeNull();
    expect(quiz().historyLoading).toBe(false);
    expect(quiz().setupConfig).toMatchObject({ selectionMode: 'LEARNED_ONLY', questionCount: 10 });
    expect(quiz().setupActualQuestionCount).toBe(1);
    expect(quizMarkup()).not.toContain('quiz-history-error');
    expect(api.getWordsByBook).toHaveBeenCalledTimes(1);
  });

  it('catches generation failure, retains the selected config and guards same-tick starts', async () => {
    quiz(); flushEffects();
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    const generation = deferred();
    api.generateGrammarPracticeQuestions.mockReturnValueOnce(generation.promise);
    quiz().updateSetupConfig({ questionMode: 'GRAMMAR_CLOZE', questionCount: 10 });
    const ready = quiz();
    ready.startQuiz(ready.setupConfig);
    ready.startQuiz(ready.setupConfig);
    expect(api.generateGrammarPracticeQuestions).toHaveBeenCalledTimes(1);
    generation.reject(new Error('synthetic generation failure'));
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    expect(quiz().allWords).toEqual(words);
    expect(quiz().setupConfig).toMatchObject({ questionMode: 'GRAMMAR_CLOZE', questionCount: 10 });
    expect(quizMarkup()).toContain('quiz-start-error');
    quiz().retryStart();
    await vi.waitFor(() => expect(quiz().loading).toBe(false));
    expect(quiz().startError).toBeNull();
    expect(quiz().screen).toBe('RUNNING');
    expect(api.generateGrammarPracticeQuestions).toHaveBeenCalledTimes(2);
  });
});

describe('onboarding result persistence', () => {
  it('keeps the result retryable and incomplete when its preferences cannot save', async () => {
    const completed = vi.fn();
    const f = resultController(completed);
    const result = f.render().result;
    api.saveLearningPreference.mockRejectedValueOnce(new Error('synthetic preference failure'));
    await f.render().saveResult();
    expect(api.updateSessionUser).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    const failed = f.render();
    expect(failed.result).toBe(result);
    expect(failed.saveError).toContain('もう一度保存');
    const markup = renderToStaticMarkup(<OnboardingResultStep result={failed.result!} finalLevel={failed.finalLevel!} isSaving={false} saveError={failed.saveError} isRetake={false} onSave={failed.saveResult} />);
    expect(markup).toContain('onboarding-save-error');
    expect(markup).toContain('診断結果をもう一度保存する');
    await f.render().saveResult();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(api.saveLearningPreference.mock.invocationCallOrder[1]).toBeLessThan(api.updateSessionUser.mock.invocationCallOrder[0]);
  });

  it('blocks a duplicate save and completion until both writes finish', async () => {
    const f = resultController();
    const preference = deferred();
    api.saveLearningPreference.mockReturnValueOnce(preference.promise);
    const original = f.render();
    const first = original.saveResult();
    const second = original.saveResult();
    expect(original.isSavePending()).toBe(true);
    expect(api.saveLearningPreference).toHaveBeenCalledTimes(1);
    expect(api.updateSessionUser).not.toHaveBeenCalled();
    expect(f.onComplete).not.toHaveBeenCalled();
    const pending = f.render();
    const tree = OnboardingResultStep({ result: pending.result!, finalLevel: pending.finalLevel!, isSaving: true, isRetake: true, onCancel: vi.fn(), onSave: pending.saveResult }) as ReactElement;
    const markup = renderToStaticMarkup(tree);
    expect(markup).toMatch(/disabled=""[^>]*>[\s\S]*?閉じる/);
    preference.resolve(); await Promise.all([first, second]);
    expect(api.updateSessionUser).toHaveBeenCalledTimes(1);
    expect(f.onComplete).toHaveBeenCalledTimes(1);
    expect(f.render().isSavePending()).toBe(false);
  });

  it('does not complete after a session-update failure and can retry the retained result', async () => {
    const f = resultController();
    api.updateSessionUser.mockRejectedValueOnce(new Error('synthetic profile failure'));
    await f.render().saveResult();
    expect(f.onComplete).not.toHaveBeenCalled();
    expect(f.render().saveError).toBeTruthy();
    expect(f.render().step).toBe('RESULT');
    await f.render().saveResult();
    expect(f.render().saveError).toBeNull();
    expect(f.onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('teacher catalog confirmed-data states', () => {
  it('shows unknown counts through loading and failure, then retries a confirmed empty catalog', async () => {
    api.getBooks.mockRejectedValueOnce(new Error('synthetic catalog failure'));
    expect(catalogMarkup()).toContain('教材を確認中');
    expect(catalogMarkup()).not.toContain('0 / 0 冊 利用可');
    flushEffects();
    await vi.waitFor(() => expect(catalogMarkup()).toContain('official-catalog-load-error'));
    const failed = catalogMarkup();
    expect(failed).toContain('件数は未確認');
    expect(failed).toContain('もう一度読み込む');
    expect(failed).not.toContain('この体験アカウント');
    const tree = renderHook(() => OfficialCatalogAccessPanel({ user: { ...user, role: UserRole.INSTRUCTOR }, onSelectBook: vi.fn() })) as ReactElement<any>;
    const findButton = (value: any): any => {
      if (Array.isArray(value)) return value.map(findButton).find(Boolean);
      if (!React.isValidElement(value)) return undefined;
      const node = value as ReactElement<any>;
      if (node.type === 'button' && node.props.onClick) return node;
      return findButton(node.props.children);
    };
    findButton(tree).props.onClick(); catalogMarkup(); flushEffects();
    await vi.waitFor(() => expect(catalogMarkup()).toContain('0 / 0 冊 利用可'));
    expect(catalogMarkup()).toContain('教材の配布設定を教室の管理者に確認');
    expect(catalogMarkup()).not.toContain('この体験アカウント');
  });
});
