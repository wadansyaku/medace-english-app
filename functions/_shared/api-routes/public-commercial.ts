import type { CommercialRequestPayload } from '../../../contracts/storage';
import { requireUser } from '../auth';
import { handleCreateCommercialRequest } from '../commercial-actions';
import { HttpError, readJson } from '../http';
import { recordProductEvent, recordProductEventForUser, isProductEventName } from '../product-events';
import { assertSameOriginMutation } from '../request-guards';
import { handleGetPublicMotivationSnapshot } from '../storage-dashboard-actions';
import {
  ApiRouteDefinition,
  createJsonResponse,
} from './runtime';

interface PublicProductEventPayload {
  eventName: string;
  subjectType?: string;
  subjectId?: string;
  status?: string;
  usedAi?: boolean;
  estimatedCostMilliYen?: number;
  metadata?: Record<string, unknown>;
}

const PUBLIC_PRODUCT_EVENT_NAMES = new Set([
  'student_dashboard_start_task',
  'study_session_started',
  'study_session_finished',
  'quiz_session_started',
  'spelling_check_started',
  'commercial_form_opened',
]);

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
  {
    matches: ({ pathname, request }) => pathname === 'public/product-events' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const body = await readJson<PublicProductEventPayload>(request);
      if (!body || typeof body !== 'object' || !isProductEventName(body.eventName) || !PUBLIC_PRODUCT_EVENT_NAMES.has(body.eventName)) {
        throw new HttpError(400, '記録できないイベントです。');
      }

      const user = await requireUser(env, request).catch(() => null);
      if (!user && body.eventName !== 'commercial_form_opened') {
        throw new HttpError(401, 'ログインが必要です。');
      }

      if (user) {
        await recordProductEventForUser(env, user, {
          eventName: body.eventName,
          subjectType: body.subjectType,
          subjectId: body.subjectId,
          status: body.status,
          usedAi: Boolean(body.usedAi),
          estimatedCostMilliYen: body.estimatedCostMilliYen,
          metadata: body.metadata,
        });
      } else {
        await recordProductEvent(env, {
          eventName: body.eventName,
          subjectType: body.subjectType,
          subjectId: body.subjectId,
          status: body.status,
          usedAi: Boolean(body.usedAi),
          estimatedCostMilliYen: body.estimatedCostMilliYen,
          metadata: body.metadata,
        });
      }

      return {
        logUser: user,
        response: createJsonResponse({ ok: true }),
      };
    },
  },
];
