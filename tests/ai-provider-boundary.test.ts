import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDisabledAiProviderBoundary,
  createSyntheticMockAiProviderBoundary,
  validateCandidateOcrDraft,
  validateCandidateWritingFeedbackDraft,
  type CandidateAiRequest,
  type SyntheticAiMockDriver,
} from '../functions/_shared/ai-provider-boundary';
import { createMockAiBudgetStore } from '../functions/_shared/ai-provider-budget';

const request = (requestId = 'request_1'): CandidateAiRequest => ({
  requestId, dataOrigin: 'SYNTHETIC_FIXTURE', operation: 'WRITING_FEEDBACK',
  payload: { transcript: 'This is a synthetic English paragraph.', promptText: 'Describe a fictional day.' },
});
const feedback = () => ({
  strengths: ['A clear sentence.'], improvementPoints: ['Add a fictional example.'],
  correctedDraft: 'This is a synthetic English paragraph.', sentenceCorrections: [],
});
const setup = (options: {
  response?: Awaited<ReturnType<SyntheticAiMockDriver['execute']>>;
  provider?: SyntheticAiMockDriver['provider'];
  model?: string;
  bound?: number;
  timeoutMs?: number;
} = {}) => {
  const budget = createMockAiBudgetStore();
  const execute = vi.fn<SyntheticAiMockDriver['execute']>(async () => options.response ?? { kind: 'COMPLETED' as const, json: JSON.stringify(feedback()), chargedMicroUsd: 10 });
  const driver: SyntheticAiMockDriver = { kind: 'SYNTHETIC_MOCK', provider: options.provider ?? 'OPENAI', model: options.model ?? 'mock-feedback-v1', execute };
  const boundary = createSyntheticMockAiProviderBoundary({ driver, budget,
    quote: { upperBoundMicroUsd: options.bound ?? 100, pricingVersion: 'mock-pricing-v1' },
    now: () => new Date('2026-10-05T12:00:00Z'), timeoutMs: options.timeoutMs,
  });
  return { budget, execute, driver, boundary };
};

afterEach(() => { vi.useRealTimers(); });

