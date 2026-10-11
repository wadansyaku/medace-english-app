import { describe, expect, it, vi } from 'vitest';

import { SubscriptionPlan, OrganizationRole, UserRole } from '../types';
import { hydrateUserOrganizationFromMembership, maybeSyncBusinessMembershipFromUser, readActiveOrganizationContextForUser } from '../functions/_shared/organization-memberships';
import type { AppEnv, D1PreparedStatement, DbUserRow } from '../functions/_shared/types';

const createEnvWithActiveMembership = (row: Record<string, unknown> | null): AppEnv => {
  const statement: D1PreparedStatement = {
    bind: () => statement,
    first: async <TRow = Record<string, unknown>>() => row as TRow | null,
    all: async <TRow = Record<string, unknown>>() => ({ meta: {}, results: row ? [row as TRow] : [] }),
    run: async () => ({ meta: {} }),
  };

  return {
    DB: {
      prepare: () => statement,
      batch: async () => [],
    },
  };
};

const createUser = (overrides: Partial<DbUserRow> = {}): DbUserRow => ({
  id: overrides.id || 'user-1',
  email: overrides.email || 'user@example.com',
  password_hash: overrides.password_hash || null,
  display_name: overrides.display_name || 'User One',
  role: overrides.role || 'student',
  grade: overrides.grade || null,
  english_level: overrides.english_level || null,
  subscription_plan: overrides.subscription_plan || SubscriptionPlan.TOC_FREE,
  organization_id: overrides.organization_id || null,
  organization_name: overrides.organization_name || null,
  organization_role: overrides.organization_role || null,
  study_mode: overrides.study_mode || null,
  stats_xp: overrides.stats_xp || 0,
  stats_level: overrides.stats_level || 1,
  stats_current_streak: overrides.stats_current_streak || 0,
  stats_last_login_date: overrides.stats_last_login_date || null,
  created_at: overrides.created_at || 1,
  updated_at: overrides.updated_at || 1,
});

describe('organization membership hydration', () => {
  it('clears organization shadow and business entitlements when no active membership remains', async () => {
    const hydrated = await hydrateUserOrganizationFromMembership(
      createEnvWithActiveMembership(null),
      createUser({
        subscription_plan: SubscriptionPlan.TOB_PAID,
        organization_id: 'org-1',
        organization_name: 'MedAce School',
        organization_role: 'STUDENT',
      }),
    );

    expect(hydrated.subscription_plan).toBe(SubscriptionPlan.TOC_FREE);
    expect(hydrated.organization_id).toBeNull();
    expect(hydrated.organization_name).toBeNull();
    expect(hydrated.organization_role).toBeNull();
  });

  it('clears stale business entitlements even after organization shadow was already removed', async () => {
    const hydrated = await hydrateUserOrganizationFromMembership(
      createEnvWithActiveMembership(null),
      createUser({
        subscription_plan: SubscriptionPlan.TOB_FREE,
      }),
    );

    expect(hydrated.subscription_plan).toBe(SubscriptionPlan.TOC_FREE);
    expect(hydrated.organization_id).toBeNull();
    expect(hydrated.organization_name).toBeNull();
    expect(hydrated.organization_role).toBeNull();
  });

  it('preserves personal subscriptions when no membership exists', async () => {
    const user = createUser({
      subscription_plan: SubscriptionPlan.TOC_PAID,
    });

    await expect(
      hydrateUserOrganizationFromMembership(createEnvWithActiveMembership(null), user),
    ).resolves.toEqual(user);
  });
});


describe('legacy membership bootstrap respects canonical authorization', () => {
  const setup = (membership: Record<string, unknown> | null, organizationStatus = 'ACTIVE') => {
    const writes = vi.fn(async () => ({ meta: {} }));
    const sqls: string[] = [];
    const env: AppEnv = { DB: { prepare: (sql) => {
      sqls.push(sql);
      const statement: D1PreparedStatement = { bind: () => statement,
        first: async <T>() => (sql.includes('FROM organization_memberships') ? membership : {
          id: 'legacy-org', display_name: 'Legacy org', subscription_plan: SubscriptionPlan.TOB_PAID, status: organizationStatus,
        }) as T | null, all: async () => ({ meta: {}, results: [] }), run: writes };
      return statement;
    }, batch: async () => [] } };
    return { env, writes, sqls };
  };
  const legacy = createUser({ role: UserRole.INSTRUCTOR, organization_id: 'legacy-org',
    organization_role: OrganizationRole.GROUP_ADMIN, subscription_plan: SubscriptionPlan.TOB_PAID });

  it.each(['ACTIVE', 'INACTIVE'])('never overwrites an existing %s membership from stale admin shadow', async (status) => {
    const { env, writes } = setup({ user_id: legacy.id, organization_id: 'other-org', role: OrganizationRole.INSTRUCTOR, status });
    await maybeSyncBusinessMembershipFromUser(env, legacy);
    expect(writes).not.toHaveBeenCalled();
  });
  it('does not bootstrap into an inactive organization', async () => {
    const { env, writes } = setup(null, 'INACTIVE');
    await maybeSyncBusinessMembershipFromUser(env, legacy);
    expect(writes).not.toHaveBeenCalled();
  });
  it('preserves first-time legacy bootstrap with an atomic non-overwriting insert', async () => {
    const { env, writes, sqls } = setup(null);
    await maybeSyncBusinessMembershipFromUser(env, legacy);
    expect(writes).toHaveBeenCalledOnce();
    const insert = sqls.find((sql) => sql.includes('INSERT INTO organization_memberships'))!;
    expect(insert).toContain('WHERE NOT EXISTS');
    expect(insert).toContain("AND status = 'ACTIVE'");
    expect(insert).toContain('DO NOTHING');
    expect(sqls.some((sql) => sql.includes('UPDATE users') || sql.includes('UPDATE organizations'))).toBe(false);
  });
  it('requires active organization as well as active membership on reads', async () => {
    const { env, sqls } = setup(null);
    await readActiveOrganizationContextForUser(env, legacy.id);
    expect(sqls[0]).toContain("m.status = 'ACTIVE'");
    expect(sqls[0]).toContain("o.status = 'ACTIVE'");
  });
  it('hydrates the canonical lower role and other organization over stale admin shadow', async () => {
    const env = createEnvWithActiveMembership({ organization_id: 'other-org', organization_name: 'Canonical org',
      organization_role: OrganizationRole.INSTRUCTOR, subscription_plan: SubscriptionPlan.TOB_FREE });
    const hydrated = await hydrateUserOrganizationFromMembership(env, legacy);
    expect(hydrated.organization_role).toBe(OrganizationRole.INSTRUCTOR);
    expect(hydrated.organization_id).toBe('other-org');
    expect(hydrated.subscription_plan).toBe(SubscriptionPlan.TOB_FREE);
  });
});
