import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWritingAiCapabilities, getWritingAiDraft, getWritingInputDraft, saveWritingInputDraft } from '../services/writingAiDrafts';
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
});
