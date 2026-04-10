import type { ProductEventName } from '../types';
import { apiPost } from './apiClient';

export interface RecordClientProductEventInput {
  eventName: ProductEventName;
  subjectType?: string;
  subjectId?: string;
  status?: string;
  usedAi?: boolean;
  estimatedCostMilliYen?: number;
  metadata?: Record<string, unknown>;
}

export const recordClientProductEvent = async (
  input: RecordClientProductEventInput,
): Promise<void> => {
  await apiPost('/api/public/product-events', input);
};
