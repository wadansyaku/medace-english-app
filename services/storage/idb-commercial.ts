import {
  CommercialRequest,
  CommercialRequestStatus,
  OrganizationRole,
  SubscriptionPlan,
  UserProfile,
  UserRole,
} from '../../types';
import type {
  CommercialRequestPayload,
  CommercialRequestUpdatePayload,
} from '../../contracts/storage';
import { hasDuplicateOpenRequest } from '../../shared/commercial';
import { IDB_MOCK_COMMERCIAL_REQUESTS } from './mockData';
import {
  readAllStoreRecords,
  requestToPromise,
  STORES,
  type GetStore,
  type StoredCommercialRequestRecord,
} from './idb-support';

interface LocalCommercialStorageContext {
  getStore: GetStore;
  getSession: () => Promise<UserProfile | null>;
  updateSessionUser: (user: UserProfile) => Promise<void>;
  now?: () => number;
}

const slugifySegment = (value: string): string => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')
  .slice(0, 48);

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const createLocalOrganizationId = (displayName: string): string => {
  const slug = slugifySegment(displayName) || 'organization';
  return `org_local_${slug}_${hashString(displayName)}`;
};

const mergeSeededRecordsById = <T extends { id: string | number }>(seed: T[], stored: T[]): T[] => {
  const merged = new Map<string, T>();
  seed.forEach((record) => merged.set(String(record.id), record));
  stored.forEach((record) => merged.set(String(record.id), record));
  return [...merged.values()];
};

export const listStoredCommercialRequests = async (
  context: Pick<LocalCommercialStorageContext, 'getStore'>,
): Promise<CommercialRequest[]> => {
  const store = await context.getStore(STORES.COMMERCIAL_REQUESTS);
  const stored = await readAllStoreRecords<StoredCommercialRequestRecord>(store);
  return mergeSeededRecordsById(IDB_MOCK_COMMERCIAL_REQUESTS, stored)
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

export const getNextCommercialRequestId = async (
  context: Pick<LocalCommercialStorageContext, 'getStore'>,
): Promise<number> => {
  const requests = await listStoredCommercialRequests(context);
  return requests.reduce((maxId, request) => Math.max(maxId, Number(request.id || 0)), 100) + 1;
};

export const getCommercialRequestStatus = async (
  context: Pick<LocalCommercialStorageContext, 'getStore' | 'getSession'>,
): Promise<CommercialRequest[]> => {
  const sessionUser = await context.getSession();
  if (!sessionUser) return [];
  const normalizedEmail = sessionUser.email.trim().toLowerCase();
  const requests = await listStoredCommercialRequests(context);
  return requests.filter((request) => (
    request.requestedByUid === sessionUser.uid
    || request.contactEmail.trim().toLowerCase() === normalizedEmail
  ));
};

export const submitCommercialRequest = async (
  context: Pick<LocalCommercialStorageContext, 'getStore' | 'getSession' | 'now'>,
  payload: CommercialRequestPayload,
): Promise<CommercialRequest> => {
  const sessionUser = await context.getSession();
  if (!sessionUser) {
    throw new Error('ログイン後に申請してください。');
  }

  const existing = await listStoredCommercialRequests(context);
  if (hasDuplicateOpenRequest(existing, payload.contactEmail, payload.kind, sessionUser.uid)) {
    throw new Error('進行中の申請があるため、新しい申請は作成できません。');
  }

  const now = context.now?.() ?? Date.now();
  const nextRequestId = await getNextCommercialRequestId(context);
  const store = await context.getStore(STORES.COMMERCIAL_REQUESTS, 'readwrite');
  const nextRequest: CommercialRequest = {
    id: nextRequestId,
    kind: payload.kind,
    status: CommercialRequestStatus.OPEN,
    contactName: payload.contactName.trim(),
    contactEmail: payload.contactEmail.trim().toLowerCase(),
    organizationName: payload.organizationName?.trim() || undefined,
    teachingFormat: payload.teachingFormat,
    desiredStartTiming: payload.desiredStartTiming?.trim() || undefined,
    requestedWorkspaceRole: payload.requestedWorkspaceRole,
    seatEstimate: payload.seatEstimate?.trim() || undefined,
    message: payload.message.trim(),
    source: payload.source,
    requestedByUid: sessionUser.uid,
    linkedUserUid: sessionUser.uid,
    createdAt: now,
    updatedAt: now,
  };
  await requestToPromise(store.put(nextRequest));
  return nextRequest;
};

export const listCommercialRequests = async (
  context: Pick<LocalCommercialStorageContext, 'getStore'>,
): Promise<CommercialRequest[]> => listStoredCommercialRequests(context);

export const updateCommercialRequest = async (
  context: Pick<LocalCommercialStorageContext, 'getStore' | 'getSession' | 'updateSessionUser' | 'now'>,
  payload: CommercialRequestUpdatePayload,
): Promise<CommercialRequest> => {
  const requests = await listStoredCommercialRequests(context);
  const current = requests.find((request) => request.id === payload.id);
  if (!current) {
    throw new Error('申請が見つかりません。');
  }

  const now = context.now?.() ?? Date.now();
  const nextRequest: CommercialRequest = {
    ...current,
    status: payload.status,
    resolutionNote: payload.resolutionNote || current.resolutionNote,
    linkedUserUid: payload.linkedUserUid || current.linkedUserUid,
    targetSubscriptionPlan: payload.targetSubscriptionPlan || current.targetSubscriptionPlan,
    targetOrganizationId: payload.targetOrganizationId
      || current.targetOrganizationId
      || (payload.targetOrganizationName ? createLocalOrganizationId(payload.targetOrganizationName) : undefined),
    targetOrganizationName: payload.targetOrganizationName || current.targetOrganizationName,
    targetOrganizationRole: payload.targetOrganizationRole || current.targetOrganizationRole,
    updatedAt: now,
  };

  const store = await context.getStore(STORES.COMMERCIAL_REQUESTS, 'readwrite');
  await requestToPromise(store.put(nextRequest));

  const sessionUser = await context.getSession();
  if (
    payload.status === CommercialRequestStatus.PROVISIONED
    && sessionUser
    && nextRequest.linkedUserUid === sessionUser.uid
  ) {
    const nextUserRole = nextRequest.targetOrganizationRole === OrganizationRole.GROUP_ADMIN
      || nextRequest.targetOrganizationRole === OrganizationRole.INSTRUCTOR
      ? UserRole.INSTRUCTOR
      : UserRole.STUDENT;
    await context.updateSessionUser({
      ...sessionUser,
      role: nextUserRole,
      subscriptionPlan: nextRequest.targetSubscriptionPlan || sessionUser.subscriptionPlan || SubscriptionPlan.TOC_FREE,
      organizationId: nextRequest.targetOrganizationId,
      organizationName: nextRequest.targetOrganizationName,
      organizationRole: nextRequest.targetOrganizationRole,
    });
  }

  return nextRequest;
};
