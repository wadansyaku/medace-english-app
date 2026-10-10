import { beforeEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: new Map<number, () => void>() }));
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original,
    useState: (initial: unknown) => {
      const i = harness.cursor++;
      if (!(i in harness.slots)) harness.slots[i] = typeof initial === 'function' ? initial() : initial;
      return [harness.slots[i], (next: any) => { harness.slots[i] = typeof next === 'function' ? next(harness.slots[i]) : next; }];
    },
    useRef: (initial: unknown) => { const i = harness.cursor++; if (!(i in harness.slots)) harness.slots[i] = { current: initial }; return harness.slots[i]; },
    useEffect: (effect: () => void, deps: unknown[]) => {
      const i = harness.cursor++;
      const old = harness.slots[i] as unknown[] | undefined;
      if (!old || deps.some((dep, n) => !Object.is(dep, old[n]))) { harness.slots[i] = deps; harness.effects.set(i, effect); }
    },
  };
});
const api = vi.hoisted(() => ({ getSession: vi.fn(), login: vi.fn(), authenticate: vi.fn(), requestPasswordRecovery: vi.fn(), clearSession: vi.fn() }));
vi.mock('../services/session', () => ({ sessionService: api }));
vi.mock('../hooks/usePublicMotivationSnapshot', () => ({ usePublicMotivationSnapshot: () => ({ snapshot: null, loading: false, error: null }) }));
vi.mock('../utils/displayPreferences', () => ({ applyDisplayPreferences: vi.fn(), getStoredDisplayPreferences: vi.fn() }));
import { useAuthExperienceController } from '../hooks/useAuthExperienceController';
import { navigationReducer, parseNavigationPath, type AppNavigationAction } from '../hooks/useAppNavigation';
import { OrganizationRole, UserRole, type UserProfile } from '../types';

const user: UserProfile = { uid: 'synthetic-user', role: UserRole.STUDENT, displayName: '架空生徒', email: 'synthetic@example.invalid' };
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const event = () => ({ preventDefault: vi.fn() }) as any;
const flushEffects = () => { const effects = [...harness.effects.values()]; harness.effects.clear(); effects.forEach(effect => effect()); };
const fixture = (path = '/', search = '?auth=login') => {
  let state = parseNavigationPath(path, search);
  const dispatch = vi.fn((action: AppNavigationAction) => { state = navigationReducer(state, action); });
  const render = () => { harness.cursor = 0; return useAuthExperienceController({ navigationState: state, dispatchNavigation: dispatch }); };
  return { render, dispatch, get state() { return state; }, setState: (next: typeof state) => { state = next; } };
};
const ready = async (f: ReturnType<typeof fixture>) => { f.render(); flushEffects(); await vi.waitFor(() => expect(f.render().authLoading).toBe(false)); };
const enterLogin = (f: ReturnType<typeof fixture>) => { f.render().authExperienceProps.onEmailChange('  synthetic@example.invalid  '); f.render().authExperienceProps.onPasswordChange('synthetic-password'); };

beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects.clear(); vi.clearAllMocks();
  api.getSession.mockResolvedValue(null); api.authenticate.mockResolvedValue(user); api.login.mockResolvedValue(user);
  api.requestPasswordRecovery.mockResolvedValue({ message: '依頼を受け付けました' });
});

