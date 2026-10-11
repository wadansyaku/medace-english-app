import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleProductFeedback } from '../functions/_shared/product-feedback-actions';
import { productFeedbackRoutes } from '../functions/_shared/api-routes/product-feedback';
import * as auth from '../functions/_shared/auth';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import type { ProductFeedbackList, ProductFeedbackStatus, ProductFeedbackStatusSummary } from '../contracts/productFeedback';
import { createSqliteD1 } from './helpers/sqlite-d1';

const dbs: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { dbs.splice(0).forEach(f => f.sqlite.close()); vi.restoreAllMocks(); });
const input = { title: 'Button issue', version: 'unverified-entered-version', screen: 'Review', steps: 'Press next', expected: 'Next word', actual: 'Blank', impact: 'Cannot continue' };
const setup = () => {
  const f = createSqliteD1(); dbs.push(f);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) f.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  f.sqlite.exec(`INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES ('teacher','teacher@example.invalid','Teacher','INSTRUCTOR',1,1),('other','other@example.invalid','Other','INSTRUCTOR',1,1),('admin','admin@example.invalid','Admin','ADMIN',1,1),('student','student@example.invalid','Student','STUDENT',1,1);
    INSERT INTO organizations(id,display_name,name_key,subscription_plan,status,created_at,updated_at) VALUES ('org','School','school','TOB_PAID','ACTIVE',1,1),('elsewhere','Other','other','TOB_PAID','ACTIVE',1,1);
    INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at,updated_at) VALUES ('org','teacher','INSTRUCTOR','ACTIVE',1,1),('org','other','INSTRUCTOR','ACTIVE',1,1);`);
  const env = { DB: f.DB } as AppEnv;
  const user = (id = 'teacher') => f.sqlite.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as DbUserRow;
  const run = (body: unknown, actor = 'teacher') => handleProductFeedback(env, user(actor), body);
  const seed = (id: string, status: ProductFeedbackStatus, owner = 'teacher', org: string | null = 'org', at = 42) => {
    f.sqlite.prepare('INSERT INTO product_feedback_reports(id,reporter_user_id,org_id,create_fingerprint,input_json,revision,status,fix_revision,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?,?)').run(id, owner, org, 'fingerprint', JSON.stringify(input), status, 'manually-entered-fix', at, at);
  };
  return { ...f, env, user, run, seed };
};

