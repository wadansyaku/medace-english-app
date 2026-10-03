import type {
  CatalogImportIssue,
  CatalogImportRequest,
  CatalogImportRow,
} from '../contracts/storage';
import type { WordPartOfSpeech } from '../types';

const slugifySegment = (value: string): string => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')
  .slice(0, 48);

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const createImportedBookId = (
  bookName: string,
  createdByUid?: string,
  uniqueSalt?: string,
): string => {
  const slug = slugifySegment(bookName) || 'book';
  const ownerSegment = createdByUid ? `${createdByUid.slice(0, 8)}-` : '';
  const suffixBase = `${createdByUid || 'official'}:${bookName}:${uniqueSalt || ''}`;
  const suffix = hashString(suffixBase);
  return `${ownerSegment}${slug}-${suffix}`;
};

const parseCsvRows = (text: string): string[][] | null => {
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      cells.push(current);
      if (cells.some((cell) => cell.trim())) rows.push(cells);
      cells = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (inQuotes) return null;
  cells.push(current);
  if (cells.some((cell) => cell.trim())) rows.push(cells);
  return rows;
};

const normalizeHeaderKey = (value: string): string => value
  .trim()
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const HEADER_ALIASES = {
  bookName: ['bookname', 'book', 'booktitle', '単語帳名', '教材名'],
  number: ['number', 'no', 'num', '番号'],
  word: ['word', 'headword', '単語', '英単語'],
  definition: ['meaning', 'definition', 'ja', 'japanese', '日本語訳', '意味'],
  exampleSentence: ['examplesentence', '例文', '英文例文'],
  exampleMeaning: ['examplemeaning', '例文訳', '例文日本語訳'],
  category: ['category', 'カテゴリ', '大分類'],
  subcategory: ['subcategory', '小分類'],
  section: ['section', 'セクション'],
  sourceSheet: ['sourcesheet', 'sheet', 'シート', '出典シート'],
  sourceEntryId: ['sourceentryid', 'entryid', 'sourceid', '出典番号'],
  partOfSpeech: ['partofspeech', 'pos', '品詞'],
  inflections: ['inflections', '活用', '活用形'],
  pronunciation: ['pronunciation', '発音', '発音記号'],
  sourceNote: ['sourcenote', '注記', '原本注記'],
} as const;

const KNOWN_HEADER_KEYS: Set<string> = new Set(
  Object.values(HEADER_ALIASES).flat(),
);

const findHeaderIndex = (
  headers: string[],
  aliases: readonly string[],
): number => headers.findIndex((header) => aliases.includes(header));

const hasHeaderSignal = (headers: string[]): boolean => (
  headers.some((header) => KNOWN_HEADER_KEYS.has(header))
);

const looksLikePositionalDataRow = (cells: string[]): boolean => {
  const numberCell = (cells[1] || '').trim();
  const wordCell = (cells[2] || '').trim();
  const definitionCell = (cells[3] || '').trim();
  return cells.length >= 4 && /^\d+$/.test(numberCell) && wordCell.length > 0 && definitionCell.length > 0;
};

export interface NormalizedCatalogImportRow {
  bookName: string;
  number: number;
  word: string;
  definition: string;
  partOfSpeech?: WordPartOfSpeech;
  inflections?: string;
  pronunciation?: string;
  sourceNote?: string;
  exampleSentence?: string;
  exampleMeaning?: string;
  category?: string;
  subcategory?: string;
  section?: string;
  sourceSheet?: string;
  sourceEntryId?: number;
}

export interface NormalizedCatalogImport {
  rows: NormalizedCatalogImportRow[];
  warnings: CatalogImportIssue[];
}

const BLOCKED_CONTENT_MARKERS = ['[未抽出]', '[要確認]', '未抽出', '要確認', '未設定', 'TODO', 'TBD', 'N/A'] as const;
const CONTENT_QA_FIELDS = ['word', 'definition', 'exampleSentence', 'exampleMeaning', 'category', 'subcategory', 'section', 'sourceSheet', 'sourceEntryId', 'partOfSpeech', 'inflections', 'pronunciation', 'sourceNote'] as const;

