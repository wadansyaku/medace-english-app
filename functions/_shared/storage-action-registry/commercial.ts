import { UserRole } from '../../../types';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEmptyPayload, expectObject } from '../request-validation';
import {
  handleCreateCommercialRequest,
  handleGetCommercialRequestStatus,
  handleListCommercialRequests,
  handleUpdateCommercialRequest,
} from '../commercial-actions';

export const commercialStorageActionDefinitions = {
  getCommercialRequestStatus: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetCommercialRequestStatus(env, user),
  }),
  submitCommercialRequest: defineStorageAction({
    parse: (payload) => expectObject(payload) as never,
    execute: ({ env, user }, payload) => handleCreateCommercialRequest(env, payload, user),
  }),
  listCommercialRequests: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN],
    execute: ({ env }) => handleListCommercialRequests(env),
  }),
  updateCommercialRequest: defineStorageAction({
    parse: (payload) => expectObject(payload) as never,
    roles: [UserRole.ADMIN],
    execute: ({ env, user }, payload) => handleUpdateCommercialRequest(env, user, payload),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  'getCommercialRequestStatus' | 'submitCommercialRequest' | 'listCommercialRequests' | 'updateCommercialRequest'
>;
