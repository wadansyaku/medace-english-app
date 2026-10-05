import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWritingAiDraft, getWritingAiCapabilities, getWritingAiDraft, getWritingInputDraft, saveWritingInputDraft } from '../services/writingAiDrafts';
const respond = (body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })));
afterEach(() => vi.unstubAllGlobals());
describe('unassessed Writing draft service', () => {
  it('sends revision CAS and stable request ID to input storage without an AI route', async () => {
    respond({ draft: { assignmentId: 'a', attemptNo: 1, revision: 2, manualTranscript: 'My input.', assetIds: [], assets: [], updatedAt: 1, assessmentStatus: 'UNASSESSED' } });
    const request = { requestId: 'same-request', assignmentId: 'a', attemptNo: 1, expectedRevision: 1, manualTranscript: 'My input.', assetIds: [] };
    await saveWritingInputDraft(request);
    expect(fetch).toHaveBeenCalledWith('/api/writing/input-draft', expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify(request) }));
  });
  it('escapes the scope parameters and preserves an absent draft rather than inventing a saved one', async () => {
    respond({ draft: null });
    expect(await getWritingInputDraft('a/b ?', 2)).toEqual({ draft: null });
    expect(fetch).toHaveBeenCalledWith('/api/writing/input-draft?assignmentId=a%2Fb+%3F&attemptNo=2', expect.anything());
  });
  it('rejects capabilities that pretend to enable PDF OCR', async () => {
    respond({ provider: 'OPENAI', model: 'test', state: 'ENABLED', ocrEnabled: true, feedbackEnabled: true, pdfOcrEnabled: true, draftSavingEnabled: true, gradingEnabled: false, message: '' });
    await expect(getWritingAiCapabilities('a')).rejects.toThrow('応答を確認できません');
  });
  it('does not accept a scored or unverified response as a GPT draft', async () => {
    respond({ requestId: 'r', assignmentId: 'a', attemptNo: 1, operation: 'WRITING_FEEDBACK', status: 'READY', assessmentStatus: 'GRADED', requiresHumanReview: false, updatedAt: 1, result: { score: 20 } });
    await expect(getWritingAiDraft('r')).rejects.toThrow('応答を確認できません');
  });
  it('requires the correct unassessed result schema before displaying feedback', async () => {
    const base = { requestId: 'r', assignmentId: 'a', attemptNo: 1, operation: 'WRITING_FEEDBACK', status: 'READY', assessmentStatus: 'UNASSESSED', requiresHumanReview: true, updatedAt: 1 };
    respond({ ...base, result: { operation: 'WRITING_FEEDBACK', score: 20 } });
    await expect(getWritingAiDraft('r')).rejects.toThrow('応答を確認できません');
    const result = { operation: 'WRITING_FEEDBACK', strengths: ['Clear structure.'], improvementPoints: ['Check the tense.'], correctedDraft: 'A suggested draft.', sentenceCorrections: [] };
    respond({ ...base, result });
    expect(await getWritingAiDraft('r')).toEqual({ ...base, result });
  });
  const pending = { requestId: 'canonical', assignmentId: 'a', attemptNo: 1, inputDraftRevision: 2,
    operation: 'WRITING_FEEDBACK', status: 'PENDING', assessmentStatus: 'UNASSESSED', requiresHumanReview: true, updatedAt: 1 };
  it.each(['RESEND_SAME_REQUEST', 'CHECK_RESULT', 'NONE'])('preserves the verified recovery action %s and input revision', async recoveryAction => {
    respond({ ...pending, recoveryAction }); expect(await getWritingAiDraft('alias')).toEqual({ ...pending, recoveryAction });
    expect(fetch).toHaveBeenCalledWith('/api/writing/ai-drafts/alias', expect.objectContaining({ credentials: 'include' }));
    expect((fetch as any).mock.calls[0][1].method).not.toBe('POST');
  });
  it.each([0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid inputDraftRevision=%s', async inputDraftRevision => {
    respond({ ...pending, inputDraftRevision }); await expect(getWritingAiDraft('alias')).rejects.toThrow('応答を確認できません');
  });
  it.each(['AUTO_RETRY', 'POST_NEW_REQUEST', null, {}])('rejects unknown recoveryAction=%s', async recoveryAction => {
    respond({ ...pending, recoveryAction }); await expect(getWritingAiDraft('alias')).rejects.toThrow('応答を確認できません');
  });
  it('sends an explicit same-request recovery POST without changing its original identity', async () => {
    const request = { requestId: 'original-caller-id', assignmentId: 'a', attemptNo: 1, inputDraftRevision: 2, operation: 'WRITING_FEEDBACK' as const };
    respond({ ...pending, recoveryAction: 'CHECK_RESULT' }); await generateWritingAiDraft(request);
    expect(fetch).toHaveBeenCalledWith('/api/writing/ai-drafts', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }));
  });
  it('rejects non-text reason metadata before it can be rendered', async () => {
    respond({ ...pending, reason: { nonce: 'private' } }); await expect(getWritingAiDraft('alias')).rejects.toThrow('応答を確認できません');
  });

  it.each(['', '   '])('rejects a blank canonical request ID (%j)', async requestId => {
    respond({ ...pending, requestId }); await expect(getWritingAiDraft('alias')).rejects.toThrow('応答を確認できません');
  });

});
