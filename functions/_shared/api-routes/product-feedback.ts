import { requireUser } from '../auth';
import { readJson } from '../http';
import { assertSameOriginMutation } from '../request-guards';
import { handleProductFeedback } from '../product-feedback-actions';
import { createJsonResponse, type ApiRouteDefinition } from './runtime';

export const productFeedbackRoutes: ApiRouteDefinition[] = [{
  matches: ({ pathname, request }) => pathname === 'product-feedback' && request.method === 'POST',
  handle: async ({ env, request }) => {
    assertSameOriginMutation(request);
    const user = await requireUser(env, request);
    const body = await readJson<unknown>(request, { maxBytes: 48 * 1024 });
    return { logUser: user, response: createJsonResponse(await handleProductFeedback(env, user, body)) };
  },
}];
