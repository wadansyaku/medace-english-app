import type { GuestLearningCatalogResponse, GuestLearningImportRequest, GuestLearningImportResponse } from '../contracts/guestLearning';
import { apiGet, apiPost } from './apiClient';

export const getGuestLearningCatalog = (): Promise<GuestLearningCatalogResponse> => apiGet('/api/guest-learning/naru');
export const importGuestLearning = (request: GuestLearningImportRequest): Promise<GuestLearningImportResponse> => apiPost('/api/guest-learning/import', request);
