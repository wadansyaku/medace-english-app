import { requireUser } from '../auth';
import { HttpError, readJson } from '../http';
import {
  handleGetWordHintImageResponse,
  runWordHintAuditSweep,
} from '../word-hint-assets';
import {
  ApiRouteDefinition,
  createJsonResponse,
} from './runtime';

const WORD_HINT_IMAGE_ROUTE = /^word-hints\/([^/]+)\/image$/;
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

export const wordHintRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => WORD_HINT_IMAGE_ROUTE.test(pathname) && request.method === 'GET',
    handle: async ({ env, pathname, request }) => {
      const user = await requireUser(env, request);
      const matched = pathname.match(WORD_HINT_IMAGE_ROUTE);
      const wordId = matched?.[1];
      if (!wordId) {
        throw new HttpError(404, '画像ヒントのURLが不正です。');
      }

      return {
        logUser: user,
        response: await handleGetWordHintImageResponse(env, user, decodeURIComponent(wordId)),
      };
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'internal/word-hint-audits/run' && request.method === 'POST',
    handle: async ({ env, request }) => {
      requireInternalJobSecret(env, request);
      const body: { limit?: number; staleAfterHours?: number } = await readJson<{ limit?: number; staleAfterHours?: number }>(request).catch(() => ({}));
      const result = await runWordHintAuditSweep(env, {
        limit: typeof body.limit === 'number' ? body.limit : undefined,
        staleAfterHours: typeof body.staleAfterHours === 'number' ? body.staleAfterHours : undefined,
      });
      return {
        response: createJsonResponse(result),
      };
    },
  },
];
