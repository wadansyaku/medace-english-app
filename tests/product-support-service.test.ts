import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestProductSupport } from '../services/productSupport';

afterEach(() => vi.unstubAllGlobals());
describe('conversation transport keeps asks and rechecks explicit', () => {
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
