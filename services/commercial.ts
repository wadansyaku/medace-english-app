import type { CommercialRequestPayload } from '../contracts/storage';
import type { CommercialRequest } from '../types';
import { apiPost } from './apiClient';
import { resolveStorageMode } from '../shared/storageMode';
import { CloudflareStorageService } from './cloudflare';
import type { CommercialRequestUpdatePayload } from '../contracts/storage';
import { storage } from './storage';

export const submitPublicCommercialRequest = async (
  payload: CommercialRequestPayload,
): Promise<CommercialRequest> => {
  return apiPost<CommercialRequest>('/api/public/commercial-request', payload);
};

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const commercialApiAvailable = storageMode.capabilities.commercial.available;
const commercialMockAvailable = storageMode.capabilities.commercial.usesMockData;
const unavailableCommercialMessage = '導入申請機能はこの storage mode では利用できません。';
const cloudflareStorage = new CloudflareStorageService();
const commercialService = commercialApiAvailable ? cloudflareStorage : storage;

const assertCommercialAvailable = (): void => {
  if (!commercialApiAvailable && !commercialMockAvailable) {
    throw new Error(unavailableCommercialMessage);
  }
};

export const submitCommercialRequest = async (
  payload: CommercialRequestPayload,
): Promise<CommercialRequest> => {
  assertCommercialAvailable();
  return commercialService.submitCommercialRequest(payload);
};

export const listCommercialRequests = async (): Promise<CommercialRequest[]> => {
  assertCommercialAvailable();
  return commercialService.listCommercialRequests();
};

export const updateCommercialRequest = async (
  payload: CommercialRequestUpdatePayload,
): Promise<CommercialRequest> => {
  assertCommercialAvailable();
  return commercialService.updateCommercialRequest(payload);
};
