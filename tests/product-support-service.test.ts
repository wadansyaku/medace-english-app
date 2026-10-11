import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductSupportNotAdmittedError, requestProductSupport } from '../services/productSupport';

afterEach(() => vi.unstubAllGlobals());
describe('conversation transport keeps asks and rechecks explicit', () => {
  it.each([400, 403, 409, 413])('converts only a server-proven pre-admission %i to an editable-input error, without retry', async status => {
    const message = '個人情報を取り除いてください。';
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message, error: message, productSupportAdmission: 'NOT_ADMITTED' }), { status, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(requestProductSupport({ action: 'ask', requestId: 'synthetic_rejected_1', question: 'synthetic@example.test', history: [], privacyConsent: true }))
      .rejects.toMatchObject({ name: 'ProductSupportNotAdmittedError', requestId: 'synthetic_rejected_1', message });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: 409, details: { message: '同じIDで別の内容は送れません。' } },
    { status: 403, details: { message: '許可されていません。' } },
    { status: 500, details: { message: '未確定', productSupportAdmission: 'NOT_ADMITTED' } },
    { status: 400, details: { message: 123, productSupportAdmission: 'NOT_ADMITTED' } },
  ])('does not infer safe non-admission from a bare status or invalid marker: $status', async ({ status, details }) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(details), { status, headers: { 'Content-Type': 'application/json' } })); vi.stubGlobal('fetch', fetch);
    let error: unknown;
    try { await requestProductSupport({ action: 'recheck', requestId: 'synthetic_unknown_1' }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(ProductSupportNotAdmittedError); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('passes the captured ask and abort signal once with cookie credentials', async () => {
    const body = { action: 'ask' as const, requestId: 'synthetic_request_1', question: '発音は？', history: [], privacyConsent: true as const };
    const signal = new AbortController().signal;
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ANSWERED' }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch); await requestProductSupport(body, signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/product-support', expect.objectContaining({ method: 'POST', credentials: 'include', signal: expect.any(AbortSignal), body: JSON.stringify(body) }));
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
  });
  it('propagates caller cancellation and discards a late response without resending the ask', async () => {
    const controller = new AbortController();
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const request = requestProductSupport({ action: 'recheck', requestId: 'synthetic_request_1' }, controller.signal);
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    finish(new Response(JSON.stringify({ status: 'ANSWERED' }), { headers: { 'Content-Type': 'application/json' } }));
    await rejection;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not convert a lost ask response into an automatic retry', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('synthetic lost response')); vi.stubGlobal('fetch', fetch);
    await expect(requestProductSupport({ action: 'recheck', requestId: 'synthetic_request_1' })).rejects.toThrow('lost response');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'recheck', requestId: 'synthetic_request_1' });
  });
});
