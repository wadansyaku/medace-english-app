import type { CatalogImportRequest, CatalogImportResult, CatalogImportRow } from '../contracts/storage';
import { catalogRowsAreEquivalent, normalizeCatalogImport } from './catalogImport';
import { PERSONAL_CATALOG_INPUT_MAX_ROWS } from './preparedPersonalCatalog';

export type PersonalDraftRow = CatalogImportRow & { draftId: string };
export interface PersonalWordbookDraft {
  ownerUid: string;
  updatedAt: number;
  title: string;
  rows: PersonalDraftRow[];
  csvText?: string;
  pendingRequest?: CatalogImportRequest;
  saved?: { title: string; result: CatalogImportResult };
}
export const PERSONAL_DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const key = (uid: string) => `steady-study:personal-wordbook-draft:v1:${encodeURIComponent(uid)}`;
const isDraftCatalogRow = (value: unknown): value is CatalogImportRow => {
  if (!value || typeof value !== 'object') return false;
  const row = value as CatalogImportRow;
  return typeof row.word === 'string' && typeof row.definition === 'string'
    && ['bookName', 'partOfSpeech', 'inflections', 'pronunciation', 'sourceNote', 'exampleSentence', 'exampleMeaning', 'category', 'subcategory', 'section', 'sourceSheet']
      .every(name => row[name] === undefined || typeof row[name] === 'string')
    && ['number', 'sourceEntryId'].every(name => row[name] === undefined || ['number', 'string'].includes(typeof row[name]));
};
export const createPersonalDraftRow = (row?: Partial<CatalogImportRow>): PersonalDraftRow => ({
  ...row, word: row?.word ?? '', definition: row?.definition ?? '', draftId: crypto.randomUUID(),
});
export const emptyPersonalWordbookDraft = (ownerUid: string): PersonalWordbookDraft => ({
  ownerUid, updatedAt: Date.now(), title: '自分の単語帳', rows: [createPersonalDraftRow()],
});
export const hasPersonalDraftContent = (row: CatalogImportRow): boolean => (
  Object.entries(row).some(([name, value]) => !['draftId', 'bookName', 'number'].includes(name)
    && value != null && String(value).trim().length > 0)
);

export const preparePersonalDraftRequest = (draft: PersonalWordbookDraft): CatalogImportRequest => {
  const title = draft.title.trim() || '自分の単語帳';
  if (title.length > 120) throw new Error('単語帳名は120文字以内にしてください。');
  const rows = draft.rows.flatMap(({ draftId: _id, ...row }, index) => {
    if (!hasPersonalDraftContent(row)) return [];
    if (!row.word.trim() || !row.definition.trim()) throw new Error(`${index + 1}語目の単語と意味を両方入力してください。`);
    return [{ ...row, bookName: title, number: row.number ?? index + 1 }];
  });
  if (!rows.length) throw new Error('単語と意味を1語以上入力してください。');
  if (rows.length > PERSONAL_CATALOG_INPUT_MAX_ROWS) throw new Error('1冊に追加できる単語は500語までです。');
  const request: CatalogImportRequest = { clientImportId: crypto.randomUUID(), createdByUid: draft.ownerUid,
    defaultBookName: title, source: { kind: 'rows', rows } };
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > 1_000_000) throw new Error('入力は1MB以内にしてください。');
  const normalized = normalizeCatalogImport(request);
  if (normalized.warnings.length) throw new Error(normalized.warnings[0].message);
  return request;
};
export const previewPersonalDraftRequest = (request: CatalogImportRequest) => {
  if (request.source.kind !== 'rows') throw new Error('入力内容を確認してください。');
  const rows: CatalogImportRow[] = [];
  const duplicateRowNumbers: number[] = [];
  request.source.rows.forEach((row, index) => {
    if (rows.some(candidate => catalogRowsAreEquivalent(candidate as never, row as never))) duplicateRowNumbers.push(index + 1);
    else rows.push(row);
  });
  return { rows, duplicateRowNumbers };
};

const decodePersonalWordbookDraft = (ownerUid: string, value: string | null): PersonalWordbookDraft => {
  try {
    if (!value || value.length > 2_500_000) return emptyPersonalWordbookDraft(ownerUid);
    const draft = JSON.parse(value) as PersonalWordbookDraft;
    if (draft.ownerUid !== ownerUid || !Number.isFinite(draft.updatedAt) || draft.updatedAt > Date.now()
      || draft.updatedAt <= Date.now() - PERSONAL_DRAFT_LIFETIME_MS || typeof draft.title !== 'string'
      || !Array.isArray(draft.rows) || !draft.rows.length || draft.rows.length > 500
      || draft.rows.some(row => !isDraftCatalogRow(row) || typeof row.draftId !== 'string')) {
      localStorage.removeItem(key(ownerUid));
      return emptyPersonalWordbookDraft(ownerUid);
    }
    if (draft.csvText !== undefined && typeof draft.csvText !== 'string') return emptyPersonalWordbookDraft(ownerUid);
    if (draft.pendingRequest && (draft.pendingRequest.createdByUid !== ownerUid || draft.pendingRequest.source?.kind !== 'rows'
      || typeof draft.pendingRequest.defaultBookName !== 'string'
      || !Array.isArray(draft.pendingRequest.source.rows) || !draft.pendingRequest.source.rows.length || draft.pendingRequest.source.rows.length > 500
      || draft.pendingRequest.source.rows.some(row => !isDraftCatalogRow(row))
      || !/^[A-Za-z0-9_-]{16,128}$/.test(draft.pendingRequest.clientImportId ?? ''))) return emptyPersonalWordbookDraft(ownerUid);
    if (draft.saved && (typeof draft.saved.title !== 'string' || !Array.isArray(draft.saved.result?.importedBookIds)
      || draft.saved.result.importedBookIds.length !== 1 || typeof draft.saved.result.importedBookIds[0] !== 'string'
      || !Array.isArray(draft.saved.result.warnings) || draft.saved.result.warnings.some(warning => !warning || typeof warning.message !== 'string')
      || !Number.isSafeInteger(draft.saved.result.importedWordCount) || draft.saved.result.importedWordCount < 1)) return emptyPersonalWordbookDraft(ownerUid);
    return draft;
  } catch { return emptyPersonalWordbookDraft(ownerUid); }
};
export const readPersonalWordbookDraftSnapshot = (ownerUid: string) => {
  try {
    const raw = localStorage.getItem(key(ownerUid));
    return { draft: decodePersonalWordbookDraft(ownerUid, raw), raw, available: true };
  } catch {
    return { draft: emptyPersonalWordbookDraft(ownerUid), raw: null, available: false };
  }
};
export const readPersonalWordbookDraft = (ownerUid: string): PersonalWordbookDraft => readPersonalWordbookDraftSnapshot(ownerUid).draft;
// Quota/private-mode failures do not discard the in-memory input.
export const writePersonalWordbookDraft = (draft: PersonalWordbookDraft): boolean => {
  try { localStorage.setItem(key(draft.ownerUid), JSON.stringify(draft)); return true; }
  catch { return false; }
};
