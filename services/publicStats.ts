import type { PublicMotivationSnapshot } from '../types';
import { apiGet } from './apiClient';

export const getPublicMotivationSnapshot = (): Promise<PublicMotivationSnapshot> => (
  apiGet<PublicMotivationSnapshot>('/api/public/motivation')
);
