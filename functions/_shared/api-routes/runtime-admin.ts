import { requireRole, requireUser } from '../auth';
import { readJson } from '../http';
import { assertSameOriginMutation } from '../request-guards';
import { replayPendingSideEffectJobs } from '../side-effect-jobs';
import { UserRole } from '../../../types';
import { ApiRouteDefinition, createJsonResponse } from './runtime';

interface ReplaySideEffectJobsBody {
  limit?: number;
}

export const runtimeAdminRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'runtime/side-effect-jobs/replay' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      requireRole(user, [UserRole.ADMIN]);
      const body: ReplaySideEffectJobsBody = await readJson<ReplaySideEffectJobsBody>(request).catch(() => ({}));
      const limit = typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(100, Math.trunc(body.limit)))
        : 20;
      const result = await replayPendingSideEffectJobs(env, limit);
      return {
        logUser: user,
        response: createJsonResponse({
          completed: result.completed,
          failed: result.failed,
          limit,
          results: result.results,
        }),
      };
    },
  },
];
