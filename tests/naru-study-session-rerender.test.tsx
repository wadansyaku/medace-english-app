import React, { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Separate component hook slots; run the real controller load/receipt effects.
// This models a parent render without mistaking the child for a remount.
const harness = vi.hoisted(() => ({ component: 'outer', cursor: 0,
  slots: new Map<string, any[]>(), effects: new Map<string, () => void | (() => void)>(),
  cleanups: new Map<string, () => void>(), controller: null as any }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  const slot = () => {
    const index = harness.cursor++;
    if (!harness.slots.has(harness.component)) harness.slots.set(harness.component, []);
    return { index, values: harness.slots.get(harness.component)!, key: `${harness.component}:${index}` };
  };
  const useEffect = (effect: () => void | (() => void), deps: unknown[]) => {
    const { index, values, key } = slot(); const previous = values[index] as unknown[] | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      values[index] = deps; harness.effects.set(key, effect);
    }
  };
  const hooks = {
    useState: (initial: any) => {
      const { index, values } = slot();
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (next: any) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef: (initial: unknown) => {
      const { index, values } = slot();
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useMemo: (factory: () => unknown, deps: unknown[]) => {
      const { index, values } = slot(); const previous = values[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) values[index] = { deps, value: factory() };
      return values[index].value;
    }, useEffect, useLayoutEffect: useEffect,
  };
  return { ...actual, ...hooks, default: { ...actual.default, ...hooks } };
});
const api = vi.hoisted(() => ({ getBookSession: vi.fn(), getBooks: vi.fn(), saveSRSHistory: vi.fn(),
  addXP: vi.fn(), getDashboardSnapshot: vi.fn(), event: vi.fn() }));
vi.mock('../services/learning', () => ({ learningService: api }));
vi.mock('../services/productEvents', () => ({ recordClientProductEvent: api.event }));
vi.mock('../hooks/useIsMobileViewport', () => ({ default: () => false }));
vi.mock('../hooks/useStudyModeController', async importOriginal => {
  const actual = await importOriginal<typeof import('../hooks/useStudyModeController')>();
  return { ...actual, useStudyModeController: (params: Parameters<typeof actual.useStudyModeController>[0]) => {
    harness.controller = actual.useStudyModeController(params); return harness.controller;
  } };
});

import StudyMode from '../components/StudyMode';
import { createNaruChapterTask } from '../shared/naruStudy';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../shared/naruBook';
import { UserRole, type LearningTaskIntent, type UserProfile, type WordData } from '../types';

const user: UserProfile = { uid: 'synthetic-rerender', displayName: 'Synthetic', role: UserRole.STUDENT, email: 'synthetic@example.invalid' };
const words: WordData[] = [1, 2].map(number => ({ id: `word-${number}`, bookId: NARU_BOOK_ID, number, word: `word${number}`, definition: `meaning${number}` }));
let props: React.ComponentProps<typeof StudyMode>;
const outer = () => {
  harness.component = 'outer'; harness.cursor = 0;
  return StudyMode(props) as ReactElement<React.ComponentProps<typeof StudyMode>>;
};
const render = () => {
  const session = outer(); harness.component = 'session'; harness.cursor = 0;
  (session.type as (input: typeof session.props) => ReactElement)(session.props);
  return harness.controller as ReturnType<typeof import('../hooks/useStudyModeController').useStudyModeController>;
};
const flushEffects = () => {
  const effects = [...harness.effects]; harness.effects.clear();
  for (const [key, effect] of effects) {
    harness.cleanups.get(key)?.(); const cleanup = effect();
    if (cleanup) harness.cleanups.set(key, cleanup); else harness.cleanups.delete(key);
  }
};
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const load = async () => { render(); flushEffects(); await settle(); expect(render().loading).toBe(false); };
beforeEach(() => {
  harness.slots.clear(); harness.effects.clear(); harness.cleanups.clear(); harness.controller = null;
  vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), speechSynthesis: { getVoices: () => [] } });
  vi.stubGlobal('CSS', { supports: () => true });
  props = { user, bookId: NARU_BOOK_ID, taskIntent: createNaruChapterTask(NARU_RANGE_PRESETS[1], 'new', true),
    onBack: vi.fn(), onSessionComplete: vi.fn(), onStartTask: vi.fn() };
  api.getBookSession.mockResolvedValue(words); api.getBooks.mockResolvedValue([]); api.saveSRSHistory.mockResolvedValue(undefined);
  api.addXP.mockResolvedValue({ user, leveledUp: false }); api.getDashboardSnapshot.mockResolvedValue({ weaknessProfile: null }); api.event.mockResolvedValue(undefined);
});
afterEach(() => { harness.cleanups.forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Naru session survives a parent render', () => {
  it.each(['new', 'due'] as const)('preserves the active card, queue and pending %s answer', async kind => {
    props.taskIntent = createNaruChapterTask(NARU_RANGE_PRESETS[1], kind, true);
    let saved!: () => void;
    api.saveSRSHistory.mockReturnValue(new Promise<void>(resolve => { saved = resolve; }));
    await load(); const originalTask = api.getBookSession.mock.calls[0][3];
    render().openBack(); const pending = render().handleRating(2);
    props = { ...props, user: { ...user, displayName: 'Refreshed profile' }, onBack: vi.fn() };
    render(); flushEffects();
    expect(api.getBookSession).toHaveBeenCalledTimes(1);
    expect(render()).toMatchObject({ loading: false, currentIndex: 0, isFlipped: true, selectedRating: 2, isAdvancingCard: true });
    expect(render().queue).toEqual(words);
    expect(api.saveSRSHistory).toHaveBeenCalledTimes(1);
    saved(); await settle(); await vi.advanceTimersByTimeAsync(401); await pending;
    const advanced = render(); flushEffects();
    expect(advanced.currentIndex).toBe(1); expect(advanced.currentWord.id).toBe(words[1].id);
    expect(api.getBookSession).toHaveBeenCalledTimes(1);
    expect(outer().props.taskIntent).toBe(originalTask);
    expect(api.addXP).not.toHaveBeenCalled();
  });

  it('normalizes a legacy chapter once and reloads only for a newly selected task', async () => {
    props.taskIntent = { ...createNaruChapterTask(NARU_RANGE_PRESETS[0], 'new', true), wordRange: { start: 1, end: 1530 } };
    await load(); const normalized = outer().props.taskIntent;
    expect(normalized?.wordRange).toEqual({ start: NARU_RANGE_PRESETS[0].start, end: NARU_RANGE_PRESETS[0].end });
    render(); flushEffects(); expect(api.getBookSession).toHaveBeenCalledTimes(1);
    expect(outer().props.taskIntent).toBe(normalized);
    props = { ...props, taskIntent: createNaruChapterTask(NARU_RANGE_PRESETS[2], 'due', true) };
    render(); flushEffects(); await settle();
    expect(api.getBookSession).toHaveBeenCalledTimes(2);
    expect(api.getBookSession.mock.calls[1][3]).toMatchObject({ selectionPolicy: 'BOOK_DUE_ONLY', wordRange: { start: NARU_RANGE_PRESETS[2].start, end: NARU_RANGE_PRESETS[2].end } });
  });

  it('retains the same receipt and rating when a parent render occurs before retry', async () => {
    api.saveSRSHistory.mockRejectedValueOnce(new Error('response lost'));
    await load(); render().openBack(); await render().handleRating(1);
    props = { ...props, onSessionComplete: vi.fn() }; render(); flushEffects();
    expect(api.getBookSession).toHaveBeenCalledTimes(1); expect(render().saveError).toBeTruthy();
    const retry = render().retrySave(); await settle(); await vi.advanceTimersByTimeAsync(401); await retry;
    expect(api.saveSRSHistory.mock.calls[1]).toEqual(api.saveSRSHistory.mock.calls[0]);
    expect(render().currentIndex).toBe(1);
  });

  it('passes a mission range through unchanged', () => {
    const task: LearningTaskIntent = { ...createNaruChapterTask(NARU_RANGE_PRESETS[1], 'new', true),
      missionAssignmentId: 'synthetic-mission', wordRange: { start: 10, end: 30 } };
    props.taskIntent = task;
    expect(outer().props.taskIntent).toBe(task);
  });
});
