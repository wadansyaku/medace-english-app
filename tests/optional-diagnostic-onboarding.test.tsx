import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Runs the real callbacks with persistent state; browser/layout evidence belongs
// to the smoke suite, rather than this deliberately small hook harness.
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }));
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
  };
  return { ...original, ...hooks, default: { ...original.default, ...hooks } };
});
const api = vi.hoisted(() => ({ saveLearningPreference: vi.fn(), updateSessionUser: vi.fn() }));
vi.mock('../services/dashboard', () => ({ dashboardService: api }));
vi.mock('../services/session', () => ({ sessionService: api }));

import Onboarding from '../components/Onboarding';
import OnboardingChoiceStep from '../components/onboarding/OnboardingChoiceStep';
import OnboardingProfileStep from '../components/onboarding/OnboardingProfileStep';
import OnboardingTestStep from '../components/onboarding/OnboardingTestStep';
import OnboardingResultStep from '../components/onboarding/OnboardingResultStep';
import { useOnboardingController } from '../hooks/useOnboardingController';
import { DIAGNOSTIC_QUESTIONS } from '../data/diagnostic';
import { UserGrade, UserRole, type UserProfile } from '../types';

const user: UserProfile = { uid: 'optional-diagnostic-learner', email: 'optional@example.invalid', displayName: '架空生徒', role: UserRole.STUDENT, needsOnboarding: true };
const renderHook = <T,>(hook: () => T): T => { harness.cursor = 0; return hook(); };
const fixture = (isRetake = false) => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  const render = () => renderHook(() => useOnboardingController({ user, onComplete, isRetake }));
  const view = () => renderHook(() => Onboarding({ user, onComplete, isRetake, onCancel })) as ReactElement<any>;
  const answerAll = () => {
    render().handleChooseDiagnostic();
    render().setSelfAssessment('FOUNDATION');
    render().handleStart();
    DIAGNOSTIC_QUESTIONS.forEach((question) => {
      render().handleSelectAnswer(question.answer);
      render().handleNext();
    });
  };
  return { render, view, onComplete, onCancel, answerAll };
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  harness.slots = []; harness.cursor = 0;
  vi.resetAllMocks();
  api.saveLearningPreference.mockResolvedValue(undefined);
  api.updateSessionUser.mockResolvedValue(undefined);
});

