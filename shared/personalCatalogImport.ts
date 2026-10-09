import type { CatalogImportRequest, CatalogImportResult } from '../contracts/storage';
import { catalogRowsAreEquivalent, inspectCatalogImportContent, normalizeCatalogImport } from './catalogImport';
import { BookAccessScope, BookCatalogSource, type WordData } from '../types';

export class PersonalCatalogImportError extends Error {
  constructor(public readonly status: 400 | 403 | 409, message: string) { super(message); this.name = 'PersonalCatalogImportError'; }
}

export const validatePersonalClientImportId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new PersonalCatalogImportError(400, '作成IDは16〜128文字の英数字・ハイフン・アンダースコアで指定してください。');
  }
  return value;
};

// Stable key ordering makes a JSON serialization/property-order change harmless.
// Row ordering and every supplied value stay significant: retries must carry
// the same immutable request, rather than a new edit under the old ID.
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};
const hash = async (value: string): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};


/** Prepare immutable input before starting either a D1 or native IDB transaction. */
export const preparePersonalCatalogImport = async (payload: CatalogImportRequest, ownerId: string) => {
  const clientImportId = validatePersonalClientImportId(payload.clientImportId);
  if (payload.createdByUid !== ownerId) throw new PersonalCatalogImportError(403, '本人の個人単語帳のみ作成できます。');
  if (payload.source?.kind !== 'rows' || !Array.isArray(payload.source.rows)
    || payload.source.rows.length === 0 || payload.source.rows.length > 500) {
    throw new PersonalCatalogImportError(400, '個人単語帳は1〜500行の入力で作成してください。');
  }
  const title = typeof payload.defaultBookName === 'string' ? payload.defaultBookName.trim() : '';
  if (!title || title.length > 120) throw new PersonalCatalogImportError(400, '単語帳名は1〜120文字で指定してください。');
  if (payload.importProfile !== undefined) throw new PersonalCatalogImportError(400, '個人作成には教材取り込みプロファイルを指定できません。');
  for (const key of ['contextSummary', 'bookDescription'] as const) {
    if (payload[key] !== undefined && typeof payload[key] !== 'string') throw new PersonalCatalogImportError(400, '単語帳の補足は文字列で入力してください。');
  }
  if (payload.options !== undefined && (!payload.options || typeof payload.options !== 'object' || Array.isArray(payload.options))) {
    throw new PersonalCatalogImportError(400, '単語帳の設定が不正です。');
  }
  if (payload.options?.catalogSource !== undefined && !Object.values(BookCatalogSource).includes(payload.options.catalogSource)) throw new PersonalCatalogImportError(400, '教材の分類が不正です。');
  if (payload.options?.accessScope !== undefined && !Object.values(BookAccessScope).includes(payload.options.accessScope)) throw new PersonalCatalogImportError(400, '教材の公開範囲が不正です。');
  for (const row of payload.source.rows) {
    if (!row || typeof row !== 'object' || typeof row.word !== 'string' || typeof row.definition !== 'string') {
      throw new PersonalCatalogImportError(400, '単語と意味を文字列で入力してください。');
    }
    for (const key of ['bookName', 'partOfSpeech', 'inflections', 'pronunciation', 'sourceNote', 'exampleSentence', 'exampleMeaning', 'category', 'subcategory', 'section', 'sourceSheet'] as const) {
      if (row[key] !== undefined && typeof row[key] !== 'string') throw new PersonalCatalogImportError(400, '補足項目は文字列で入力してください。');
    }
    for (const key of ['number', 'sourceEntryId'] as const) {
      if (row[key] !== undefined && !['string', 'number'].includes(typeof row[key])) throw new PersonalCatalogImportError(400, '番号は数字で入力してください。');
    }
    if (row.number !== undefined && (!/^\d+$/.test(String(row.number)) || !Number.isSafeInteger(Number(row.number)) || Number(row.number) <= 0)) {
      throw new PersonalCatalogImportError(400, '番号は正の整数で入力してください。');
    }
    if (row.bookName !== undefined && row.bookName.trim() !== title) throw new PersonalCatalogImportError(400, '一度に作成できる個人単語帳は1冊です。');
  }
  const canonical = canonicalJson(payload);
  if (new TextEncoder().encode(canonical).length > 1_000_000) throw new PersonalCatalogImportError(400, '入力が大きすぎます。500語以内で内容を短くしてください。');
  const fingerprint = await hash(canonical);
  const normalized = normalizeCatalogImport(payload);
  // Never turn partially invalid direct entry into a successful partial import.
  if (normalized.warnings.length || normalized.rows.length !== payload.source.rows.length) {
    throw new PersonalCatalogImportError(400, normalized.warnings[0]?.message || '入力内容を確認してください。空行を除いて再送してください。');
  }
  const bookId = `personal-${await hash(`${ownerId}:${clientImportId}`)}`;
  const words: WordData[] = [];
  const warnings: CatalogImportResult['warnings'] = [];
  let skippedRowCount = 0;
  normalized.rows.forEach((row, index) => {
    if (words.some(word => catalogRowsAreEquivalent(word, row))) {
      skippedRowCount++;
      warnings.push({ code: 'DUPLICATE_ROW', message: '単語・意味・用例・品詞・出典がすべて同じ重複行をスキップしました。', rowNumber: index + 1 });
      return;
    }
    const number = row.number || words.length + 1;
    words.push({ ...row, id: `${bookId}_${number}_${index}`, bookId, number, word: row.word.trim(), definition: row.definition.trim(), searchKey: row.word.trim().toLowerCase() });
  });
  const qa = inspectCatalogImportContent(words);
  if (!words.length || qa.requiredBlankRows || qa.rowsWithSentinel) throw new PersonalCatalogImportError(400, '不完全な単語・意味を含むため保存を停止しました。');
  const result: CatalogImportResult = { importedBookIds: [bookId], importedBookCount: 1, importedWordCount: words.length, skippedRowCount, warnings };
  return { clientImportId, fingerprint, bookId, title, words, result };
};
