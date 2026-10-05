import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteD1 } from './helpers/sqlite-d1';
import { createD1AiBudgetStore, type AiProviderUsageSettlement } from '../functions/_shared/ai-provider-budget-d1';
import type { AiBudgetReservation } from '../functions/_shared/ai-provider-budget';

const fixtures: ReturnType<typeof createSqliteD1>[] = [];
const directories: string[] = [];
const sql = readFileSync(new URL('../migrations/0050_ai_provider_budget.sql', import.meta.url), 'utf8');
const price = 'openai-official-20261006';
const clock = () => new Date('2026-10-06T00:00:00Z');
const metadata = { provider: 'OPENAI' as const, model: 'gpt-4.1-mini-2025-04-14', operation: 'OCR' as const };
const reservation = (change: Partial<AiBudgetReservation> = {}) => ({ requestId: 'request_1', fingerprint: 'a'.repeat(64),
  monthKey: '2026-10', upperBoundMicroUsd: 100_000, pricingVersion: price, ...change });
const usage = (change: Partial<AiProviderUsageSettlement> = {}): AiProviderUsageSettlement => ({
  requestId: 'request_1', fingerprint: 'a'.repeat(64), chargedMicroUsd: 10_000,
  usage: { ...metadata, providerResponseId: 'resp_test_1', pricingVersion: price, inputTokens: 100, cachedInputTokens: 20, outputTokens: 40, totalTokens: 140 }, ...change,
});
const setup = () => {
  const fixture = createSqliteD1(); fixtures.push(fixture); fixture.sqlite.exec(sql);
  const store = () => createD1AiBudgetStore(fixture.DB, { approvedPricingVersions: [price, 'mock-price-v1', 'openai-official-v2'], now: clock });
  return { ...fixture, store };
};
afterEach(() => {
  fixtures.splice(0).forEach(({ sqlite }) => sqlite.close());
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }));
});

