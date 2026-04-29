import { HttpError } from './http';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const assertSameOriginMutation = (request: Request): void => {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return;
  }

  const requestUrl = new URL(request.url);
  const expectedOrigin = requestUrl.origin;
  const origin = request.headers.get('Origin');
  if (origin) {
    if (normalizeOrigin(origin) !== expectedOrigin) {
      throw new HttpError(403, 'Cross-origin な mutation は許可されていません。');
    }
    return;
  }

  const referer = request.headers.get('Referer');
  if (referer) {
    if (normalizeOrigin(referer) !== expectedOrigin) {
      throw new HttpError(403, 'Cross-origin な mutation は許可されていません。');
    }
    return;
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) {
    throw new HttpError(403, 'Cross-site な mutation は許可されていません。');
  }

  if (fetchSite) {
    return;
  }

  if (LOCALHOSTS.has(requestUrl.hostname)) {
    return;
  }

  throw new HttpError(403, 'Origin / Referer / Sec-Fetch-Site のない mutation は許可されていません。');
};
