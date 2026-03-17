import { UserRole } from '../../../types';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEmptyPayload } from '../request-validation';
import { handleGetAdminDashboardSnapshot, handleGetDashboardSnapshot, handleGetLeaderboard, handleGetMasteryDistribution } from '../storage-dashboard-actions';

export const dashboardStorageActionDefinitions = {
  getDashboardSnapshot: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetDashboardSnapshot(env, user),
  }),
  getAdminDashboardSnapshot: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN],
    execute: ({ env, user }) => handleGetAdminDashboardSnapshot(env, user),
  }),
  getLeaderboard: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetLeaderboard(env, user.id),
  }),
  getMasteryDistribution: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetMasteryDistribution(env, user.id),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  'getDashboardSnapshot' | 'getAdminDashboardSnapshot' | 'getLeaderboard' | 'getMasteryDistribution'
>;
