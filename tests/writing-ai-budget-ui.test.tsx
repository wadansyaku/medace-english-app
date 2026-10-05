import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminAiUsageView, { AdminAiUsageSummary } from '../components/admin/AdminAiUsageView';
import { ApiError } from '../services/apiClient';
import {
  createWritingAiBudgetLoader, getWritingAiBudget,
  type WritingAiBudgetAuditRow, type WritingAiBudgetLoadState, type WritingAiBudgetResponse,
} from '../services/writingAiBudget';

const response = (monthKey = '2026-10'): WritingAiBudgetResponse => ({
  monthKey, scope: 'THIS_APPLICATION_ONLY', configured: false, providerInvoiceConfirmed: false,
  snapshot: {
    monthKey, scope: 'GLOBAL', currency: 'USD', amountMeaning: 'APPLICATION_METERING_NOT_PROVIDER_INVOICE',
    planLimitMicroUsd: 5_000_000, safetyMarginMicroUsd: 500_000, dispatchLimitMicroUsd: 4_500_000,
    accountedMicroUsd: 0, accountedMicroUsdExact: '0', measuredUsageMicroUsd: 0, measuredUsageMicroUsdExact: '0',
    reservedHoldMicroUsd: 0, reservedHoldMicroUsdExact: '0', remainingDispatchMicroUsd: 4_500_000,
    unresolvedReservations: 0, settledRequests: 0, blocked: false, precisionExceeded: false,
  },
  audit: { rows: [], nextAfterSequence: null },
});
const auditRow = (): WritingAiBudgetAuditRow => ({
  sequence: 1, event_id: 'private-event-id', request_id: 'private-request-id', fingerprint: 'private-fingerprint',
  month_key: '2026-10', outcome: 'UNKNOWN_USAGE', provider: 'OPENAI', model: 'synthetic-model', operation: 'OCR',
  pricing_version: 'synthetic-pricing', upper_bound_micro_usd: 100_000, charged_micro_usd: null,
  provider_response_id: 'synthetic-response-id', input_tokens: null, cached_input_tokens: 0,
  output_tokens: null, total_tokens: null, created_at: Date.UTC(2026, 9, 5),
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};
const mockJson = (payload: unknown) => {
  const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
afterEach(() => vi.unstubAllGlobals());

describe('admin AI budget read contract', () => {
  it('uses only a session-authenticated uncached GET for the selected month', async () => {
    const fetch = mockJson(response());
    expect(await getWritingAiBudget('2026-10')).toEqual(response());
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/writing/ai-budget?month=2026-10', expect.objectContaining({
      method: 'GET', credentials: 'include', cache: 'no-store',
    }));
  });

  it.each(['', '2026-00', '2026-13', '2026-1', '2026-10&enable=true'])('rejects invalid month %s before requesting', async month => {
    const fetch = mockJson(response());
    await expect(getWritingAiBudget(month)).rejects.toThrow('対象月');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['other month', () => response('2026-09')],
    ['unknown invoice meaning', () => ({ ...response(), providerInvoiceConfirmed: true })],
    ['missing measured amount', () => {
      const data = response(); delete (data.snapshot as Partial<typeof data.snapshot>).measuredUsageMicroUsd; return data;
    }],
    ['unsafe numeric amount', () => {
      const data = response(); data.snapshot.accountedMicroUsd = Number.MAX_SAFE_INTEGER + 1; return data;
    }],
    ['null amount falsely claiming precision', () => {
      const data = response(); data.snapshot.accountedMicroUsd = null; return data;
    }],
    ['invalid audit timestamp', () => {
      const data = response(); data.audit.rows = [{ ...auditRow(), created_at: 8_640_000_000_000_001 }]; return data;
    }],
    ['audit from another month', () => {
      const data = response(); data.audit.rows = [{ ...auditRow(), month_key: '2026-09' }]; return data;
    }],
  ] as const)('fails closed for %s instead of fabricating a zero', async (_name, makePayload) => {
    mockJson(makePayload());
    await expect(getWritingAiBudget('2026-10')).rejects.toThrow('取得結果');
  });

  it('accepts a precision overflow in the total while preserving safe individual amounts', async () => {
    const data = response();
    Object.assign(data.snapshot, {
      accountedMicroUsd: null, accountedMicroUsdExact: '9007199254740992',
      measuredUsageMicroUsd: Number.MAX_SAFE_INTEGER, measuredUsageMicroUsdExact: '9007199254740991',
      reservedHoldMicroUsd: 1, reservedHoldMicroUsdExact: '1', precisionExceeded: true, blocked: true,
    });
    mockJson(data);
    expect(await getWritingAiBudget('2026-10')).toEqual(data);
  });
});

