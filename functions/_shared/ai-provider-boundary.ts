import {
  isValidMicroUsd,
  type AiBudgetReservation,
  type AtomicAiBudgetStore,
} from './ai-provider-budget';

// There is deliberately no live mode, fetch, SDK client, API key, or binding.
// Environment configuration alone cannot turn this local candidate into AI.
export type CandidateAiProvider = 'OPENAI' | 'CLOUDFLARE';
export type CandidateAiOperation = 'OCR' | 'WRITING_FEEDBACK';

export type CandidateAiRequest = {
  requestId: string;
  dataOrigin: 'SYNTHETIC_FIXTURE';
} & (
  | { operation: 'OCR'; payload: { assets: Array<{ mimeType: string; base64Data: string }>; promptText: string } }
  | { operation: 'WRITING_FEEDBACK'; payload: { transcript: string; promptText: string } }
);

export interface CandidateOcrDraft {
  transcript: string;
  confidence: number;
}

export interface CandidateWritingFeedbackDraft {
  strengths: string[];
  improvementPoints: string[];
  correctedDraft: string;
  sentenceCorrections: Array<{ before: string; after: string; reason: string }>;
}

export type CandidateAiFailureReason =
  | 'DISABLED' | 'SYNTHETIC_ONLY' | 'INVALID_REQUEST' | 'INVALID_CONFIGURATION'
  | 'BUDGET_UNAVAILABLE' | 'BUDGET_DENIED' | 'PROVIDER_REFUSAL' | 'PROVIDER_FAILED'
  | 'TIMEOUT' | 'INVALID_OUTPUT' | 'UNKNOWN_USAGE' | 'COST_BOUND_EXCEEDED';

export type CandidateAiResult =
  | { status: 'UNASSESSED'; reason: CandidateAiFailureReason; retryAutomatically: false }
  | {
      status: 'DRAFT';
      evaluationStatus: 'UNASSESSED';
      requiresHumanReview: true;
      provider: CandidateAiProvider;
      model: string;
      operation: 'OCR';
      draft: CandidateOcrDraft;
    }
  | {
      status: 'DRAFT';
      evaluationStatus: 'UNASSESSED';
      requiresHumanReview: true;
      provider: CandidateAiProvider;
      model: string;
      operation: 'WRITING_FEEDBACK';
      draft: CandidateWritingFeedbackDraft;
    };

export interface SyntheticAiMockDriver {
  kind: 'SYNTHETIC_MOCK';
  provider: CandidateAiProvider;
  // Mock names must be distinguishable from a real provider/model/price.
  model: string;
  execute(request: CandidateAiRequest, signal: AbortSignal): Promise<{
    kind: 'COMPLETED' | 'REFUSAL';
    json?: string;
    chargedMicroUsd?: number;
  }>;
}

export interface CandidateAiBoundary {
  readonly mode: 'DISABLED' | 'SYNTHETIC_MOCK';
  execute(request: CandidateAiRequest): Promise<CandidateAiResult>;
}

const failure = (reason: CandidateAiFailureReason): CandidateAiResult => ({
  status: 'UNASSESSED', reason, retryAutomatically: false,
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const textList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length >= 1 && value.length <= 5 && value.every((item) => boundedText(item, 2_000));

export const validateCandidateOcrDraft = (value: unknown): CandidateOcrDraft | null => {
  if (!isRecord(value) || !exactKeys(value, ['transcript', 'confidence'])) return null;
  if (!boundedText(value.transcript, 20_000)
    || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)
    || value.confidence < 0 || value.confidence > 1) return null;
  return { transcript: value.transcript.trim(), confidence: value.confidence };
};

export const validateCandidateWritingFeedbackDraft = (value: unknown): CandidateWritingFeedbackDraft | null => {
  if (!isRecord(value) || !exactKeys(value, ['strengths', 'improvementPoints', 'correctedDraft', 'sentenceCorrections'])) return null;
  if (!textList(value.strengths) || !textList(value.improvementPoints) || !boundedText(value.correctedDraft, 20_000)) return null;
  if (!Array.isArray(value.sentenceCorrections) || value.sentenceCorrections.length > 50) return null;
  const sentenceCorrections: CandidateWritingFeedbackDraft['sentenceCorrections'] = [];
  for (const correction of value.sentenceCorrections) {
    if (!isRecord(correction) || !exactKeys(correction, ['before', 'after', 'reason'])
      || !boundedText(correction.before, 2_000) || !boundedText(correction.after, 2_000)
      || !boundedText(correction.reason, 2_000)) return null;
    sentenceCorrections.push({ before: correction.before, after: correction.after, reason: correction.reason });
  }
  return { strengths: [...value.strengths], improvementPoints: [...value.improvementPoints], correctedDraft: value.correctedDraft, sentenceCorrections };
};

const validRequest = (request: CandidateAiRequest): boolean => {
  if (!isRecord(request) || !exactKeys(request, ['requestId', 'dataOrigin', 'operation', 'payload'])
    || typeof request.requestId !== 'string'
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.requestId) || !isRecord(request.payload)) return false;
  if (request.operation === 'WRITING_FEEDBACK') {
    return exactKeys(request.payload, ['transcript', 'promptText'])
      && boundedText(request.payload.transcript, 20_000) && boundedText(request.payload.promptText, 10_000);
  }
  if (request.operation !== 'OCR' || !exactKeys(request.payload, ['assets', 'promptText'])
    || !boundedText(request.payload.promptText, 10_000)
    || !Array.isArray(request.payload.assets) || request.payload.assets.length < 1 || request.payload.assets.length > 4) return false;
  return request.payload.assets.every((asset) => isRecord(asset) && exactKeys(asset, ['mimeType', 'base64Data'])
    && ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(asset.mimeType)
    && boundedText(asset.base64Data, 1_000_000) && /^[A-Za-z0-9+/]+={0,2}$/.test(asset.base64Data));
};

