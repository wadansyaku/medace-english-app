import {
  AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD,
  AI_MONTHLY_PLAN_LIMIT_MICRO_USD,
  AI_MONTHLY_SAFETY_MARGIN_MICRO_USD,
  isValidMicroUsd,
  type AiBudgetReservation,
  type AiBudgetReserveResult,
  type AiBudgetSettlement,
  type AtomicAiBudgetStore,
} from './ai-provider-budget';
import type { D1Database } from './types';

export interface AiProviderBudgetMetadata {
  provider: 'OPENAI' | 'CLOUDFLARE';
  model: string;
  operation: 'OCR' | 'WRITING_FEEDBACK';
}
export interface AiProviderMeasuredUsage extends AiProviderBudgetMetadata {
  providerResponseId: string;
  pricingVersion: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
}
export type AiProviderUsageOutcome = 'COMPLETED' | 'REFUSAL' | 'INVALID_OUTPUT' | 'INCOMPLETE';
export type AiProviderUnknownOutcome = 'TIMEOUT' | 'PROVIDER_FAILED' | 'UNKNOWN_USAGE' | 'INVALID_USAGE';
export interface AiProviderUsageSettlement extends AiBudgetSettlement {
  chargedMicroUsd: number;
  usage: AiProviderMeasuredUsage;
  outcome?: AiProviderUsageOutcome;
}
export interface AiProviderUnknownRecord {
  requestId: string;
  fingerprint: string;
  eventId: string;
  reason: AiProviderUnknownOutcome;
}
export interface D1AiBudgetSnapshot {
  monthKey: string;
  scope: 'GLOBAL';
  currency: 'USD';
  amountMeaning: 'APPLICATION_METERING_NOT_PROVIDER_INVOICE';
  planLimitMicroUsd: number;
  safetyMarginMicroUsd: number;
  dispatchLimitMicroUsd: number;
  accountedMicroUsd: number | null;
  accountedMicroUsdExact: string;
  remainingDispatchMicroUsd: number;
  unresolvedReservations: number;
  settledRequests: number;
  blocked: boolean;
  precisionExceeded: boolean;
}
export interface D1AiBudgetAuditRow {
  sequence: number; event_id: string; request_id: string; fingerprint: string; month_key: string;
  outcome: string; provider: string | null; model: string | null; operation: string | null;
  pricing_version: string; upper_bound_micro_usd: number; charged_micro_usd: number | null;
  provider_response_id: string | null; input_tokens: number | null; cached_input_tokens: number | null;
  output_tokens: number | null; total_tokens: number | null; created_at: number;
}
export interface D1AiBudgetStore extends AtomicAiBudgetStore {
  reserveWithMetadata(reservation: AiBudgetReservation & AiProviderBudgetMetadata): Promise<AiBudgetReserveResult>;
  settleUsage(settlement: AiProviderUsageSettlement): Promise<void>;
  recordUnknownOutcome(record: AiProviderUnknownRecord): Promise<void>;
  snapshot(monthKey: string): Promise<D1AiBudgetSnapshot>;
  exportAudit(monthKey: string, options?: { afterSequence?: number; limit?: number }): Promise<{ rows: D1AiBudgetAuditRow[]; nextAfterSequence: number | null }>;
}

const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const PRICING_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,150}$/;
const MODEL = /^[a-zA-Z0-9@][a-zA-Z0-9@/._:-]{0,150}$/;
const RESPONSE_ID = /^[a-zA-Z0-9_-]{1,200}$/;
const validMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validMetadata = (value: AiProviderBudgetMetadata): boolean => value
  && ['OPENAI', 'CLOUDFLARE'].includes(value.provider) && typeof value.model === 'string' && MODEL.test(value.model)
  && ['OCR', 'WRITING_FEEDBACK'].includes(value.operation);
