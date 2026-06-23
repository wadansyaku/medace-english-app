import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiRouteDefinition } from '../functions/_shared/api-routes/runtime';
import {
  INTERNAL_JOB_SECRET_HEADER,
} from '../functions/_shared/request-guards';

const {
  handleGetWordHintImageResponseMock,
  runProductAnalyticsSnapshotJobMock,
  runWordHintAuditSweepMock,
} = vi.hoisted(() => ({
  handleGetWordHintImageResponseMock: vi.fn(),
  runProductAnalyticsSnapshotJobMock: vi.fn(),
  runWordHintAuditSweepMock: vi.fn(),
}));

vi.mock('../functions/_shared/product-kpi', () => ({
  runProductAnalyticsSnapshotJob: runProductAnalyticsSnapshotJobMock,
}));

vi.mock('../functions/_shared/word-hint-assets', () => ({
  handleGetWordHintImageResponse: handleGetWordHintImageResponseMock,
  runWordHintAuditSweep: runWordHintAuditSweepMock,
}));

import { analyticsRoutes } from '../functions/_shared/api-routes/analytics';
import { wordHintRoutes } from '../functions/_shared/api-routes/word-hints';

const findRoute = (
  routes: ApiRouteDefinition[],
  pathname: string,
  request: Request,
): ApiRouteDefinition => {
  const route = routes.find((candidate) => candidate.matches({
    env: {} as never,
    request,
    pathname,
  }));
  if (!route) {
    throw new Error(`Route not found: ${pathname}`);
  }
  return route;
};

const createInternalJobRequest = (
  pathname: string,
  headers: HeadersInit = {},
  body?: string,
): Request => new Request(`https://steady-study.example/api/${pathname}`, {
  method: 'POST',
  headers,
  body,
});

const routeCases = [
  {
    name: 'analytics snapshots',
    pathname: 'internal/analytics-snapshots/run',
    routes: analyticsRoutes,
    jobMock: runProductAnalyticsSnapshotJobMock,
    arrangeSuccess: () => {
      runProductAnalyticsSnapshotJobMock.mockResolvedValueOnce({
        dateKey: '2026-06-22',
        organizationSnapshotsUpdated: 0,
        snapshot: { dateKey: '2026-06-22' },
      });
    },
  },
  {
    name: 'word hint audits',
    pathname: 'internal/word-hint-audits/run',
    routes: wordHintRoutes,
    jobMock: runWordHintAuditSweepMock,
    body: JSON.stringify({ limit: 2, staleAfterHours: 168 }),
    arrangeSuccess: () => {
      runWordHintAuditSweepMock.mockResolvedValueOnce({
        limit: 2,
        staleAfterHours: 168,
        auditedCount: 0,
        exampleAudits: 0,
        imageAudits: 0,
        approvedCount: 0,
        reviewRequiredCount: 0,
        failedCount: 0,
      });
    },
  },
];

describe('internal job route mutation guards', () => {
  beforeEach(() => {
    handleGetWordHintImageResponseMock.mockReset();
    runProductAnalyticsSnapshotJobMock.mockReset();
    runWordHintAuditSweepMock.mockReset();
  });

  for (const routeCase of routeCases) {
    it(`allows ${routeCase.name} POSTs without browser provenance headers when the secret matches`, async () => {
      routeCase.arrangeSuccess();
      const request = createInternalJobRequest(
        routeCase.pathname,
        {
          [INTERNAL_JOB_SECRET_HEADER]: 'expected-secret',
          ...(routeCase.body ? { 'Content-Type': 'application/json' } : {}),
        },
        routeCase.body,
      );
      const route = findRoute(routeCase.routes, routeCase.pathname, request);

      await expect(route.handle({
        env: { INTERNAL_JOB_SECRET: 'expected-secret' } as never,
        request,
        pathname: routeCase.pathname,
      })).resolves.toMatchObject({
        response: expect.any(Response),
      });
      expect(routeCase.jobMock).toHaveBeenCalledTimes(1);
    });

    it(`returns 503 for ${routeCase.name} when INTERNAL_JOB_SECRET is unset`, async () => {
      const request = createInternalJobRequest(
        routeCase.pathname,
        { [INTERNAL_JOB_SECRET_HEADER]: 'expected-secret' },
        routeCase.body,
      );
      const route = findRoute(routeCase.routes, routeCase.pathname, request);

      await expect(route.handle({
        env: {} as never,
        request,
        pathname: routeCase.pathname,
      })).rejects.toMatchObject({
        name: 'HttpError',
        status: 503,
        message: 'INTERNAL_JOB_SECRET が設定されていません。',
      });
      expect(routeCase.jobMock).not.toHaveBeenCalled();
    });

    it(`returns 401 for ${routeCase.name} when the internal secret does not match`, async () => {
      const request = createInternalJobRequest(
        routeCase.pathname,
        { [INTERNAL_JOB_SECRET_HEADER]: 'wrong-secret' },
        routeCase.body,
      );
      const route = findRoute(routeCase.routes, routeCase.pathname, request);

      await expect(route.handle({
        env: { INTERNAL_JOB_SECRET: 'expected-secret' } as never,
        request,
        pathname: routeCase.pathname,
      })).rejects.toMatchObject({
        name: 'HttpError',
        status: 401,
        message: '内部ジョブ認証に失敗しました。',
      });
      expect(routeCase.jobMock).not.toHaveBeenCalled();
    });
  }
});
