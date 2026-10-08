import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real controller and button handlers. Browser checks cover geometry.
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0,
  effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>() }));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  const useEffect = (effect: () => void | (() => void), deps: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, position) => !Object.is(value, previous[position]))) {
      harness.slots[index] = deps; harness.effects.set(index, effect);
    }
  };
  const hooks = {
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: any) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.slots[index], (next: any) => { harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next; }];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    }, useEffect, useLayoutEffect: useEffect,
  };
  return { ...original, ...hooks, default: { ...original.default, ...hooks } };
});
const api = vi.hoisted(() => ({ getBookSession: vi.fn(), getBooks: vi.fn(), saveSRSHistory: vi.fn(),
  addXP: vi.fn(), getDashboardSnapshot: vi.fn(), recordClientProductEvent: vi.fn() }));
vi.mock('../services/learning', () => ({ learningService: api }));
vi.mock('../services/productEvents', () => ({ recordClientProductEvent: api.recordClientProductEvent }));
vi.mock('../hooks/useIsMobileViewport', () => ({ default: () => false }));
// Audio has its own real-browser acceptance; this controller harness has no DOM.
vi.mock('../hooks/useWordPronunciation', () => ({ useWordPronunciation: () => ({
  muted: false, status: 'idle', message: null, speak: vi.fn(), stop: vi.fn(), toggleMuted: vi.fn(),
}) }));

import StudyMode from '../components/StudyMode';
import { useStudyModeController } from '../hooks/useStudyModeController';
import { UserRole, type UserProfile, type WordData } from '../types';

const user: UserProfile = { uid: 'synthetic', email: 'synthetic@example.invalid', displayName: '架空生徒', role: UserRole.STUDENT };
const words: WordData[] = [1, 2].map(number => ({ id: `word-${number}`, bookId: 'synthetic-book', number, word: `word${number}`, definition: `meaning${number}` }));
const params = { user, bookId: 'synthetic-book', onSessionComplete: vi.fn() };
const render = <T,>(fn: () => T): T => { harness.cursor = 0; return fn(); };
const controller = () => render(() => useStudyModeController(params));
const view = () => render(() => {
  const session = StudyMode({ ...params, onBack: vi.fn(), onStartTask: vi.fn() }) as ReactElement<any>;
  return (session.type as (props: any) => ReactElement)(session.props);
});
const find = (tree: ReactElement<any>, id: string): ReactElement<any> | undefined => {
  if (tree.props['data-testid'] === id) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    if (React.isValidElement(child)) { const found = find(child, id); if (found) return found; }
  }
  return undefined;
};
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const load = async () => {
  controller();
  const effects = [...harness.effects]; harness.effects.clear();
  effects.forEach(([index, effect]) => { const cleanup = effect(); if (cleanup) harness.cleanups.set(index, cleanup); });
  await settle(); expect(controller().loading).toBe(false);
  controller().openBack();
};

beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects.clear(); harness.cleanups.clear();
  vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: false }), speechSynthesis: { getVoices: () => [] } });
  vi.stubGlobal('CSS', { supports: () => true });
  api.getBookSession.mockResolvedValue(words); api.getBooks.mockResolvedValue([]);
  api.saveSRSHistory.mockResolvedValue(undefined); api.addXP.mockResolvedValue({ user, leveledUp: false });
  api.getDashboardSnapshot.mockResolvedValue({ weaknessProfile: null }); api.recordClientProductEvent.mockResolvedValue(undefined);
});
afterEach(() => {
  harness.cleanups.forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('accepted study rating feedback', () => {
  it('keeps translation provenance on the meaning face and clears it when advancing to an original word', async () => {
    api.getBookSession.mockResolvedValue([{ ...words[0], aichiExamAppeared: true, definitionSupplemented: true }, words[1]]);
    await load();
    const back = find(view(), 'study-card-back')!;
    expect(back.props['aria-hidden']).toBe(false);
    expect(renderToStaticMarkup(back)).toContain('訳・例文訳：アプリ補完（辞書を参照）');
    const pending = controller().handleRating(3);
    await settle(); await vi.advanceTimersByTimeAsync(400); await pending;
    await vi.advanceTimersByTimeAsync(1);
    expect(controller().currentIndex).toBe(1);
    controller().openBack();
    expect(renderToStaticMarkup(find(view(), 'study-card-back')!)).not.toContain('word-definition-supplement-note');
  });

  it.each([false, true])('shows the accepted button for at least 400ms, including reduced motion: %s', async reducedMotion => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: reducedMotion }), speechSynthesis: { getVoices: () => [] } });
    await load();
    find(view(), 'study-rate-2')!.props.onClick({ stopPropagation: vi.fn() });
    expect(controller().selectedRating).toBe(2);
    expect(find(view(), 'study-rate-2')!.props['aria-pressed']).toBe(true);
    expect(find(view(), 'study-rate-3')!.props['aria-pressed']).toBe(false);
    expect(find(view(), 'study-rate-2')!.props.disabled).toBe(true);
    await settle(); await vi.advanceTimersByTimeAsync(399);
    expect(controller().currentIndex).toBe(0);
    expect(controller().isAdvancingCard).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(controller().currentIndex).toBe(1);
    expect(controller().selectedRating).toBeNull();
    expect(controller().isFlipped).toBe(false);
    expect(api.saveSRSHistory).toHaveBeenCalledTimes(1);
  });

  it('waits for saving and does not add another 400ms after a slow response', async () => {
    let save!: () => void;
    api.saveSRSHistory.mockReturnValue(new Promise<void>(resolve => { save = resolve; }));
    await load(); const pending = controller().handleRating(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(controller().currentIndex).toBe(0);
    expect(controller().selectedRating).toBe(1);
    save(); await pending; await vi.advanceTimersByTimeAsync(1);
    expect(controller().currentIndex).toBe(1);
  });

  it('locks rapid ratings and retries the same attempt, rating and response time after failure', async () => {
    api.saveSRSHistory.mockRejectedValueOnce(new Error('response lost'));
    await load(); const first = controller().handleRating(1);
    void controller().handleRating(3); await first;
    expect(controller().saveError).toBeTruthy();
    expect(controller().selectedRating).toBe(1);
    expect(controller().currentIndex).toBe(0);
    expect(api.saveSRSHistory).toHaveBeenCalledTimes(1);
    const retry = controller().retrySave(); await vi.advanceTimersByTimeAsync(400); await retry;
    await vi.advanceTimersByTimeAsync(1);
    expect(api.saveSRSHistory.mock.calls[1]).toEqual(api.saveSRSHistory.mock.calls[0]);
    expect(api.addXP).not.toHaveBeenCalled();
    expect(controller().currentIndex).toBe(1);
  });

  it('keeps the final accepted rating visible before finishing and awards XP once', async () => {
    api.getBookSession.mockResolvedValue([words[0]]); await load();
    const pending = controller().handleRating(3); await settle();
    await vi.advanceTimersByTimeAsync(399);
    expect(controller().isFinished).toBe(false); expect(api.addXP).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await pending;
    expect(controller().isFinished).toBe(true); expect(api.addXP).toHaveBeenCalledTimes(1);
    await controller().handleRating(3); expect(api.saveSRSHistory).toHaveBeenCalledTimes(1);
  });
});
