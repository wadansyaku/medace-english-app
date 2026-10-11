import type { ProductSupportRole } from '../../shared/productSupportKnowledge';
import { formatDateKey } from '../../utils/date';
import { HttpError } from './http';
import type { D1Database } from './types';

export interface ProductSupportBudgetLimits {
  concurrent: number; actorConcurrent: number; actorPerMinute: number; actorPerDay: number; globalPerDay: number;
  dayMicroUsd: number; monthMicroUsd: number;
}
export const PRODUCT_SUPPORT_BUDGET_LIMITS: Readonly<ProductSupportBudgetLimits> = Object.freeze({
  concurrent: 2, actorConcurrent: 1, actorPerMinute: 5, actorPerDay: 30, globalPerDay: 1000,
  dayMicroUsd: 100_000, monthMicroUsd: 1_000_000,
});
export interface ProductSupportReceipt {
  actor_hash: string; request_key: string; request_hash: string; dispatch_token: string;
  role: ProductSupportRole; target_version: string; state: 'RESERVED' | 'COMPLETED' | 'UNKNOWN';
  operation: 'PUBLIC_KB' | 'GENERATION'; day_key: string; month_key: string;
  reserved_micro_usd: number; created_at: number; updated_at: number;
}
export interface ProductSupportReservation {
  actorHash: string; requestKey: string; requestHash: string; role: ProductSupportRole;
  version: string; operation: ProductSupportReceipt['operation']; upperBoundMicroUsd: number;
}
const HASH = /^[a-f0-9]{64}$/;
export const hashProductSupportMetadata = async (value: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');

/** Independent Bot admission accounting, not the Cloudflare account invoice.
 * Options are trusted server/test configuration, never an HTTP payload.
 * A single conditional INSERT is the serialization point across D1 workers.
 * UNKNOWN retains both cost and concurrency: no guessed refund or redispatch. */
export const createProductSupportBudget = (DB: D1Database, options: {
  now?: () => number; limits?: Partial<ProductSupportBudgetLimits>;
} = {}) => {
  const limits = { ...PRODUCT_SUPPORT_BUDGET_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > PRODUCT_SUPPORT_BUDGET_LIMITS[key as keyof typeof limits]) {
      throw new Error('Invalid Bot budget configuration.');
    }
  }
  const now = () => {
    const value = options.now?.() ?? Date.now();
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid Bot budget clock.');
    return value;
  };
  const read = (actorHash: string, requestKey: string) => DB.prepare(
    'SELECT * FROM bot_product_support_requests WHERE actor_hash=? AND request_key=?',
  ).bind(actorHash, requestKey).first<ProductSupportReceipt>();
  const reserve = async (input: ProductSupportReservation): Promise<{
    kind: 'reserved' | 'duplicate'; receipt: ProductSupportReceipt;
  } | { kind: 'capacity' }> => {
    if (![input.actorHash, input.requestKey, input.requestHash].every(value => HASH.test(value))
      || !['GUEST', 'STUDENT', 'INSTRUCTOR', 'GROUP_ADMIN', 'ADMIN'].includes(input.role)
      || !/^[a-zA-Z0-9._:-]{1,100}$/.test(input.version)
      || !['PUBLIC_KB', 'GENERATION'].includes(input.operation)
      || !Number.isSafeInteger(input.upperBoundMicroUsd) || input.upperBoundMicroUsd < 0
      || input.operation === 'PUBLIC_KB' && input.upperBoundMicroUsd !== 0
      || input.operation === 'GENERATION' && input.upperBoundMicroUsd === 0) {
      throw new Error('Invalid Bot reservation.');
    }
    const identify = (receipt: ProductSupportReceipt) => {
      if (receipt.request_hash !== input.requestHash) throw new HttpError(409, '同じ質問IDが別の内容で使われています。');
      return receipt;
    };
    const existing = await read(input.actorHash, input.requestKey);
    if (existing) return { kind: 'duplicate', receipt: identify(existing) };
    const at = now();
    const dayKey = formatDateKey(at); const monthKey = dayKey.slice(0, 7);
    const token = crypto.randomUUID();
    const result = await DB.prepare(`INSERT OR IGNORE INTO bot_product_support_requests
      (actor_hash,request_key,request_hash,dispatch_token,role,target_version,state,operation,
       day_key,month_key,reserved_micro_usd,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'RESERVED',?,?,?,?,?,?
      WHERE (SELECT COUNT(*) FROM bot_product_support_requests WHERE state IN ('RESERVED','UNKNOWN')) < ?
        AND (SELECT COUNT(*) FROM bot_product_support_requests WHERE actor_hash=? AND state IN ('RESERVED','UNKNOWN')) < ?
        AND (SELECT COUNT(*) FROM bot_product_support_requests WHERE actor_hash=? AND created_at>?) < ?
        AND (SELECT COUNT(*) FROM bot_product_support_requests WHERE actor_hash=? AND day_key=?) < ?
        AND (SELECT COUNT(*) FROM bot_product_support_requests WHERE day_key=?) < ?
        AND (SELECT COALESCE(SUM(reserved_micro_usd),0) FROM bot_product_support_requests WHERE day_key=?) <= ?
        AND (SELECT COALESCE(SUM(reserved_micro_usd),0) FROM bot_product_support_requests WHERE month_key=?) <= ?`)
      .bind(input.actorHash, input.requestKey, input.requestHash, token, input.role, input.version,
        input.operation, dayKey, monthKey, input.upperBoundMicroUsd, at, at,
        limits.concurrent, input.actorHash, limits.actorConcurrent, input.actorHash, at - 60_000,
        limits.actorPerMinute, input.actorHash, dayKey, limits.actorPerDay, dayKey, limits.globalPerDay,
        dayKey, limits.dayMicroUsd - input.upperBoundMicroUsd, monthKey, limits.monthMicroUsd - input.upperBoundMicroUsd).run();
    if (result.success === false) throw new Error('Bot reservation persistence failed.');
    const saved = await read(input.actorHash, input.requestKey);
    if (!saved) return { kind: 'capacity' };
    identify(saved);
    return { kind: saved.dispatch_token === token ? 'reserved' : 'duplicate', receipt: saved };
  };
  const finish = async (receipt: ProductSupportReceipt, state: 'COMPLETED' | 'UNKNOWN') => {
    const result = await DB.prepare(`UPDATE bot_product_support_requests SET state=?,updated_at=?
      WHERE actor_hash=? AND request_key=? AND request_hash=? AND dispatch_token=? AND state='RESERVED'`)
      .bind(state, now(), receipt.actor_hash, receipt.request_key, receipt.request_hash, receipt.dispatch_token).run();
    if (result.success === false || result.meta.changes !== 1) throw new Error('Bot completion persistence failed.');
  };
  return { read, reserve, finish };
};