describe('month request lifecycle', () => {
  it.each(['success', 'failure'] as const)('ignores a late previous-month %s', async result => {
    const oldMonth = deferred<WritingAiBudgetResponse>();
    const newMonth = deferred<WritingAiBudgetResponse>();
    const states: WritingAiBudgetLoadState[] = [];
    const read = vi.fn(month => month === '2026-09' ? oldMonth.promise : newMonth.promise);
    const loader = createWritingAiBudgetLoader(state => states.push(state), read);
    const first = loader.load('2026-09');
    const latest = loader.load('2026-10');
    newMonth.resolve(response()); await latest;
    if (result === 'success') oldMonth.resolve(response('2026-09'));
    else oldMonth.reject(new Error('private backend detail'));
    await first;
    expect(states.map(state => [state.status, state.monthKey])).toEqual([
      ['loading', '2026-09'], ['loading', '2026-10'], ['ready', '2026-10'],
    ]);
  });

  it('locks repeated clicks on the same pending request and releases the lock for refresh', async () => {
    const pending = deferred<WritingAiBudgetResponse>();
    const read = vi.fn(() => pending.promise);
    const loader = createWritingAiBudgetLoader(vi.fn(), read);
    const first = loader.load('2026-10');
    expect(loader.load('2026-10')).toBe(first);
    expect(loader.load('2026-10')).toBe(first);
    pending.resolve(response()); await first;
    expect(read).toHaveBeenCalledOnce();
    await loader.load('2026-10');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('invalidates an unmounted request and can start again after React effect remount', async () => {
    const stale = deferred<WritingAiBudgetResponse>();
    const read = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(response());
    const states: WritingAiBudgetLoadState[] = [];
    const loader = createWritingAiBudgetLoader(state => states.push(state), read);
    const old = loader.load('2026-10'); await Promise.resolve();
    loader.invalidate();
    await loader.load('2026-10');
    stale.resolve(response()); await old;
    expect(states.filter(state => state.status === 'ready')).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 503])('sanitizes HTTP %s and retries without retaining a failed result', async status => {
    const states: WritingAiBudgetLoadState[] = [];
    const read = vi.fn().mockRejectedValueOnce(new ApiError('private response detail', status)).mockResolvedValueOnce(response());
    const loader = createWritingAiBudgetLoader(state => states.push(state), read);
    await loader.load('2026-10');
    expect(states.at(-1)).toEqual({ status: 'error', monthKey: '2026-10', reason: status === 503 ? 'LOAD_FAILED' : 'UNAUTHORIZED' });
    expect(JSON.stringify(states)).not.toContain('private response detail');
    await loader.load('2026-10');
    expect(states.at(-1)?.status).toBe('ready');
  });

  it('rejects an empty month and discards its previous pending response', async () => {
    const pending = deferred<WritingAiBudgetResponse>();
    const read = vi.fn(() => pending.promise);
    const states: WritingAiBudgetLoadState[] = [];
    const loader = createWritingAiBudgetLoader(state => states.push(state), read);
    const old = loader.load('2026-10');
    await loader.load(''); pending.resolve(response()); await old;
    expect(states.at(-1)).toEqual({ status: 'error', monthKey: '', reason: 'INVALID_MONTH' });
    expect(read).toHaveBeenCalledOnce();
  });
});

describe('admin usage content and privacy', () => {
  it('starts with loading, an accessible month input, and explicit application-only scope', () => {
    const read = vi.fn();
    const html = renderToStaticMarkup(<AdminAiUsageView initialMonth="2026-10" readBudget={read} />);
    expect(html).toContain('admin-ai-usage-loading');
    expect(html).toContain('対象月（UTC）');
    expect(html).toContain('value="2026-10"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('providerの請求確定額ではありません');
    expect(html).toContain('税・為替・他アプリの利用分は対象外');
    expect(html).not.toContain('$0.00');
    expect(html).not.toContain('AIは未有効です');
    expect(read).not.toHaveBeenCalled();
  });

  it('distinguishes feature off, no measured costs, and a held unconfirmed reservation', () => {
    const data = response();
    Object.assign(data.snapshot, { accountedMicroUsd: 100_000, accountedMicroUsdExact: '100000',
      reservedHoldMicroUsd: 100_000, reservedHoldMicroUsdExact: '100000', unresolvedReservations: 1 });
    data.audit.rows = [auditRow()];
    const html = renderToStaticMarkup(<AdminAiUsageSummary data={data} />);
    expect(html).toContain('AIは未有効です');
    expect(html).toContain('この月の計測済み費用の記録はありません');
    expect(html).toContain('費用未確認の予約保持額');
    expect(html).toContain('$0.10');
    expect(html).toContain('推定費用: <strong>未確認</strong>');
    expect(html).toContain('うちcached token</dt><dd>0</dd>');
    expect(html).toContain('入力token</dt><dd>未確認</dd>');
  });

  it('preserves exact micro-dollar precision and explains that a positive remaining amount is blocked', () => {
    const data = response();
    Object.assign(data.snapshot, { accountedMicroUsd: null, accountedMicroUsdExact: '9007199254740992',
      measuredUsageMicroUsd: Number.MAX_SAFE_INTEGER, measuredUsageMicroUsdExact: '9007199254740991',
      reservedHoldMicroUsd: 1, reservedHoldMicroUsdExact: '1', precisionExceeded: true, blocked: true });
    const html = renderToStaticMarkup(<AdminAiUsageSummary data={data} />);
    expect(html).toContain('数値を確認できません');
    expect(html).toContain('9007199254740992');
    expect(html).toContain('$9,007,199,254.740991');
    expect(html).toContain('$0.000001');
    expect(html).toContain('新規dispatchを停止しています');
    expect(html).toContain('表示額が残っていても、停止中は新規送信しません');
  });

  it('shows only allowed audit metadata, keeps month totals separate, and identifies partial audit pages', () => {
    const data = response();
    data.configured = true;
    Object.assign(data.snapshot, { measuredUsageMicroUsd: 2_500_000, measuredUsageMicroUsdExact: '2500000',
      accountedMicroUsd: 2_500_000, accountedMicroUsdExact: '2500000', settledRequests: 10 });
    data.audit = { rows: [Object.assign(auditRow(), { charged_micro_usd: 10_000,
      body: 'private-answer-body', image: 'private-answer-image', name: 'private-student-name' })], nextAfterSequence: 1 };
    const html = renderToStaticMarkup(<AdminAiUsageSummary data={data} />);
    expect(html).toContain('$2.50');
    expect(html).toContain('$0.01');
    expect(html).toContain('監査記録は一部を表示しています');
    expect(html).toContain('synthetic-response-id');
    expect(html).not.toContain('この月の計測済み費用の記録はありません');
    for (const privateValue of ['private-answer-body', 'private-answer-image', 'private-student-name',
      'private-event-id', 'private-request-id', 'private-fingerprint']) expect(html).not.toContain(privateValue);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<button');
  });
});