describe('optional first diagnostic', () => {
  it('opens the choice screen initially and preserves the manual diagnostic entry', () => {
    const first = fixture();
    expect(first.render().step).toBe('CHOICE');
    expect(first.view().type).toBe(OnboardingChoiceStep);
    first.view().props.onChooseDiagnostic();
    expect(first.render().step).toBe('PROFILE');
    expect(first.view().type).toBe(OnboardingProfileStep);
    harness.slots = [];
    const retake = fixture(true);
    expect(retake.render().step).toBe('PROFILE');
    expect(retake.view().type).toBe(OnboardingProfileStep);
    retake.view().props.onCancel();
    expect(retake.onCancel).toHaveBeenCalledTimes(1);
    expect(retake.render().step).toBe('PROFILE');
  });

  it('defers without inventing a level, saving preferences or applying profile selections', async () => {
    const f = fixture();
    f.render().setSelectedGrade(UserGrade.JHS1);
    f.render().setSelfAssessment('FOUNDATION');
    await f.render().deferDiagnostic();
    expect(api.updateSessionUser).toHaveBeenCalledTimes(1);
    const saved = api.updateSessionUser.mock.calls[0][0];
    expect(saved).toEqual({ ...user, needsOnboarding: false, diagnosticDeferredAt: expect.any(Number) });
    expect(saved.englishLevel).toBeUndefined();
    expect(saved.grade).toBeUndefined();
    expect(api.saveLearningPreference).not.toHaveBeenCalled();
    expect(f.onComplete).toHaveBeenCalledWith(saved);
    await f.render().deferDiagnostic();
    expect(api.updateSessionUser).toHaveBeenCalledTimes(1);
  });

  it('keeps failed deferral retryable with selections intact and completes only after success', async () => {
    const f = fixture();
    f.render().setSelectedGrade(UserGrade.JHS1);
    f.render().setSelfAssessment('FOUNDATION');
    api.updateSessionUser.mockRejectedValueOnce(new Error('synthetic transport failure'));
    await f.render().deferDiagnostic();
    expect(f.onComplete).not.toHaveBeenCalled();
    expect(f.render()).toMatchObject({ step: 'CHOICE', selectedGrade: UserGrade.JHS1, selfAssessment: 'FOUNDATION', isSaving: false });
    expect(f.render().saveError).toContain('もう一度');
    expect(renderToStaticMarkup(f.view())).toContain('onboarding-defer-error');
    await f.render().deferDiagnostic();
    expect(f.onComplete).toHaveBeenCalledTimes(1);
    expect(f.render().saveError).toBeNull();
    expect(api.saveLearningPreference).not.toHaveBeenCalled();
  });

  it('blocks same-tick duplicate deferral and diagnostic navigation while saving', async () => {
    const f = fixture();
    const pending = deferred();
    api.updateSessionUser.mockReturnValueOnce(pending.promise);
    const first = f.render().deferDiagnostic();
    const second = f.render().deferDiagnostic();
    f.render().handleChooseDiagnostic();
    f.render().handleReturnToChoice();
    expect(f.render()).toMatchObject({ step: 'CHOICE', isSaving: true });
    expect(f.render().isSavePending()).toBe(true);
    expect(api.updateSessionUser).toHaveBeenCalledTimes(1);
    expect(f.onComplete).not.toHaveBeenCalled();
    const markup = renderToStaticMarkup(f.view());
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('role="status"');
    pending.resolve(); await Promise.all([first, second]);
    expect(f.onComplete).toHaveBeenCalledTimes(1);
  });

  it('returns from profile and an unfinished test without saving any inferred score', async () => {
    const f = fixture();
    f.render().handleChooseDiagnostic();
    f.view().props.onCancel();
    expect(f.render().step).toBe('CHOICE');
    f.render().handleChooseDiagnostic();
    f.render().setSelfAssessment('FOUNDATION');
    f.render().handleStart();
    f.render().handleSelectAnswer(DIAGNOSTIC_QUESTIONS[0].answer);
    f.render().handleNext();
    expect(f.view().type).toBe(OnboardingTestStep);
    expect(renderToStaticMarkup(f.view())).toContain('診断をやめる');
    f.view().props.onCancel();
    expect(f.render()).toMatchObject({ step: 'CHOICE', answeredCount: 0, currentQuestionIndex: 0, result: null, finalLevel: null });
    expect(api.updateSessionUser).not.toHaveBeenCalled();
    expect(api.saveLearningPreference).not.toHaveBeenCalled();
    await f.render().deferDiagnostic();
    expect(api.updateSessionUser.mock.calls[0][0].englishLevel).toBeUndefined();
    expect(f.onCancel).not.toHaveBeenCalled();
  });

  it('lets first users leave a full result without saving and restarts with no old answers', () => {
    const f = fixture();
    f.answerAll();
    expect(f.render().answeredCount).toBe(12);
    expect(f.view().type).toBe(OnboardingResultStep);
    expect(renderToStaticMarkup(f.view())).toContain('保存せず戻る');
    f.view().props.onCancel();
    expect(f.render()).toMatchObject({ step: 'CHOICE', answeredCount: 0, result: null, finalLevel: null });
    f.render().handleChooseDiagnostic();
    f.render().handleStart();
    expect(f.render()).toMatchObject({ step: 'TEST', answeredCount: 0, currentAnswer: '', currentQuestionIndex: 0 });
    expect(api.updateSessionUser).not.toHaveBeenCalled();
    expect(api.saveLearningPreference).not.toHaveBeenCalled();
  });

  it('still evaluates the complete twelve answers and saves the normal diagnosed level', async () => {
    const f = fixture();
    f.answerAll();
    const result = f.render().result;
    expect(result?.totalQuestions).toBe(12);
    expect(result?.correctCount).toBe(12);
    expect(f.render().step).toBe('RESULT');
    await f.render().saveResult();
    expect(api.saveLearningPreference).toHaveBeenCalledTimes(1);
    expect(api.updateSessionUser).toHaveBeenCalledWith(expect.objectContaining({ englishLevel: result?.level, needsOnboarding: false }));
    expect(api.updateSessionUser.mock.calls[0][0].diagnosticDeferredAt).toBeUndefined();
    expect(f.onComplete).toHaveBeenCalledTimes(1);
  });

  it('blocks result cancellation until both diagnosed writes finish', async () => {
    const f = fixture();
    f.answerAll();
    const pending = deferred();
    api.saveLearningPreference.mockReturnValueOnce(pending.promise);
    const save = f.render().saveResult();
    f.view().props.onCancel();
    expect(f.render().step).toBe('RESULT');
    expect(renderToStaticMarkup(f.view())).toMatch(/disabled=""[^>]*>[\s\S]*?保存せず戻る/);
    pending.resolve(); await save;
    expect(f.onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not defer from a manual retake or from an in-progress diagnostic', async () => {
    const f = fixture(true);
    await f.render().deferDiagnostic();
    expect(api.updateSessionUser).not.toHaveBeenCalled();
    harness.slots = [];
    const first = fixture();
    first.render().handleChooseDiagnostic();
    await first.render().deferDiagnostic();
    expect(api.updateSessionUser).not.toHaveBeenCalled();
  });
});
