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
  it.each([false, true])('restores the saved manual input after an initial read failure unless edited=%s', async edited => {
    api.read.mockRejectedValueOnce(new Error('503')).mockResolvedValue({ draft: input });
    await settle(); expect(render().error).toContain('復元を確認できません');
    if (edited) render().setManual('My local edit.');
    render().reload(); await settle();
    expect(render().manual).toBe(edited ? 'My local edit.' : input.manualTranscript);
    expect(render().notice).toContain(edited ? '編集中の本文は保持' : '復元しました');
    await render().save(); expect(api.save.mock.calls[0][0].manualTranscript).toBe(edited ? 'My local edit.' : input.manualTranscript);
  });
  const replacement = new File(['%PDF-1.4 replacement'], 'replacement.pdf', { type: 'application/pdf' });
  const pdfInput = { ...input, manualTranscript: '', assets: [{ ...input.assets[0], mimeType: 'application/pdf' }] };
  const configureReplacement = async () => {
    api.read.mockResolvedValue({ draft: pdfInput });
    api.hash.mockResolvedValue('synthetic-hash'); api.url.mockResolvedValue({ assetId: 'replacement' }); api.upload.mockResolvedValue(undefined);
    api.save.mockImplementation(async request => ({ draft: { ...pdfInput, revision: request.expectedRevision + 1,
      manualTranscript: request.manualTranscript, assetIds: request.assetIds,
      assets: request.assetIds.map((id: string) => id === 'replacement'
        ? { id, fileName: replacement.name, mimeType: replacement.type, byteSize: replacement.size }
        : pdfInput.assets[0]) } }));
    await settle(); render().removeAsset('asset'); render().setFiles([replacement]);
  };
  it('confirms removal with CAS before allocating a replacement PDF slot, then saves at the new revision', async () => {
    await configureReplacement();
    await render().save();
    expect(api.save.mock.calls[0][0]).toMatchObject({ expectedRevision: 1, assetIds: [], manualTranscript: '' });
    expect(api.save.mock.invocationCallOrder[0]).toBeLessThan(api.url.mock.invocationCallOrder[0]);
    expect(api.save.mock.calls[1][0]).toMatchObject({ expectedRevision: 2, assetIds: ['replacement'] });
    expect(render().saved?.revision).toBe(3); expect(render().files).toEqual([]);
  });
  it('does not allocate an upload before a lost removal response is confirmed with the same request', async () => {
    await configureReplacement(); api.save.mockRejectedValueOnce(new Error('removal response lost'));
    await render().save(); expect(api.url).not.toHaveBeenCalled(); expect(render().files).toEqual([replacement]);
    await render().save();
    expect(api.save.mock.calls[0][0]).toEqual(api.save.mock.calls[1][0]);
    expect(api.save.mock.calls[2][0].expectedRevision).toBe(2);
    expect(api.save.mock.calls[2][0].requestId).not.toBe(api.save.mock.calls[0][0].requestId);
  });
  it('retains confirmed retirement and replays only the final save after its response is lost', async () => {
    await configureReplacement(); const save = api.save.getMockImplementation()!;
    api.save.mockImplementationOnce(save).mockRejectedValueOnce(new Error('final response lost'));
    await render().save(); expect(render().saved?.revision).toBe(2); expect(render().files).toEqual([replacement]);
    await render().save();
    expect(api.url).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[1][0]).toEqual(api.save.mock.calls[2][0]);
    expect(render().saved?.revision).toBe(3);
  });
  it('preserves new files and text when replacement upload fails after retirement has committed', async () => {
    await configureReplacement(); render().setManual('My replacement text.'); api.upload.mockRejectedValueOnce(new Error('upload failed'));
    await render().save();
    expect(render().saved?.revision).toBe(2); expect(render().saved?.assetIds).toEqual([]);
    expect(render().manual).toBe('My replacement text.'); expect(render().files).toEqual([replacement]);
    expect(render().notice).toContain('新しいファイルはまだ保存されていません'); expect(render().error).toContain('入力は保持');
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('stops at a CAS conflict and prompts a reload without uploading a replacement', async () => {
    await configureReplacement(); api.save.mockRejectedValueOnce(new Error('revision conflict'));
    await render().save();
    expect(api.url).not.toHaveBeenCalled(); expect(render().files).toEqual([replacement]); expect(render().error).toContain('再取得');
  });
  it('frees one active slot before adding an image to a saved four-image draft', async () => {
    const originalAssets = Array.from({ length: 4 }, (_, index) => ({ id: `image-${index}`, fileName: `${index}.png`, mimeType: 'image/png', byteSize: 20 }));
    const activeIds = new Set(originalAssets.map(asset => asset.id));
    api.read.mockResolvedValue({ draft: { ...input, assetIds: [...activeIds], assets: originalAssets } });
    api.hash.mockResolvedValue('synthetic-hash'); api.upload.mockResolvedValue(undefined);
    api.url.mockImplementation(async () => { if (activeIds.size >= 4) throw new Error('active quota full'); activeIds.add('new-image'); return { assetId: 'new-image' }; });
    api.save.mockImplementation(async request => {
      for (const id of activeIds) if (!request.assetIds.includes(id)) activeIds.delete(id);
      return { draft: { ...input, revision: request.expectedRevision + 1, assetIds: request.assetIds,
        assets: request.assetIds.map((id: string) => originalAssets.find(asset => asset.id === id) || { id, fileName: 'new.png', mimeType: 'image/png', byteSize: 1 }) } };
    });
    await settle(); render().removeAsset('image-0'); render().setFiles([new File(['a'], 'new.png', { type: 'image/png' })]);
    await render().save();
    expect(api.save.mock.calls[0][0].assetIds).toEqual(['image-1', 'image-2', 'image-3']);
    expect(render().saved?.assetIds).toEqual(['image-1', 'image-2', 'image-3', 'new-image']); expect(activeIds.size).toBe(4);
    expect(render().error).toBeNull();
  });
  const prepareFreshDraft = async (kind: 'pdf' | 'images' = 'pdf') => {
    api.cap.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false });
    api.read.mockResolvedValue({ draft: null });
    api.hash.mockResolvedValue('synthetic-hash'); api.upload.mockResolvedValue(undefined);
    const selected = kind === 'pdf'
      ? [new File(['%PDF-1.4 A'], 'a.pdf', { type: 'application/pdf' })]
      : [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })];
    const active = new Set<string>();
    const metadata = new Map<string, { id: string; fileName: string; mimeType: string; byteSize: number }>();
    api.url.mockImplementation(async (request: any) => {
      if (request.mimeType === 'application/pdf' && active.size > 0) throw new Error('active PDF quota full');
      const id = `uploaded-${request.fileName}`;
      active.add(id); metadata.set(id, { id, fileName: request.fileName, mimeType: request.mimeType, byteSize: request.byteSize });
      return { assetId: id, uploadUrl: `https://example.invalid/${id}` };
    });
    api.save.mockImplementation(async (request: any) => {
      if (request.prepareUpload) for (const id of active) if (!request.assetIds.includes(id)) active.delete(id);
      return { draft: { assignmentId: 'assignment', attemptNo: 1, revision: request.expectedRevision + 1,
        manualTranscript: request.manualTranscript, assetIds: request.assetIds,
        assets: request.assetIds.map((id: string) => metadata.get(id)), assessmentStatus: 'UNASSESSED', updatedAt: 1 } };
    });
    await settle();
    render().setFiles(selected);
    return { selected, active, metadata };
  };
  it('prepares an initially empty draft before upload and replays the exact uncertain preparation', async () => {
    const { selected } = await prepareFreshDraft();
    const persist = api.save.getMockImplementation()!;
    let confirmed: any;
    api.save.mockImplementationOnce(async (request: any) => { confirmed = await persist(request); throw new Error('preparation response lost'); })
      .mockImplementationOnce(async (request: any) => { expect(request).toEqual(api.save.mock.calls[0][0]); return confirmed; });
    await render().save(); expect(api.url).not.toHaveBeenCalled(); expect(render().files).toEqual(selected);
    await render().save();
    expect(api.save.mock.calls[0][0]).toMatchObject({ expectedRevision: 0, assetIds: [], prepareUpload: true });
    expect(api.save.mock.calls[2][0]).toMatchObject({ expectedRevision: 1, assetIds: ['uploaded-a.pdf'] });
    expect(render().saved?.revision).toBe(2); expect(render().error).toBeNull();
  });
  it('retains preparation and completed uploads while replaying an uncertain first-file final save', async () => {
    await prepareFreshDraft(); const persist = api.save.getMockImplementation()!;
    api.save.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('final response lost'));
    await render().save(); await render().save();
    expect(api.save).toHaveBeenCalledTimes(3); expect(api.save.mock.calls[1][0]).toEqual(api.save.mock.calls[2][0]);
    expect(api.url).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(1);
    expect(render().saved?.revision).toBe(2);
  });
  it('retires an orphan PDF after failed final save when the selected File is replaced', async () => {
    const { active } = await prepareFreshDraft(); const persist = api.save.getMockImplementation()!;
    api.save.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('final failed before commit'));
    await render().save(); expect(active).toEqual(new Set(['uploaded-a.pdf']));
    const next = new File(['%PDF-1.4 B'], 'b.pdf', { type: 'application/pdf' }); render().setFiles([next]);
    await render().save();
    expect(api.save.mock.calls[2][0]).toMatchObject({ expectedRevision: 1, assetIds: [], prepareUpload: true });
    expect(api.save.mock.calls[2][0].requestId).not.toBe(api.save.mock.calls[0][0].requestId);
    expect(active).toEqual(new Set(['uploaded-b.pdf']));
    expect(render().saved?.assetIds).toEqual(['uploaded-b.pdf']); expect(render().error).toBeNull();
  });
  it('reuses issued upload URLs and completed assets after a partial PUT response is lost', async () => {
    const { selected } = await prepareFreshDraft('images');
    api.upload.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('PUT response lost')).mockResolvedValueOnce(undefined);
    await render().save(); expect(render().files).toEqual(selected); expect(api.save).toHaveBeenCalledTimes(1);
    await render().save();
    expect(api.url).toHaveBeenCalledTimes(2); expect(api.upload).toHaveBeenCalledTimes(3);
    expect(api.upload.mock.calls[1]).toEqual(api.upload.mock.calls[2]);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(render().saved?.assetIds).toEqual(['uploaded-a.png', 'uploaded-b.png']); expect(render().saved?.revision).toBe(2);
  });
  it('saves manual-only edits in the final CAS while retaining completed uploads without another preparation', async () => {
    const { active } = await prepareFreshDraft(); const persist = api.save.getMockImplementation()!;
    api.save.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('final failed before commit'));
    await render().save(); render().setManual('My updated text.');
    api.save.mockRejectedValueOnce(new Error('second final response lost'));
    await render().save();
    expect(render().saved?.assetIds).toEqual([]); expect(render().saved?.assets).toEqual([]);
    await render().save();
    expect(api.save.mock.calls[2][0]).toMatchObject({ expectedRevision: 1, assetIds: ['uploaded-a.pdf'], manualTranscript: 'My updated text.' });
    expect(api.save.mock.calls[2][0].prepareUpload).toBeUndefined();
    expect(api.save.mock.calls[2][0]).toEqual(api.save.mock.calls[3][0]);
    expect(api.save.mock.calls.filter(([request]) => request.prepareUpload)).toHaveLength(1);
    expect(render().saved?.assetIds).toEqual(['uploaded-a.pdf']); expect(render().saved?.manualTranscript).toBe('My updated text.');
    expect(active.size).toBe(1); expect(api.url).toHaveBeenCalledTimes(1); expect(render().error).toBeNull();
  });
  it('replays a successful-but-uncertain PUT after a manual-only edit without retiring its original', async () => {
    const { active } = await prepareFreshDraft();
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockImplementationOnce(async (upload: any) => {
      if (!active.has(upload.assetId)) throw new Error('original retired before PUT receipt');
    });
    await render().save(); render().setManual('My text after the lost PUT.'); await render().save();
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1][0]).toMatchObject({ expectedRevision: 1, manualTranscript: 'My text after the lost PUT.', assetIds: ['uploaded-a.pdf'] });
    expect(api.url).toHaveBeenCalledTimes(1); expect(api.upload.mock.calls[0]).toEqual(api.upload.mock.calls[1]);
    expect(render().saved?.revision).toBe(2); expect(render().error).toBeNull();
  });
  it.each([false, true])('renews an expired unconfirmed URL after preparation, previously uploaded=%s', async uploaded => {
    const { active, selected, metadata } = await prepareFreshDraft();
    const record = (id: string, index = 0) => metadata.set(id, { id, fileName: selected[index].name, mimeType: selected[index].type, byteSize: selected[index].size });
    const firstIssued = { assetId: 'uncertain-old', uploadUrl: 'https://example.invalid/old', expiresAt: Date.now() + 60_000 };
    const nextIssued = { assetId: 'confirmed-new', uploadUrl: 'https://example.invalid/new', expiresAt: Date.now() + 120_000 };
    api.url.mockImplementationOnce(async () => { if (uploaded) active.add(firstIssued.assetId); record(firstIssued.assetId); return firstIssued; })
      .mockImplementationOnce(async () => { if (active.size) throw new Error('old quota not retired'); active.add(nextIssued.assetId); record(nextIssued.assetId); return nextIssued; });
    api.upload.mockRejectedValueOnce(new Error(uploaded ? 'successful PUT response lost' : 'PUT never reached server')).mockResolvedValueOnce(undefined);
    await render().save();
    firstIssued.expiresAt = Date.now() - 1;
    await render().save();
    expect(api.save.mock.calls[1][0]).toMatchObject({ expectedRevision: 1, assetIds: [], prepareUpload: true });
    expect(api.save.mock.invocationCallOrder[1]).toBeLessThan(api.url.mock.invocationCallOrder[1]);
    expect(api.url).toHaveBeenCalledTimes(2); expect(api.upload.mock.calls[1][0]).toEqual(nextIssued);
    expect(render().saved?.assetIds).toEqual(['confirmed-new']); expect(render().saved?.revision).toBe(3); expect(render().error).toBeNull();
  });
  it('keeps known successful originals when renewing another expired pending image URL', async () => {
    const { active, selected, metadata } = await prepareFreshDraft('images');
    const record = (id: string, index: number) => metadata.set(id, { id, fileName: selected[index].name, mimeType: selected[index].type, byteSize: selected[index].size });
    const first = { assetId: 'image-success', uploadUrl: 'https://example.invalid/first', expiresAt: Date.now() + 60_000 };
    const unknown = { assetId: 'image-uncertain', uploadUrl: 'https://example.invalid/unknown', expiresAt: Date.now() + 60_000 };
    const replacement = { assetId: 'image-replacement', uploadUrl: 'https://example.invalid/replacement', expiresAt: Date.now() + 120_000 };
    api.url.mockImplementationOnce(async () => { active.add(first.assetId); record(first.assetId, 0); return first; })
      .mockImplementationOnce(async () => { active.add(unknown.assetId); record(unknown.assetId, 1); return unknown; })
      .mockImplementationOnce(async () => { expect(active).toEqual(new Set([first.assetId])); active.add(replacement.assetId); record(replacement.assetId, 1); return replacement; });
    api.upload.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('second image PUT response lost')).mockResolvedValueOnce(undefined);
    await render().save(); first.expiresAt = Date.now() - 1; unknown.expiresAt = Date.now() - 1;
    await render().save();
    expect(api.save.mock.calls[1][0]).toMatchObject({ expectedRevision: 1, prepareUpload: true, assetIds: [first.assetId] });
    expect(api.url).toHaveBeenCalledTimes(3); expect(api.upload).toHaveBeenCalledTimes(3);
    expect(render().saved?.assetIds).toEqual([first.assetId, replacement.assetId]); expect(render().error).toBeNull();
  });

  it.each([1, 4])('confirms a lost successful PUT before preparing after restoring draft revision %s', async revision => {
    const { selected, active } = await prepareFreshDraft();
    render().setManual('My text before the upload.');
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockImplementationOnce(async (issued: any, file: File) => {
      expect(file).toBe(selected[0]);
      if (!active.has(issued.assetId)) throw new Error('retired before receipt confirmation');
    });
    await render().save(); render().setManual('My local edit after the lost response.');
    api.read.mockResolvedValue({ draft: { assignmentId: 'assignment', attemptNo: 1, revision,
      manualTranscript: 'Saved elsewhere.', assetIds: [], assets: [], assessmentStatus: 'UNASSESSED', updatedAt: 2 } });
    render().reload(); await settle();
    expect(render().manual).toBe('My local edit after the lost response.'); expect(render().files).toEqual(selected);
    await render().save();
    expect(api.upload.mock.invocationCallOrder[1]).toBeLessThan(api.save.mock.invocationCallOrder[1]);
    expect(api.upload.mock.calls[0]).toEqual(api.upload.mock.calls[1]); expect(api.url).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[1][0]).toMatchObject({ expectedRevision: revision, prepareUpload: true, assetIds: ['uploaded-a.pdf'] });
    expect(render().saved?.revision).toBe(revision + 2); expect(render().saved?.assetIds).toEqual(['uploaded-a.pdf']);
    expect(render().saved?.manualTranscript).toBe('My local edit after the lost response.'); expect(render().error).toBeNull();
    expect(active).toEqual(new Set(['uploaded-a.pdf']));
  });
  it('does not retire or save after restored pending PUT confirmation fails and recovers with the same File', async () => {
    const { selected, active } = await prepareFreshDraft();
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockRejectedValueOnce(new Error('confirmation unavailable')).mockResolvedValueOnce(undefined);
    await render().save();
    api.read.mockResolvedValue({ draft: render().saved }); render().reload(); await settle();
    await render().save(); expect(api.save).toHaveBeenCalledTimes(1); expect(render().files).toEqual(selected);
    expect(active).toEqual(new Set(['uploaded-a.pdf'])); expect(render().error).toContain('confirmation unavailable');
    await render().save();
    expect(api.url).toHaveBeenCalledTimes(1); expect(api.upload.mock.calls[0]).toEqual(api.upload.mock.calls[2]);
    expect(api.save.mock.calls[1][0].assetIds).toEqual(['uploaded-a.pdf']); expect(render().saved?.revision).toBe(3); expect(render().error).toBeNull();
  });
  it('treats a restored asset matching the pending File as one original and confirms it before preparation', async () => {
    const { selected, active, metadata } = await prepareFreshDraft();
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockImplementationOnce(async (issued: any) => {
      if (!active.has(issued.assetId)) throw new Error('retired before receipt confirmation');
    });
    await render().save();
    api.read.mockResolvedValue({ draft: { assignmentId: 'assignment', attemptNo: 1, revision: 4,
      manualTranscript: '', assetIds: ['uploaded-a.pdf'], assets: [metadata.get('uploaded-a.pdf')], assessmentStatus: 'UNASSESSED', updatedAt: 2 } });
    render().reload(); await settle(); expect(render().files).toEqual(selected);
    await render().save();
    expect(api.url).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1][0]).toMatchObject({ expectedRevision: 4, prepareUpload: true, assetIds: ['uploaded-a.pdf'] });
    expect(render().saved?.assetIds).toEqual(['uploaded-a.pdf']); expect(render().saved?.revision).toBe(6); expect(render().error).toBeNull();
  });

  const pendingResponse = (request: any, overrides: Record<string, unknown> = {}) => ({ ...request,
    status: 'PENDING', assessmentStatus: 'UNASSESSED', requiresHumanReview: true, recoveryAction: 'CHECK_RESULT', updatedAt: 1, ...overrides });
  const readyResponse = (request: any, overrides: Record<string, unknown> = {}) => pendingResponse(request, {
    status: 'READY', recoveryAction: 'NONE', result: { operation: 'WRITING_FEEDBACK', strengths: ['Clear structure.'],
      improvementPoints: [], correctedDraft: 'A proposed draft.', sentenceCorrections: [] }, ...overrides });
  it('adopts a verified canonical ID only for GET while preserving the original POST identity for explicit resume', async () => {
    await settle();
    api.generate.mockImplementation(async request => pendingResponse(request, { requestId: 'canonical', recoveryAction: 'CHECK_RESULT' }));
    await render().generate('WRITING_FEEDBACK'); const original = api.generate.mock.calls[0][0];
    api.result.mockResolvedValue(pendingResponse(original, { requestId: 'canonical', recoveryAction: 'RESEND_SAME_REQUEST' }));
    await render().generate('WRITING_FEEDBACK', true);
    expect(api.result).toHaveBeenCalledWith('canonical'); expect(render().pendingRecoveryAction).toBe('RESEND_SAME_REQUEST');
    api.generate.mockResolvedValueOnce(readyResponse(original, { requestId: 'canonical' }));
    await render().generate('WRITING_FEEDBACK', true);
    expect(api.generate.mock.calls[1][0]).toEqual(original); expect(original.requestId).not.toBe('canonical');
    expect(render().hasPendingRequest).toBe(false); expect(render().aiDraft?.requestId).toBe('canonical');
    expect(render().manual).toBe(input.manualTranscript); expect(render().saved).toEqual(input); expect(api.save).not.toHaveBeenCalled();
  });
  it('checks an alias after a lost POST response and resumes only on a later explicit click', async () => {
    await settle(); api.generate.mockRejectedValueOnce(new Error('POST response lost'));
    await render().generate('WRITING_FEEDBACK'); const original = api.generate.mock.calls[0][0];
    api.result.mockResolvedValue(pendingResponse(original, { requestId: 'canonical', recoveryAction: 'RESEND_SAME_REQUEST' }));
    await render().generate('WRITING_FEEDBACK', true);
    expect(api.result).toHaveBeenCalledWith(original.requestId); expect(api.generate).toHaveBeenCalledTimes(1);
    api.generate.mockResolvedValueOnce(readyResponse(original, { requestId: 'canonical' })); await render().generate('WRITING_FEEDBACK', true);
    expect(api.generate.mock.calls[1][0]).toEqual(original); expect(render().aiDraft?.status).toBe('READY');
  });
  it('consumes explicit resume permission before POST so another lost response is followed only by GET', async () => {
    await settle(); api.generate.mockImplementationOnce(async request => pendingResponse(request, { requestId: 'canonical', recoveryAction: 'RESEND_SAME_REQUEST' }))
      .mockRejectedValueOnce(new Error('resume response lost'));
    await render().generate('WRITING_FEEDBACK'); const original = api.generate.mock.calls[0][0];
    await render().generate('WRITING_FEEDBACK', true); expect(render().pendingRecoveryAction).toBe('CHECK_RESULT');
    api.result.mockResolvedValue(readyResponse(original, { requestId: 'canonical' })); await render().generate('WRITING_FEEDBACK', true);
    expect(api.generate).toHaveBeenCalledTimes(2); expect(api.generate.mock.calls[1][0]).toEqual(original);
    expect(api.result).toHaveBeenCalledWith('canonical'); expect(render().aiDraft?.status).toBe('READY');
  });
  it.each([
    { assignmentId: 'other-assignment' }, { attemptNo: 2 }, { operation: 'OCR' },
    { inputDraftRevision: 2 }, { inputDraftRevision: undefined },
  ])('rejects a mismatched canonical response without adopting its lookup ID: %j', async mismatch => {
    await settle(); api.generate.mockImplementation(async request => pendingResponse(request, { requestId: 'wrong-canonical', ...mismatch }));
    await render().generate('WRITING_FEEDBACK'); const original = api.generate.mock.calls[0][0];
    expect(render().aiDraft).toBeNull(); expect(render().error).toContain('一致するGPT下書き');
    api.result.mockResolvedValue(pendingResponse(original)); await render().generate('WRITING_FEEDBACK', true);
    expect(api.result).toHaveBeenCalledWith(original.requestId); expect(render().manual).toBe(input.manualTranscript);
  });
  it('rejects the wrong input revision even when the response uses the original request ID', async () => {
    await settle(); api.generate.mockImplementation(async request => pendingResponse(request, { inputDraftRevision: 2 }));
    await render().generate('WRITING_FEEDBACK'); expect(render().aiDraft).toBeNull(); expect(render().error).toContain('一致するGPT下書き');
  });
  it('keeps legacy same-ID replies compatible without allowing a canonical ID missing revision', async () => {
    await settle(); api.generate.mockImplementation(async request => {
      const { inputDraftRevision, ...legacy } = readyResponse(request); return legacy;
    });
    await render().generate('WRITING_FEEDBACK'); expect(render().aiDraft?.status).toBe('READY'); expect(render().error).toBeNull();
  });
  it('keeps a same-operation new-generation click read-only while a request is pending', async () => {
    await settle(); api.generate.mockImplementation(async request => pendingResponse(request, { recoveryAction: 'RESEND_SAME_REQUEST' }));
    await render().generate('WRITING_FEEDBACK'); const original = api.generate.mock.calls[0][0];
    api.result.mockResolvedValue(pendingResponse(original, { recoveryAction: 'RESEND_SAME_REQUEST' }));
    await render().generate('WRITING_FEEDBACK'); await render().generate('WRITING_FEEDBACK');
    expect(api.generate).toHaveBeenCalledTimes(1); expect(api.result).toHaveBeenCalledTimes(2);
    expect(api.result.mock.calls).toEqual([[original.requestId], [original.requestId]]);
  });
  it('does not create duplicate requests from a double click while the first response is pending', async () => {
    await settle(); let resolve!: (value: any) => void;
    api.generate.mockImplementation(request => new Promise(done => { resolve = done; }));
    const editor = render(); const first = editor.generate('WRITING_FEEDBACK'); await editor.generate('WRITING_FEEDBACK');
    expect(api.generate).toHaveBeenCalledTimes(1); resolve(pendingResponse(api.generate.mock.calls[0][0])); await first;
    expect(render().hasPendingRequest).toBe(true);
  });
  it('drops an old pending response when saved input reloads to a new revision', async () => {
    await settle(); api.generate.mockImplementation(async request => pendingResponse(request, { requestId: `canonical-${request.inputDraftRevision}` }));
    await render().generate('WRITING_FEEDBACK'); const old = api.generate.mock.calls[0][0];
    api.read.mockResolvedValue({ draft: { ...input, revision: 2, manualTranscript: 'My newer saved text.' } });
    render().reload(); await settle();
    expect(render().aiDraft).toBeNull(); expect(render().hasPendingRequest).toBe(false);
    await render().generate('WRITING_FEEDBACK', true); expect(api.result).not.toHaveBeenCalled();
    await render().generate('WRITING_FEEDBACK');
    expect(api.generate.mock.calls[1][0]).toMatchObject({ inputDraftRevision: 2 });
    expect(api.generate.mock.calls[1][0].requestId).not.toBe(old.requestId); expect(render().aiDraft?.inputDraftRevision).toBe(2);
  });
  it('allows result-only GET after capability becomes disabled without sending edited local text', async () => {
    await settle(); api.generate.mockImplementation(async request => pendingResponse(request)); await render().generate('WRITING_FEEDBACK');
    const original = api.generate.mock.calls[0][0]; render().setManual('My unsaved local text.');
    api.cap.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false, ocrEnabled: false, feedbackEnabled: false }); render().reload(); await settle();
    api.result.mockResolvedValue(readyResponse(original)); await render().generate('WRITING_FEEDBACK', true);
    expect(api.generate).toHaveBeenCalledTimes(1); expect(api.result).toHaveBeenCalledWith(original.requestId);
    expect(render().manual).toBe('My unsaved local text.'); expect(render().saved?.manualTranscript).toBe(input.manualTranscript);
  });

  it('does not authorize a same-ID resume reply missing the input revision', async () => {
    await settle(); api.generate.mockImplementation(async request => pendingResponse(request, { recoveryAction: 'RESEND_SAME_REQUEST', inputDraftRevision: undefined }));
    await render().generate('WRITING_FEEDBACK'); const original = api.generate.mock.calls[0][0];
    expect(render().pendingRecoveryAction).toBe('CHECK_RESULT'); api.result.mockResolvedValue(pendingResponse(original));
    await render().generate('WRITING_FEEDBACK', true); expect(api.generate).toHaveBeenCalledTimes(1); expect(api.result).toHaveBeenCalledWith(original.requestId);
  });
  it('keeps the current pending request when another operation is invoked before completion', async () => {
    await settle(); api.generate.mockImplementation(async request => pendingResponse(request)); await render().generate('WRITING_FEEDBACK');
    await render().generate('OCR'); expect(api.generate).toHaveBeenCalledTimes(1); expect(api.result).not.toHaveBeenCalled();
    expect(render().pendingOperation).toBe('WRITING_FEEDBACK'); expect(render().error).toContain('先に処理中');
  });

});
