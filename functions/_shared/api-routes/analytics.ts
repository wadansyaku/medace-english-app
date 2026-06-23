import { runProductAnalyticsSnapshotJob } from '../product-kpi';
import { assertInternalJobMutation } from '../request-guards';
import {
  ApiRouteDefinition,
  createJsonResponse,
} from './runtime';

export const analyticsRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'internal/analytics-snapshots/run' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertInternalJobMutation(env, request);
      const result = await runProductAnalyticsSnapshotJob(env);
      return {
        response: createJsonResponse(result),
      };
    },
  },
];
