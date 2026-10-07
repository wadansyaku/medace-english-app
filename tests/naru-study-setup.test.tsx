import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookStudyOverview, LearningTaskIntent, UserProfile } from '../types';
import { UserRole } from '../types';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../shared/naruBook';
import { createNaruChapterTask } from '../shared/naruStudy';

// Exercise the real setup component and asynchronous effects without a browser
// runner or adding a second DOM implementation to the project.
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0,
  effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>() }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual,
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = initial;
      return [harness.slots[index], (next: any) => {
        harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = harness.cursor++; const previous = harness.slots[index] as unknown[] | undefined;
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
        harness.slots[index] = deps; harness.effects.set(index, effect);
      }
    },
  };
});
const api = vi.hoisted(() => ({ overview: vi.fn(), controller: vi.fn(), event: vi.fn() }));
vi.mock('../services/learning', () => ({ learningService: { getBookStudyOverview: api.overview } }));
vi.mock('../hooks/useStudyModeController', () => ({ useStudyModeController: api.controller }));
vi.mock('../services/productEvents', () => ({ recordClientProductEvent: api.event }));
import NaruStudySetup from '../components/study/NaruStudySetup';
import StudyMode from '../components/StudyMode';

const user: UserProfile = { uid: 'synthetic-student', displayName: 'Synthetic', role: UserRole.STUDENT, email: 'synthetic@example.test' };
type SetupProps = React.ComponentProps<typeof NaruStudySetup>;
type ButtonProps = { children?: React.ReactNode; 'data-testid'?: string; 'aria-pressed'?: boolean;
  disabled?: boolean; onClick?: () => void };
let props: SetupProps;
const overview = (values: Partial<BookStudyOverview> = {}): BookStudyOverview => ({ bookId: NARU_BOOK_ID,
  totalCount: 100, studiedCount: 40, newCount: 60, dueCount: 10, ...values });
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const render = () => {
  harness.cursor = 0;
  const tree = NaruStudySetup(props);
  if (!React.isValidElement(tree)) throw new Error('Setup did not return a rendered element.');
  return tree;
};
const flushEffects = () => {
  const effects = [...harness.effects]; harness.effects.clear();
  for (const [index, effect] of effects) {
    harness.cleanups.get(index)?.();
    const cleanup = effect();
    if (cleanup) harness.cleanups.set(index, cleanup); else harness.cleanups.delete(index);
  }
};
const settle = async () => {
  for (let i = 0; i < 4; i++) { render(); flushEffects(); await Promise.resolve(); }
  return render();
};
const buttons = (tree: React.ReactNode): React.ReactElement<ButtonProps>[] => {
  const found: React.ReactElement<ButtonProps>[] = [];
  const visit = (node: React.ReactNode) => React.Children.forEach(node, child => {
    if (!React.isValidElement<ButtonProps>(child)) return;
    if (child.type === 'button') found.push(child);
    visit(child.props.children);
  });
  visit(tree); return found;
};
const button = (tree: React.ReactNode, testId: string) => {
  const match = buttons(tree).find(node => node.props['data-testid'] === testId);
  if (!match) throw new Error(`Missing ${testId}`);
  return match.props;
};
beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects.clear(); harness.cleanups.clear(); vi.resetAllMocks();
  props = { user, chapter: NARU_RANGE_PRESETS[2], kind: 'new', onSelect: vi.fn(), onBack: vi.fn() };
  api.overview.mockResolvedValue(overview());
  api.controller.mockReturnValue({ loading: true, queue: [] });
});
afterEach(() => { harness.cleanups.forEach(cleanup => cleanup()); vi.restoreAllMocks(); });

