import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteD1 } from './helpers/sqlite-d1';
import { createProductSupportBudget, type ProductSupportReservation } from '../functions/_shared/product-support-budget';

const sql = readFileSync(new URL('../migrations/0063_bot_product_support_budget.sql', import.meta.url), 'utf8');
const fixtures: ReturnType<typeof createSqliteD1>[] = [];
const start = Date.parse('2026-10-11T14:59:59.999Z');
const input = (i: number, change: Partial<ProductSupportReservation> = {}): ProductSupportReservation => ({
  actorHash: i.toString(16).padStart(64, '0'), requestKey: (i + 100).toString(16).padStart(64, '0'),
  requestHash: 'a'.repeat(64), role: 'GUEST', version: 'synthetic-v1', operation: 'GENERATION', upperBoundMicroUsd: 40_000, ...change,
});
const setup = () => {
  const fixture = createSqliteD1(); fixtures.push(fixture); fixture.sqlite.exec(sql); return fixture;
};
afterEach(() => fixtures.splice(0).forEach(fixture => fixture.sqlite.close()));

describe('Bot-only atomic maximum reservation metadata', () => {
  it('gives concurrent same-ID requests one dispatch token and rejects changed content', async () => {
    const { DB, sqlite } = setup();
    const stores = [createProductSupportBudget(DB, { now: () => start }), createProductSupportBudget(DB, { now: () => start })];
    const results = await Promise.all(stores.map(store => store.reserve(input(1))));
    expect(results.map(row => row.kind).sort()).toEqual(['duplicate', 'reserved']);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM bot_product_support_requests').get()).toEqual({ n: 1 });
    await expect(stores[0].reserve(input(1, { requestHash: 'b'.repeat(64) }))).rejects.toMatchObject({ status: 409 });
  });

  it('serializes separate actors, maximum cost and concurrency across store instances', async () => {
    const { DB, sqlite } = setup();
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => createProductSupportBudget(DB, { now: () => start }).reserve(input(i))));
    const winners = results.filter(row => row.kind === 'reserved');
    expect(winners).toHaveLength(2);
    const store = createProductSupportBudget(DB, { now: () => start });
    for (const row of winners) if (row.kind === 'reserved') await store.finish(row.receipt, 'COMPLETED');
    expect(await store.reserve(input(20))).toEqual({ kind: 'capacity' });
    const exact = await store.reserve(input(21, { upperBoundMicroUsd: 20_000 }));
    expect(exact.kind).toBe('reserved');
    expect(sqlite.prepare('SELECT SUM(reserved_micro_usd) AS cost FROM bot_product_support_requests').get()).toEqual({ cost: 100_000 });
  });

  it('retains unknown cost and concurrency across retries, days and completion attempts', async () => {
    const { DB, sqlite } = setup();
    const store = createProductSupportBudget(DB, { now: () => start });
    const result = await store.reserve(input(1)); if (result.kind !== 'reserved') throw Error('fixture');
    await store.finish(result.receipt, 'UNKNOWN');
    const next = createProductSupportBudget(DB, { now: () => start + 86_400_000 });
    expect((await next.reserve(input(1))).kind).toBe('duplicate');
    expect(await next.reserve(input(2, { actorHash: input(1).actorHash }))).toEqual({ kind: 'capacity' });
    await expect(next.finish(result.receipt, 'COMPLETED')).rejects.toThrow('completion persistence');
    expect(sqlite.prepare('SELECT state,reserved_micro_usd FROM bot_product_support_requests').get()).toEqual({ state: 'UNKNOWN', reserved_micro_usd: 40_000 });
  });

  it('uses rolling minute and JST daily boundaries with completed KB receipts', async () => {
    const { DB } = setup(); let clock = start;
    const store = createProductSupportBudget(DB, { now: () => clock, limits: { actorPerMinute: 1, actorPerDay: 1 } });
    const free = (i: number) => input(i, { actorHash: 'f'.repeat(64), operation: 'PUBLIC_KB', upperBoundMicroUsd: 0 });
    const result = await store.reserve(free(1)); if (result.kind !== 'reserved') throw Error('fixture');
    expect(result.receipt.day_key).toBe('2026-10-11'); await store.finish(result.receipt, 'COMPLETED');
    clock += 1; expect(await store.reserve(free(2))).toEqual({ kind: 'capacity' });
    clock += 60_000; const next = await store.reserve(free(2));
    expect(next.kind).toBe('reserved'); if (next.kind === 'reserved') expect(next.receipt.day_key).toBe('2026-10-12');
  });

  it('keeps the month ceiling when a new day resets daily allowance', async () => {
    const { DB } = setup(); let clock = start;
    const store = createProductSupportBudget(DB, { now: () => clock, limits: { monthMicroUsd: 50_000 } });
    const first = await store.reserve(input(1)); if (first.kind !== 'reserved') throw Error('fixture');
    await store.finish(first.receipt, 'COMPLETED'); clock += 86_400_000;
    expect(await store.reserve(input(2))).toEqual({ kind: 'capacity' });
    expect((await store.reserve(input(3, { upperBoundMicroUsd: 10_000 }))).kind).toBe('reserved');
  });

  it('persists no row after a failed atomic insertion and cannot raise trusted ceilings', async () => {
    const { DB, sqlite } = setup();
    sqlite.exec("CREATE TRIGGER synthetic_bot_failure BEFORE INSERT ON bot_product_support_requests BEGIN SELECT RAISE(ABORT,'synthetic'); END");
    await expect(createProductSupportBudget(DB, { now: () => start }).reserve(input(1))).rejects.toThrow('synthetic');
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM bot_product_support_requests').get()).toEqual({ n: 0 });
    expect(() => createProductSupportBudget(DB, { limits: { concurrent: 100 } })).toThrow('configuration');
  });

  it.each([NaN, -1, 1.1, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid maximum quote %s', async upperBoundMicroUsd => {
    const { DB } = setup();
    await expect(createProductSupportBudget(DB, { now: () => start }).reserve(input(1, { upperBoundMicroUsd }))).rejects.toThrow('reservation');
  });
});
