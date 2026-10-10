import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationRole, UserRole } from '../types';
import type { DbUserRow } from '../functions/_shared/types';
import { authProfileRoutes } from '../functions/_shared/api-routes/auth-profile';
import { authenticate } from '../services/storage/auth-session';
import { IDB_MOCK_USERS } from '../services/storage/mockData';

const mocks = vi.hoisted(() => ({ find: vi.fn(), rawFind: vi.fn(), verify: vi.fn(), session: vi.fn(), create: vi.fn(), membership: vi.fn(), clear: vi.fn(), put: vi.fn() }));
vi.mock('../services/storage/idb-support', async (original) => ({ ...await original<object>(), putStoreRecord: mocks.put }));
vi.mock('../functions/_shared/auth', async (original) => ({ ...await original<object>(), findUserByEmail: mocks.find,
  verifyPassword: mocks.verify, createSession: mocks.session, createUser: mocks.create }));
vi.mock('../functions/_shared/auth-rate-limit', () => ({ assertAuthAttemptAllowed: vi.fn(), clearAuthFailures: mocks.clear,
  createAuthAttemptScopeKey: () => 'auth-scope', recordAuthFailure: vi.fn() }));
const row = (role: UserRole): DbUserRow => ({ id: 'existing-user', email: 'staff@example.invalid', password_hash: 'hash',
  display_name: 'Existing account', role, grade: null, english_level: null, subscription_plan: null,
  organization_id: null, organization_name: null, organization_role: null, study_mode: null,
  stats_xp: 0, stats_level: 1, stats_current_streak: 0, stats_last_login_date: null, created_at: 0, updated_at: 0 });
const run = (loginEntry: unknown, extra: Record<string, unknown> = {}) => {
  const request = new Request('http://localhost/api/auth', { method: 'POST', headers: { Cookie: 'existing-session=preserved' },
    body: JSON.stringify({ action: 'email-auth', email: 'staff@example.invalid', password: 'valid-password', loginEntry, ...extra }) });
  const route = authProfileRoutes.find((candidate) => candidate.matches({ request, env: {} as never, pathname: 'auth' }))!;
  return route.handle({ request, pathname: 'auth', env: { DB: { prepare: (sql: string) => ({ bind: () => ({ first: sql.includes('FROM users') ? mocks.rawFind : mocks.membership }) }) } } as never });
};
beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue(row(UserRole.INSTRUCTOR)); mocks.rawFind.mockResolvedValue(row(UserRole.INSTRUCTOR)); mocks.verify.mockResolvedValue(true);
  mocks.session.mockResolvedValue('new-session=value'); mocks.membership.mockResolvedValue({ organization_id: 'active-org',
    organization_name: 'Existing org', subscription_plan: 'TOB_PAID', organization_role: OrganizationRole.INSTRUCTOR }); });

describe('staff authentication boundary', () => {
  it.each(['bad', null, 1, {}])('rejects malformed entry %j before auth/session work', async (entry) => {
    await expect(run(entry)).rejects.toMatchObject({ status: 400 });
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it('rejects signup entry without creating or granting any role', async () => {
    await expect(run('service-admin', { isSignUp: true, role: UserRole.ADMIN })).rejects.toMatchObject({ status: 400 });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it('verifies credentials before inspecting account role/membership', async () => {
    mocks.verify.mockResolvedValue(false);
    await expect(run('group-admin')).rejects.toMatchObject({ status: 401 });
    expect(mocks.membership).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.rawFind).toHaveBeenCalledOnce();
  });
  it.each(['group-admin', 'service-admin'])('denies wrong entry %s without replacing existing session', async (entry) => {
    await expect(run(entry)).rejects.toMatchObject({ status: 403 }); expect(mocks.session).not.toHaveBeenCalled();
  });
  it('denies missing active membership and stale organization shadow', async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(run('instructor')).rejects.toMatchObject({ status: 403 }); expect(mocks.session).not.toHaveBeenCalled();
  });
  it('denies student membership even on an instructor account', async () => {
    mocks.membership.mockResolvedValue({ organization_id: 'org', organization_role: OrganizationRole.STUDENT });
    await expect(run('instructor')).rejects.toMatchObject({ status: 403 }); expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each(['instructor', 'group-admin', 'service-admin'] as const)('issues a session for matching existing %s', async (entry) => {
    if (entry === 'service-admin') { mocks.find.mockResolvedValue(row(UserRole.ADMIN)); mocks.rawFind.mockResolvedValue(row(UserRole.ADMIN)); }
    if (entry === 'group-admin') mocks.membership.mockResolvedValue({ organization_id: 'org', organization_name: 'Org',
      subscription_plan: 'TOB_PAID', organization_role: OrganizationRole.GROUP_ADMIN });
    const result = await run(entry);
    expect(result.response.headers.get('Set-Cookie')).toBe('new-session=value');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.session).toHaveBeenCalledOnce();
    if (entry === 'service-admin') expect(mocks.membership).not.toHaveBeenCalled();
  });
  it('keeps ordinary student authentication unchanged', async () => {
    mocks.find.mockResolvedValue(row(UserRole.STUDENT));
    await run(undefined); expect(mocks.session).toHaveBeenCalledOnce(); expect(mocks.membership).not.toHaveBeenCalled();
  });
  it.each(['instructor', 'group-admin', 'service-admin'] as const)('saves only matching local existing %s account', async (entry) => {
    const user = IDB_MOCK_USERS.find((candidate) => entry === 'service-admin' ? candidate.role === UserRole.ADMIN
      : candidate.role === UserRole.INSTRUCTOR && (entry === 'group-admin' ? candidate.organizationRole === OrganizationRole.GROUP_ADMIN : candidate.organizationRole === OrganizationRole.INSTRUCTOR))!;
    const store = {};
    const getStore = vi.fn().mockResolvedValue(store);
    const result = await authenticate({ getStore }, user.email, 'password', false, undefined, undefined, entry);
    expect(result?.uid).toBe(user.uid);
    expect(mocks.put).toHaveBeenCalledWith(store, expect.objectContaining({ key: 'current', user: expect.objectContaining({ uid: user.uid, role: user.role }) }));
  });
  it('does not open or overwrite the local session on wrong entry or staff signup', async () => {
    const getStore = vi.fn(); const context = { getStore };
    const instructor = IDB_MOCK_USERS.find((candidate) => candidate.role === UserRole.INSTRUCTOR)!;
    await expect(authenticate(context, instructor.email, 'password', false, undefined, undefined, 'service-admin')).rejects.toThrow('権限');
    await expect(authenticate(context, instructor.email, 'password', true, UserRole.ADMIN, undefined, 'service-admin')).rejects.toThrow('登録');
    expect(getStore).not.toHaveBeenCalled();
  });
});
