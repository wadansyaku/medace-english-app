import { apiGet, ApiError } from './apiClient';

export interface WritingAiBudgetSnapshot {
  monthKey: string;
  scope: 'GLOBAL';
  currency: 'USD';
  amountMeaning: 'APPLICATION_METERING_NOT_PROVIDER_INVOICE';
  planLimitMicroUsd: number;
  safetyMarginMicroUsd: number;
  dispatchLimitMicroUsd: number;
  accountedMicroUsd: number | null;
  accountedMicroUsdExact: string;
  measuredUsageMicroUsd: number | null;
  measuredUsageMicroUsdExact: string;
  reservedHoldMicroUsd: number | null;
  reservedHoldMicroUsdExact: string;
  remainingDispatchMicroUsd: number;
  unresolvedReservations: number;
  settledRequests: number;
  blocked: boolean;
  precisionExceeded: boolean;
}

export type WritingAiBudgetOutcome = 'RESERVED' | 'COMPLETED' | 'REFUSAL' | 'INVALID_OUTPUT'
  | 'INCOMPLETE' | 'TIMEOUT' | 'PROVIDER_FAILED' | 'UNKNOWN_USAGE' | 'INVALID_USAGE' | 'COST_ONLY';

export interface WritingAiBudgetAuditRow {
  sequence: number;
  event_id: string;
  request_id: string;
  fingerprint: string;
  month_key: string;
  outcome: WritingAiBudgetOutcome;
  provider: string | null;
  model: string | null;
  operation: string | null;
  pricing_version: string;
  upper_bound_micro_usd: number;
  charged_micro_usd: number | null;
  provider_response_id: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  created_at: number;
}

export interface WritingAiBudgetResponse {
  monthKey: string;
  snapshot: WritingAiBudgetSnapshot;
  audit: { rows: WritingAiBudgetAuditRow[]; nextAfterSequence: number | null };
  providerInvoiceConfirmed: false;
  scope: 'THIS_APPLICATION_ONLY';
  configured: boolean;
}

export const isWritingAiBudgetMonth = (month: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isNullableCount = (value: unknown) => value === null || isCount(value);
const isNullableText = (value: unknown) => value === null || typeof value === 'string';
const isExactAmount = (amount: unknown, exact: unknown) => {
  if (typeof exact !== 'string' || !/^\d+$/.test(exact)) return false;
  const exactAmount = BigInt(exact);
  return amount === null ? exactAmount > BigInt(Number.MAX_SAFE_INTEGER) : isCount(amount) && exactAmount === BigInt(amount);
};
const validOutcomes: WritingAiBudgetOutcome[] = ['RESERVED', 'COMPLETED', 'REFUSAL', 'INVALID_OUTPUT',
  'INCOMPLETE', 'TIMEOUT', 'PROVIDER_FAILED', 'UNKNOWN_USAGE', 'INVALID_USAGE', 'COST_ONLY'];
const isValidAuditRow = (row: WritingAiBudgetAuditRow, monthKey: string) => row && row.month_key === monthKey
  && isCount(row.sequence) && validOutcomes.includes(row.outcome)
  && isCount(row.upper_bound_micro_usd) && isNullableCount(row.charged_micro_usd)
  && [row.input_tokens, row.cached_input_tokens, row.output_tokens, row.total_tokens].every(isNullableCount)
  && [row.provider, row.model, row.operation, row.provider_response_id].every(isNullableText)
  && isCount(row.created_at) && row.created_at <= 8_640_000_000_000_000;

export const getWritingAiBudget = async (monthKey: string): Promise<WritingAiBudgetResponse> => {
  if (!isWritingAiBudgetMonth(monthKey)) throw new Error('対象月を選択してください。');
  const response = await apiGet<WritingAiBudgetResponse>(`/api/writing/ai-budget?month=${encodeURIComponent(monthKey)}`);
  if (!response || response.monthKey !== monthKey || response.snapshot?.monthKey !== monthKey
    || response.scope !== 'THIS_APPLICATION_ONLY' || response.providerInvoiceConfirmed !== false
    || typeof response.configured !== 'boolean' || !Array.isArray(response.audit?.rows)
    || response.snapshot.scope !== 'GLOBAL' || response.snapshot.currency !== 'USD'
    || response.snapshot.amountMeaning !== 'APPLICATION_METERING_NOT_PROVIDER_INVOICE'
    || ![response.snapshot.planLimitMicroUsd, response.snapshot.safetyMarginMicroUsd,
      response.snapshot.dispatchLimitMicroUsd, response.snapshot.remainingDispatchMicroUsd,
      response.snapshot.unresolvedReservations, response.snapshot.settledRequests].every(isCount)
    || !isExactAmount(response.snapshot.accountedMicroUsd, response.snapshot.accountedMicroUsdExact)
    || !isExactAmount(response.snapshot.measuredUsageMicroUsd, response.snapshot.measuredUsageMicroUsdExact)
    || !isExactAmount(response.snapshot.reservedHoldMicroUsd, response.snapshot.reservedHoldMicroUsdExact)
    || typeof response.snapshot.blocked !== 'boolean' || typeof response.snapshot.precisionExceeded !== 'boolean'
    || (!response.snapshot.precisionExceeded && [response.snapshot.accountedMicroUsd,
      response.snapshot.measuredUsageMicroUsd, response.snapshot.reservedHoldMicroUsd].includes(null))
    || !isNullableCount(response.audit.nextAfterSequence)
    || !response.audit.rows.every(row => isValidAuditRow(row, monthKey))) {
    throw new Error('利用状況の取得結果を確認できません。');
  }
  return response;
};

export type WritingAiBudgetLoadState =
  | { status: 'loading'; monthKey: string }
  | { status: 'error'; monthKey: string; reason: 'INVALID_MONTH' | 'UNAUTHORIZED' | 'LOAD_FAILED' }
  | { status: 'ready'; monthKey: string; data: WritingAiBudgetResponse };

export const createWritingAiBudgetLoader = (
  onState: (state: WritingAiBudgetLoadState) => void,
  read: (monthKey: string) => Promise<WritingAiBudgetResponse> = getWritingAiBudget,
) => {
  let generation = 0;
  let pending: { monthKey: string; promise: Promise<void> } | null = null;
  return {
    load(monthKey: string): Promise<void> {
      if (pending?.monthKey === monthKey) return pending.promise;
      const requestGeneration = ++generation;
      if (!isWritingAiBudgetMonth(monthKey)) {
        pending = null;
        onState({ status: 'error', monthKey, reason: 'INVALID_MONTH' });
        return Promise.resolve();
      }
      onState({ status: 'loading', monthKey });
      const promise = Promise.resolve().then(() => read(monthKey)).then(data => {
        if (generation === requestGeneration) onState({ status: 'ready', monthKey, data });
      }).catch(error => {
        if (generation === requestGeneration) onState({ status: 'error', monthKey,
          reason: error instanceof ApiError && [401, 403].includes(error.status) ? 'UNAUTHORIZED' : 'LOAD_FAILED' });
      }).finally(() => {
        if (generation === requestGeneration) pending = null;
      });
      pending = { monthKey, promise };
      return promise;
    },
    invalidate(): void {
      generation += 1;
      pending = null;
    },
  };
};
