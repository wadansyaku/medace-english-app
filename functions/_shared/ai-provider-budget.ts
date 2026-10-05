// USD micro-units avoid rounding down a fractional cost. These are application
// planning limits, not a provider price or a promise about the provider's bill.
export const AI_MONTHLY_PLAN_LIMIT_MICRO_USD = 5_000_000;
export const AI_MONTHLY_SAFETY_MARGIN_MICRO_USD = 500_000;
export const AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD =
  AI_MONTHLY_PLAN_LIMIT_MICRO_USD - AI_MONTHLY_SAFETY_MARGIN_MICRO_USD;

export interface AiBudgetReservation {
  requestId: string;
  fingerprint: string;
  monthKey: string;
  upperBoundMicroUsd: number;
  pricingVersion: string;
}

export type AiBudgetReserveResult =
  | { reserved: true }
  | { reserved: false; reason: 'INVALID_RESERVATION' | 'DUPLICATE_REQUEST' | 'REQUEST_CONFLICT' | 'BUDGET_EXHAUSTED' | 'BUDGET_BLOCKED' };

export interface AiBudgetSettlement {
  requestId: string;
  fingerprint: string;
  // Unknown, rejected, or timed out calls remain reserved at the full bound.
  chargedMicroUsd?: number;
}

export interface AtomicAiBudgetStore {
  // Implementations must atomically check the GLOBAL month total and create the
  // reservation. A SELECT followed by an INSERT is not a sufficient contract.
  reserve(reservation: AiBudgetReservation): Promise<AiBudgetReserveResult>;
  // Must atomically settle this exact reservation; a cost above the approved
  // bound blocks further dispatch for its month instead of hiding the overrun.
  settle(settlement: AiBudgetSettlement): Promise<void>;
}

export const isValidMicroUsd = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isValidReservation = (value: AiBudgetReservation): boolean => (
  typeof value.requestId === 'string'
  && /^[a-zA-Z0-9_-]{1,100}$/.test(value.requestId)
  && /^[a-f0-9]{64}$/.test(value.fingerprint)
  && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.monthKey)
  && isValidMicroUsd(value.upperBoundMicroUsd)
  && value.upperBoundMicroUsd > 0
  && value.upperBoundMicroUsd <= AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD
  && /^mock-[a-zA-Z0-9_-]{1,100}$/.test(value.pricingVersion)
);

interface MockBudgetEntry extends AiBudgetReservation {
  state: 'RESERVED' | 'SETTLED';
  chargedMicroUsd?: number;
}

export interface MockAiBudgetSnapshot {
  monthKey: string;
  accountedMicroUsd: number;
  unresolvedReservations: number;
  settledRequests: number;
  blocked: boolean;
}

// This store exists ONLY for isolated mock evaluation. It is process-local,
// survives neither a restart nor multiple Workers, and must never gate live AI.
// No production D1 migration or persistent store is supplied in this candidate.
export const createMockAiBudgetStore = (): AtomicAiBudgetStore & {
  snapshot(monthKey: string): MockAiBudgetSnapshot;
} => {
  const entries = new Map<string, MockBudgetEntry>();
  const blockedMonths = new Set<string>();
  const snapshot = (monthKey: string): MockAiBudgetSnapshot => {
    const monthEntries = [...entries.values()].filter((entry) => entry.monthKey === monthKey);
    return {
      monthKey,
      accountedMicroUsd: monthEntries.reduce((sum, entry) => sum + (entry.chargedMicroUsd ?? entry.upperBoundMicroUsd), 0),
      unresolvedReservations: monthEntries.filter((entry) => entry.state === 'RESERVED').length,
      settledRequests: monthEntries.filter((entry) => entry.state === 'SETTLED').length,
      blocked: blockedMonths.has(monthKey),
    };
  };

  return {
    snapshot,
    async reserve(reservation) {
      if (!isValidReservation(reservation)) return { reserved: false, reason: 'INVALID_RESERVATION' };
      const existing = entries.get(reservation.requestId);
      if (existing) {
        const same = existing.fingerprint === reservation.fingerprint
          && existing.monthKey === reservation.monthKey
          && existing.upperBoundMicroUsd === reservation.upperBoundMicroUsd
          && existing.pricingVersion === reservation.pricingVersion;
        return { reserved: false, reason: same ? 'DUPLICATE_REQUEST' : 'REQUEST_CONFLICT' };
      }
      if (blockedMonths.has(reservation.monthKey)) return { reserved: false, reason: 'BUDGET_BLOCKED' };
      if (snapshot(reservation.monthKey).accountedMicroUsd + reservation.upperBoundMicroUsd > AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD) {
        return { reserved: false, reason: 'BUDGET_EXHAUSTED' };
      }
      // No await between the check and write: atomic inside this mock process.
      entries.set(reservation.requestId, { ...reservation, state: 'RESERVED' });
      return { reserved: true };
    },
    async settle(settlement) {
      const existing = entries.get(settlement.requestId);
      if (!existing || existing.fingerprint !== settlement.fingerprint) throw new Error('Budget reservation mismatch.');
      if (settlement.chargedMicroUsd == null) return;
      if (!isValidMicroUsd(settlement.chargedMicroUsd)) throw new Error('Invalid measured usage.');
      if (existing.state === 'SETTLED') {
        if (existing.chargedMicroUsd !== settlement.chargedMicroUsd) throw new Error('Budget settlement conflict.');
        return;
      }
      entries.set(existing.requestId, { ...existing, state: 'SETTLED', chargedMicroUsd: settlement.chargedMicroUsd });
      if (settlement.chargedMicroUsd > existing.upperBoundMicroUsd) blockedMonths.add(existing.monthKey);
    },
  };
};