describe('disabled or explicit synthetic provider boundary', () => {
  it('defaults to disabled without reading keys, bindings, or external providers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await createDisabledAiProviderBoundary().execute(request()))
      .toEqual({ status: 'UNASSESSED', reason: 'DISABLED', retryAutomatically: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects real or unclassified data before reserving or calling a mock', async () => {
    const { boundary, execute, budget } = setup();
    expect(await boundary.execute({ ...request(), dataOrigin: 'STUDENT' } as unknown as CandidateAiRequest))
      .toMatchObject({ status: 'UNASSESSED', reason: 'SYNTHETIC_ONLY' });
    expect(execute).not.toHaveBeenCalled();
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(0);
  });

  it.each(['gpt-6-luna', 'gemini-2.5-flash'])('cannot enable live model %s through the mock factory', async (model) => {
    const { boundary, execute } = setup({ model });
    expect(await boundary.execute(request())).toMatchObject({ status: 'UNASSESSED', reason: 'INVALID_CONFIGURATION' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a legacy Gemini driver without falling back to another provider', async () => {
    const { boundary, execute, driver } = setup();
    driver.provider = 'GEMINI' as SyntheticAiMockDriver['provider'];
    expect(await boundary.execute(request())).toMatchObject({ reason: 'INVALID_CONFIGURATION' });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['OPENAI', 'CLOUDFLARE'] as const)('returns only an unassessed human-review draft for %s', async (provider) => {
    const { boundary, execute, budget } = setup({ provider });
    const result = await boundary.execute(request());
    expect(result).toMatchObject({ status: 'DRAFT', evaluationStatus: 'UNASSESSED', requiresHumanReview: true, provider,
      operation: 'WRITING_FEEDBACK', draft: feedback() });
    expect(JSON.stringify(result)).not.toMatch(/overallScore|selectionScore|rubric|isDefault/);
    expect(execute).toHaveBeenCalledOnce();
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 10, unresolvedReservations: 0 });
  });

  it('returns OCR text as a draft, keeping confidence distinct from a grade', async () => {
    const { boundary } = setup({ response: { kind: 'COMPLETED', json: '{"transcript":" Synthetic handwriting. ","confidence":0.7}', chargedMicroUsd: 10 } });
    const result = await boundary.execute({ requestId: 'ocr_1', dataOrigin: 'SYNTHETIC_FIXTURE', operation: 'OCR',
      payload: { promptText: 'A fictional day.', assets: [{ mimeType: 'image/png', base64Data: 'aGVsbG8=' }] } });
    expect(result).toMatchObject({ status: 'DRAFT', evaluationStatus: 'UNASSESSED', requiresHumanReview: true,
      operation: 'OCR', draft: { transcript: 'Synthetic handwriting.', confidence: 0.7 } });
  });

  it('never dispatches the same attempt twice under concurrent calls or after success', async () => {
    const { boundary, execute } = setup();
    const results = await Promise.all([boundary.execute(request()), boundary.execute(request())]);
    expect(results.filter((result) => result.status === 'DRAFT')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'UNASSESSED')).toHaveLength(1);
    expect(await boundary.execute(request())).toMatchObject({ reason: 'BUDGET_DENIED' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('freezes the dispatched payload before asynchronous reservation', async () => {
    const { boundary, execute } = setup();
    const input = request();
    const pending = boundary.execute(input);
    input.payload = { transcript: 'changed after call', promptText: 'changed' };
    await pending;
    expect(execute.mock.calls[0][0]).toEqual(request());
  });

  it('rejects unknown input fields, numeric IDs, and oversized text before dispatch', async () => {
    for (const input of [
      { ...request(), studentName: 'Unrequested identifier' },
      { ...request(), requestId: 12 },
      { ...request(), payload: { transcript: 'a'.repeat(20_001), promptText: 'fiction' } },
    ]) {
      const { boundary, execute } = setup();
      expect(await boundary.execute(input as unknown as CandidateAiRequest)).toMatchObject({ reason: 'INVALID_REQUEST' });
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it('fails closed on a budget-store failure before provider dispatch', async () => {
    const { driver, execute } = setup();
    const boundary = createSyntheticMockAiProviderBoundary({ driver,
      budget: { reserve: async () => { throw new Error('store unavailable'); }, settle: vi.fn() },
      quote: { upperBoundMicroUsd: 100, pricingVersion: 'mock-pricing-v1' },
    });
    expect(await boundary.execute(request())).toMatchObject({ reason: 'BUDGET_UNAVAILABLE' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed if settlement fails, even when the provider draft is valid', async () => {
    const { driver } = setup();
    const boundary = createSyntheticMockAiProviderBoundary({ driver,
      budget: { reserve: async () => ({ reserved: true }), settle: async () => { throw new Error('store failure'); } },
      quote: { upperBoundMicroUsd: 100, pricingVersion: 'mock-pricing-v1' },
    });
    expect(await boundary.execute(request())).toMatchObject({ reason: 'BUDGET_UNAVAILABLE', status: 'UNASSESSED' });
  });

  it('does not mistake Cloudflare free quota for an unlimited budget', async () => {
    const { boundary, budget, execute } = setup({ provider: 'CLOUDFLARE', bound: 4_500_000,
      response: { kind: 'COMPLETED', json: JSON.stringify(feedback()) } });
    expect(await boundary.execute(request())).toMatchObject({ reason: 'UNKNOWN_USAGE' });
    expect(await boundary.execute(request('another_request'))).toMatchObject({ reason: 'BUDGET_DENIED' });
    expect(execute).toHaveBeenCalledOnce();
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(4_500_000);
  });

  it('records a known refusal charge and leaves the submission unassessed', async () => {
    const { boundary, budget } = setup({ response: { kind: 'REFUSAL', chargedMicroUsd: 8 } });
    expect(await boundary.execute(request())).toMatchObject({ status: 'UNASSESSED', reason: 'PROVIDER_REFUSAL', retryAutomatically: false });
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(8);
  });

  it('retains unknown failures without returning a sample or retrying automatically', async () => {
    const { boundary, execute, budget } = setup();
    execute.mockRejectedValue(new Error('provider rejected'));
    expect(await boundary.execute(request())).toMatchObject({ status: 'UNASSESSED', reason: 'PROVIDER_FAILED', retryAutomatically: false });
    expect(await boundary.execute(request())).toMatchObject({ reason: 'BUDGET_DENIED' });
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 100, unresolvedReservations: 1 });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('aborts timeout but retains the reservation when a provider resolves later', async () => {
    vi.useFakeTimers();
    const { boundary, execute, budget } = setup({ timeoutMs: 50 });
    let resolveProvider: (response: Awaited<ReturnType<SyntheticAiMockDriver['execute']>>) => void;
    execute.mockImplementation(() => new Promise((resolve) => { resolveProvider = resolve; }));
    const pending = boundary.execute(request());
    // SHA-256 completes outside fake timer scheduling.
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ status: 'UNASSESSED', reason: 'TIMEOUT' });
    expect(execute.mock.calls[0][1].aborted).toBe(true);
    resolveProvider!({ kind: 'COMPLETED', json: JSON.stringify(feedback()), chargedMicroUsd: 1 });
    await Promise.resolve();
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 100, unresolvedReservations: 1 });
    expect(await boundary.execute(request())).toMatchObject({ reason: 'BUDGET_DENIED' });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('blocks the month after an observed cost exceeds its declared bound', async () => {
    const { boundary, budget, execute } = setup({ bound: 10,
      response: { kind: 'COMPLETED', json: JSON.stringify(feedback()), chargedMicroUsd: 11 } });
    expect(await boundary.execute(request())).toMatchObject({ status: 'UNASSESSED', reason: 'COST_BOUND_EXCEEDED' });
    expect(await boundary.execute(request('request_2'))).toMatchObject({ reason: 'BUDGET_DENIED' });
    expect(budget.snapshot('2026-10')).toMatchObject({ accountedMicroUsd: 11, blocked: true });
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    'not JSON', '{"strengths":[],"improvementPoints":[],"correctedDraft":"x","sentenceCorrections":[]}',
    JSON.stringify({ ...feedback(), overallScore: 20 }),
    JSON.stringify({ ...feedback(), sentenceCorrections: [{ before: 'x', after: 'y', reason: 4 }] }),
  ])('never turns invalid or grade-bearing JSON into an evaluation (%s)', async (json) => {
    const { boundary, budget } = setup({ response: { kind: 'COMPLETED', json, chargedMicroUsd: 5 } });
    expect(await boundary.execute(request())).toMatchObject({ status: 'UNASSESSED', reason: 'INVALID_OUTPUT' });
    expect(budget.snapshot('2026-10').accountedMicroUsd).toBe(5);
  });

  it('validates OCR ranges instead of clamping invalid confidence into plausibility', () => {
    expect(validateCandidateOcrDraft({ transcript: 'x', confidence: 1.1 })).toBeNull();
    expect(validateCandidateOcrDraft({ transcript: 'x', confidence: NaN })).toBeNull();
    expect(validateCandidateOcrDraft({ transcript: ' ', confidence: 0.5 })).toBeNull();
    expect(validateCandidateOcrDraft({ transcript: 'x', confidence: '0.5' })).toBeNull();
    expect(validateCandidateWritingFeedbackDraft({ ...feedback(), rubric: [] })).toBeNull();
  });
});