describe('current authorized feedback counts and filtered routes', () => {
  it('aggregates all six states for only the current teacher and organization; administrators see all', async () => {
    const f = setup();
    const statuses: ProductFeedbackStatus[] = ['NEW', 'TRIAGED', 'HANDOFF_PREPARED', 'FIXED', 'RETEST_PASS', 'RETEST_FAIL'];
    statuses.forEach((status, i) => f.seed(`own-${i}`, status));
    f.seed('own-fixed-2', 'FIXED'); f.seed('other-fixed', 'FIXED', 'other'); f.seed('old-org-fixed', 'FIXED', 'teacher', 'elsewhere'); f.seed('admin-new', 'NEW', 'admin', null);
    const prepare = vi.spyOn(f.DB, 'prepare');
    const own = await f.run({ action: 'status-summary' }) as ProductFeedbackStatusSummary;
    expect(own).toMatchObject({ counts: { NEW: 1, TRIAGED: 1, HANDOFF_PREPARED: 1, FIXED: 2, RETEST_PASS: 1, RETEST_FAIL: 1 }, canManage: false, scope: 'own-current-organization', actualDeploymentRevision: null });
    expect(own.fetchedAt).toBeGreaterThan(0); expect(prepare).toHaveBeenCalledTimes(3);
    expect(prepare.mock.calls.some(([sql]) => /input_json|product_feedback_events|SELECT \*/.test(sql))).toBe(false);
    f.env.DEPLOYMENT_SHA = 'runtime-trusted-revision'; prepare.mockClear();
    expect(await f.run({ action: 'status-summary' }, 'admin')).toMatchObject({ counts: { NEW: 2, FIXED: 4 }, canManage: true, scope: 'all', actualDeploymentRevision: 'runtime-trusted-revision' });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(own)).not.toMatch(/Button issue|manually-entered|teacher|org_id|reporter|reports|history|unverified/);
    f.sqlite.exec("UPDATE organization_memberships SET organization_id='elsewhere' WHERE user_id='teacher'");
    expect(await f.run({ action: 'status-summary' })).toMatchObject({ counts: { NEW: 0, FIXED: 1 } });
    expect(await f.run({ action: 'list', status: 'FIXED' })).toMatchObject({ reports: [{ id: 'old-org-fixed' }] });
  });

  it('requires the live role, membership and active organization and forbids client scope injection', async () => {
    const f = setup(); f.seed('fixed', 'FIXED');
    await expect(f.run({ action: 'status-summary' }, 'student')).rejects.toMatchObject({ status: 403 });
    for (const extra of [{ uid: 'other' }, { role: 'ADMIN' }, { orgId: 'elsewhere' }, { status: 'FIXED' }, { cursor: 'anything' }]) {
      await expect(f.run({ action: 'status-summary', ...extra }, 'admin')).rejects.toMatchObject({ status: 400 });
    }
    f.sqlite.exec("UPDATE organization_memberships SET role='STUDENT' WHERE user_id='teacher'");
    for (const body of [{ action: 'status-summary' }, { action: 'list', status: 'FIXED' }]) await expect(f.run(body)).rejects.toMatchObject({ status: 403 });
    f.sqlite.exec("UPDATE organization_memberships SET role='GROUP_ADMIN' WHERE user_id='teacher'");
    expect(await f.run({ action: 'status-summary' })).toMatchObject({ canManage: false, counts: { FIXED: 1 } });
    f.sqlite.exec("UPDATE organization_memberships SET status='INACTIVE' WHERE user_id='teacher'");
    await expect(f.run({ action: 'status-summary' })).rejects.toMatchObject({ status: 403 });
    f.sqlite.exec("UPDATE organization_memberships SET status='ACTIVE' WHERE user_id='teacher'; UPDATE organizations SET status='SUSPENDED' WHERE id='org'");
    await expect(f.run({ action: 'status-summary' })).rejects.toMatchObject({ status: 403 });
    expect(await f.run({ action: 'status-summary' }, 'admin')).toMatchObject({ counts: { FIXED: 1 } });
  });

  it('returns confirmed zeros without reading report bodies and propagates failed or malformed aggregate reads', async () => {
    const f = setup();
    expect(await f.run({ action: 'status-summary' })).toMatchObject({ counts: { NEW: 0, TRIAGED: 0, HANDOFF_PREPARED: 0, FIXED: 0, RETEST_PASS: 0, RETEST_FAIL: 0 } });
    f.seed('fixed', 'FIXED'); f.sqlite.exec("UPDATE product_feedback_reports SET input_json='invalid JSON'");
    expect(await f.run({ action: 'status-summary' })).toMatchObject({ counts: { FIXED: 1 } });
    const original = f.DB.prepare.bind(f.DB);
    for (const result of [{ success: false, results: [] }, { success: true }, { success: true, results: [{ status: 'FIXED', count: -1 }] }, { success: true, results: [{ status: 'UNKNOWN', count: 1 }] }]) {
      const spy = vi.spyOn(f.DB, 'prepare').mockImplementation(sql => {
        const statement = original(sql);
        if (sql.includes('COUNT(*) AS count')) statement.all = vi.fn().mockResolvedValue(result);
        return statement;
      });
      await expect(f.run({ action: 'status-summary' }, 'admin')).rejects.toThrow('Feedback status read failed'); spy.mockRestore();
    }
  });

  it('selects matching reports across pages and binds cursors to the exact enum filter, preserving ALL cursors', async () => {
    const f = setup();
    for (let i = 0; i < 103; i++) f.seed(`fixed-${i}`, 'FIXED');
    for (let i = 0; i < 120; i++) f.seed(`new-${i}`, 'NEW', 'teacher', 'org', 100);
    f.seed('another-fixed', 'FIXED', 'other', 'org', 200);
    const page = await f.run({ action: 'list', status: 'FIXED' }) as ProductFeedbackList;
    const next = await f.run({ action: 'list', status: 'FIXED', cursor: page.nextCursor }) as ProductFeedbackList;
    expect(page.reports).toHaveLength(100); expect(next.reports).toHaveLength(3); expect(next.nextCursor).toBeNull();
    expect(new Set([...page.reports, ...next.reports].map(row => row.id)).size).toBe(103);
    expect(page.reports.every(row => row.status === 'FIXED' && row.isOwnReport)).toBe(true);
    expect(JSON.parse(atob(page.nextCursor!))).toMatchObject({ at: 42, status: 'FIXED' });
    const all = await f.run({ action: 'list' }) as ProductFeedbackList;
    expect(JSON.parse(atob(all.nextCursor!))).not.toHaveProperty('status');
    expect((await f.run({ action: 'list', cursor: all.nextCursor }) as ProductFeedbackList).reports).toHaveLength(100);
    for (const body of [{ action: 'list', cursor: page.nextCursor }, { action: 'list', status: 'NEW', cursor: page.nextCursor }, { action: 'list', status: 'FIXED', cursor: all.nextCursor }, { action: 'list', status: 'ALL' }, { action: 'list', status: 'fixed' }, { action: 'list', status: ['FIXED'] }]) await expect(f.run(body)).rejects.toMatchObject({ status: 400 });
    expect((await f.run({ action: 'list', status: 'FIXED' }, 'admin') as ProductFeedbackList).reports[0].id).toBe('another-fixed');
  });

  it('uses the existing POST route with fresh authentication and same-origin enforcement', async () => {
    const f = setup(); f.seed('fixed', 'FIXED');
    const route = productFeedbackRoutes[0];
    const context = (origin = 'https://app.test') => ({ env: f.env, pathname: 'product-feedback', request: new Request('https://app.test/api/product-feedback', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ action: 'status-summary' }) }) });
    vi.spyOn(auth, 'requireUser').mockRejectedValueOnce(Object.assign(new Error('login required'), { status: 401 }));
    await expect(route.handle(context())).rejects.toMatchObject({ status: 401 });
    vi.mocked(auth.requireUser).mockResolvedValue(f.user());
    const result = await route.handle(context()); expect(result.response.status).toBe(200);
    expect(await result.response.json()).toMatchObject({ counts: { FIXED: 1 }, scope: 'own-current-organization' });
    await expect(route.handle(context('https://evil.test'))).rejects.toMatchObject({ status: 403 });
    vi.mocked(auth.requireUser).mockResolvedValue(f.user('student'));
    await expect(route.handle(context())).rejects.toMatchObject({ status: 403 });
  });
});
