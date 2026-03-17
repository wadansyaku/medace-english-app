import { requireUser } from '../auth';
import { handleAiAction } from '../ai-actions';
import { readJson } from '../http';
import {
  ApiRouteDefinition,
  createJsonResponse,
} from './runtime';

export const aiRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'ai' && request.method === 'POST',
    handle: async ({ env, request }) => {
      const user = await requireUser(env, request);
      const body = await readJson<{ action: string; payload?: unknown }>(request);
      const result = await handleAiAction(env, user, body);
      return {
        logUser: user,
        response: createJsonResponse(result),
      };
    },
  },
];