describe('authentication keeps one focused task through pending and recovery states', () => {
  it.each(['/teacher', '/school-admin', '/service-admin'])('keeps a signed-in public role entry without changing the session: %s', async (path) => {
    api.getSession.mockResolvedValueOnce(user);
    const f = fixture(path, ''); await ready(f);
    expect(f.state.currentView).toBe('publicRole');
    expect(f.render().user).toEqual(user);
    expect(api.login).not.toHaveBeenCalled();
    expect(api.clearSession).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('keeps a defensively mismatched auth response on its safe staff entry', async () => {
    const f = fixture('/teacher', '?auth=login'); await ready(f); enterLogin(f);
    await f.render().authExperienceProps.onSubmitEmailAuth(event());
    expect(f.state.currentView).toBe('publicRole');
    expect(f.state.authPanelMode).toBeUndefined();
    expect(f.render().user).toEqual(user);
  });
  it.each([
    ['/teacher', 'instructor', UserRole.INSTRUCTOR, OrganizationRole.INSTRUCTOR, 'instructor'],
    ['/school-admin', 'group-admin', UserRole.INSTRUCTOR, OrganizationRole.GROUP_ADMIN, 'instructor'],
    ['/service-admin', 'service-admin', UserRole.ADMIN, undefined, 'admin'],
  ] as const)('passes the %s entry to authentication and opens only the matching home', async (path, entry, role, organizationRole, home) => {
    const f = fixture(path, ''); await ready(f); enterLogin(f);
    api.authenticate.mockResolvedValueOnce({ ...user, role, organizationRole });
    await f.render().authExperienceProps.onSubmitEmailAuth(event());
    expect(api.authenticate.mock.calls[0][5]).toBe(entry);
    expect(f.state.currentView).toBe(home);
  });
  it('retains the current location after Back while a staff login response is pending', async () => {
    const f = fixture('/teacher', ''); await ready(f); enterLogin(f);
    const request = deferred<UserProfile>(); api.authenticate.mockReturnValueOnce(request.promise);
    const submit = f.render().authExperienceProps.onSubmitEmailAuth(event());
    f.setState(parseNavigationPath('/', '')); f.render(); flushEffects();
    request.resolve({ ...user, role: UserRole.INSTRUCTOR, organizationRole: OrganizationRole.INSTRUCTOR }); await submit;
    expect(f.state.currentView).toBe('login'); expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.render().staffLoginCompletionPending).toBe(true);
    f.render().openAuthenticatedHome(); expect(f.state.currentView).toBe('instructor');
    expect(f.render().staffLoginCompletionPending).toBe(false);
  });
  it('normalizes a staff signup query and never creates a staff account', async () => {
    const f = fixture('/school-admin', '?auth=signup'); await ready(f); f.render(); flushEffects(); enterLogin(f);
    expect(f.state.authPanelMode).toBe('LOGIN'); expect(f.render().authExperienceProps.authMode).toBe('LOGIN');
    f.render().authExperienceProps.onChangeAuthMode('SIGNUP');
    api.authenticate.mockRejectedValueOnce(new Error('この入口は利用できません'));
    await f.render().authExperienceProps.onSubmitEmailAuth(event());
    expect(api.authenticate.mock.calls[0][2]).toBe(false); expect(api.authenticate.mock.calls[0][5]).toBe('group-admin');
    expect(f.render().user).toBeNull(); expect(f.render().authExperienceProps.authError).toContain('この入口');
    expect(api.clearSession).not.toHaveBeenCalled();
  });
  it('uses login after moving from a student signup form to a bare staff URL', async () => {
    const f = fixture('/', '?auth=signup'); await ready(f);
    expect(f.render().authExperienceProps.authMode).toBe('SIGNUP');
    f.setState(parseNavigationPath('/teacher', '')); f.render(); flushEffects(); enterLogin(f);
    api.authenticate.mockRejectedValueOnce(new Error('invalid credential'));
    await f.render().authExperienceProps.onSubmitEmailAuth(event());
    expect(api.authenticate).toHaveBeenCalledWith('synthetic@example.invalid', 'synthetic-password', false, undefined, undefined, 'instructor');
  });
  it('does not display an old staff error on the student entry after Back', async () => {
    const f = fixture('/teacher', ''); await ready(f); enterLogin(f);
    const request = deferred<UserProfile>(); api.authenticate.mockReturnValueOnce(request.promise);
    const submit = f.render().authExperienceProps.onSubmitEmailAuth(event());
    f.setState(parseNavigationPath('/', '')); f.render(); flushEffects();
    request.reject(new Error('old staff credential failure')); await submit;
    expect(f.render().authExperienceProps.authError).toBeNull(); expect(f.state.currentView).toBe('login');
  });
  it('finishes delayed session deletion before exposing account switching and clearing identity drafts', async () => {
    const f = fixture('/dashboard', ''); await ready(f);
    f.render().setCurrentUser(user); enterLogin(f);
    f.render().authExperienceProps.onDisplayNameChange('前の生徒');
    const request = deferred<void>(); api.clearSession.mockReturnValueOnce(request.promise);
    const first = f.render().handleLogout(); const second = f.render().handleLogout();
    f.render().authExperienceProps.onOpenAuth('SIGNUP');
    expect(api.clearSession).toHaveBeenCalledTimes(1);
    expect(f.render().authLoading).toBe(true); expect(f.render().user).toEqual(user);
    expect(f.dispatch).not.toHaveBeenCalled();
    request.resolve(); await Promise.all([first, second]);
    expect(f.render().authLoading).toBe(false); expect(f.render().user).toBeNull();
    expect(f.render().authExperienceProps.email).toBe(''); expect(f.render().authExperienceProps.displayName).toBe('');
    f.render().authExperienceProps.onOpenAuth('SIGNUP');
    expect(f.state.authPanelMode).toBe('SIGNUP');
    expect(f.dispatch).toHaveBeenCalledTimes(2);
  });
  it('keeps the existing account and releases pending state if session deletion fails, allowing a retry', async () => {
    const f = fixture('/dashboard', ''); await ready(f); f.render().setCurrentUser(user);
    api.clearSession.mockRejectedValueOnce(new Error('合成の通信失敗'));
    await expect(f.render().handleLogout()).resolves.toBeUndefined();
    expect(f.render().user).toEqual(user); expect(f.render().authLoading).toBe(false); expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.render().logoutError).toContain('ログアウトを確認できませんでした');
    api.clearSession.mockResolvedValueOnce(undefined);
    await f.render().handleLogout(); expect(f.render().user).toBeNull(); expect(f.render().logoutError).toBeNull();
  });
  it('does not replace/unmount the auth form while submitting, blocks same-tick duplicates, then exposes a retryable error', async () => {
    const f = fixture(); await ready(f); enterLogin(f);
    const request = deferred<UserProfile>(); api.authenticate.mockReturnValueOnce(request.promise);
    const first = f.render().authExperienceProps.onSubmitEmailAuth(event());
    const second = f.render().authExperienceProps.onSubmitEmailAuth(event());
    f.render().authExperienceProps.onCloseAuth(); f.render().authExperienceProps.onChangeAuthMode('SIGNUP');
    f.render().authExperienceProps.onEmailChange('newer@example.invalid'); f.render().authExperienceProps.onPasswordChange('newer-password');
    expect(api.authenticate).toHaveBeenCalledTimes(1);
    expect(api.authenticate.mock.calls[0][0]).toBe('synthetic@example.invalid');
    expect(f.render().authLoading).toBe(false);
    expect(f.render().authExperienceProps.authSubmitting).toBe(true);
    expect(f.state.authPanelMode).toBe('LOGIN'); expect(f.dispatch).not.toHaveBeenCalled();
    request.reject(new Error('合成の認証失敗')); await Promise.all([first, second]);
    const retry = f.render().authExperienceProps;
    expect(retry.authSubmitting).toBe(false); expect(retry.authError).toBe('合成の認証失敗');
    expect(retry.email.trim()).toBe('synthetic@example.invalid'); expect(retry.password).toBe('synthetic-password');
    expect(f.state.authPanelMode).toBe('LOGIN');
    await retry.onSubmitEmailAuth(event()); expect(api.authenticate).toHaveBeenCalledTimes(2);
  });
  it('keeps the existing workspace blocked during a delayed logged-in demo reset', async () => {
    const f = fixture('/dashboard', ''); await ready(f);
    f.render().setCurrentUser({ ...user, email: 'demo_student_synthetic@medace.app' });
    const request = deferred<UserProfile>(); api.login.mockReturnValueOnce(request.promise);
    const first = f.render().handleResetDemo(); const second = f.render().handleResetDemo();
    expect(f.render().authLoading).toBe(true); expect(api.login).toHaveBeenCalledTimes(1);
    request.resolve(user); await Promise.all([first, second]); expect(f.render().authLoading).toBe(false);
  });
  it('retains the latest deep lesson route on delayed login success and strips only the auth overlay', async () => {
    const f = fixture('/study/original-book'); await ready(f); enterLogin(f);
    const request = deferred<UserProfile>(); api.authenticate.mockReturnValueOnce(request.promise);
    const submit = f.render().authExperienceProps.onSubmitEmailAuth(event());
    const next = parseNavigationPath('/quiz/newer-book', '?auth=login'); f.setState(next); f.render();
    request.resolve(user); await submit;
    expect(f.state.currentView).toBe('quiz'); expect(f.state.selectedTask).toEqual(next.selectedTask); expect(f.state.authPanelMode).toBeUndefined();
    expect(f.dispatch).toHaveBeenLastCalledWith({ type: 'close-auth', historyMode: 'replace' });
  });
  it('reports a null authentication response instead of silently doing nothing', async () => {
    const f = fixture(); await ready(f); enterLogin(f); api.authenticate.mockResolvedValueOnce(null);
    await f.render().authExperienceProps.onSubmitEmailAuth(event()); expect(f.render().authExperienceProps.authError).toContain('ログインに失敗');
  });
  it('recovery is guarded, retryable, and preserves the email when returning to login', async () => {
    const f = fixture(); await ready(f); enterLogin(f); f.render().authExperienceProps.onOpenPasswordRecovery();
    const request = deferred<{ message: string }>(); api.requestPasswordRecovery.mockReturnValueOnce(request.promise);
    const first = f.render().authExperienceProps.onRequestPasswordRecovery(); const second = f.render().authExperienceProps.onRequestPasswordRecovery();
    f.render().authExperienceProps.onClosePasswordRecovery(); f.render().authExperienceProps.onCloseAuth();
    expect(f.render().authExperienceProps.showPasswordRecovery).toBe(true); expect(api.requestPasswordRecovery).toHaveBeenCalledTimes(1);
    request.resolve({ message: '依頼を受け付けました' }); await Promise.all([first, second]);
    expect(f.render().authExperienceProps.passwordRecoveryMessage).toBe('依頼を受け付けました');
    await f.render().authExperienceProps.onRequestPasswordRecovery(); expect(api.requestPasswordRecovery).toHaveBeenCalledTimes(2);
    f.render().authExperienceProps.onClosePasswordRecovery(); expect(f.render().authExperienceProps.showPasswordRecovery).toBe(false);
    expect(f.render().authExperienceProps.email.trim()).toBe('synthetic@example.invalid'); expect(f.render().authExperienceProps.password).toBe('');
  });
  it('opening signup routes the focused form and dismissal retains useful identity drafts', async () => {
    const f = fixture('/', ''); await ready(f);
    f.render().authExperienceProps.onOpenAuth('SIGNUP'); f.render(); flushEffects();
    expect(f.state.authPanelMode).toBe('SIGNUP');
    f.render().authExperienceProps.onDisplayNameChange('架空生徒'); f.render().authExperienceProps.onEmailChange('synthetic@example.invalid');
    f.render().authExperienceProps.onPasswordChange('synthetic-password'); f.render().authExperienceProps.onCloseAuth();
    const closed = f.render().authExperienceProps;
    expect(f.state.authPanelMode).toBeUndefined(); expect(closed.displayName).toBe('架空生徒'); expect(closed.email).toBe('synthetic@example.invalid'); expect(closed.password).toBe('');
  });
});