export const createDisabledAiProviderBoundary = (): CandidateAiBoundary => ({
  mode: 'DISABLED',
  async execute() { return failure('DISABLED'); },
});

// Request canonicalization is explicit, so property order cannot change the
// fingerprint. Metadata/ledger contains only a hash, never the draft or assets.
const fingerprintRequest = async (request: CandidateAiRequest, driver: SyntheticAiMockDriver): Promise<string> => {
  const payload = request.operation === 'OCR'
    ? [request.payload.promptText, request.payload.assets.map((asset) => [asset.mimeType, asset.base64Data])]
    : [request.payload.promptText, request.payload.transcript];
  const bytes = new TextEncoder().encode(JSON.stringify([request.dataOrigin, request.operation, driver.provider, driver.model, payload]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const createSyntheticMockAiProviderBoundary = (options: {
  driver: SyntheticAiMockDriver;
  budget: AtomicAiBudgetStore;
  // A hypothetical bound is explicitly marked mock; no real unit price exists
  // in this candidate and no free allowance is treated as unlimited capacity.
  quote: { upperBoundMicroUsd: number; pricingVersion: string };
  now?: () => Date;
  timeoutMs?: number;
}): CandidateAiBoundary => ({
  mode: 'SYNTHETIC_MOCK',
  async execute(input) {
    if (!isRecord(input) || input.dataOrigin !== 'SYNTHETIC_FIXTURE') return failure('SYNTHETIC_ONLY');
    // Keep the hashed request and dispatched input equal across await points.
    let request: CandidateAiRequest;
    try { request = structuredClone(input); } catch { return failure('INVALID_REQUEST'); }
    if (!validRequest(request)) return failure('INVALID_REQUEST');
    const { driver: sourceDriver, budget } = options;
    const driver = { ...sourceDriver, execute: sourceDriver.execute.bind(sourceDriver) };
    const quote = { ...options.quote };
    const timeoutMs = options.timeoutMs ?? 20_000;
    if (driver.kind !== 'SYNTHETIC_MOCK' || !['OPENAI', 'CLOUDFLARE'].includes(driver.provider)
      || !/^mock-[a-zA-Z0-9_-]{1,100}$/.test(driver.model)
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) return failure('INVALID_CONFIGURATION');

    let reservation: AiBudgetReservation;
    try {
      reservation = {
        requestId: request.requestId,
        fingerprint: await fingerprintRequest(request, driver),
        monthKey: (options.now?.() ?? new Date()).toISOString().slice(0, 7),
        ...quote,
      };
      const reserved = await budget.reserve(reservation);
      if (!reserved.reserved) return failure('BUDGET_DENIED');
    } catch {
      return failure('BUDGET_UNAVAILABLE');
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('mock-provider-timeout')); }, timeoutMs);
    });
    let response: Awaited<ReturnType<SyntheticAiMockDriver['execute']>>;
    try {
      // No automatic retry or cross-provider fallback. Late resolution after a
      // timeout cannot reach settlement, draft publication, or a second call.
      response = await Promise.race([Promise.resolve().then(() => driver.execute(structuredClone(request), controller.signal)), timeout]);
    } catch {
      return failure(controller.signal.aborted ? 'TIMEOUT' : 'PROVIDER_FAILED');
    } finally {
      clearTimeout(timer!);
    }

    if (!isRecord(response) || !['COMPLETED', 'REFUSAL'].includes(response.kind)) return failure('INVALID_OUTPUT');
    if (!isValidMicroUsd(response.chargedMicroUsd)) return failure('UNKNOWN_USAGE');
    try {
      await budget.settle({ requestId: reservation.requestId, fingerprint: reservation.fingerprint, chargedMicroUsd: response.chargedMicroUsd });
    } catch {
      return failure('BUDGET_UNAVAILABLE');
    }
    if (response.chargedMicroUsd > reservation.upperBoundMicroUsd) return failure('COST_BOUND_EXCEEDED');
    if (response.kind === 'REFUSAL') return failure('PROVIDER_REFUSAL');

    if (typeof response.json !== 'string' || response.json.length > 100_000) return failure('INVALID_OUTPUT');
    let parsed: unknown;
    try { parsed = JSON.parse(response.json); } catch { return failure('INVALID_OUTPUT'); }
    const base = {
      status: 'DRAFT' as const,
      evaluationStatus: 'UNASSESSED' as const,
      requiresHumanReview: true as const,
      provider: driver.provider,
      model: driver.model,
    };
    if (request.operation === 'OCR') {
      const draft = validateCandidateOcrDraft(parsed);
      return draft ? { ...base, operation: 'OCR', draft } : failure('INVALID_OUTPUT');
    }
    const draft = validateCandidateWritingFeedbackDraft(parsed);
    return draft ? { ...base, operation: 'WRITING_FEEDBACK', draft } : failure('INVALID_OUTPUT');
  },
});