const hasBlockedContentMarker = (value: unknown): boolean => {
  const normalized = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (!normalized) return false;
  return BLOCKED_CONTENT_MARKERS.some((marker) => (
    normalized === marker.toLowerCase()
    || ((marker.includes('[') || marker.includes('未抽出') || marker.includes('要確認')) && normalized.includes(marker.toLowerCase()))
  ));
};

export interface CatalogImportContentQa {
  requiredBlankRows: number;
  rowsWithSentinel: number;
  sentinelValueCount: number;
}

// Inspect the values themselves; catalog labels and a client-supplied profile
// cannot attest that the imported content is complete or approved.
export const inspectCatalogImportContent = (rows: readonly Partial<Record<(typeof CONTENT_QA_FIELDS)[number], unknown>>[]): CatalogImportContentQa => (
  rows.reduce((qa, row) => {
    if (!String(row.word ?? '').trim() || !String(row.definition ?? '').trim()) qa.requiredBlankRows += 1;
    const sentinelCount = CONTENT_QA_FIELDS.filter((field) => hasBlockedContentMarker(row[field])).length;
    if (sentinelCount > 0) qa.rowsWithSentinel += 1;
    qa.sentinelValueCount += sentinelCount;
    return qa;
  }, { requiredBlankRows: 0, rowsWithSentinel: 0, sentinelValueCount: 0 })
);

const normalizeRow = (
  row: CatalogImportRow,
  defaultBookName: string,
  rowNumber: number,
): { row?: NormalizedCatalogImportRow; warning?: CatalogImportIssue } => {
  const bookName = (row.bookName || defaultBookName || 'Imported').trim();
  const word = row.word.trim();
  const definition = row.definition.trim();
  const parsedNumber = Number.parseInt(String(row.number || rowNumber), 10);
  const sourceEntryText = String(row.sourceEntryId ?? '').trim();
  const parsedSourceEntryId = sourceEntryText ? Number(sourceEntryText) : undefined;
  const exampleSentence = typeof row.exampleSentence === 'string' ? row.exampleSentence.trim() : '';
  const exampleMeaning = typeof row.exampleMeaning === 'string' ? row.exampleMeaning.trim() : '';
  const category = typeof row.category === 'string' ? row.category.trim() : '';
  const subcategory = typeof row.subcategory === 'string' ? row.subcategory.trim() : '';
  const section = typeof row.section === 'string' ? row.section.trim() : '';
  const sourceSheet = typeof row.sourceSheet === 'string' ? row.sourceSheet.trim() : '';
  const partOfSpeech = typeof row.partOfSpeech === 'string' ? row.partOfSpeech.trim() : '';
  const inflections = typeof row.inflections === 'string' ? row.inflections.trim() : '';
  const pronunciation = typeof row.pronunciation === 'string' ? row.pronunciation.trim() : '';
  const sourceNote = typeof row.sourceNote === 'string' ? row.sourceNote.trim() : '';

  if (partOfSpeech && !['verb', 'noun', 'adverb', 'adjective'].includes(partOfSpeech)) {
    return { warning: { code: 'INVALID_PART_OF_SPEECH', message: '品詞は verb / noun / adverb / adjective を指定してください。', rowNumber } };
  }

  if (sourceEntryText && (!/^\d+$/.test(sourceEntryText) || !Number.isSafeInteger(parsedSourceEntryId) || parsedSourceEntryId! <= 0)) {
    return { warning: { code: 'INVALID_SOURCE_ENTRY_ID', message: '出典番号は正の安全な整数を指定してください。行をスキップしました。', rowNumber } };
  }

  if (!word) {
    return {
      warning: {
        code: 'EMPTY_WORD',
        message: '単語が空の行をスキップしました。',
        rowNumber,
      },
    };
  }

  if (!definition) {
    return {
      warning: {
        code: 'EMPTY_DEFINITION',
        message: '意味が空の行をスキップしました。',
        rowNumber,
      },
    };
  }

  if (inspectCatalogImportContent([{ ...row, word, definition }]).rowsWithSentinel > 0) {
    return { warning: { code: 'BLOCKED_CONTENT_MARKER', message: '未抽出・要確認など未完成の値を含む行をスキップしました。', rowNumber } };
  }

  return {
    row: {
      bookName,
      number: Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : rowNumber,
      word,
      definition,
      ...(partOfSpeech ? { partOfSpeech: partOfSpeech as WordPartOfSpeech } : {}),
      ...(inflections ? { inflections } : {}),
      ...(pronunciation ? { pronunciation } : {}),
      ...(sourceNote ? { sourceNote } : {}),
      ...(exampleSentence ? { exampleSentence } : {}),
      ...(exampleMeaning ? { exampleMeaning } : {}),
      ...(category ? { category } : {}),
      ...(subcategory ? { subcategory } : {}),
      ...(section ? { section } : {}),
      ...(sourceSheet ? { sourceSheet } : {}),
      ...(parsedSourceEntryId !== undefined ? { sourceEntryId: parsedSourceEntryId } : {}),
    },
  };
};

