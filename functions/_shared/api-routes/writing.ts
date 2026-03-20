import { requireUser } from '../auth';
import { handleWritingAssetUpload, handleWritingRequest } from '../writing-actions';
import { assertSameOriginMutation } from '../request-guards';
import {
  ApiRouteDefinition,
  createApiRequestLogContext,
} from './runtime';

export const writingRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname.startsWith('writing/upload/') && request.method === 'PUT',
    handle: async ({ env, pathname, request }) => {
      assertSameOriginMutation(request);
      return {
        response: await handleWritingAssetUpload(env, pathname.replace(/^writing\/upload\//, ''), request),
      };
    },
  },
  {
    matches: ({ pathname }) => pathname === 'writing' || pathname.startsWith('writing/'),
    handle: async ({ env, pathname, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      return {
        logUser: user,
        response: await handleWritingRequest(
          env,
          user,
          request,
          pathname.replace(/^writing/, ''),
          {
            ...createApiRequestLogContext(request, env, pathname || 'writing'),
            source: 'writing',
          },
        ),
      };
    },
  },
];
