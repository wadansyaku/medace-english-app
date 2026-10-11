// Production demo requests must stop before creating identities or organization data.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationRole, UserRole } from '../types';
import { authProfileRoutes } from '../functions/_shared/api-routes/auth-profile';

const mocks = vi.hoisted(() => ({
  ensureDemoUser: vi.fn(),
  createSession: vi.fn(),
  mapUserRowToProfile: vi.fn(),
}));

vi.mock('../functions/_shared/auth', async (original) => ({
  ...await original<object>(),
  ensureDemoUser: mocks.ensureDemoUser,
  createSession: mocks.createSession,
  mapUserRowToProfile: mocks.mapUserRowToProfile,
}));

const prepare = vi.fn(() => { throw new Error('UNEXPECTED_D1_PREPARE'); });
const batch = vi.fn(() => { throw new Error('UNEXPECTED_D1_BATCH'); });
const exec = vi.fn(() => { throw new Error('UNEXPECTED_D1_EXEC'); });

const run = (
  hostname: string,
  body: { role: UserRole; organizationRole?: OrganizationRole },
  flag?: string,
) => {
  const origin = `https://${hostname}`;
  const request = new Request(`${origin}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: 'existing-session=preserved' },
    body: JSON.stringify({ action: 'demo-login', ...body }),
  });
  const env = { DB: { prepare, batch, exec }, ...(flag === undefined ? {} : { ENABLE_PUBLIC_BUSINESS_DEMO: flag }) } as never;
  const context = { request, env, pathname: 'auth' };
  const route = authProfileRoutes.find((candidate) => candidate.matches(context));
  if (!route) throw new Error('AUTH_ROUTE_MISSING');
  return { promise: route.handle(context), env };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureDemoUser.mockResolvedValue({ id: 'synthetic-demo-user' });
  mocks.createSession.mockResolvedValue('synthetic-session=value');
  mocks.mapUserRowToProfile.mockReturnValue({ uid: 'synthetic-demo-user' });
});

describe('production business demo guard before D1 work', () => {
  const businessCases = [
    { label: 'instructor', body: { role: UserRole.INSTRUCTOR } },
    { label: 'group-admin', body: { role: UserRole.INSTRUCTOR, organizationRole: OrganizationRole.GROUP_ADMIN } },
    { label: 'affiliated-student', body: { role: UserRole.STUDENT, organizationRole: OrganizationRole.STUDENT } },
  ];

  for (const hostname of ['medace-english-app.pages.dev', 'study.example.invalid']) {
    it.each(businessCases)(`${hostname} rejects $label with no demo flag before user, session, or D1 operations`, async ({ body }) => {
      const { promise } = run(hostname, body);
      await expect(promise).rejects.toMatchObject({
        name: 'HttpError', status: 403,
        message: '学校・教室向けデモは preview / 個別案内のみです。',
      });
      // The exact business message and valid same-origin headers exclude an unrelated 403 guard.
      expect(mocks.ensureDemoUser).not.toHaveBeenCalled();
      expect(mocks.createSession).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
      expect(exec).not.toHaveBeenCalled();
    });
  }

  it('still permits the ordinary student demo without an organizationRole on production', async () => {
    const { promise, env } = run('medace-english-app.pages.dev', { role: UserRole.STUDENT });
    const result = await promise;
    expect(result.response.status).toBe(200);
    expect(mocks.ensureDemoUser).toHaveBeenCalledWith(env, UserRole.STUDENT, undefined);
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it('preserves an explicitly enabled production business demo', async () => {
    const body = { role: UserRole.INSTRUCTOR, organizationRole: OrganizationRole.INSTRUCTOR };
    const { promise, env } = run('medace-english-app.pages.dev', body, 'true');
    await expect(promise).resolves.toMatchObject({ response: expect.any(Response) });
    expect(mocks.ensureDemoUser).toHaveBeenCalledWith(env, body.role, body.organizationRole);
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it('keeps Pages preview default business demos enabled', async () => {
    const body = { role: UserRole.INSTRUCTOR, organizationRole: OrganizationRole.INSTRUCTOR };
    const { promise, env } = run('preview.medace-english-app.pages.dev', body);
    await promise;
    expect(mocks.ensureDemoUser).toHaveBeenCalledWith(env, body.role, body.organizationRole);
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });
});
