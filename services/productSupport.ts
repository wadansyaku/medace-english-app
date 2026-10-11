import { PRODUCT_SUPPORT_NOT_ADMITTED, type ProductSupportRequest, type ProductSupportResponse } from '../contracts/productSupport';
import { ApiError, apiPost } from './apiClient';

export class ProductSupportNotAdmittedError extends Error {
  constructor(message: string, readonly requestId: string) {
    super(message);
    this.name = 'ProductSupportNotAdmittedError';
  }
}

// No automatic retry: ask IDs and bodies belong to the UI's captured turn;
// recheck only reads metadata and never starts another generation.
export const requestProductSupport = async (request: ProductSupportRequest, signal?: AbortSignal): Promise<ProductSupportResponse> => {
  try {
    return await apiPost<ProductSupportResponse>('/api/product-support', request, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      const details = error.details;
      if (details && typeof details === 'object' && !Array.isArray(details)
        && 'productSupportAdmission' in details && details.productSupportAdmission === PRODUCT_SUPPORT_NOT_ADMITTED
        && 'message' in details && typeof details.message === 'string' && details.message.length > 0 && details.message.length <= 600) {
        throw new ProductSupportNotAdmittedError(details.message, request.requestId);
      }
    }
    throw error;
  }
};
