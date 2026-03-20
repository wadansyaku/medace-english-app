import type { StorageAction, StorageActionRequest } from '../../../contracts/storage';
import { requireUser } from '../auth';
import { readJson } from '../http';
import { assertSameOriginMutation } from '../request-guards';
import { handleStorageAction } from '../storage-actions';
import {
  ApiRouteDefinition,
  createJsonResponse,
} from './runtime';

export const storageRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'storage' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      const body = await readJson<StorageActionRequest<StorageAction>>(request);
      const result = await handleStorageAction(env, user, body, request);
      return {
        logUser: user,
        response: createJsonResponse(result),
      };
    },
  },
];
