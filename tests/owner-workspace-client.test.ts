import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiPost } from '../services/apiClient';
import { acceptWorkspaceProfile, clearWorkspaceContext, isCurrentWorkspaceProfile, prepareWorkspaceRestore, selectWorkspaceForSession, subscribeWorkspaceRevocation } from '../services/workspaceContext';
import { getWorkspaceContextKey, WORKSPACE_ACCESS_REVOKED } from '../contracts/workspaceAccess';
import { OrganizationRole, UserRole, type UserProfile } from '../types';

const storage = new Map<string, string>();
const profile = (workspace: 'instructor' | 'group-admin' | 'service-admin', version = 7): UserProfile => ({
  uid: 'synthetic-workspace-owner', displayName: '合成本人', email: 'owner@example.invalid',
  role: workspace === 'service-admin' ? UserRole.ADMIN : UserRole.INSTRUCTOR,
  organizationId: workspace === 'service-admin' ? undefined : 'synthetic-staff-org',
  organizationRole: workspace === 'instructor' ? OrganizationRole.INSTRUCTOR : workspace === 'group-admin' ? OrganizationRole.GROUP_ADMIN : undefined,
  workspaceAccess: { workspace, organizationId: workspace === 'service-admin' ? undefined : 'synthetic-staff-org',
    grantVersion: version, availableWorkspaces: ['instructor', 'group-admin', 'service-admin'] },
});
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; };
const revoked = (changes = {}) => ({ error: 'Grant changed', errorCode: WORKSPACE_ACCESS_REVOKED,
  workspaceContext: { uid: 'synthetic-workspace-owner', workspace: 'instructor', organizationId: 'synthetic-staff-org', grantVersion: 7, ...changes } });
const rejection = (details: unknown, status = 403) => new Response(JSON.stringify(details), {
  status, headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  clearWorkspaceContext();
});
afterEach(() => { clearWorkspaceContext(); vi.unstubAllGlobals(); });

