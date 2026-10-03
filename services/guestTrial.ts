import type { GuestTrialImportRequest, GuestTrialImportResponse, GuestTrialSummary } from '../contracts/guestTrial';
import { apiGet, apiPost } from './apiClient';

// This is an authenticated cloud operation. Device storage is handled separately
// and must remain intact until the caller confirms this response was received.
export const importGuestTrial = (request: GuestTrialImportRequest): Promise<GuestTrialImportResponse> => (
  apiPost<GuestTrialImportResponse>('/api/guest-trial/import', request)
);

export const getGuestTrialSummary = async (trialId: string): Promise<GuestTrialSummary | null> => (
  (await apiGet<GuestTrialSummary | undefined>(`/api/guest-trial/summary?trialId=${encodeURIComponent(trialId)}`)) ?? null
);

export const getLatestGuestTrialSummary = async (): Promise<GuestTrialSummary | null> => (
  (await apiGet<GuestTrialSummary | undefined>('/api/guest-trial/summary')) ?? null
);
