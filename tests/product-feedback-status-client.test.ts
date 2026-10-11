import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/apiClient';
import { getProductFeedbackStatusSummary, listProductFeedback } from '../services/productFeedback';

vi.mock('../services/apiClient', async original => ({ ...await original<typeof import('../services/apiClient')>(), apiPost: vi.fn() }));
import { apiPost } from '../services/apiClient';
const valid = { counts: { NEW: 0, TRIAGED: 0, HANDOFF_PREPARED: 0, FIXED: 2, RETEST_PASS: 0, RETEST_FAIL: 1 }, canManage: false, scope: 'own-current-organization', actualDeploymentRevision: null, fetchedAt: 123 };
beforeEach(() => vi.clearAllMocks());
describe('feedback client contracts', () => {
  it('preserves the old list signature and sends a third-argument status with its abort signal', async () => {
    const signal = new AbortController().signal;
    await listProductFeedback('old-cursor', signal);
    expect(apiPost).toHaveBeenLastCalledWith('/api/product-feedback', { action: 'list', cursor: 'old-cursor' }, { signal });
    await listProductFeedback(undefined, signal, 'FIXED');
    expect(apiPost).toHaveBeenLastCalledWith('/api/product-feedback', { action: 'list', status: 'FIXED' }, { signal });
  });
  it('reads a count-only summary without role, identity or organization request fields', async () => {
    vi.mocked(apiPost).mockResolvedValue(valid);
    const signal = new AbortController().signal;
    expect(await getProductFeedbackStatusSummary(signal)).toEqual(valid);
    expect(apiPost).toHaveBeenCalledWith('/api/product-feedback', { action: 'status-summary' }, { signal });
  });
  it.each([
    null, { ...valid, counts: {} }, { ...valid, counts: { ...valid.counts, NEW: -1 } },
    { ...valid, counts: { ...valid.counts, NEW: '0' } }, { ...valid, counts: { ...valid.counts, NEW: 1.5 } },
    { ...valid, canManage: true }, { ...valid, scope: 'own' }, { ...valid, fetchedAt: undefined },
    { ...valid, actualDeploymentRevision: undefined }, { ...valid, actualDeploymentRevision: '' },
  ])('rejects an incomplete or invalid summary without converting unknown counts to zero: %j', async value => {
    vi.mocked(apiPost).mockResolvedValue(value);
    await expect(getProductFeedbackStatusSummary()).rejects.toThrow('報告状況を確認できませんでした');
  });
  it('propagates current authorization failures rather than creating an empty result', async () => {
    const error = new ApiError('Permission changed', 403);
    vi.mocked(apiPost).mockRejectedValue(error);
    await expect(getProductFeedbackStatusSummary()).rejects.toBe(error);
  });
});
