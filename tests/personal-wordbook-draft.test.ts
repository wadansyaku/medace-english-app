import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPersonalDraftRow, emptyPersonalWordbookDraft, hasPersonalDraftContent,
  PERSONAL_DRAFT_LIFETIME_MS, preparePersonalDraftRequest, previewPersonalDraftRequest,
  readPersonalWordbookDraft, writePersonalWordbookDraft,
} from '../shared/personalWordbookDraft';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const one = () => ({ ...emptyPersonalWordbookDraft('owner-a'), rows: [createPersonalDraftRow({ word: 'plant', definition: '植物' })] });

describe('personal wordbook draft preparation', () => {
  it('saves a single current editor row without an Add action and ignores a trailing empty row', () => {
    const draft = one(); draft.rows.push(createPersonalDraftRow());
    const request = preparePersonalDraftRequest(draft);
    expect(request).toMatchObject({ createdByUid: 'owner-a', defaultBookName: '自分の単語帳', source: { kind: 'rows', rows: [{ word: 'plant', definition: '植物', number: 1 }] } });
    expect(request.clientImportId).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    if (request.source.kind !== 'rows') throw new Error('rows required');
    expect(request.source.rows).toHaveLength(1); expect(request.source.rows[0]).not.toHaveProperty('draftId');
  });
  it('allows blank optional hints while requiring both fields of every started row', () => {
    const draft = one(); draft.rows[0].exampleSentence = ''; draft.rows[0].exampleMeaning = '';
    expect(() => preparePersonalDraftRequest(draft)).not.toThrow();
    draft.rows.push(createPersonalDraftRow({ word: 'unfinished', definition: '' }));
    expect(() => preparePersonalDraftRequest(draft)).toThrow('2語目');
    expect(hasPersonalDraftContent(createPersonalDraftRow({ exampleSentence: 'hint only' }))).toBe(true);
    expect(() => preparePersonalDraftRequest(emptyPersonalWordbookDraft('owner-a'))).toThrow('1語以上');
  });
  it('preserves homographs, supplied numbers and provenance; previews only exact duplicate removal', () => {
    const base = { word: 'plant', definition: '植物', number: 21, sourceNote: 'synthetic provenance', sourceSheet: 'Sheet A', sourceEntryId: 7 };
    const draft = { ...one(), rows: [createPersonalDraftRow(base), createPersonalDraftRow({ ...base, definition: '植える', number: 22 }), createPersonalDraftRow(base)] };
    const request = preparePersonalDraftRequest(draft); const preview = previewPersonalDraftRequest(request);
    expect(preview.rows).toHaveLength(2); expect(preview.duplicateRowNumbers).toEqual([3]);
    expect(preview.rows).toEqual([expect.objectContaining(base), expect.objectContaining({ definition: '植える', number: 22, sourceNote: base.sourceNote })]);
    expect(request.source.kind === 'rows' && request.source.rows.length).toBe(3);
  });
  it('keeps quoted commas, newlines and Unicode as direct values without CSV interpretation', () => {
    const row = { word: '"rain, 🌧️"', definition: '「雨」\n降る', exampleSentence: 'She says, "雨".', exampleMeaning: '彼女は「雨」と言う。' };
    const draft = { ...one(), rows: [createPersonalDraftRow(row)] };
    expect(preparePersonalDraftRequest(draft).source).toEqual({ kind: 'rows', rows: [{ ...row, bookName: '自分の単語帳', number: 1 }] });
  });
  it('rejects over-limit rows and title without silently dropping content', () => {
    expect(() => preparePersonalDraftRequest({ ...one(), title: 'x'.repeat(121) })).toThrow('120');
    expect(() => preparePersonalDraftRequest({ ...one(), rows: Array.from({ length: 501 }, () => createPersonalDraftRow({ word: 'a', definition: '意味' })) })).toThrow('500');
  });
});
describe('account-scoped recoverable local drafts', () => {
  it('recovers pasted CSV drafts and rejects corrupted pending rows without crashing the editor', () => {
    const draft = one(); const request = preparePersonalDraftRequest(draft);
    writePersonalWordbookDraft({ ...draft, csvText: 'Word,Meaning\nplant,植物' });
    expect(readPersonalWordbookDraft('owner-a').csvText).toContain('plant,植物');
    for (const rows of [null, [{ word: 'a', definition: { unsafe: 'object' } }], [{ word: 'a', definition: '意味', exampleSentence: { unsafe: 'object' } }]]) {
      writePersonalWordbookDraft({ ...draft, pendingRequest: { ...request, source: { kind: 'rows', rows } } } as never);
      expect(readPersonalWordbookDraft('owner-a').pendingRequest).toBeUndefined();
    }
  });
  it('round-trips a frozen request with its exact ID and payload', () => {
    const draft = one(); const pendingRequest = preparePersonalDraftRequest(draft);
    expect(writePersonalWordbookDraft({ ...draft, pendingRequest })).toBe(true);
    const recovered = readPersonalWordbookDraft('owner-a');
    expect(recovered.pendingRequest).toEqual(pendingRequest); expect(recovered.rows).toEqual(draft.rows);
    expect(readPersonalWordbookDraft('owner-b').pendingRequest).toBeUndefined();
    expect(readPersonalWordbookDraft('owner-b').rows[0].word).toBe('');
  });
  it.each([PERSONAL_DRAFT_LIFETIME_MS, PERSONAL_DRAFT_LIFETIME_MS + 1, -1])('discards expired or future drafts (age %s)', age => {
    writePersonalWordbookDraft({ ...one(), updatedAt: Date.now() - age });
    expect(readPersonalWordbookDraft('owner-a').rows[0].word).toBe('');
  });
  it('retains a draft just inside the seven-day boundary', () => {
    writePersonalWordbookDraft({ ...one(), updatedAt: Date.now() - PERSONAL_DRAFT_LIFETIME_MS + 1 });
    expect(readPersonalWordbookDraft('owner-a').rows[0].word).toBe('plant');
  });
  it('refuses a pending request from another owner despite a matching outer owner', () => {
    writePersonalWordbookDraft({ ...one(), pendingRequest: preparePersonalDraftRequest({ ...one(), ownerUid: 'other' }) });
    expect(readPersonalWordbookDraft('owner-a').pendingRequest).toBeUndefined();
    expect(readPersonalWordbookDraft('owner-a').rows[0].word).toBe('');
  });
  it('reports storage failure and leaves in-memory input untouched', () => {
    const draft = one(); vi.stubGlobal('localStorage', { getItem: () => { throw new Error('private mode'); }, setItem: () => { throw new Error('quota'); } });
    expect(writePersonalWordbookDraft(draft)).toBe(false); expect(draft.rows[0].word).toBe('plant');
    expect(readPersonalWordbookDraft('owner-a').ownerUid).toBe('owner-a');
  });
});
