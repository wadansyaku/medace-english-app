import { HttpError } from './http';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '::1']);
export const INTERNAL_JOB_SECRET_HEADER = 'X-Internal-Job-Secret';

const mutationFailure = (message: string): string => `Mutating request rejected: ${message}`;

export const MUTATING_REQUEST_FAILURE_MESSAGES = {
  originMismatch: mutationFailure('Origin ヘッダーがリクエスト先 origin と一致しません。'),
  refererMismatch: mutationFailure('Referer ヘッダーがリクエスト先 origin と一致しません。'),
  fetchSiteUntrusted: mutationFailure('Sec-Fetch-Site は same-origin / same-site / none のいずれかが必要です。'),
  missingBrowserHeaders: mutationFailure(
    'localhost 以外の mutation には Origin / Referer / Sec-Fetch-Site のいずれかが必要です。',
  ),
} as const;

export type MutatingRequestHeaderGuardContext = Readonly<{
  method: string;
  requestUrl: URL;
  expectedOrigin: string;
  isLocalhost: boolean;
}>;

export type MutatingRequestHeaderGuard = (
  request: Request,
  context: MutatingRequestHeaderGuardContext,
) => string | null;

export type MutatingRequestHeaderGuardOptions = Readonly<{
  additionalHeaderGuards?: readonly MutatingRequestHeaderGuard[];
}>;

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const isMutatingRequest = (request: Request): boolean => MUTATING_METHODS.has(request.method.toUpperCase());

const createMutatingRequestHeaderGuardContext = (request: Request): MutatingRequestHeaderGuardContext => {
  const requestUrl = new URL(request.url);
  return {
    method: request.method.toUpperCase(),
    requestUrl,
    expectedOrigin: requestUrl.origin,
    isLocalhost: LOCALHOSTS.has(requestUrl.hostname),
  };
};

export const validateBrowserMutationHeaders: MutatingRequestHeaderGuard = (request, context) => {
  const origin = request.headers.get('Origin');
  if (origin) {
    if (normalizeOrigin(origin) !== context.expectedOrigin) {
      return MUTATING_REQUEST_FAILURE_MESSAGES.originMismatch;
    }
    return null;
  }

  const referer = request.headers.get('Referer');
  if (referer) {
    if (normalizeOrigin(referer) !== context.expectedOrigin) {
      return MUTATING_REQUEST_FAILURE_MESSAGES.refererMismatch;
    }
    return null;
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) {
    return MUTATING_REQUEST_FAILURE_MESSAGES.fetchSiteUntrusted;
  }

  if (fetchSite) {
    return null;
  }

  if (context.isLocalhost) {
    return null;
  }

  return MUTATING_REQUEST_FAILURE_MESSAGES.missingBrowserHeaders;
};

export const assertMutatingRequestHeaders = (
  request: Request,
  options: MutatingRequestHeaderGuardOptions = {},
): void => {
  if (!isMutatingRequest(request)) {
    return;
  }

  const context = createMutatingRequestHeaderGuardContext(request);
  const headerGuards = [
    validateBrowserMutationHeaders,
    ...(options.additionalHeaderGuards ?? []),
  ];

  for (const guard of headerGuards) {
    const failureMessage = guard(request, context);
    if (failureMessage) {
      throw new HttpError(403, failureMessage);
    }
  }
};

export const assertSameOriginMutation = (
  request: Request,
  options: MutatingRequestHeaderGuardOptions = {},
): void => {
  assertMutatingRequestHeaders(request, options);
};

// Scheduled/server-to-server jobs do not send browser provenance headers.
// Keep this named mutation path explicit so future CSRF guards review it.
export const assertInternalJobMutation = (
  env: { INTERNAL_JOB_SECRET?: string },
  request: Request,
): void => {
  if (!isMutatingRequest(request)) {
    throw new HttpError(405, '内部ジョブ guard は mutation リクエスト専用です。');
  }

  const expected = env.INTERNAL_JOB_SECRET;
  if (!expected) {
    throw new HttpError(503, 'INTERNAL_JOB_SECRET が設定されていません。');
  }

  const provided = request.headers.get(INTERNAL_JOB_SECRET_HEADER);
  if (!provided || provided !== expected) {
    throw new HttpError(401, '内部ジョブ認証に失敗しました。');
  }
};