const sameReservation = (row: DbReservation, input: AiBudgetReservation, metadata: AiProviderBudgetMetadata | null) => (
  row.fingerprint === input.fingerprint && row.month_key === input.monthKey
  && row.upper_bound_micro_usd === input.upperBoundMicroUsd && row.pricing_version === input.pricingVersion
  && row.provider === (metadata?.provider ?? null) && row.model === (metadata?.model ?? null) && row.operation === (metadata?.operation ?? null)
);
interface DbReservation {
  request_id: string; reserve_token: string; fingerprint: string; month_key: string;
  upper_bound_micro_usd: number; pricing_version: string; provider: string | null; model: string | null; operation: string | null;
  state: 'RESERVED' | 'SETTLED'; settlement_key: string | null;
}
const digest = async (value: unknown): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

// Trusted server-only store. The API layer must authorize ADMIN before using
// snapshot/exportAudit; no client-supplied amount, model or price config is trusted.
export const createD1AiBudgetStore = (
  DB: D1Database,
  options: { approvedPricingVersions: readonly string[]; now?: () => Date },
): D1AiBudgetStore => {
  const pricingVersions = new Set(options.approvedPricingVersions);
  if (!pricingVersions.size || [...pricingVersions].some(value => typeof value !== 'string' || !PRICING_VERSION.test(value))) {
    throw new Error('Invalid approved provider pricing versions.');
  }
  const now = () => {
    const value = options.now?.() ?? new Date();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() <= 0) throw new Error('Invalid budget clock.');
    return value;
  };
  const readReservation = (requestId: string) => DB.prepare('SELECT * FROM ai_provider_budget_reservations WHERE request_id = ?').bind(requestId).first<DbReservation>();
  const assertIdentity = async (requestId: string, fingerprint: string): Promise<DbReservation> => {
    if (!ID.test(requestId) || !FINGERPRINT.test(fingerprint)) throw new Error('Budget reservation mismatch.');
    const row = await readReservation(requestId);
    if (!row || row.fingerprint !== fingerprint) throw new Error('Budget reservation mismatch.');
    return row;
  };

  const reserve = async (input: AiBudgetReservation, metadata: AiProviderBudgetMetadata | null): Promise<AiBudgetReserveResult> => {
    // Clone scalars before the first await so the checked and stored quote agree.
    const reservation = input ? { ...input } : input;
    const detail = metadata ? { ...metadata } : null;
    const clock = now();
    if (!reservation || typeof reservation.requestId !== 'string' || !ID.test(reservation.requestId)
      || typeof reservation.fingerprint !== 'string' || !FINGERPRINT.test(reservation.fingerprint)
      || !validMonth(reservation.monthKey) || reservation.monthKey !== clock.toISOString().slice(0, 7)
      || !isValidMicroUsd(reservation.upperBoundMicroUsd) || reservation.upperBoundMicroUsd < 1
      || reservation.upperBoundMicroUsd > AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD
      || !pricingVersions.has(reservation.pricingVersion) || (detail && !validMetadata(detail))) {
      return { reserved: false, reason: 'INVALID_RESERVATION' };
    }
    const token = crypto.randomUUID();
    // Admission and creation happen inside the write transaction. The trigger
    // repeats the guard and accounts/audits the reservation in the same commit.
    await DB.batch([
      DB.prepare('INSERT INTO ai_provider_budget_months(month_key, created_at) VALUES (?, ?) ON CONFLICT(month_key) DO NOTHING').bind(reservation.monthKey, clock.getTime()),
      DB.prepare(`INSERT INTO ai_provider_budget_reservations
        (request_id, reserve_token, fingerprint, month_key, upper_bound_micro_usd, pricing_version, provider, model, operation, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM ai_provider_budget_months m
        WHERE m.month_key = ? AND m.blocked = 0 AND m.accounted_micro_usd + ? <= ?
          AND NOT EXISTS (SELECT 1 FROM ai_provider_budget_reservations WHERE request_id = ?)
        ON CONFLICT(request_id) DO NOTHING`).bind(
        reservation.requestId, token, reservation.fingerprint, reservation.monthKey, reservation.upperBoundMicroUsd,
        reservation.pricingVersion, detail?.provider ?? null, detail?.model ?? null, detail?.operation ?? null, clock.getTime(),
        reservation.monthKey, reservation.upperBoundMicroUsd, AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD, reservation.requestId,
      ),
    ]);
    // A nonce identifies this admission, so trigger changes/ack retries cannot
    // turn a previous request into permission to dispatch a second provider call.
    const existing = await readReservation(reservation.requestId);
    if (existing) {
      if (existing.reserve_token === token) return { reserved: true };
      return { reserved: false, reason: sameReservation(existing, reservation, detail) ? 'DUPLICATE_REQUEST' : 'REQUEST_CONFLICT' };
    }
    const month = await DB.prepare('SELECT blocked FROM ai_provider_budget_months WHERE month_key = ?').bind(reservation.monthKey).first<{ blocked: number }>();
    if (!month) throw new Error('Budget admission result unavailable.');
    return { reserved: false, reason: month.blocked ? 'BUDGET_BLOCKED' : 'BUDGET_EXHAUSTED' };
  };

  const settleKnown = async (input: AiBudgetSettlement, usage: AiProviderMeasuredUsage | null, outcome: string): Promise<void> => {
    const settlement = { ...input };
    const measured = usage ? { ...usage } : null;
    const row = await assertIdentity(settlement.requestId, settlement.fingerprint);
    if (settlement.chargedMicroUsd == null) return;
    if (!isValidMicroUsd(settlement.chargedMicroUsd)) throw new Error('Invalid measured usage.');
    if (measured && (!validMetadata(measured) || typeof measured.providerResponseId !== 'string' || !RESPONSE_ID.test(measured.providerResponseId)
      || measured.pricingVersion !== row.pricing_version || measured.provider !== row.provider || measured.model !== row.model || measured.operation !== row.operation
      || ![measured.inputTokens, measured.cachedInputTokens, measured.outputTokens, measured.totalTokens].every(isValidMicroUsd)
      || measured.cachedInputTokens > measured.inputTokens || measured.inputTokens + measured.outputTokens !== measured.totalTokens
      || !Number.isSafeInteger(measured.inputTokens + measured.outputTokens))) throw new Error('Invalid provider usage metadata.');
    const key = await digest([settlement.chargedMicroUsd, outcome, measured && [measured.providerResponseId, measured.provider, measured.model, measured.operation,
      measured.pricingVersion, measured.inputTokens, measured.cachedInputTokens, measured.outputTokens, measured.totalTokens]]);
    await DB.prepare(`UPDATE ai_provider_budget_reservations SET state = 'SETTLED', charged_micro_usd = ?, settlement_key = ?, outcome = ?, settled_at = ?,
      provider_response_id = ?, input_tokens = ?, cached_input_tokens = ?, output_tokens = ?, total_tokens = ?
      WHERE request_id = ? AND fingerprint = ? AND state = 'RESERVED'`).bind(
      settlement.chargedMicroUsd, key, outcome, now().getTime(), measured?.providerResponseId ?? null,
      measured?.inputTokens ?? null, measured?.cachedInputTokens ?? null, measured?.outputTokens ?? null, measured?.totalTokens ?? null,
      settlement.requestId, settlement.fingerprint,
    ).run();
    const saved = await assertIdentity(settlement.requestId, settlement.fingerprint);
    if (saved.state !== 'SETTLED' || saved.settlement_key !== key) throw new Error('Budget settlement conflict.');
  };

  return {
    reserve: reservation => reserve(reservation, null),
    reserveWithMetadata: reservation => reserve(reservation, reservation),
    settle: settlement => settleKnown(settlement, null, 'COST_ONLY'),
    async settleUsage(settlement) {
      const outcome = settlement.outcome ?? 'COMPLETED';
      if (!['COMPLETED', 'REFUSAL', 'INVALID_OUTPUT', 'INCOMPLETE'].includes(outcome)) throw new Error('Invalid usage outcome.');
      if (!settlement.usage || settlement.chargedMicroUsd == null) throw new Error('Detailed provider usage required.');
      await settleKnown(settlement, settlement.usage, outcome);
    },
    async recordUnknownOutcome(input) {
      const record = { ...input };
      if (typeof record.eventId !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/.test(record.eventId) || !['TIMEOUT', 'PROVIDER_FAILED', 'UNKNOWN_USAGE', 'INVALID_USAGE'].includes(record.reason)) throw new Error('Invalid unknown usage record.');
      await assertIdentity(record.requestId, record.fingerprint);
      await DB.prepare(`INSERT INTO ai_provider_usage_audit(event_id, request_id, fingerprint, month_key, outcome, provider, model, operation, pricing_version, upper_bound_micro_usd, created_at)
        SELECT ?, request_id, fingerprint, month_key, ?, provider, model, operation, pricing_version, upper_bound_micro_usd, ?
        FROM ai_provider_budget_reservations WHERE request_id = ? AND fingerprint = ? AND state = 'RESERVED'
        ON CONFLICT(event_id) DO NOTHING`).bind(record.eventId, record.reason, now().getTime(), record.requestId, record.fingerprint).run();
      const event = await DB.prepare('SELECT request_id, fingerprint, outcome FROM ai_provider_usage_audit WHERE event_id = ?').bind(record.eventId).first<{ request_id: string; fingerprint: string; outcome: string }>();
      if (!event || event.request_id !== record.requestId || event.fingerprint !== record.fingerprint || event.outcome !== record.reason) throw new Error('Unknown usage audit conflict.');
    },
    async snapshot(monthKey) {
      if (!validMonth(monthKey)) throw new Error('Invalid budget month.');
      const result = await DB.prepare(`SELECT CAST(COALESCE(m.accounted_micro_usd, 0) AS TEXT) AS exact_amount, COALESCE(m.blocked, 0) AS blocked,
        (SELECT COUNT(*) FROM ai_provider_budget_reservations WHERE month_key = ? AND state = 'RESERVED') AS reserved_count,
        (SELECT COUNT(*) FROM ai_provider_budget_reservations WHERE month_key = ? AND state = 'SETTLED') AS settled_count
        FROM (SELECT 1) LEFT JOIN ai_provider_budget_months m ON m.month_key = ?`).bind(monthKey, monthKey, monthKey)
        .first<{ exact_amount: string; blocked: number; reserved_count: number; settled_count: number }>();
      if (!result || !/^\d+$/.test(result.exact_amount)) throw new Error('Budget snapshot unavailable.');
      const exact = BigInt(result.exact_amount);
      const precisionExceeded = exact > BigInt(Number.MAX_SAFE_INTEGER);
      return {
        monthKey, scope: 'GLOBAL', currency: 'USD', amountMeaning: 'APPLICATION_METERING_NOT_PROVIDER_INVOICE',
        planLimitMicroUsd: AI_MONTHLY_PLAN_LIMIT_MICRO_USD, safetyMarginMicroUsd: AI_MONTHLY_SAFETY_MARGIN_MICRO_USD,
        dispatchLimitMicroUsd: AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD,
        accountedMicroUsd: precisionExceeded ? null : Number(exact), accountedMicroUsdExact: result.exact_amount,
        remainingDispatchMicroUsd: exact >= BigInt(AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD) ? 0 : AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD - Number(exact),
        unresolvedReservations: result.reserved_count, settledRequests: result.settled_count, blocked: Boolean(result.blocked), precisionExceeded,
      };
    },
    async exportAudit(monthKey, input = {}) {
      const after = input.afterSequence ?? 0; const limit = input.limit ?? 100;
      if (!validMonth(monthKey) || !Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid audit pagination.');
      const result = await DB.prepare('SELECT * FROM ai_provider_usage_audit WHERE month_key = ? AND sequence > ? ORDER BY sequence LIMIT ?').bind(monthKey, after, limit + 1).all<D1AiBudgetAuditRow>();
      if (!result.success || !result.results) throw new Error('Budget audit unavailable.');
      const rows = result.results.slice(0, limit);
      return { rows, nextAfterSequence: result.results.length > limit ? rows.at(-1)!.sequence : null };
    },
  };
};
