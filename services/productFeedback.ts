import { apiPost } from './apiClient';
import type { ProductFeedbackList, ProductFeedbackReport, ProductFeedbackRequest, ProductFeedbackStatus, ProductFeedbackStatusSummary } from '../contracts/productFeedback';

export const listProductFeedback = (cursor?: string, signal?: AbortSignal, status?: ProductFeedbackStatus) => apiPost<ProductFeedbackList>('/api/product-feedback', { action: 'list', ...(cursor ? { cursor } : {}), ...(status ? { status } : {}) } satisfies ProductFeedbackRequest, { signal });
export const saveProductFeedback = (request: Extract<ProductFeedbackRequest, { action: 'create' | 'advance' }>, signal?: AbortSignal) => apiPost<ProductFeedbackReport>('/api/product-feedback', request, { signal });

export const getProductFeedback = (id: string, signal?: AbortSignal) => apiPost<ProductFeedbackReport>('/api/product-feedback', { action: 'get', id } satisfies ProductFeedbackRequest, { signal });

export const getProductFeedbackStatusSummary = async (signal?: AbortSignal): Promise<ProductFeedbackStatusSummary> => {
  const value = await apiPost<ProductFeedbackStatusSummary>('/api/product-feedback', { action: 'status-summary' } satisfies ProductFeedbackRequest, { signal });
  const statuses: ProductFeedbackStatus[] = ['NEW', 'TRIAGED', 'HANDOFF_PREPARED', 'FIXED', 'RETEST_PASS', 'RETEST_FAIL'];
  if (!value || !value.counts || statuses.some(status => !Number.isSafeInteger(value.counts[status]) || value.counts[status] < 0)
    || typeof value.canManage !== 'boolean'
    || value.scope !== (value.canManage ? 'all' : 'own-current-organization')
    || (value.actualDeploymentRevision !== null && (typeof value.actualDeploymentRevision !== 'string' || !value.actualDeploymentRevision))
    || !Number.isSafeInteger(value.fetchedAt) || value.fetchedAt < 0) {
    throw new Error('報告状況を確認できませんでした。もう一度取得してください。');
  }
  return value;
};