describe('Naru setup acquisition and controlled choices', () => {
  it('keeps loading/error unknown, prevents starting and retries instead of showing zero', async () => {
    const pending = deferred<BookStudyOverview>(); api.overview.mockReturnValueOnce(pending.promise);
    let tree = await settle();
    expect(api.overview).toHaveBeenCalledWith(user.uid, NARU_BOOK_ID, { start: 354, end: 1285 });
    expect(renderToStaticMarkup(tree)).not.toContain('naru-study-overview"');
    expect(renderToStaticMarkup(tree)).not.toContain('naru-study-empty');
    expect(button(tree, 'naru-study-start').disabled).toBe(true);
    button(tree, 'naru-study-start').onClick!(); expect(props.onSelect).not.toHaveBeenCalled();
    pending.reject(new Error('synthetic fetch failure')); tree = await settle();
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('naru-study-overview-error');
    expect(markup).not.toContain('naru-study-count-'); expect(markup).not.toContain('naru-study-empty');
    expect(button(tree, 'naru-study-start').disabled).toBe(true);
    const retry = buttons(tree).find(node => node.props.children === '記録をもう一度読み込む')!;
    retry.props.onClick!(); tree = await settle();
    expect(api.overview).toHaveBeenCalledTimes(2);
    expect(renderToStaticMarkup(tree)).toContain('naru-study-count-new');
    expect(button(tree, 'naru-study-start').disabled).toBe(false);
  });

  it('keeps due zero separate from new words and starts at most ten from the chosen chapter', async () => {
    props.kind = 'due'; api.overview.mockResolvedValue(overview({ dueCount: 0, newCount: 17 }));
    let tree = await settle();
    expect(renderToStaticMarkup(tree)).toContain('この章で期限が来た復習はありません');
    expect(button(tree, 'naru-study-start').disabled).toBe(true);
    button(tree, 'naru-study-start').onClick!(); expect(props.onSelect).not.toHaveBeenCalled();
    button(tree, 'naru-study-kind-new').onClick!();
    expect(props.onSelect).toHaveBeenLastCalledWith(createNaruChapterTask(props.chapter, 'new'));
    props.kind = 'new'; tree = render();
    expect(api.overview).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(tree)).toContain('新しい単語を10語学習する');
    expect(button(tree, 'naru-study-start').disabled).toBe(false);
    button(tree, 'naru-study-start').onClick!();
    expect(props.onSelect).toHaveBeenLastCalledWith(createNaruChapterTask(props.chapter, 'new', true));
    button(tree, 'naru-study-chapter-all').onClick!();
    expect(props.onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ wordRange: { start: 1, end: 1531 }, autoStart: false }));
  });

  it.each(['success', 'failure'] as const)('ignores the previous chapter’s late %s after selection changes', async outcome => {
    const first = deferred<BookStudyOverview>(); const second = deferred<BookStudyOverview>();
    api.overview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await settle(); props.chapter = NARU_RANGE_PRESETS[1];
    let tree = render();
    expect(button(tree, 'naru-study-start').disabled).toBe(true);
    expect(renderToStaticMarkup(tree)).not.toContain('naru-study-count-');
    await settle(); second.resolve(overview({ newCount: 2, dueCount: 0 })); tree = await settle();
    if (outcome === 'success') first.resolve(overview({ newCount: 99, dueCount: 88 }));
    else first.reject(new Error('old chapter failed'));
    tree = await settle(); const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('新しい単語を2語学習する');
    expect(markup).not.toContain('naru-study-overview-error');
    expect(markup).not.toContain('>99<');
    button(tree, 'naru-study-start').onClick!();
    expect(props.onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ wordRange: { start: 1, end: 353 }, autoStart: true }));
  });

  it('hides a ready snapshot immediately when its chapter or user changes', async () => {
    let tree = await settle(); expect(button(tree, 'naru-study-start').disabled).toBe(false);
    props.chapter = NARU_RANGE_PRESETS[3]; tree = render();
    expect(renderToStaticMarkup(tree)).not.toContain('naru-study-count-');
    expect(button(tree, 'naru-study-start').disabled).toBe(true);
    await settle(); props.user = { ...user, uid: 'synthetic-second-user' }; tree = render();
    expect(renderToStaticMarkup(tree)).not.toContain('naru-study-count-');
    expect(button(tree, 'naru-study-start').disabled).toBe(true);
    await settle(); expect(api.overview).toHaveBeenLastCalledWith('synthetic-second-user', NARU_BOOK_ID, { start: 1286, end: 1372 });
  });

  it('does not start an invalid restored chapter even with positive counters', async () => {
    props.invalidSelection = true; const tree = await settle(); const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('章の選択を確認できませんでした');
    expect(button(tree, 'naru-study-start').disabled).toBe(true);
    expect(button(tree, 'naru-study-kind-due').disabled).toBe(true);
    button(tree, 'naru-study-kind-due').onClick!();
    button(tree, 'naru-study-start').onClick!(); expect(props.onSelect).not.toHaveBeenCalled();
    expect(api.overview).not.toHaveBeenCalled();
    expect(markup).not.toContain('naru-study-count-');
    expect(button(tree, 'naru-study-chapter-noun')['aria-pressed']).toBe(false);
    button(tree, 'naru-study-chapter-adjective').onClick!();
    expect(props.onSelect).toHaveBeenLastCalledWith(createNaruChapterTask(NARU_RANGE_PRESETS[4], 'new'));
  });
});

