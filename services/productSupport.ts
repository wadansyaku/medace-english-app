import type { ProductSupportRequest, ProductSupportResponse } from '../contracts/productSupport';
import { apiPost } from './apiClient';

// No automatic retry: ask IDs and bodies belong to the UI's captured turn;
// recheck only reads metadata and never starts another generation.
export const requestProductSupport = (request: ProductSupportRequest, signal?: AbortSignal) =>
  apiPost<ProductSupportResponse>('/api/product-support', request, { signal });
