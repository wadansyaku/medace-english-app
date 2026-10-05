import { describe, expect, it } from 'vitest';
import {
  AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD,
  AI_MONTHLY_PLAN_LIMIT_MICRO_USD,
  createMockAiBudgetStore,
  type AiBudgetReservation,
} from '../functions/_shared/ai-provider-budget';

const reservation = (overrides: Partial<AiBudgetReservation> = {}): AiBudgetReservation => ({
  requestId: 'request_1', fingerprint: 'a'.repeat(64), monthKey: '2026-10',
  upperBoundMicroUsd: 100_000, pricingVersion: 'mock-pricing-v1', ...overrides,
});

describe('mock application USD budget reservation', () => {
  it('leaves 10% of the $5 planning ceiling undispatched', async () => {
    const budget = createMockAiBudgetStore();
    expect(AI_MONTHLY_PLAN_LIMIT_MICRO_USD).toBe(5_000_000);
    expect(AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD).toBe(4_500_000);
    expect(await budget.reserve(reservation({ upperBoundMicroUsd: 4_500_000 }))).toEqual({ reserved: true });
    expect(await budget.reserve(reservation({ requestId: 'one_more', upperBoundMicroUsd: 1 })))
      .toEqual({ reserved: false, reason: 'BUDGET_EXHAUSTED' });
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(4_500_000);
  });

  it('reserves concurrently against one global month instead of separate providers/users', async () => {
    const budget = createMockAiBudgetStore();
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => budget.reserve(reservation({
      requestId: `request_${index}`, upperBoundMicroUsd: 1_000_000,
    }))));
    expect(results.filter((result) => result.reserved)).toHaveLength(4);
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 4_000_000, unresolvedReservations: 4 });
  });

  it('does not redispatch the same ID after settlement or a new calendar month', async () => {
    const budget = createMockAiBudgetStore();
    await budget.reserve(reservation());
    await budget.settle({ requestId: 'request_1', fingerprint: 'a'.repeat(64), chargedMicroUsd: 10 });
    expect(await budget.reserve(reservation())).toEqual({ reserved: false, reason: 'DUPLICATE_REQUEST' });
    expect(await budget.reserve(reservation({ monthKey: '2026-11' })))
      .toEqual({ reserved: false, reason: 'REQUEST_CONFLICT' });
  });

  it.each([
    { fingerprint: 'b'.repeat(64) }, { upperBoundMicroUsd: 99_999 }, { pricingVersion: 'mock-pricing-v2' },
  ])('rejects changed content/bound/pricing for an existing ID (%j)', async (change) => {
    const budget = createMockAiBudgetStore();
    await budget.reserve(reservation());
    expect(await budget.reserve(reservation(change))).toEqual({ reserved: false, reason: 'REQUEST_CONFLICT' });
  });

  it('retains uncertain usage at the upper bound without expiry or automatic release', async () => {
    const budget = createMockAiBudgetStore();
    await budget.reserve(reservation({ upperBoundMicroUsd: 4_500_000 }));
    await budget.settle({ requestId: 'request_1', fingerprint: 'a'.repeat(64) });
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 4_500_000, unresolvedReservations: 1 });
    expect(await budget.reserve(reservation({ requestId: 'retry_other_id', upperBoundMicroUsd: 1 })))
      .toEqual({ reserved: false, reason: 'BUDGET_EXHAUSTED' });
  });

  it('settles measured usage idempotently but rejects a conflicting second bill', async () => {
    const budget = createMockAiBudgetStore();
    await budget.reserve(reservation());
    const settlement = { requestId: 'request_1', fingerprint: 'a'.repeat(64), chargedMicroUsd: 12_000 };
    await budget.settle(settlement);
    await budget.settle(settlement);
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 12_000, settledRequests: 1 });
    await expect(budget.settle({ ...settlement, chargedMicroUsd: 13_000 })).rejects.toThrow('settlement conflict');
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(12_000);
  });

  it('records cost overruns and blocks further dispatch for the month', async () => {
    const budget = createMockAiBudgetStore();
    await budget.reserve(reservation({ upperBoundMicroUsd: 10 }));
    await budget.settle({ requestId: 'request_1', fingerprint: 'a'.repeat(64), chargedMicroUsd: 11 });
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 11, blocked: true });
    expect(await budget.reserve(reservation({ requestId: 'request_2' })))
      .toEqual({ reserved: false, reason: 'BUDGET_BLOCKED' });
  });

  it('does not settle another request with an unrelated fingerprint', async () => {
    const budget = createMockAiBudgetStore();
    await budget.reserve(reservation());
    await expect(budget.settle({ requestId: 'request_1', fingerprint: 'b'.repeat(64), chargedMicroUsd: 0 }))
      .rejects.toThrow('reservation mismatch');
    expect(budget.snapshot('2026-10').unresolvedReservations).toBe(1);
  });

  it.each([NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])('never rounds invalid measured usage %s down', async (chargedMicroUsd) => {
    const budget = createMockAiBudgetStore();
    await budget.reserve(reservation());
    await expect(budget.settle({ requestId: 'request_1', fingerprint: 'a'.repeat(64), chargedMicroUsd }))
      .rejects.toThrow('Invalid measured usage');
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(100_000);
  });

  it.each([
    { upperBoundMicroUsd: 0 }, { upperBoundMicroUsd: -1 }, { upperBoundMicroUsd: 0.1 },
    { upperBoundMicroUsd: NaN }, { upperBoundMicroUsd: 4_500_001 },
    { monthKey: '2026-13' }, { fingerprint: 'plaintext-answer' }, { pricingVersion: 'real-price-unverified' },
  ])('rejects invalid or unverified reservation metadata %j', async (change) => {
    const budget = createMockAiBudgetStore();
    expect(await budget.reserve(reservation(change))).toEqual({ reserved: false, reason: 'INVALID_RESERVATION' });
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(0);
  });
});
