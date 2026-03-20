import { describe, expect, it } from 'vitest';

import { SubscriptionPlan } from '../types';
import { hydrateUserOrganizationFromMembership } from '../functions/_shared/organization-memberships';
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
