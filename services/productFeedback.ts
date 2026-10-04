import { apiPost } from './apiClient';
import type { ProductFeedbackList, ProductFeedbackReport, ProductFeedbackRequest } from '../contracts/productFeedback';

export const listProductFeedback = (cursor?: string, signal?: AbortSignal) => apiPost<ProductFeedbackList>('/api/product-feedback', { action: 'list', ...(cursor ? { cursor } : {}) } satisfies ProductFeedbackRequest, { signal });
export const saveProductFeedback = (request: Extract<ProductFeedbackRequest, { action: 'create' | 'advance' }>, signal?: AbortSignal) => apiPost<ProductFeedbackReport>('/api/product-feedback', request, { signal });

export const getProductFeedback = (id: string, signal?: AbortSignal) => apiPost<ProductFeedbackReport>('/api/product-feedback', { action: 'get', id } satisfies ProductFeedbackRequest, { signal });