export const normalizeCatalogImport = (request: CatalogImportRequest): NormalizedCatalogImport => {
  if (request.source.kind === 'rows') {
    const warnings: CatalogImportIssue[] = [];
    const rows = request.source.rows.flatMap((row, index) => {
      const normalized = normalizeRow(row, request.defaultBookName, index + 1);
      if (normalized.warning) warnings.push(normalized.warning);
      return normalized.row ? [normalized.row] : [];
    });

    return { rows, warnings };
  }

  const csvText = request.source.csvText.replace(/^\uFEFF/, '');
  const lines = parseCsvRows(csvText);

  if (lines === null) {
    return { rows: [], warnings: [{ code: 'INVALID_CSV', message: 'CSV の引用符が閉じていません。取り込みを中止しました。' }] };
  }

  if (lines.length === 0) {
    return {
      rows: [],
      warnings: [{ code: 'EMPTY_PAYLOAD', message: 'CSV に有効なデータがありません。' }],
    };
  }

  const firstCells = lines[0];
  const headers = firstCells.map(normalizeHeaderKey);
  const shouldUseHeaderRow = hasHeaderSignal(headers) && !looksLikePositionalDataRow(firstCells);
  const bookIndex = findHeaderIndex(headers, HEADER_ALIASES.bookName);
  const numberIndex = findHeaderIndex(headers, HEADER_ALIASES.number);
  const wordIndex = findHeaderIndex(headers, HEADER_ALIASES.word);
  const meaningIndex = findHeaderIndex(headers, HEADER_ALIASES.definition);
  const exampleSentenceIndex = findHeaderIndex(headers, HEADER_ALIASES.exampleSentence);
  const exampleMeaningIndex = findHeaderIndex(headers, HEADER_ALIASES.exampleMeaning);
  const categoryIndex = findHeaderIndex(headers, HEADER_ALIASES.category);
  const subcategoryIndex = findHeaderIndex(headers, HEADER_ALIASES.subcategory);
  const sectionIndex = findHeaderIndex(headers, HEADER_ALIASES.section);
  const sourceSheetIndex = findHeaderIndex(headers, HEADER_ALIASES.sourceSheet);
  const sourceEntryIdIndex = findHeaderIndex(headers, HEADER_ALIASES.sourceEntryId);
  const partOfSpeechIndex = findHeaderIndex(headers, HEADER_ALIASES.partOfSpeech);
  const inflectionsIndex = findHeaderIndex(headers, HEADER_ALIASES.inflections);
  const pronunciationIndex = findHeaderIndex(headers, HEADER_ALIASES.pronunciation);
  const sourceNoteIndex = findHeaderIndex(headers, HEADER_ALIASES.sourceNote);

  if (!shouldUseHeaderRow) {
    const warnings: CatalogImportIssue[] = [];
    const rows = lines.flatMap((cells, index) => {
      const normalized = normalizeRow({
        bookName: cells[0] || request.defaultBookName,
        number: cells[1] || index + 1,
        word: cells[2] || '',
        definition: cells[3] || '',
        exampleSentence: cells[4] || undefined,
        exampleMeaning: cells[5] || undefined,
        category: cells[6] || undefined,
        subcategory: cells[7] || undefined,
        section: cells[8] || undefined,
        sourceSheet: cells[9] || undefined,
        sourceEntryId: cells[10] || undefined,
        partOfSpeech: (cells[11] || undefined) as WordPartOfSpeech | undefined,
        inflections: cells[12] || undefined,
        pronunciation: cells[13] || undefined,
        sourceNote: cells[14] || undefined,
      }, request.defaultBookName, index + 1);
      if (normalized.warning) warnings.push(normalized.warning);
      return normalized.row ? [normalized.row] : [];
    });

    return { rows, warnings };
  }

  if (wordIndex === -1 || meaningIndex === -1) {
    return {
      rows: [],
      warnings: [{
        code: 'MISSING_REQUIRED_COLUMNS',
        message: 'CSV は `Word` と `Meaning` 列を含む必要があります。',
      }],
    };
  }

  const warnings: CatalogImportIssue[] = [];
  const rows = lines.slice(1).flatMap((cells, index) => {
    const normalized = normalizeRow({
      bookName: bookIndex >= 0 ? cells[bookIndex] : request.defaultBookName,
      number: numberIndex >= 0 ? cells[numberIndex] : index + 1,
      word: cells[wordIndex] || '',
      definition: cells[meaningIndex] || '',
      exampleSentence: exampleSentenceIndex >= 0 ? cells[exampleSentenceIndex] || '' : undefined,
      exampleMeaning: exampleMeaningIndex >= 0 ? cells[exampleMeaningIndex] || '' : undefined,
      category: categoryIndex >= 0 ? cells[categoryIndex] || '' : undefined,
      subcategory: subcategoryIndex >= 0 ? cells[subcategoryIndex] || '' : undefined,
      section: sectionIndex >= 0 ? cells[sectionIndex] || '' : undefined,
      sourceSheet: sourceSheetIndex >= 0 ? cells[sourceSheetIndex] || '' : undefined,
      sourceEntryId: sourceEntryIdIndex >= 0 ? cells[sourceEntryIdIndex] || '' : undefined,
      partOfSpeech: (partOfSpeechIndex >= 0 ? cells[partOfSpeechIndex] || undefined : undefined) as WordPartOfSpeech | undefined,
      inflections: inflectionsIndex >= 0 ? cells[inflectionsIndex] : undefined,
      pronunciation: pronunciationIndex >= 0 ? cells[pronunciationIndex] : undefined,
      sourceNote: sourceNoteIndex >= 0 ? cells[sourceNoteIndex] : undefined,
    }, request.defaultBookName, index + 2);
    if (normalized.warning) warnings.push(normalized.warning);
    return normalized.row ? [normalized.row] : [];
  });

  return { rows, warnings };
};

export const normalizeCatalogImportRows = normalizeCatalogImport;

// Equal headwords/meanings may still be distinct examples, senses, or sources.
export const catalogRowsAreEquivalent = (left: Partial<NormalizedCatalogImportRow>, right: Partial<NormalizedCatalogImportRow>): boolean => (
  ['word', 'definition', 'exampleSentence', 'exampleMeaning', 'partOfSpeech', 'inflections', 'pronunciation', 'sourceNote', 'category', 'subcategory', 'section', 'sourceSheet', 'sourceEntryId']
    .every((field) => String(left[field] ?? '').trim() === String(right[field] ?? '').trim())
);