describe('StudyMode chapter setup boundary', () => {
  const outerProps = (taskIntent?: LearningTaskIntent): React.ComponentProps<typeof StudyMode> => ({ user,
    bookId: NARU_BOOK_ID, taskIntent, onBack: vi.fn(), onSessionComplete: vi.fn(), onStartTask: vi.fn() });
  it('uses setup for the initial route and blocks an unrecognized explicit auto-start range', () => {
    const initial = StudyMode(outerProps());
    expect(React.isValidElement(initial) && initial.type).toBe(NaruStudySetup);
    const bad = { ...createNaruChapterTask(NARU_RANGE_PRESETS[2], 'new', true), wordRange: { start: 354, end: 400 } };
    const tree = StudyMode(outerProps(bad));
    expect(React.isValidElement<{ invalidSelection?: boolean }>(tree) && tree.props.invalidSelection).toBe(true);
    expect(api.controller).not.toHaveBeenCalled();
  });
  it.each([
    [{ start: 1, end: 1530 }, { start: 1, end: 1531 }],
    [{ start: 1286, end: 1371 }, { start: 1286, end: 1372 }],
    [{ start: 1372, end: 1530 }, { start: 1373, end: 1531 }],
  ])('runs a restored chapter with its current boundaries', (previous, current) => {
    const task = { ...createNaruChapterTask(NARU_RANGE_PRESETS[0], 'new', true), wordRange: previous };
    const session = StudyMode(outerProps(task));
    if (!React.isValidElement<React.ComponentProps<typeof StudyMode>>(session)) throw new Error('Missing session');
    expect(session.type).not.toBe(NaruStudySetup);
    expect(session.props.taskIntent?.wordRange).toEqual(current);
  });
  it.each(['new', 'due'] as const)('returns the running %s session to the same chapter without auto-start', kind => {
    const task = createNaruChapterTask(NARU_RANGE_PRESETS[2], kind, true); const input = outerProps(task);
    const session = StudyMode(input);
    if (!React.isValidElement<React.ComponentProps<typeof StudyMode>>(session)) throw new Error('Missing session');
    expect(session.type).not.toBe(NaruStudySetup);
    expect(session.props.taskIntent?.wordRange).toEqual({ start: 354, end: 1285 });
    expect(session.props.backLabel).toBe('章の学習に戻る');
    session.props.onBack();
    expect(input.onStartTask).toHaveBeenLastCalledWith(user, createNaruChapterTask(NARU_RANGE_PRESETS[2], kind));
    const updatedUser = { ...user, displayName: 'After save' }; session.props.onSessionComplete(updatedUser);
    expect(input.onStartTask).toHaveBeenLastCalledWith(updatedUser, createNaruChapterTask(NARU_RANGE_PRESETS[2], kind));
  });
});
