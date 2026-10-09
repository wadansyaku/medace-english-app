import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPlan, UserRole } from '../types';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
}));
const service = vi.hoisted(() => ({ save: vi.fn(), textAi: vi.fn(), mediaAi: vi.fn() }));
vi.mock('../services/dashboard', () => ({ dashboardService: { batchImportWords: service.save } }));
vi.mock('../services/gemini', () => ({ extractVocabularyFromText: service.textAi, extractVocabularyFromMedia: service.mediaAi }));
import { useStudentDashboardMutations } from '../hooks/useStudentDashboardMutations';
import { emptyPersonalWordbookDraft, createPersonalDraftRow, preparePersonalDraftRequest } from '../shared/personalWordbookDraft';

const params = () => ({
  user: { uid: 'synthetic-owner', email: 'synthetic@example.test', role: UserRole.STUDENT, subscriptionPlan: SubscriptionPlan.TOC_PAID },
  createMode: 'TEXT', rawText: 'Word,Meaning,ExampleSentence,ExampleMeaning\nsource,出典,Please check the source.,出典を確認してください。',
  newBookTitle: 'My prepared book', uploadFile: null,
  setCreating: vi.fn(), setErrorMsg: vi.fn(), setRawText: vi.fn(), setNewBookTitle: vi.fn(),
  setUploadFile: vi.fn(), setShowCreateModal: vi.fn(), setPageNotice: vi.fn(), refreshDashboard: vi.fn().mockResolvedValue(undefined),
} as unknown as Parameters<typeof useStudentDashboardMutations>[0]);
const render = (input: Parameters<typeof useStudentDashboardMutations>[0]) => {
  harness.cursor = 0;
  return useStudentDashboardMutations(input);
};
beforeEach(() => {
  harness.slots = []; harness.cursor = 0;
  vi.clearAllMocks();
  service.save.mockResolvedValue({ importedWordCount: 1, importedBookCount: 1, warnings: [], skippedRowCount: 0 });
});
afterEach(() => vi.useRealTimers());
const directRequest = () => preparePersonalDraftRequest({ ...emptyPersonalWordbookDraft('synthetic-owner'), rows: [createPersonalDraftRow({ word: 'source', definition: '出典' })] });

