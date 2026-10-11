import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost } from '../services/apiClient';
import { acceptWorkspaceProfile, clearWorkspaceContext, isCurrentWorkspaceProfile, prepareWorkspaceRestore, selectWorkspaceForSession } from '../services/workspaceContext';
import { getWorkspaceContextKey } from '../contracts/workspaceAccess';
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

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  clearWorkspaceContext();
});
afterEach(() => { clearWorkspaceContext(); vi.unstubAllGlobals(); });

describe('tab-scoped explicit workspace requests', () => {
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
