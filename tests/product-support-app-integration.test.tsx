import React, { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessAdminWorkspaceView, InstructorWorkspaceView, OrganizationRole, UserRole } from '../types';

// Exercise real App handlers with synthetic hooks; no browser, API or storage.
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>(),
  navigation: {} as any, auth: {} as any, authParams: {} as any, dispatch: vi.fn(), normalizeOnRead: false }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  lazy: (loader: () => unknown) => `mock-${loader.toString().match(/components\/([^'"]+)/)?.[1]}`,
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.slots[index], (next: any) => { harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next; }];
  },
  useRef: (initial: any) => { const index = harness.cursor++; if (!(index in harness.slots)) harness.slots[index] = { current: initial }; return harness.slots[index]; },
  useEffect: (effect: () => void | (() => void), deps: any[]) => {
    const index = harness.cursor++; const before = harness.slots[index];
    if (!before || deps.some((dep, i) => !Object.is(dep, before[i]))) { harness.slots[index] = deps; harness.effects.set(index, effect); }
  },
}));
vi.mock('../hooks/useAppNavigation', async original => ({ ...await original<typeof import('../hooks/useAppNavigation')>(), useAppNavigation: () => {
  if (harness.normalizeOnRead) { harness.normalizeOnRead = false; window.history.replaceState(null, '', '/public'); }
  return { navigationState: harness.navigation, dispatchNavigation: harness.dispatch };
} }));
vi.mock('../hooks/useAuthExperienceController', () => ({ useAuthExperienceController: (params: any) => { harness.authParams = params; return harness.auth; } }));
vi.mock('../hooks/useAnnouncementFeed', () => ({ useAnnouncementFeed: () => ({ feed: [], acknowledge: vi.fn(), markSeen: vi.fn() }) }));
vi.mock('../services/productEvents', () => ({ recordDashboardStartTaskEvent: vi.fn() }));
vi.mock('../services/productSupport', () => ({ requestProductSupport: vi.fn() }));
vi.mock('../components/Layout', () => ({ default: () => null }));
vi.mock('../components/auth/AuthExperienceScreen', () => ({ default: () => null }));
vi.mock('../components/auth/StaffEntryStatus', () => ({ default: () => null }));
vi.mock('../components/auth/AdminDemoPrompt', () => ({ default: () => null }));
vi.mock('../components/auth/PasswordResetScreen', () => ({ default: () => null }));
vi.mock('../components/announcements/AnnouncementOverlay', () => ({ default: () => null }));
vi.mock('../components/ProductSupportDialog', () => ({ default: () => null }));
import Layout from '../components/Layout';
import ProductSupportDialog from '../components/ProductSupportDialog';
import ProductSupportSourcePage from '../components/ProductSupportSourcePage';
import App from '../App';

type Node = ReactElement<Record<string, any>>;
const walk = (value: any): Node[] => Array.isArray(value) ? value.flatMap(walk) : React.isValidElement(value)
  ? [value as Node, ...walk((value as Node).props.children)] : [];
