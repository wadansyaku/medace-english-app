import type { CommercialRequestPayload } from '../../../contracts/storage';
import { handleCreateCommercialRequest } from '../commercial-actions';
import { HttpError, readJson } from '../http';
import { handleGetPublicMotivationSnapshot } from '../storage-dashboard-actions';
import {
  ApiRouteDefinition,
  createJsonResponse,
} from './runtime';

export const publicCommercialRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'public/motivation' && request.method === 'GET',
    handle: async ({ env }) => ({
      response: createJsonResponse(await handleGetPublicMotivationSnapshot(env)),
    }),
  },
  {
    matches: ({ pathname, request }) => pathname === 'public/commercial-request' && request.method === 'POST',
    handle: async ({ env, request }) => {
      const body = await readJson<CommercialRequestPayload>(request);
      if (!body || typeof body !== 'object') {
        throw new HttpError(400, '申請内容が不正です。');
      }

      return {
        response: createJsonResponse(await handleCreateCommercialRequest(env, body)),
      };
    },
  },
];
