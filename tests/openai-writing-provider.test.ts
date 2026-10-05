import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenAiWritingProvider,
  OPENAI_WRITING_LIMITS,
  OPENAI_WRITING_MODEL,
  OPENAI_WRITING_PRICING_VERSION,
  parseOpenAiWritingMetering,
  quoteOpenAiWritingRequest,
  type OpenAiWritingRequest,
} from '../functions/_shared/openai-writing-provider';

const key = 'sk-synthetic-fixture-key-only';
const feedbackRequest = (): OpenAiWritingRequest => ({ operation: 'WRITING_FEEDBACK', payload: {
  promptText: 'Write about a fictional classroom.', transcript: 'This fictional classroom is bright.',
} });
const ocrRequest = (): OpenAiWritingRequest => ({ operation: 'OCR', payload: {
  promptText: 'Write about a fictional classroom.', assets: [{ mimeType: 'image/png', base64Data: 'aGVsbG8=' }],
} });
const feedback = () => ({ strengths: ['主張が明確です。'], improvementPoints: ['具体例を加えてください。'],
  correctedDraft: 'This fictional classroom is bright.', sentenceCorrections: [] });
const envelope = (draft: unknown = feedback()) => ({ id: 'resp_synthetic_1', model: OPENAI_WRITING_MODEL,
  status: 'completed', error: null, incomplete_details: null,
  usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20 }, output_tokens: 50,
    output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 150 },
  output: [{ type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: JSON.stringify(draft), annotations: [] }] }],
});
const setup = (body: unknown = envelope(), status = 200) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status,
    headers: { 'content-type': 'application/json' } }));
  return { fetchImpl, provider: createOpenAiWritingProvider({ apiKey: key, fetchImpl }) };
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('OpenAI writing Responses adapter with injected synthetic fetch', () => {
  it('cannot fetch without a caller-supplied key', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await createOpenAiWritingProvider({ fetchImpl }).execute(feedbackRequest()))
      .toEqual({ status: 'UNASSESSED', reason: 'NOT_CONFIGURED', dispatched: false, retryAutomatically: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['short', 'sk-bad-key-with-newline\n', 'sk-key with whitespace more than 20'])('rejects malformed key before dispatch', async (apiKey) => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await createOpenAiWritingProvider({ apiKey, fetchImpl }).execute(feedbackRequest())).toMatchObject({ reason: 'INVALID_CONFIGURATION', dispatched: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses one fixed endpoint/snapshot/schema and disables storage, tools and redirects', async () => {
    const { fetchImpl, provider } = setup();
    const result = await provider.execute(feedbackRequest());
    expect(result).toMatchObject({ status: 'DRAFT', evaluationStatus: 'UNASSESSED', requiresHumanReview: true,
      operation: 'WRITING_FEEDBACK', draft: feedback(), metering: { responseId: 'resp_synthetic_1',
        model: OPENAI_WRITING_MODEL, pricingVersion: OPENAI_WRITING_PRICING_VERSION, estimatedCostMicroUsd: 114 } });
    expect(result).not.toHaveProperty('overallScore');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}` } });
    const requestBody = JSON.parse(init!.body as string);
    expect(requestBody).toMatchObject({ model: OPENAI_WRITING_MODEL, store: false, stream: false,
      background: false, service_tier: 'default', tools: [], tool_choice: 'none', truncation: 'disabled',
      max_output_tokens: OPENAI_WRITING_LIMITS.feedbackOutputTokens,
      text: { format: { type: 'json_schema', strict: true, schema: { additionalProperties: false } } } });
    expect(requestBody).not.toHaveProperty('metadata');
    expect(requestBody).not.toHaveProperty('previous_response_id');
    expect(requestBody.text.format.schema.properties.sentenceCorrections.items.additionalProperties).toBe(false);
  });

  it('sends bounded inline images at high detail and returns unassessed OCR text', async () => {
    const { fetchImpl, provider } = setup(envelope({ transcript: 'Synthetic handwriting.', confidence: 0.75 }));
    const result = await provider.execute(ocrRequest());
    expect(result).toMatchObject({ status: 'DRAFT', evaluationStatus: 'UNASSESSED', operation: 'OCR',
      draft: { transcript: 'Synthetic handwriting.', confidence: 0.75 } });
    const body = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
    expect(body.input[0].content[1]).toEqual({ type: 'input_image', detail: 'high', image_url: 'data:image/png;base64,aGVsbG8=' });
    expect(body.max_output_tokens).toBe(OPENAI_WRITING_LIMITS.ocrOutputTokens);
  });

  it.each([
    { ...feedback(), overallScore: 20 },
    { ...feedback(), rubric: [] },
    { ...feedback(), strengths: [] },
    { ...feedback(), sentenceCorrections: [{ before: 'x', after: 'y', reason: 1 }] },
  ])('refuses unknown/scored/invalid draft JSON and still reports known usage %j', async (draft) => {
    const { provider } = setup(envelope(draft));
    expect(await provider.execute(feedbackRequest())).toMatchObject({ status: 'UNASSESSED', reason: 'INVALID_OUTPUT',
      metering: { responseId: 'resp_synthetic_1', estimatedCostMicroUsd: 114 } });
  });

  it.each([{ transcript: '', confidence: 0 }, { transcript: 'x', confidence: 1.2 },
    { transcript: 'x', confidence: '0.7' }, { transcript: 'x', confidence: 0.7, score: 4 }])('rejects unreadable or invalid OCR instead of fabricating text', async (draft) => {
    expect(await setup(envelope(draft)).provider.execute(ocrRequest())).toMatchObject({ reason: 'INVALID_OUTPUT', status: 'UNASSESSED' });
  });

  it('returns refusal separately and preserves its known charged-token estimate', async () => {
    const body = envelope();
    body.output[0].content = [{ type: 'refusal', refusal: 'Synthetic refusal.' }] as any;
    expect(await setup(body).provider.execute(feedbackRequest())).toMatchObject({ status: 'UNASSESSED', reason: 'PROVIDER_REFUSAL',
      retryAutomatically: false, metering: { estimatedCostMicroUsd: 114 } });
  });

  it('does not accept partial/incomplete output but preserves known usage', async () => {
    const body = { ...envelope(), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
    expect(await setup(body).provider.execute(feedbackRequest())).toMatchObject({ status: 'UNASSESSED', reason: 'INCOMPLETE', metering: { estimatedCostMicroUsd: 114 } });
  });

  it.each([
    { input_tokens: 100, output_tokens: 50, total_tokens: 151, input_tokens_details: { cached_tokens: 20 } },
    { input_tokens: '100', output_tokens: 50, total_tokens: 150, input_tokens_details: { cached_tokens: 20 } },
    { input_tokens: 100, output_tokens: 50, total_tokens: 150, input_tokens_details: { cached_tokens: 101 } },
    { input_tokens: 100, output_tokens: -1, total_tokens: 99, input_tokens_details: { cached_tokens: 0 } },
    { input_tokens: 100, output_tokens: 50, total_tokens: 150, input_tokens_details: {} },
    { input_tokens: 100, output_tokens: 50.1, total_tokens: 150.1, input_tokens_details: { cached_tokens: 0 } },
  ])('never interprets inconsistent or missing usage as zero charge %j', async (usage) => {
    expect(await setup({ ...envelope(), usage }).provider.execute(feedbackRequest()))
      .toEqual({ status: 'UNASSESSED', reason: 'UNKNOWN_USAGE', dispatched: true, retryAutomatically: false });
  });

  it('rejects an unexpected response model or absent real response ID', () => {
    expect(parseOpenAiWritingMetering({ ...envelope(), model: 'gpt-6-luna' })).toBeNull();
    expect(parseOpenAiWritingMetering({ ...envelope(), id: 'unverified-id' })).toBeNull();
  });

  it('rounds fractional micro-USD upward once, using cached tokens only as a subset', () => {
    const body = { ...envelope(), usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, total_tokens: 1 } };
    expect(parseOpenAiWritingMetering(body)?.estimatedCostMicroUsd).toBe(1);
    body.usage = { input_tokens: 10, input_tokens_details: { cached_tokens: 10 }, output_tokens: 0, total_tokens: 10 };
    expect(parseOpenAiWritingMetering(body)?.estimatedCostMicroUsd).toBe(1);
  });

  it('retains actual known usage when a response exceeds the dispatch quote', async () => {
    const body = envelope();
    body.usage.output_tokens = OPENAI_WRITING_LIMITS.feedbackOutputTokens + 1;
    body.usage.total_tokens = body.usage.input_tokens + body.usage.output_tokens;
    expect(await setup(body).provider.execute(feedbackRequest())).toMatchObject({ status: 'UNASSESSED', reason: 'USAGE_BOUND_EXCEEDED',
      metering: { outputTokens: OPENAI_WRITING_LIMITS.feedbackOutputTokens + 1 } });
  });

  it('does not retry or use another provider after HTTP 429 or a transport failure', async () => {
    const { fetchImpl, provider } = setup({ error: { message: 'Synthetic HTTP limit.' } }, 429);
    expect(await provider.execute(feedbackRequest())).toMatchObject({ reason: 'HTTP_ERROR', dispatched: true, retryAutomatically: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockRejectedValue(new Error(`private ${key} synthetic learner text`));
    const failed = await provider.execute(feedbackRequest());
    expect(failed).toEqual({ status: 'UNASSESSED', reason: 'PROVIDER_FAILED', dispatched: true, retryAutomatically: false });
    expect(JSON.stringify(failed)).not.toContain(key);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('aborts timeout and never accepts a late provider completion', async () => {
    vi.useFakeTimers();
    let resolveFetch: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const provider = createOpenAiWritingProvider({ apiKey: key, fetchImpl, timeoutMs: 50 });
    const pending = provider.execute(feedbackRequest());
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toEqual({ status: 'UNASSESSED', reason: 'TIMEOUT', dispatched: true, retryAutomatically: false });
    expect(fetchImpl.mock.calls[0][1]!.signal!.aborted).toBe(true);
    resolveFetch!(new Response(JSON.stringify(envelope())));
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('caps the streamed HTTP body without trusting content-length', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('a'.repeat(OPENAI_WRITING_LIMITS.responseBytes + 1)));
    expect(await createOpenAiWritingProvider({ apiKey: key, fetchImpl }).execute(feedbackRequest()))
      .toMatchObject({ status: 'UNASSESSED', reason: 'PROVIDER_FAILED' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects unbounded PDF/external URL/names/oversized input before dispatch', async () => {
    const badRequests = [
      { ...ocrRequest(), payload: { promptText: 'fiction', assets: [{ mimeType: 'application/pdf', base64Data: 'aGVsbG8=' }] } },
      { ...ocrRequest(), payload: { promptText: 'fiction', assets: [{ mimeType: 'image/png', image_url: 'https://example.org/student.png' }] } },
      { ...feedbackRequest(), studentName: 'Unrequested identifier' },
      { operation: 'WRITING_FEEDBACK', payload: { promptText: 'fiction', transcript: 'a'.repeat(12_001) } },
      { operation: 'OCR', payload: { promptText: 'fiction', assets: Array(5).fill({ mimeType: 'image/png', base64Data: 'aGVsbG8=' }) } },
    ];
    const { provider, fetchImpl } = setup();
    for (const input of badRequests) expect(await provider.execute(input as OpenAiWritingRequest)).toMatchObject({ reason: 'INVALID_REQUEST', dispatched: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not log request text or credentials', async () => {
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    await setup().provider.execute(feedbackRequest());
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});

describe('OpenAI dispatch quote with real standard price version', () => {
  it('uses an uncached upper bound including every page and capped output', () => {
    const one = quoteOpenAiWritingRequest(ocrRequest())!;
    const many = ocrRequest();
    if (many.operation !== 'OCR') throw new Error('fixture');
    many.payload.assets = Array(4).fill(many.payload.assets[0]);
    const four = quoteOpenAiWritingRequest(many)!;
    expect(four.inputTokenBound - one.inputTokenBound).toBe(3 * (Math.ceil(6_144 * 1.62) + 1));
    expect(one.upperBoundMicroUsd).toBe(Math.ceil((one.inputTokenBound * 4 + one.maxOutputTokens * 16) / 10));
    expect(four.upperBoundMicroUsd).toBeGreaterThan(one.upperBoundMicroUsd);
    expect(one.model).toBe(OPENAI_WRITING_MODEL);
    expect(one.pricingVersion).toBe(OPENAI_WRITING_PRICING_VERSION);
  });

  it('quotes JSON-escaped UTF8 input rather than undercounting raw characters', () => {
    const plain = feedbackRequest();
    const escaped = feedbackRequest();
    if (escaped.operation !== 'WRITING_FEEDBACK' || plain.operation !== 'WRITING_FEEDBACK') throw new Error('fixture');
    plain.payload.transcript = 'x'.repeat(12_000);
    escaped.payload.transcript = '\u0001'.repeat(11_999) + 'x';
    expect(quoteOpenAiWritingRequest(escaped)!.inputTokenBound - quoteOpenAiWritingRequest(plain)!.inputTokenBound).toBe(5 * 11_999);
  });
});
