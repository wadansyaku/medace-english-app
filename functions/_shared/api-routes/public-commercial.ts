import type { CommercialRequestPayload } from '../../../contracts/storage';
import type { ProductEventName } from '../../../types';
import { requireUser } from '../auth';
import { handleCreateCommercialRequest } from '../commercial-actions';
import { HttpError, readJson } from '../http';
import { assertPublicWriteAllowed } from '../public-abuse-guard';
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

type ValidPublicProductEventPayload = Omit<PublicProductEventPayload, 'eventName'> & {
  eventName: ProductEventName;
};

const PUBLIC_EVENT_TEXT_LIMIT = 160;
const PUBLIC_EVENT_METADATA_KEY_LIMIT = 24;
const PUBLIC_EVENT_METADATA_JSON_LIMIT_BYTES = 4096;
const PUBLIC_EVENT_COST_LIMIT_MILLI_YEN = 100_000;
const PUBLIC_PRODUCT_EVENT_BODY_LIMIT_BYTES = 8 * 1024;
const PUBLIC_COMMERCIAL_REQUEST_BODY_LIMIT_BYTES = 24 * 1024;
const COMMERCIAL_FORM_OPENED_RATE_LIMIT = {
  scope: 'commercial-form-opened',
  limit: 20,
  windowMs: 60 * 1000,
};
const COMMERCIAL_REQUEST_RATE_LIMIT = {
  scope: 'commercial-request',
  limit: 6,
  windowMs: 15 * 60 * 1000,
};

const PUBLIC_PRODUCT_EVENT_NAMES = new Set<ProductEventName>([
  'student_dashboard_start_task',
  'study_session_started',
  'study_session_finished',
  'quiz_session_started',
  'spelling_check_started',
  'commercial_form_opened',
]);

const getUtf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const isAllowedPublicProductEventPayload = (
  body: PublicProductEventPayload,
): body is ValidPublicProductEventPayload => (
  isProductEventName(body.eventName)
  && PUBLIC_PRODUCT_EVENT_NAMES.has(body.eventName)
);

const assertOptionalPublicEventText = (
  value: unknown,
  fieldName: string,
): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new HttpError(400, `${fieldName} が不正です。`);
  }
  const trimmed = value.trim();
  if (getUtf8ByteLength(trimmed) > PUBLIC_EVENT_TEXT_LIMIT) {
    throw new HttpError(413, `${fieldName} が長すぎます。`);
  }
  return trimmed || undefined;
};

const assertPublicEventMetadata = (metadata: unknown): Record<string, unknown> | undefined => {
  if (metadata === undefined || metadata === null) return undefined;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new HttpError(400, 'metadata が不正です。');
  }

  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length > PUBLIC_EVENT_METADATA_KEY_LIMIT) {
    throw new HttpError(413, 'metadata の項目数が多すぎます。');
  }

  for (const [key] of entries) {
    if (getUtf8ByteLength(key) > PUBLIC_EVENT_TEXT_LIMIT) {
      throw new HttpError(413, 'metadata の項目名が長すぎます。');
    }
  }

  if (getUtf8ByteLength(JSON.stringify(metadata)) > PUBLIC_EVENT_METADATA_JSON_LIMIT_BYTES) {
    throw new HttpError(413, 'metadata が長すぎます。');
  }

  return metadata as Record<string, unknown>;
};

const assertOptionalPublicEventBoolean = (
  value: unknown,
  fieldName: string,
): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${fieldName} が不正です。`);
  }
  return value;
};

const assertOptionalPublicEventCost = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new HttpError(400, 'estimatedCostMilliYen が不正です。');
  }
  if (value > PUBLIC_EVENT_COST_LIMIT_MILLI_YEN) {
    throw new HttpError(413, 'estimatedCostMilliYen が大きすぎます。');
  }
  return Math.trunc(value);
};

const normalizePublicProductEventPayload = (
  body: ValidPublicProductEventPayload,
): ValidPublicProductEventPayload => ({
  ...body,
  subjectType: assertOptionalPublicEventText(body.subjectType, 'subjectType'),
  subjectId: assertOptionalPublicEventText(body.subjectId, 'subjectId'),
  status: assertOptionalPublicEventText(body.status, 'status'),
  usedAi: assertOptionalPublicEventBoolean(body.usedAi, 'usedAi'),
  estimatedCostMilliYen: assertOptionalPublicEventCost(body.estimatedCostMilliYen),
  metadata: assertPublicEventMetadata(body.metadata),
});

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
      assertSameOriginMutation(request);
      const body = await readJson<CommercialRequestPayload>(request, {
        maxBytes: PUBLIC_COMMERCIAL_REQUEST_BODY_LIMIT_BYTES,
      });
      if (!body || typeof body !== 'object') {
        throw new HttpError(400, '申請内容が不正です。');
      }
      await assertPublicWriteAllowed(env, request, COMMERCIAL_REQUEST_RATE_LIMIT);

      return {
        response: createJsonResponse(await handleCreateCommercialRequest(env, body)),
      };
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'public/product-events' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const body = await readJson<PublicProductEventPayload>(request, {
        maxBytes: PUBLIC_PRODUCT_EVENT_BODY_LIMIT_BYTES,
      });
      if (!body || typeof body !== 'object' || !isAllowedPublicProductEventPayload(body)) {
        throw new HttpError(400, '記録できないイベントです。');
      }
      const eventPayload = normalizePublicProductEventPayload(body);

      const user = await requireUser(env, request).catch(() => null);
      if (!user && eventPayload.eventName !== 'commercial_form_opened') {
        throw new HttpError(401, 'ログインが必要です。');
      }
      if (!user) {
        await assertPublicWriteAllowed(env, request, COMMERCIAL_FORM_OPENED_RATE_LIMIT);
      }

      if (user) {
        await recordProductEventForUser(env, user, {
          eventName: eventPayload.eventName,
          subjectType: eventPayload.subjectType,
          subjectId: eventPayload.subjectId,
          status: eventPayload.status,
          usedAi: Boolean(eventPayload.usedAi),
          estimatedCostMilliYen: eventPayload.estimatedCostMilliYen,
          metadata: eventPayload.metadata,
        });
      } else {
        await recordProductEvent(env, {
          eventName: eventPayload.eventName,
          subjectType: eventPayload.subjectType,
          subjectId: eventPayload.subjectId,
          status: eventPayload.status,
          usedAi: Boolean(eventPayload.usedAi),
          estimatedCostMilliYen: eventPayload.estimatedCostMilliYen,
          metadata: eventPayload.metadata,
        });
      }

      return {
        logUser: user,
        response: createJsonResponse({ ok: true }),
      };
    },
  },
];