describe('D1 global provider budget', () => {
  it('reserves atomically across store instances and retains the 10% safety margin', async () => {
    const fixture = setup();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => fixture.store().reserve(reservation({ requestId: `parallel_${i}`, upperBoundMicroUsd: 1_000_000 }))));
    expect(results.filter(result => result.reserved)).toHaveLength(4);
    expect(await fixture.store().snapshot('2026-10')).toMatchObject({ scope: 'GLOBAL', accountedMicroUsd: 4_000_000, remainingDispatchMicroUsd: 500_000, unresolvedReservations: 4, planLimitMicroUsd: 5_000_000, dispatchLimitMicroUsd: 4_500_000 });
    expect(await fixture.store().reserve(reservation({ requestId: 'last', upperBoundMicroUsd: 500_000 }))).toEqual({ reserved: true });
    expect(await fixture.store().reserve(reservation({ requestId: 'over', upperBoundMicroUsd: 1 }))).toEqual({ reserved: false, reason: 'BUDGET_EXHAUSTED' });
  });
  it('deduplicates retries including metadata and does not redispatch a changed fingerprint or month', async () => {
    const fixture = setup(); const store = fixture.store();
    expect(await store.reserveWithMetadata({ ...reservation(), ...metadata })).toEqual({ reserved: true });
    expect(await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata })).toEqual({ reserved: false, reason: 'DUPLICATE_REQUEST' });
    expect(await fixture.store().reserveWithMetadata({ ...reservation({ fingerprint: 'b'.repeat(64) }), ...metadata })).toEqual({ reserved: false, reason: 'REQUEST_CONFLICT' });
    expect(await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata, model: 'different-model' })).toEqual({ reserved: false, reason: 'REQUEST_CONFLICT' });
    const nextMonth = createD1AiBudgetStore(fixture.DB, { approvedPricingVersions: [price], now: () => new Date('2026-11-01T00:00:00Z') });
    expect(await nextMonth.reserveWithMetadata({ ...reservation({ monthKey: '2026-11' }), ...metadata })).toEqual({ reserved: false, reason: 'REQUEST_CONFLICT' });
    expect(await nextMonth.reserve(reservation({ requestId: 'new-month', monthKey: '2026-11' }))).toEqual({ reserved: true });
  });
  it.each([
    { monthKey: '2026-09' }, { monthKey: '2026-11' }, { monthKey: '2026-13' }, { fingerprint: 'answer text' },
    { upperBoundMicroUsd: 0 }, { upperBoundMicroUsd: 4_500_001 }, { upperBoundMicroUsd: NaN }, { upperBoundMicroUsd: 0.1 },
    { pricingVersion: 'unapproved-price' },
  ])('rejects invalid or unapproved quote %j without creating rows', async change => {
    const fixture = setup();
    expect(await fixture.store().reserve(reservation(change))).toEqual({ reserved: false, reason: 'INVALID_RESERVATION' });
    expect((await fixture.store().exportAudit('2026-10')).rows).toEqual([]);
  });
  it('settles response metadata and cost in the same commit once across store instances', async () => {
    const fixture = setup(); const store = fixture.store();
    await store.reserveWithMetadata({ ...reservation(), ...metadata });
    await Promise.all([store.settleUsage(usage()), fixture.store().settleUsage(usage())]);
    expect(await fixture.store().snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 10_000, unresolvedReservations: 0, settledRequests: 1, amountMeaning: 'APPLICATION_METERING_NOT_PROVIDER_INVOICE' });
    const audit = await store.exportAudit('2026-10');
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[1]).toMatchObject({ outcome: 'COMPLETED', provider_response_id: 'resp_test_1', provider: metadata.provider, model: metadata.model,
      operation: metadata.operation, pricing_version: price, input_tokens: 100, cached_input_tokens: 20, output_tokens: 40, total_tokens: 140, charged_micro_usd: 10_000 });
    await expect(store.settleUsage(usage({ chargedMicroUsd: 10_001 }))).rejects.toThrow('settlement conflict');
    await expect(store.settleUsage(usage({ usage: { ...usage().usage, providerResponseId: 'resp_different' } }))).rejects.toThrow('settlement conflict');
    expect((await store.exportAudit('2026-10')).rows).toHaveLength(2);
  });
  it.each(['REFUSAL', 'INVALID_OUTPUT', 'INCOMPLETE'] as const)('meters known usage for %s without asserting successful evaluation', async outcome => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata });
    await fixture.store().settleUsage(usage({ outcome }));
    expect((await fixture.store().exportAudit('2026-10')).rows[1].outcome).toBe(outcome);
    expect((await fixture.store().snapshot('2026-10')).accountedMicroUsd).toBe(10_000);
  });
  it('uses compare-and-set when concurrent settlements disagree', async () => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata });
    const results = await Promise.allSettled([
      fixture.store().settleUsage(usage({ chargedMicroUsd: 10_000 })),
      fixture.store().settleUsage(usage({ chargedMicroUsd: 20_000 })),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect([10_000, 20_000]).toContain((await fixture.store().snapshot('2026-10')).accountedMicroUsd);
    expect((await fixture.store().exportAudit('2026-10')).rows).toHaveLength(2);
  });
  it.each(['TIMEOUT', 'PROVIDER_FAILED', 'UNKNOWN_USAGE'] as const)('preserves the complete uncertain reservation and a failure audit after %s', async reason => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation({ upperBoundMicroUsd: 4_500_000 }), ...metadata });
    const record = { requestId: 'request_1', fingerprint: 'a'.repeat(64), eventId: 'failure_1', reason };
    await fixture.store().recordUnknownOutcome(record); await fixture.store().recordUnknownOutcome(record);
    await fixture.store().settle({ requestId: 'request_1', fingerprint: 'a'.repeat(64) });
    expect(await fixture.store().snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 4_500_000, unresolvedReservations: 1, settledRequests: 0 });
    expect(await fixture.store().reserve(reservation({ requestId: 'retry_new_id', upperBoundMicroUsd: 1 }))).toEqual({ reserved: false, reason: 'BUDGET_EXHAUSTED' });
    const rows = (await fixture.store().exportAudit('2026-10')).rows;
    expect(rows).toHaveLength(2); expect(rows[1]).toMatchObject({ outcome: reason, charged_micro_usd: null, input_tokens: null, total_tokens: null });
  });
  it('records overruns and blocks subsequent dispatch for that month without hiding the overrun', async () => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation({ upperBoundMicroUsd: 10 }), ...metadata });
    await fixture.store().settleUsage(usage({ chargedMicroUsd: 11 }));
    expect(await fixture.store().snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 11, blocked: true });
    expect(await fixture.store().reserve(reservation({ requestId: 'another' }))).toEqual({ reserved: false, reason: 'BUDGET_BLOCKED' });
  });
  it('keeps extreme measured totals exact rather than rounding or returning zero', async () => {
    const fixture = setup(); const store = fixture.store();
    await store.reserve(reservation()); await store.reserve(reservation({ requestId: 'second' }));
    await store.settle({ requestId: 'request_1', fingerprint: 'a'.repeat(64), chargedMicroUsd: Number.MAX_SAFE_INTEGER });
    await store.settle({ requestId: 'second', fingerprint: 'a'.repeat(64), chargedMicroUsd: Number.MAX_SAFE_INTEGER });
    expect(await store.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: null, accountedMicroUsdExact: '18014398509481982', precisionExceeded: true, blocked: true, remainingDispatchMicroUsd: 0 });
  });
  it('fails closed on anomalous usage, retains the reservation, and logs a blocked month', async () => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata });
    await expect(fixture.store().settleUsage(usage({ usage: { ...usage().usage, totalTokens: 0 } }))).rejects.toThrow('usage metadata');
    await fixture.store().recordUnknownOutcome({ requestId: 'request_1', fingerprint: 'a'.repeat(64), eventId: 'invalid_usage_1', reason: 'INVALID_USAGE' });
    expect(await fixture.store().snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 100_000, unresolvedReservations: 1, blocked: true });
    expect((await fixture.store().exportAudit('2026-10')).rows[1].charged_micro_usd).toBeNull();
  });
  it.each([
    { cachedInputTokens: 101 }, { inputTokens: -1 }, { outputTokens: NaN }, { inputTokens: 1.1 },
    { pricingVersion: 'other-price' }, { providerResponseId: null }, { totalTokens: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects malformed usage without turning it into zero %j', async change => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata });
    await expect(fixture.store().settleUsage(usage({ usage: { ...usage().usage, ...change } } as unknown as AiProviderUsageSettlement))).rejects.toThrow();
    expect(await fixture.store().snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 100_000, unresolvedReservations: 1 });
  });
  it('rolls back settlement and its counter when audit persistence fails', async () => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata });
    fixture.sqlite.exec("CREATE TRIGGER fail_settlement_audit BEFORE INSERT ON ai_provider_usage_audit WHEN NEW.outcome='COMPLETED' BEGIN SELECT RAISE(ABORT,'synthetic audit disk failure'); END");
    await expect(fixture.store().settleUsage(usage())).rejects.toThrow('synthetic audit disk failure');
    expect(await fixture.store().snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 100_000, unresolvedReservations: 1, settledRequests: 0 });
    expect((await fixture.store().exportAudit('2026-10')).rows).toHaveLength(1);
  });
  it('rolls back admission completely when reservation audit fails', async () => {
    const fixture = setup();
    fixture.sqlite.exec("CREATE TRIGGER fail_reservation_audit BEFORE INSERT ON ai_provider_usage_audit BEGIN SELECT RAISE(ABORT,'synthetic reservation audit failure'); END");
    await expect(fixture.store().reserve(reservation())).rejects.toThrow();
    expect(fixture.sqlite.prepare('SELECT * FROM ai_provider_budget_reservations').all()).toEqual([]);
    expect(fixture.sqlite.prepare('SELECT * FROM ai_provider_budget_months').all()).toEqual([]);
  });
  it('never mutates or deletes a settled reservation or its audit trail', async () => {
    const fixture = setup(); await fixture.store().reserve(reservation()); await fixture.store().settle({ requestId: 'request_1', fingerprint: 'a'.repeat(64), chargedMicroUsd: 0 });
    expect(() => fixture.sqlite.exec("UPDATE ai_provider_budget_reservations SET charged_micro_usd=1")).toThrow();
    expect(() => fixture.sqlite.exec('DELETE FROM ai_provider_budget_reservations')).toThrow();
    expect(() => fixture.sqlite.exec('DELETE FROM ai_provider_usage_audit')).toThrow();
    expect((await fixture.store().snapshot('2026-10')).accountedMicroUsd).toBe(0);
    expect((await fixture.store().exportAudit('2026-10')).rows[1]).toMatchObject({ outcome: 'COST_ONLY', input_tokens: null });
  });
  it('exports audit pagination without body data and rejects another request identity', async () => {
    const fixture = setup(); await fixture.store().reserveWithMetadata({ ...reservation(), ...metadata });
    await fixture.store().recordUnknownOutcome({ requestId: 'request_1', fingerprint: 'a'.repeat(64), eventId: 'unknown_1', reason: 'UNKNOWN_USAGE' });
    const first = await fixture.store().exportAudit('2026-10', { limit: 1 });
    expect(first.rows).toHaveLength(1); expect(first.nextAfterSequence).not.toBeNull();
    expect((await fixture.store().exportAudit('2026-10', { afterSequence: first.nextAfterSequence!, limit: 1 })).rows[0].outcome).toBe('UNKNOWN_USAGE');
    expect(JSON.stringify(first)).not.toMatch(/transcript|base64|displayName|email|promptText/);
    await expect(fixture.store().settle({ requestId: 'request_1', fingerprint: 'b'.repeat(64), chargedMicroUsd: 1 })).rejects.toThrow('reservation mismatch');
  });
  it('adds schema only and leaves all existing words, sources and SRS data unchanged', () => {
    const fixture = createSqliteD1(); fixtures.push(fixture);
    const dir = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(dir).filter(file => file.endsWith('.sql') && file !== '0050_ai_provider_budget.sql').sort()) fixture.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
    fixture.sqlite.exec("INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES('synthetic','synthetic@example.test','Synthetic','STUDENT',1,1); INSERT INTO books(id,title,word_count,created_at,updated_at) VALUES('b','Original',1,1,1); INSERT INTO words(id,book_id,word_number,word,definition,search_key,example_sentence,created_at,updated_at) VALUES('w','b',1,'source','出典','source','Source-authored example.',1,1); INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date) VALUES('synthetic','w','b','learning',1,2)");
    const tables = fixture.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => String(row.name));
    const snapshot = () => Object.fromEntries(tables.map(table => [table, fixture.sqlite.prepare(`SELECT * FROM ${table}`).all()]));
    const before = snapshot(); fixture.sqlite.exec(sql);
    expect(snapshot()).toEqual(before); expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('admits concurrently from independent SQLite worker connections and restores after reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'medace-budget-workers-')); directories.push(directory);
    const databasePath = join(directory, 'budget.sqlite'); const modulePath = join(directory, 'store.cjs');
    const sqlite = new DatabaseSync(databasePath); sqlite.exec('PRAGMA journal_mode=WAL;'); sqlite.exec(sql); sqlite.close();
    const bundle = buildSync({ entryPoints: [new URL('../functions/_shared/ai-provider-budget-d1.ts', import.meta.url).pathname], bundle: true, format: 'cjs', platform: 'node', write: false });
    writeFileSync(modulePath, bundle.outputFiles[0].text);
    const code = `const {workerData,parentPort}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const {createD1AiBudgetStore}=require(workerData.modulePath);
      const sql=new DatabaseSync(workerData.databasePath);sql.exec('PRAGMA busy_timeout=10000');
      const prepare=q=>{let values=[];const p={bind(...v){values=v;return p},async first(){return sql.prepare(q).get(...values)||null},async all(){return {success:true,meta:{},results:sql.prepare(q).all(...values)}},async run(){const x=sql.prepare(q).run(...values);return {success:true,meta:{changes:Number(x.changes)}}}};return p};
      const DB={prepare,async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
      const store=createD1AiBudgetStore(DB,{approvedPricingVersions:[workerData.price],now:()=>new Date('2026-10-06T00:00:00Z')});
      const action=workerData.snapshot?store.snapshot('2026-10'):store.reserve({requestId:'worker_'+workerData.i,fingerprint:'a'.repeat(64),monthKey:'2026-10',upperBoundMicroUsd:1000000,pricingVersion:workerData.price});
      action.then(r=>{sql.close();parentPort.postMessage(r)},e=>{sql.close();throw e});`;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise<any>((resolve, reject) => {
      const worker = new Worker(code, { eval: true, workerData: { databasePath, modulePath, price, i } });
      worker.once('message', resolve); worker.once('error', reject);
    })));
    expect(results.filter(result => result.reserved)).toHaveLength(4);
    const restart = (extra: Record<string, unknown>) => new Promise<any>((resolve, reject) => {
      const worker = new Worker(code, { eval: true, workerData: { databasePath, modulePath, price, ...extra } });
      worker.once('message', resolve); worker.once('error', reject);
    });
    expect(await restart({ snapshot: true })).toMatchObject({ accountedMicroUsd: 4_000_000, unresolvedReservations: 4 });
    expect(await restart({ i: results.findIndex(result => result.reserved) })).toEqual({ reserved: false, reason: 'DUPLICATE_REQUEST' });
    const reopened = new DatabaseSync(databasePath);
    expect(reopened.prepare('SELECT accounted_micro_usd FROM ai_provider_budget_months').get()!.accounted_micro_usd).toBe(4_000_000);
    expect(reopened.prepare('SELECT COUNT(*) AS n FROM ai_provider_budget_reservations').get()!.n).toBe(4);
    expect(reopened.prepare('SELECT COUNT(*) AS n FROM ai_provider_usage_audit').get()!.n).toBe(4);
    reopened.close();
  }, 20_000);
});
