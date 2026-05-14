import { describe, expect, it } from 'vitest';

import { publicCommercialRoutes } from '../functions/_shared/api-routes/public-commercial';
import { HttpError, readJson } from '../functions/_shared/http';
import { CommercialRequestKind, CommercialWorkspaceRole, TeachingFormat } from '../types';

const expectHttpError = async (
  promise: Promise<unknown>,
  status: number,
  message: string,
) => {
  await expect(promise).rejects.toMatchObject({
    name: 'HttpError',
    status,
    message,
  } satisfies Partial<HttpError>);
};

const findPublicRoute = (pathname: 'public/commercial-request' | 'public/product-events', request: Request) => {
  const route = publicCommercialRoutes.find((candidate) => candidate.matches({
    env: {} as never,
    request,
    pathname,
  }));
  expect(route).toBeDefined();
  return route!;
};

const createSameOriginPost = (url: string, body: unknown): Request => new Request(url, {
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'Content-Type': 'application/json',
    Origin: new URL(url).origin,
  },
});

const createRateLimitedEnv = (failureCount: number) => ({
  DB: {
    prepare: (query: string) => {
      const statement = {
        bind: (..._values: unknown[]) => statement,
        first: async () => {
          if (query.includes('FROM auth_attempt_limits')) {
            return { failure_count: failureCount, blocked_until: Date.now() + 60_000, updated_at: Date.now() };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          throw new Error(`Unexpected write in rate-limit rejection: ${query}`);
        },
      };
      return statement;
    },
    batch: async () => [],
  },
}) as never;

describe('public abuse limits', () => {
  it('caps JSON request bodies in readJson', async () => {
    const request = createSameOriginPost('https://medace-english-app.pages.dev/api/public/product-events', {
      value: 'x'.repeat(64),
    });

    await expectHttpError(
      readJson(request, { maxBytes: 16 }),
      413,
      'リクエストJSONのサイズが上限を超えています。',
    );
  });

  it('rejects oversized public commercial request bodies before storage writes', async () => {
    const request = createSameOriginPost('https://medace-english-app.pages.dev/api/public/commercial-request', {
      kind: CommercialRequestKind.BUSINESS_TRIAL,
      contactName: '導入担当',
      contactEmail: 'teacher@example.jp',
      organizationName: 'Steady Study',
      teachingFormat: TeachingFormat.ONLINE,
      requestedWorkspaceRole: CommercialWorkspaceRole.GROUP_ADMIN,
      message: 'x'.repeat(25 * 1024),
      source: 'public-business-role',
    });
    const route = findPublicRoute('public/commercial-request', request);

    await expectHttpError(
      route.handle({
        env: {} as never,
        request,
        pathname: 'public/commercial-request',
      }),
      413,
      'リクエストJSONのサイズが上限を超えています。',
    );
  });

  it('rejects long public product event subject and status fields', async () => {
    const request = createSameOriginPost('https://medace-english-app.pages.dev/api/public/product-events', {
      eventName: 'commercial_form_opened',
      subjectType: 'commercial_source',
      subjectId: 'x'.repeat(161),
      status: 'OPENED',
      metadata: {
        source: 'public-business-role',
      },
    });
    const route = findPublicRoute('public/product-events', request);

    await expectHttpError(
      route.handle({
        env: {} as never,
        request,
        pathname: 'public/product-events',
      }),
      413,
      'subjectId が長すぎます。',
    );
  });

  it('rejects oversized commercial_form_opened metadata before recording events', async () => {
    const request = createSameOriginPost('https://medace-english-app.pages.dev/api/public/product-events', {
      eventName: 'commercial_form_opened',
      subjectType: 'commercial_source',
      subjectId: 'public-business-role',
      status: 'OPENED',
      metadata: {
        source: 'public-business-role',
        blob: 'x'.repeat(4096),
      },
    });
    const route = findPublicRoute('public/product-events', request);

    await expectHttpError(
      route.handle({
        env: {} as never,
        request,
        pathname: 'public/product-events',
      }),
      413,
      'metadata が長すぎます。',
    );
  });

  it('rejects invalid public product event boolean and cost fields', async () => {
    const booleanRequest = createSameOriginPost('https://medace-english-app.pages.dev/api/public/product-events', {
      eventName: 'commercial_form_opened',
      subjectType: 'commercial_source',
      subjectId: 'public-business-role',
      status: 'OPENED',
      usedAi: 'false',
      metadata: {
        source: 'public-business-role',
      },
    });
    const booleanRoute = findPublicRoute('public/product-events', booleanRequest);

    await expectHttpError(
      booleanRoute.handle({
        env: {} as never,
        request: booleanRequest,
        pathname: 'public/product-events',
      }),
      400,
      'usedAi が不正です。',
    );

    const costRequest = createSameOriginPost('https://medace-english-app.pages.dev/api/public/product-events', {
      eventName: 'commercial_form_opened',
      subjectType: 'commercial_source',
      subjectId: 'public-business-role',
      status: 'OPENED',
      estimatedCostMilliYen: 100_001,
      metadata: {
        source: 'public-business-role',
      },
    });
    const costRoute = findPublicRoute('public/product-events', costRequest);

    await expectHttpError(
      costRoute.handle({
        env: {} as never,
        request: costRequest,
        pathname: 'public/product-events',
      }),
      413,
      'estimatedCostMilliYen が大きすぎます。',
    );
  });

  it('rate limits anonymous commercial_form_opened event writes by client address', async () => {
    const request = createSameOriginPost('https://medace-english-app.pages.dev/api/public/product-events', {
      eventName: 'commercial_form_opened',
      subjectType: 'commercial_source',
      subjectId: 'public-business-role',
      status: 'OPENED',
      metadata: {
        source: 'public-business-role',
      },
    });
    const route = findPublicRoute('public/product-events', request);

    await expectHttpError(
      route.handle({
        env: createRateLimitedEnv(20),
        request,
        pathname: 'public/product-events',
      }),
      429,
      '短時間の操作が上限を超えています。しばらく待ってから再試行してください。',
    );
  });

  it('rate limits public commercial request submissions by client address', async () => {
    const request = createSameOriginPost('https://medace-english-app.pages.dev/api/public/commercial-request', {
      kind: CommercialRequestKind.BUSINESS_TRIAL,
      contactName: '導入担当',
      contactEmail: 'teacher@example.jp',
      organizationName: 'Steady Study',
      teachingFormat: TeachingFormat.ONLINE,
      requestedWorkspaceRole: CommercialWorkspaceRole.GROUP_ADMIN,
      message: '導入相談です。',
      source: 'public-business-role',
    });
    const route = findPublicRoute('public/commercial-request', request);

    await expectHttpError(
      route.handle({
        env: createRateLimitedEnv(6),
        request,
        pathname: 'public/commercial-request',
      }),
      429,
      '短時間の操作が上限を超えています。しばらく待ってから再試行してください。',
    );
  });
});
