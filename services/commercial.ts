import type { CommercialRequestPayload } from '../contracts/storage';
import type { CommercialRequest } from '../types';
import { apiPost } from './apiClient';
import { resolveStorageMode } from '../shared/storageMode';
import { CloudflareStorageService } from './cloudflare';
import type { CommercialRequestUpdatePayload } from '../contracts/storage';

export const submitPublicCommercialRequest = async (
  payload: CommercialRequestPayload,
): Promise<CommercialRequest> => {
  return apiPost<CommercialRequest>('/api/public/commercial-request', payload);
};

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const commercialApiAvailable = storageMode.capabilities.commercial.available;
const unavailableCommercialMessage = '導入申請機能は Cloudflare storage mode でのみ利用できます。';
const cloudflareStorage = new CloudflareStorageService();

const assertCommercialAvailable = (): void => {
  if (!commercialApiAvailable) {
    throw new Error(unavailableCommercialMessage);
  }
};

export const submitCommercialRequest = async (
  payload: CommercialRequestPayload,
): Promise<CommercialRequest> => {
  assertCommercialAvailable();
  return cloudflareStorage.submitCommercialRequest(payload);
};

export const listCommercialRequests = async (): Promise<CommercialRequest[]> => {
  assertCommercialAvailable();
  return cloudflareStorage.listCommercialRequests();
};

export const updateCommercialRequest = async (
  payload: CommercialRequestUpdatePayload,
): Promise<CommercialRequest> => {
  assertCommercialAvailable();
  return cloudflareStorage.updateCommercialRequest(payload);
};
