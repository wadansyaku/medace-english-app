import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as Array<() => unknown> }));
vi.mock('react', () => ({
  useState(initial: unknown) { const slot = hooks.cursor++; if (!(slot in hooks.slots)) hooks.slots[slot] = initial;
    return [hooks.slots[slot], (next: any) => { hooks.slots[slot] = typeof next === 'function' ? next(hooks.slots[slot]) : next; }]; },
  useRef(initial: unknown) { const slot = hooks.cursor++; if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }; return hooks.slots[slot]; },
  useEffect(effect: () => unknown, deps: unknown[]) { const slot = hooks.cursor++;
    if (!hooks.slots[slot] || deps.some((value, index) => value !== hooks.slots[slot][index])) { hooks.slots[slot] = deps; hooks.effects.push(effect); } },
}));
const api = vi.hoisted(() => ({ cap: vi.fn(), read: vi.fn(), save: vi.fn(), generate: vi.fn(), result: vi.fn(), upload: vi.fn(), url: vi.fn(), hash: vi.fn() }));
vi.mock('../services/writingAiDrafts', () => ({ getWritingAiCapabilities: api.cap, getWritingInputDraft: api.read, saveWritingInputDraft: api.save, generateWritingAiDraft: api.generate, getWritingAiDraft: api.result }));
vi.mock('../services/writing', () => ({ calculateWritingAssetSha256Base64: api.hash, createWritingUploadUrl: api.url, uploadWritingAsset: api.upload }));
import { useWritingDraftEditor } from '../hooks/useWritingDraftEditor';
const render = () => { hooks.cursor = 0; return useWritingDraftEditor('assignment', 1); };
const settle = async () => { let state = render(); for (let index = 0; index < 5; index++) { hooks.effects.splice(0).forEach(effect => effect()); await Promise.resolve(); state = render(); } return state; };
const input = { assignmentId: 'assignment', attemptNo: 1, revision: 1, manualTranscript: 'My original.', assetIds: ['asset'], assets: [{ id: 'asset', fileName: 'original.png', mimeType: 'image/png', byteSize: 20 }], assessmentStatus: 'UNASSESSED', updatedAt: 1 };
beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.effects = []; vi.resetAllMocks();
  api.cap.mockResolvedValue({ state: 'ENABLED', ocrEnabled: true, feedbackEnabled: true, gradingEnabled: false });
  api.read.mockResolvedValue({ draft: input }); api.save.mockImplementation(async request => ({ draft: { ...input, manualTranscript: request.manualTranscript, revision: request.expectedRevision + 1 } }));
});
afterEach(() => vi.unstubAllGlobals());
describe('teacher input and GPT draft editor', () => {
  it('requires an enabled capability and saved revision before any generation', async () => {
    api.cap.mockResolvedValue({ state: 'DISABLED', ocrEnabled: false, feedbackEnabled: false, gradingEnabled: false });
    await settle(); expect(render().canFeedback).toBe(false); await render().generate('WRITING_FEEDBACK'); expect(api.generate).not.toHaveBeenCalled();
  });
  it('does not OCR PDF and does not use edited or removed assets until they are saved', async () => {
    await settle(); expect(render().canOcr).toBe(true);
    render().removeAsset('asset'); expect(render().canOcr).toBe(false); expect(render().canFeedback).toBe(false);
    hooks.slots = []; hooks.cursor = 0; api.read.mockResolvedValue({ draft: { ...input, assets: [{ ...input.assets[0], mimeType: 'application/pdf' }] } });
    await settle(); expect(render().canOcr).toBe(false);
    render().setManual('A new draft.'); expect(render().canFeedback).toBe(false); await render().save(); expect(render().canFeedback).toBe(true);
  });
  it('preserves input and the exact request after an uncertain storage response without uploading saved assets', async () => {
    await settle(); render().setManual('Keep my draft.');
    api.save.mockRejectedValueOnce(new Error('response lost'));
    await render().save(); await render().save();
    expect(api.save.mock.calls[0][0]).toEqual(api.save.mock.calls[1][0]); expect(render().manual).toBe('Keep my draft.');
    expect(api.url).not.toHaveBeenCalled(); expect(render().notice).toContain('未評価');
  });
  it('keeps OCR as an unassessed result until a person explicitly chooses the text and saves it', async () => {
    await settle(); api.generate.mockImplementation(async request => ({ ...request, status: 'READY', assessmentStatus: 'UNASSESSED', requiresHumanReview: true, result: { operation: 'OCR', transcript: 'Recognized draft.', confidence: .8 }, updatedAt: 1 }));
    await render().generate('OCR'); expect(render().manual).toBe('My original.'); expect(render().saved?.revision).toBe(1);
    expect(render().aiDraft?.assessmentStatus).toBe('UNASSESSED'); expect(api.save).not.toHaveBeenCalled();
    render().setManual('Recognized draft.'); expect(render().canFeedback).toBe(false); await render().save(); expect(render().saved?.revision).toBe(2);
  });
});
