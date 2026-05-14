import { describe, expect, it, vi } from 'vitest';

import { handleGetCommercialRequestStatus } from '../functions/_shared/commercial-actions';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import {
  CommercialRequestKind,
  CommercialRequestStatus,
  SubscriptionPlan,
  UserRole,
} from '../types';

interface DbCommercialRequestFixture {
  id: number;
  kind: CommercialRequestKind;
  status: CommercialRequestStatus;
  contact_name: string;
  contact_email: string;
  normalized_contact_email: string;
  organization_name: string | null;
  teaching_format: string | null;
  desired_start_timing: string | null;
  requested_workspace_role: string | null;
  seat_estimate: string | null;
  message: string;
  source: string;
  requested_by_user_id: string | null;
  linked_user_id: string | null;
  target_subscription_plan: string | null;
  target_organization_id: string | null;
  target_organization_name: string | null;
  target_organization_role: string | null;
  resolution_note: string | null;
  created_at: number;
  updated_at: number;
}

const currentUser: DbUserRow = {
  id: 'user-current',
  email: 'teacher@example.com',
  password_hash: null,
  display_name: 'Current Teacher',
  role: UserRole.INSTRUCTOR,
  grade: null,
  english_level: null,
  subscription_plan: SubscriptionPlan.TOC_FREE,
  organization_id: null,
  organization_name: null,
  organization_role: null,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 1,
  updated_at: 1,
};

const makeCommercialRequestRow = (
  overrides: Partial<DbCommercialRequestFixture>,
): DbCommercialRequestFixture => ({
  id: 1,
  kind: CommercialRequestKind.BUSINESS_TRIAL,
  status: CommercialRequestStatus.OPEN,
  contact_name: '田中 直人',
  contact_email: 'contact@example.com',
  normalized_contact_email: 'contact@example.com',
  organization_name: 'Steady Study Academy',
  teaching_format: null,
  desired_start_timing: null,
  requested_workspace_role: null,
  seat_estimate: null,
  message: '導入相談をしたいです。',
  source: 'PUBLIC_GUIDE',
  requested_by_user_id: null,
  linked_user_id: null,
  target_subscription_plan: null,
  target_organization_id: null,
  target_organization_name: null,
  target_organization_role: null,
  resolution_note: null,
  created_at: 100,
  updated_at: 100,
  ...overrides,
});

const createCommercialStatusDb = (rows: DbCommercialRequestFixture[]) => {
  const db = {
    lastSql: '',
    lastBindings: [] as unknown[],
    prepare: vi.fn((sql: string) => {
      db.lastSql = sql;
      const statement = {
        bind: vi.fn((...bindings: unknown[]) => {
          db.lastBindings = bindings;
          return statement;
        }),
        all: vi.fn(async () => {
          const [requestedByUserId, normalizedEmail] = db.lastBindings;
          const results = rows.filter((row) => {
            const requestedByUserMatches = row.requested_by_user_id === requestedByUserId;
            if (!sql.includes('normalized_contact_email = ?')) return requestedByUserMatches;
            return requestedByUserMatches || row.normalized_contact_email === normalizedEmail;
          });
          return { meta: {}, results };
        }),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ meta: {}, success: true })),
      };
      return statement;
    }),
    batch: vi.fn(async () => []),
  };
  return db;
};

describe('commercial request status actions', () => {
  it('does not expose another user request through an unverified email match', async () => {
    const db = createCommercialStatusDb([
      makeCommercialRequestRow({
        id: 1,
        requested_by_user_id: 'other-user',
        contact_email: 'teacher@example.com',
        normalized_contact_email: 'teacher@example.com',
      }),
    ]);

    const requests = await handleGetCommercialRequestStatus({ DB: db } as unknown as AppEnv, currentUser);

    expect(requests).toEqual([]);
    expect(db.lastSql).not.toContain('normalized_contact_email');
    expect(db.lastBindings).toEqual(['user-current']);
  });

  it('returns requests submitted by the current user id even when the contact email differs', async () => {
    const db = createCommercialStatusDb([
      makeCommercialRequestRow({
        id: 2,
        contact_email: 'billing@example.com',
        normalized_contact_email: 'billing@example.com',
        requested_by_user_id: 'user-current',
      }),
      makeCommercialRequestRow({
        id: 3,
        contact_email: 'teacher@example.com',
        normalized_contact_email: 'teacher@example.com',
        requested_by_user_id: 'other-user',
      }),
    ]);

    const requests = await handleGetCommercialRequestStatus({ DB: db } as unknown as AppEnv, currentUser);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      id: 2,
      requestedByUid: 'user-current',
      contactEmail: 'billing@example.com',
    });
    expect(db.lastBindings).toEqual(['user-current']);
  });
});
