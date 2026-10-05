import type { CatalogImportRequest } from '../contracts/storage';
import { normalizeCatalogImport } from './catalogImport';

export const PERSONAL_CATALOG_INPUT_MAX_CHARS = 1_000_000;
export const PERSONAL_CATALOG_INPUT_MAX_ROWS = 500;
export const PERSONAL_CATALOG_FILE_MAX_BYTES = 1_000_000;
export const PERSONAL_CATALOG_OCR_UNAVAILABLE = '画像・PDFからの自動抽出は現在利用できません。内容を確認した単語・語義を手入力するか、CSVを選んでください。入力は保持されています。';

export const isPreparedCatalogCsvFile = (file: Pick<File, 'name' | 'type'>): boolean => (
  /\.csv$/i.test(file.name) && file.type !== 'application/pdf' && !file.type.startsWith('image/')
);

export const readPreparedCatalogCsvFile = async (file: Pick<File, 'name' | 'type' | 'size' | 'text'>): Promise<string> => {
  if (!isPreparedCatalogCsvFile(file)) throw new Error(PERSONAL_CATALOG_OCR_UNAVAILABLE);
  if (file.size > PERSONAL_CATALOG_FILE_MAX_BYTES) throw new Error('CSVは1MB以内のファイルを選んでください。');
  return file.text();
};

// Preparation is local and never calls an external provider. The server still
// checks owner authorization and validates every imported value independently.
export const buildPreparedPersonalCatalogImport = (
  titleInput: string,
  csvText: string,
  ownerUid: string,
): CatalogImportRequest => {
  const title = titleInput.trim();
  if (!title) throw new Error('タイトルを入力してください。');
  if (!ownerUid.trim()) throw new Error('ログイン状態を確認してください。');
  if (csvText.length > PERSONAL_CATALOG_INPUT_MAX_CHARS) throw new Error('入力は100万文字以内にしてください。');
  const normalized = normalizeCatalogImport({
    defaultBookName: title,
    source: { kind: 'csv', csvText },
  });
  if (normalized.warnings.length > 0) {
    const first = normalized.warnings[0];
    throw new Error(`取込前にCSVを確認してください。${first.rowNumber ? `${first.rowNumber}行目: ` : ''}${first.message}`);
  }
  if (!normalized.rows.length) throw new Error('単語・語義を含むCSVを入力してください。');
  if (normalized.rows.length > PERSONAL_CATALOG_INPUT_MAX_ROWS) throw new Error('1回の取込は500語以内にしてください。');
  return {
    defaultBookName: title,
    createdByUid: ownerUid,
    source: {
      kind: 'rows',
      // The entered title names this one personal book. Optional examples and
      // provenance from the prepared CSV remain attached to their original rows.
      rows: normalized.rows.map(row => ({ ...row, bookName: title })),
    },
  };
};
