import { HttpError } from '../http';
import { runProductAnalyticsSnapshotJob } from '../product-kpi';
import {
  ApiRouteDefinition,
  createJsonResponse,
} from './runtime';

const INTERNAL_JOB_SECRET_HEADER = 'X-Internal-Job-Secret';

const requireInternalJobSecret = (env: { INTERNAL_JOB_SECRET?: string }, request: Request): void => {
  const expected = env.INTERNAL_JOB_SECRET;
  if (!expected) {
    throw new HttpError(503, 'INTERNAL_JOB_SECRET が設定されていません。');
  }

  const provided = request.headers.get(INTERNAL_JOB_SECRET_HEADER);
  if (!provided || provided !== expected) {
    throw new HttpError(401, '内部ジョブ認証に失敗しました。');
  }
};

export const analyticsRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'internal/analytics-snapshots/run' && request.method === 'POST',
    handle: async ({ env, request }) => {
      requireInternalJobSecret(env, request);
      const result = await runProductAnalyticsSnapshotJob(env);
      return {
        response: createJsonResponse(result),
      };
    },
  },
];
