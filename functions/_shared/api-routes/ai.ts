import type { AnyAiActionRequest } from '../../../contracts/ai';
import { requireUser } from '../auth';
import { handleAiAction } from '../ai-actions';
import { readJson } from '../http';
import { assertSameOriginMutation } from '../request-guards';
import {
  ApiRouteDefinition,
  createApiRequestLogContext,
  createJsonResponse,
} from './runtime';

export const aiRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'ai' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      const body = await readJson<AnyAiActionRequest>(request);
      const result = await handleAiAction(env, user, body, {
        ...createApiRequestLogContext(request, env, 'ai'),
        source: 'api.ai',
      });
      return {
        logUser: user,
        response: createJsonResponse(result),
      };
    },
  },
];
