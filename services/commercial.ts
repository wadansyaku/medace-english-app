import type { CommercialRequestPayload } from '../contracts/storage';
import type { CommercialRequest } from '../types';
import { apiPost } from './apiClient';

export const submitPublicCommercialRequest = async (
  payload: CommercialRequestPayload,
): Promise<CommercialRequest> => {
  return apiPost<CommercialRequest>('/api/public/commercial-request', payload);
};