describe('personal prepared book persistence', () => {
  it('releases an unanswered request after twenty seconds and retries the same immutable payload', async () => {
    vi.useFakeTimers();
    const input = params(); const request = directRequest();
    service.save.mockReturnValueOnce(new Promise(() => {}));
    const first = render(input).handleCreatePhrasebook(request);
    const failed = expect(first).rejects.toThrow('保存の応答を確認できません');
    await vi.advanceTimersByTimeAsync(20_000); await failed;
    expect(input.setCreating).toHaveBeenLastCalledWith(false);
    await render(input).handleCreatePhrasebook(request);
    expect(service.save.mock.calls.map(call => call[0])).toEqual([request, request]);
    expect(input.setShowCreateModal).not.toHaveBeenCalled();
  });
  it('returns a confirmed book before a stalled dashboard refresh without offering another import', async () => {
    const input = params(); const request = directRequest();
    input.refreshDashboard = vi.fn().mockReturnValue(new Promise(() => {}));
    const result = await render(input).handleCreatePhrasebook(request);
    expect(result?.importedWordCount).toBe(1);
    expect(input.setCreating).toHaveBeenLastCalledWith(false);
    expect(input.setRawText).not.toHaveBeenCalled();
    expect(input.setShowCreateModal).not.toHaveBeenCalled();
  });
  it('saves prepared examples through the owner storage path and makes no provider request', async () => {
    const input = params();
    await render(input).handleCreatePhrasebook();
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ createdByUid: input.user.uid,
      source: { kind: 'rows', rows: [expect.objectContaining({ exampleSentence: 'Please check the source.', exampleMeaning: '出典を確認してください。' })] } }));
    expect(service.textAi).not.toHaveBeenCalled(); expect(service.mediaAi).not.toHaveBeenCalled();
    expect(input.setRawText).toHaveBeenCalledWith('');
    expect(input.setShowCreateModal).toHaveBeenCalledWith(false);
    expect(input.setPageNotice).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });
  it('keeps file reading and saving under the same duplicate-operation lock', async () => {
    const input = params(); input.createMode = 'FILE';
    let release!: (value: string) => void;
    const text = vi.fn().mockReturnValue(new Promise<string>(resolve => { release = resolve; }));
    input.uploadFile = { name: 'reviewed.csv', type: 'text/csv', size: 20, text } as unknown as File;
    const first = render(input).handleCreatePhrasebook();
    await render(input).handleCreatePhrasebook();
    expect(text).toHaveBeenCalledTimes(1);
    expect(service.save).not.toHaveBeenCalled();
    release('Word,Meaning\nsource,出典'); await first;
    expect(service.save).toHaveBeenCalledTimes(1);
  });
  it('rejects OCR without reading bytes or clearing the current title, text or file', async () => {
    const input = params(); input.createMode = 'FILE';
    const text = vi.fn();
    input.uploadFile = { name: 'source.pdf', type: 'application/pdf', size: 20, text } as unknown as File;
    await render(input).handleCreatePhrasebook();
    expect(text).not.toHaveBeenCalled(); expect(service.save).not.toHaveBeenCalled();
    expect(service.textAi).not.toHaveBeenCalled(); expect(service.mediaAi).not.toHaveBeenCalled();
    expect(input.setErrorMsg).toHaveBeenLastCalledWith(expect.stringContaining('自動抽出は現在利用できません'));
    expect(input.setRawText).not.toHaveBeenCalled(); expect(input.setNewBookTitle).not.toHaveBeenCalled(); expect(input.setUploadFile).not.toHaveBeenCalled();
    expect(input.setShowCreateModal).not.toHaveBeenCalled();
    expect(input.setCreating).toHaveBeenLastCalledWith(false);
  });
  it('keeps malformed prepared content local without a partial save', async () => {
    const input = params(); input.rawText = 'Word,Meaning\nsource,出典\nnext,[要確認]';
    await render(input).handleCreatePhrasebook();
    expect(service.save).not.toHaveBeenCalled(); expect(service.textAi).not.toHaveBeenCalled();
    expect(input.setRawText).not.toHaveBeenCalled();
    expect(input.setErrorMsg).toHaveBeenLastCalledWith(expect.stringContaining('3行目'));
  });
  it('retains failed-save input and releases the lock for an explicit retry', async () => {
    const input = params(); service.save.mockRejectedValueOnce(new Error('Synthetic storage unavailable'));
    await render(input).handleCreatePhrasebook();
    expect(input.setRawText).not.toHaveBeenCalled(); expect(input.setNewBookTitle).not.toHaveBeenCalled();
    expect(input.setShowCreateModal).not.toHaveBeenCalled(); expect(input.setPageNotice).not.toHaveBeenCalled();
    expect(input.setErrorMsg).toHaveBeenLastCalledWith('Synthetic storage unavailable');
    await render(input).handleCreatePhrasebook();
    expect(service.save).toHaveBeenCalledTimes(2);
    expect(input.setShowCreateModal).toHaveBeenCalledWith(false);
  });
  it('distinguishes a committed book from a failed dashboard refresh instead of offering another import', async () => {
    const input = params(); input.refreshDashboard = vi.fn().mockRejectedValueOnce(new Error('Synthetic refresh unavailable'));
    await render(input).handleCreatePhrasebook();
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(input.setShowCreateModal).toHaveBeenCalledWith(false);
    expect(input.setPageNotice).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('単語帳は保存されましたが') }));
    expect(input.setErrorMsg).toHaveBeenCalledTimes(1);
    expect(input.setErrorMsg).toHaveBeenCalledWith(null);
  });
});