describe('tab-scoped explicit workspace requests', () => {
  it('invalidates only a matching verified grant and keeps the server payload on ApiError', async () => {
    acceptWorkspaceProfile(profile('instructor'));
    const notify = vi.fn(); const unsubscribe = subscribeWorkspaceRevocation(notify);
    const payload = { ...revoked(), productSupportAdmission: 'NOT_ADMITTED' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rejection(payload)));
    const error = await apiGet('/api/storage').catch(error => error);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw error;
    expect(error.details).toEqual(payload);
    expect(notify).toHaveBeenCalledExactlyOnceWith(payload.workspaceContext);
    expect(isCurrentWorkspaceProfile(profile('instructor'))).toBe(false);
    expect(storage.size).toBe(0);
    const fetch = vi.fn().mockResolvedValue(json({ role: 'STUDENT' })); vi.stubGlobal('fetch', fetch);
    await apiGet('/api/session');
    expect(fetch.mock.calls[0][1].headers['X-MedAce-Workspace']).toBeUndefined();
    unsubscribe();
  });
  it.each([
    { uid: 'another-owner' }, { workspace: 'group-admin' }, { organizationId: 'other-org' },
    { organizationId: undefined }, { grantVersion: 8 }, { grantVersion: 0 },
  ])('preserves the active staff state for a mismatched marker %j', async changes => {
    const active = profile('instructor'); acceptWorkspaceProfile(active);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rejection(revoked(changes))));
    await expect(apiGet('/api/storage')).rejects.toMatchObject({ status: 403 });
    expect(isCurrentWorkspaceProfile(active)).toBe(true); expect(storage.size).toBe(1);
  });
  it.each([403, 503])('preserves verified data for an ordinary %i response', async status => {
    const active = profile('instructor'); acceptWorkspaceProfile(active);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rejection({ error: 'Temporary or out of scope' }, status)));
    await expect(apiGet('/api/storage')).rejects.toMatchObject({ status });
    expect(isCurrentWorkspaceProfile(active)).toBe(true);
  });
  it('preserves the active staff state on network failure and canonical version-zero denial', async () => {
    const active = profile('instructor'); acceptWorkspaceProfile(active);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiGet('/api/storage')).rejects.toThrow('Failed to fetch');
    expect(isCurrentWorkspaceProfile(active)).toBe(true);
    const canonical = profile('instructor', 0); acceptWorkspaceProfile(canonical);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rejection(revoked({ grantVersion: 0 }))));
    await expect(apiGet('/api/storage')).rejects.toMatchObject({ status: 403 });
    expect(isCurrentWorkspaceProfile(canonical)).toBe(true);
  });
  it.each([7, 8])('does not let an old error body invalidate a reentered workspace at version %i', async version => {
    acceptWorkspaceProfile(profile('instructor'));
    const body = deferred<unknown>();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403,
      headers: new Headers({ 'Content-Type': 'application/json' }), json: () => body.promise }));
    const old = apiGet('/api/storage'); const denied = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    selectWorkspaceForSession('personal', 'synthetic-workspace-owner');
    const next = profile('instructor', version); acceptWorkspaceProfile(next);
    body.resolve(revoked()); await denied;
    expect(isCurrentWorkspaceProfile(next)).toBe(true);
  });
  it('sends the selected identity, role scope and version on every operation', async () => {
    acceptWorkspaceProfile(profile('instructor'));
    const fetch = vi.fn().mockResolvedValue(json({ students: [] })); vi.stubGlobal('fetch', fetch);
    await apiPost('/api/storage', { action: 'getAllStudentsProgress' });
    const init = fetch.mock.calls[0][1];
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'X-MedAce-Workspace': 'instructor',
      'X-MedAce-Workspace-Version': '7', 'X-MedAce-Workspace-Org': 'synthetic-staff-org',
      'X-MedAce-Workspace-Identity': 'synthetic-workspace-owner' });
    expect(init.headers.Cookie).toBeUndefined();
  });
  it('discards a late admin response after switching to the teacher workspace', async () => {
    acceptWorkspaceProfile(profile('service-admin'));
    const pending = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal('fetch', fetch);
    const oldRead = apiGet('/api/storage?old-admin-read');
    const rejection = expect(oldRead).rejects.toMatchObject({ name: 'AbortError' });
    selectWorkspaceForSession('instructor', 'synthetic-workspace-owner');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    pending.resolve(json({ students: [{ uid: 'other-classroom-student' }] }));
    await rejection;
  });
  it('also discards a body whose JSON resolves after switching', async () => {
    acceptWorkspaceProfile(profile('service-admin'));
    const body = deferred<unknown>();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }), json: () => body.promise }));
    const oldRead = apiGet('/api/storage');
    const rejection = expect(oldRead).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    selectWorkspaceForSession('group-admin', 'synthetic-workspace-owner');
    body.resolve({ privileged: true });
    await rejection;
  });
  it('keeps the original write headers while a later switch aborts its client response', async () => {
    acceptWorkspaceProfile(profile('instructor'));
    const pending = deferred<Response>(); const fetch = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal('fetch', fetch);
    const write = apiPost('/api/storage', { action: 'sendInstructorNotification', payload: { studentUid: 'student-a' } });
    const rejection = expect(write).rejects.toMatchObject({ name: 'AbortError' });
    selectWorkspaceForSession('service-admin', 'synthetic-workspace-owner');
    expect(fetch.mock.calls[0][1].headers['X-MedAce-Workspace']).toBe('instructor');
    expect(fetch.mock.calls[0][1].headers['X-MedAce-Workspace-Org']).toBe('synthetic-staff-org');
    pending.resolve(json({ saved: true })); await rejection;
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('restores the chosen staff screen per tab and clears it on ordinary student routes', async () => {
    acceptWorkspaceProfile(profile('group-admin'));
    prepareWorkspaceRestore('/instructor');
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(null))); vi.stubGlobal('fetch', fetch);
    await apiGet('/api/session');
    expect(fetch.mock.calls[0][1].headers['X-MedAce-Workspace']).toBe('group-admin');
    prepareWorkspaceRestore('/dashboard');
    await apiGet('/api/session');
    expect(fetch.mock.calls[1][1].headers['X-MedAce-Workspace']).toBeUndefined();
  });
  it('preserves only a saved staff context when a public evidence link reloads the tab', async () => {
    acceptWorkspaceProfile(profile('instructor'));
    prepareWorkspaceRestore('/public', '?supportSource=staff-login-entry');
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(null))); vi.stubGlobal('fetch', fetch);
    await apiGet('/api/session');
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ 'X-MedAce-Workspace': 'instructor',
      'X-MedAce-Workspace-Version': '7', 'X-MedAce-Workspace-Org': 'synthetic-staff-org',
      'X-MedAce-Workspace-Identity': 'synthetic-workspace-owner' });
    prepareWorkspaceRestore('/public'); await apiGet('/api/session');
    expect(fetch.mock.calls[1][1].headers['X-MedAce-Workspace']).toBeUndefined();
    clearWorkspaceContext();
    prepareWorkspaceRestore('/public', '?supportSource=staff-login-entry&workspace=service-admin');
    await apiGet('/api/session');
    expect(fetch.mock.calls[2][1].headers['X-MedAce-Workspace']).toBeUndefined();
  });

  it('uses a direct staff URL to discover that workspace rather than restoring another role', async () => {
    acceptWorkspaceProfile(profile('service-admin'));
    prepareWorkspaceRestore('/teacher');
    const fetch = vi.fn().mockResolvedValue(json(null)); vi.stubGlobal('fetch', fetch);
    await apiGet('/api/session');
    expect(fetch.mock.calls[0][1].headers['X-MedAce-Workspace']).toBe('instructor');
    expect(fetch.mock.calls[0][1].headers['X-MedAce-Workspace-Version']).toBeUndefined();
  });
  it('separates identity, workspace, organization and grant version in the state key', () => {
    const teacher = profile('instructor');
    const key = getWorkspaceContextKey(teacher.uid, teacher.workspaceAccess);
    expect(getWorkspaceContextKey('different-uid', teacher.workspaceAccess)).not.toBe(key);
    expect(getWorkspaceContextKey(teacher.uid, profile('group-admin').workspaceAccess)).not.toBe(key);
    expect(getWorkspaceContextKey(teacher.uid, { ...teacher.workspaceAccess!, organizationId: 'other-org' })).not.toBe(key);
    expect(getWorkspaceContextKey(teacher.uid, profile('instructor', 8).workspaceAccess)).not.toBe(key);
  });
  it('rejects a delayed profile callback from any previous workspace context', () => {
    const teacher = profile('instructor');
    acceptWorkspaceProfile(teacher);
    expect(isCurrentWorkspaceProfile(teacher)).toBe(true);
    for (const old of [profile('service-admin'), profile('instructor', 6),
      { ...teacher, uid: 'another-owner' },
      { ...teacher, workspaceAccess: { ...teacher.workspaceAccess!, organizationId: 'other-org' } }]) {
      expect(isCurrentWorkspaceProfile(old)).toBe(false);
    }
    clearWorkspaceContext();
    expect(isCurrentWorkspaceProfile(teacher)).toBe(false);
  });
  it('does not store a cookie, password or staff selection for the personal workspace', () => {
    acceptWorkspaceProfile({ ...profile('instructor'), role: UserRole.STUDENT, workspaceAccess: undefined });
    expect([...storage.values()]).toEqual([]);
  });
});
