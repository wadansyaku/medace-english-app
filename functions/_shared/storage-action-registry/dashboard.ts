import { UserRole } from '../../../types';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEmptyPayload, expectEnum, expectNumber, expectObject, expectOptionalString } from '../request-validation';
import { handleIssuePasswordResetLink } from '../password-reset-actions';
import { handleGetAdminDashboardSnapshot, handleGetDashboardSnapshot, handleGetLeaderboard, handleGetMasteryDistribution, handleUpdatePasswordRecoveryRequest } from '../storage-dashboard-actions';

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
  updatePasswordRecoveryRequest: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        requestId: expectNumber(record, 'requestId'),
        status: expectEnum(record.status, ['OPEN', 'RESOLVED'] as const, 'status'),
        resolutionNote: expectOptionalString(record, 'resolutionNote'),
      };
    },
    roles: [UserRole.ADMIN],
    execute: ({ env, user }, payload) => handleUpdatePasswordRecoveryRequest(env, user, payload),
  }),
  issuePasswordResetLink: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        requestId: expectNumber(record, 'requestId'),
      };
    },
    roles: [UserRole.ADMIN],
    execute: ({ env, request, user }, payload) => handleIssuePasswordResetLink(env, request, user, payload),
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
  'getDashboardSnapshot' | 'getAdminDashboardSnapshot' | 'updatePasswordRecoveryRequest' | 'issuePasswordResetLink' | 'getLeaderboard' | 'getMasteryDistribution'
>;