const render = () => { harness.cursor = 0; return App({}) as Node; };
const flush = () => {
  const effects = [...harness.effects]; harness.effects.clear();
  for (const [index, effect] of effects) { harness.cleanups.get(index)?.(); const cleanup = effect(); if (cleanup) harness.cleanups.set(index, cleanup); else harness.cleanups.delete(index); }
};
const settle = () => { for (let i = 0; i < 3; i++) { render(); flush(); } return render(); };
const node = (type: any) => walk(render()).find(item => item.type === type)!;
const workspace = () => walk(render()).find(item => typeof item.type === 'string' && /mock-(AdminPanel|InstructorDashboard|BusinessAdminDashboard)/.test(item.type))!;
const location = (path: string) => { const url = new URL(path, 'https://synthetic.test'); window.location.pathname = url.pathname; window.location.search = url.search; };
let listeners: Map<string, Set<() => void>>;
let stack: { state: any; path: string }[];
beforeEach(() => {
  harness.cleanups.forEach(cleanup => cleanup()); harness.cleanups.clear(); harness.effects.clear(); harness.slots = []; harness.cursor = 0; harness.normalizeOnRead = false;
  harness.navigation = { currentView: 'login', returnView: 'dashboard', selectedTask: null, publicRole: null, englishPracticeLane: null };
  harness.auth = { user: null, authLoading: false, authSubmitting: false, staffLoginCompletionPending: false, authExperienceProps: {},
    handleLogout: vi.fn(), handleResetDemo: vi.fn(), setCurrentUser: vi.fn(), openAuthenticatedHome: vi.fn(), adminDemoPrompt: { open: false } };
  listeners = new Map(); stack = [{ state: null, path: '/' }];
  let currentHistoryState: any = null;
  vi.stubGlobal('window', { location: { pathname: '/', search: '' },
    addEventListener: (name: string, callback: () => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(callback); },
    removeEventListener: (name: string, callback: () => void) => listeners.get(name)?.delete(callback),
    history: { get state() { return currentHistoryState; },
      pushState: vi.fn((state: any, _: string, path: string) => { stack.push({ state, path }); currentHistoryState = state; location(path); }),
      replaceState: vi.fn((state: any, _: string, path: string) => { stack[stack.length - 1] = { state, path }; currentHistoryState = state; location(path); }),
      back: vi.fn(() => { if (stack.length > 1) stack.pop(); const current = stack.at(-1)!; currentHistoryState = current.state; location(current.path); listeners.get('popstate')?.forEach(callback => callback()); }),
    } });
  harness.dispatch = vi.fn((action: any) => {
    if (action.type === 'go-home' || action.type === 'open-public-info') {
      harness.navigation = { ...harness.navigation, currentView: action.view ?? 'publicInfo' };
      const path = action.view ? `/${action.view}` : '/public';
      window.history.replaceState(window.history.state, '', path);
    }
  });
});
afterEach(() => { harness.cleanups.forEach(cleanup => cleanup()); harness.cleanups.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('App support entry, evidence and scoped feedback integration', () => {
  it('captures the initial source before navigation normalizes its query and keeps it during authenticated home normalization', () => {
    location('/public?supportSource=study-recall'); harness.normalizeOnRead = true; harness.navigation = { ...harness.navigation, currentView: 'publicInfo' };
    settle(); expect(node(ProductSupportSourcePage).props.sourceId).toBe('study-recall'); expect(window.location.search).toBe('?supportSource=study-recall');
    harness.auth.user = { uid: 'synthetic-student', role: UserRole.STUDENT }; harness.navigation = { ...harness.navigation, currentView: 'dashboard' };
    settle(); expect(node(ProductSupportSourcePage).props.role).toBe('STUDENT'); expect(node(Layout).props.currentView).toBe('publicInfo');
    expect(walk(render()).some(item => typeof item.type === 'string' && /ImportNotice/.test(item.type))).toBe(false);
    expect(window.location.search).toBe('?supportSource=study-recall');
  });

  it('leaves evidence for the proper public or authenticated home without a stale body', () => {
    location('/public?supportSource=study-recall'); settle(); node(ProductSupportSourcePage).props.onBack(); settle();
    expect(walk(render()).some(item => item.type === ProductSupportSourcePage)).toBe(false);
    expect(harness.dispatch).toHaveBeenLastCalledWith({ type: 'open-public-info', historyMode: 'replace' });
  });

  it('opens once, closes once and consumes a same-URL browser history entry for Back/Escape', () => {
    settle(); const trigger = node(Layout).props.onOpenProductSupport; trigger(); trigger(); settle();
    expect(window.history.pushState).toHaveBeenCalledTimes(1); expect(node(ProductSupportDialog).props.open).toBe(true);
    const close = node(ProductSupportDialog).props.onClose; close(); close(); settle();
    expect(window.history.back).toHaveBeenCalledTimes(1); expect(node(ProductSupportDialog).props.open).toBe(false);
    node(Layout).props.onOpenProductSupport(); settle(); window.history.back(); settle(); expect(node(ProductSupportDialog).props.open).toBe(false);
  });

  it.each(['person', 'role', 'organization', 'workspace', 'loading'] as const)('discards the current conversation immediately across %s', change => {
    harness.auth.user = { uid: 'teacher-a', role: UserRole.INSTRUCTOR, organizationId: 'org-a', organizationRole: OrganizationRole.INSTRUCTOR };
    harness.navigation = { ...harness.navigation, currentView: 'instructor' }; settle(); node(Layout).props.onOpenProductSupport(); settle();
    const previousKey = node(ProductSupportDialog).props.contextKey;
    if (change === 'person') harness.auth.user = { ...harness.auth.user, uid: 'teacher-b' };
    if (change === 'role') harness.auth.user = { ...harness.auth.user, role: UserRole.STUDENT };
    if (change === 'organization') harness.auth.user = { ...harness.auth.user, organizationId: 'org-b' };
    if (change === 'workspace') workspace().props.onChangeView(InstructorWorkspaceView.STUDENTS);
    if (change === 'loading') harness.auth.authLoading = true;
    expect(node(ProductSupportDialog).props.open).toBe(false); settle();
    if (change !== 'loading') expect(node(ProductSupportDialog).props.contextKey).not.toBe(previousKey);
    expect(node(ProductSupportDialog).props.open).toBe(false);
  });

  it.each([UserRole.INSTRUCTOR, UserRole.ADMIN])('bridges a %s draft to its existing scope only after the manual callback', role => {
    harness.auth.user = { uid: 'staff-a', role, organizationId: 'org-a' }; harness.navigation = { ...harness.navigation, currentView: role === UserRole.ADMIN ? 'admin' : 'instructor' };
    settle(); expect(workspace().props.productFeedbackDraft).toBeUndefined(); node(Layout).props.onOpenProductSupport(); settle();
    node(ProductSupportDialog).props.onDraft('課題の操作を確認したいです'); settle();
    expect(node(ProductSupportDialog).props.open).toBe(false); expect(workspace().props.user).toEqual(harness.auth.user);
    expect(workspace().props.productFeedbackDraft).toBe('課題の操作を確認したいです');
    expect(workspace().props.productFeedbackContextKey).toContain('staff-a'); expect(workspace().props.productFeedbackContextKey).toContain('org-a');
    workspace().props.onProductFeedbackDraftConsumed(); settle(); expect(workspace().props.productFeedbackDraft).toBeUndefined();
  });

  it('passes the organizational scope to the group-admin form and clears old drafts after identity changes', () => {
    harness.auth.user = { uid: 'group-a', role: UserRole.INSTRUCTOR, organizationId: 'org-a', organizationRole: OrganizationRole.GROUP_ADMIN };
    harness.navigation = { ...harness.navigation, currentView: 'instructor' }; settle(); node(Layout).props.onOpenProductSupport(); settle();
    node(ProductSupportDialog).props.onDraft('組織管理の操作を確認したいです'); settle();
    expect(workspace().props.productFeedbackContextKey).toContain('GROUP_ADMIN');
    workspace().props.onChangeView(BusinessAdminWorkspaceView.OVERVIEW); settle();
    harness.auth.user = { ...harness.auth.user, uid: 'group-b' }; expect(workspace().props.productFeedbackDraft).toBeUndefined(); settle();
    harness.auth.user = { ...harness.auth.user, uid: 'group-a' }; settle(); expect(workspace().props.productFeedbackDraft).toBeUndefined();
  });

  it('clears before logout begins and does not bridge guest or student drafts to a staff form', () => {
    settle(); expect(node(ProductSupportDialog).props.onDraft).toBeUndefined();
    harness.auth.user = { uid: 'student-a', role: UserRole.STUDENT }; harness.navigation = { ...harness.navigation, currentView: 'dashboard' }; settle();
    expect(node(ProductSupportDialog).props.onDraft).toBeUndefined(); node(Layout).props.onOpenProductSupport(); settle();
    node(Layout).props.onLogout(); expect(node(ProductSupportDialog).props.open).toBe(false); expect(harness.auth.handleLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps authentication loading and password-reset inputs free of the question trigger', () => {
    harness.auth.authLoading = true; settle(); expect(node(Layout).props.onOpenProductSupport).toBeUndefined();
    harness.auth.authLoading = false; harness.navigation = { ...harness.navigation, currentView: 'resetPassword' }; settle();
    expect(node(Layout).props.onOpenProductSupport).toBeUndefined(); expect(node(Layout).props.immersiveContent).toBe(true);
  });
});
