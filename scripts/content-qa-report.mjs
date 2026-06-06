#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SENTINELS = Object.freeze([
  '[未抽出]',
  '[要確認]',
  '未抽出',
  '要確認',
  '未設定',
  'TODO',
  'TBD',
  'N/A',
  'n/a',
]);

const QA_FIELDS = Object.freeze([
  'headword',
  'definition',
  'exampleSentence',
  'exampleMeaning',
  'category',
  'sourceSheet',
  'sourceEntryId',
]);

const FIELD_ALIASES = Object.freeze({
  bookId: ['bookId', 'book_id', 'bookID', '教材ID', '単語帳ID'],
  bookName: ['bookName', 'bookTitle', 'book', 'title', 'book_name', 'book_title', '教材名', '単語帳名'],
  number: ['number', 'no', 'num', 'wordNumber', 'word_number', '番号'],
  headword: ['headword', 'word', 'wordText', 'word_text', 'term', 'english', '英単語', '単語'],
  definition: ['definition', 'meaning', 'ja', 'japanese', '日本語訳', '意味'],
  exampleSentence: ['exampleSentence', 'example_sentence', 'example', 'sentence', '英文例文', '例文'],
  exampleMeaning: ['exampleMeaning', 'example_meaning', 'exampleJa', 'example_ja', '例文訳', '例文日本語訳'],
  category: ['category', 'カテゴリ', '大分類'],
  subcategory: ['subcategory', 'sub_category', '小分類'],
  section: ['section', 'セクション'],
  sourceSheet: ['sourceSheet', 'source_sheet', 'sheet', 'source', 'sourceName', 'source_name', '出典シート', 'シート', '出典'],
  sourceEntryId: ['sourceEntryId', 'source_entry_id', 'sourceId', 'source_id', 'entryId', 'entry_id', '出典番号'],
});

const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\u3000/g, ' ')
    .trim();
};

const normalizeLookupKey = (value) => normalizeText(value)
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\s+/g, ' ');

const normalizeHeaderKey = (value) => normalizeText(value)
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const normalizedAliasSet = (aliases) => new Set(aliases.map(normalizeHeaderKey));

const NORMALIZED_FIELD_ALIASES = Object.freeze(
  Object.fromEntries(Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, normalizedAliasSet(aliases)])),
);

const readField = (row, field) => {
  if (!row || typeof row !== 'object') return undefined;
  const aliases = FIELD_ALIASES[field] || [];

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }

  const normalizedAliases = NORMALIZED_FIELD_ALIASES[field] || new Set();
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeaderKey(key))) return value;
  }

  return undefined;
};

const parseMaybeNumber = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const rate = (value, total) => (total > 0 ? Number((value / total).toFixed(4)) : null);

const parseCsvLine = (line) => {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

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

    current += char;
  }

  cells.push(current);
  return cells;
};

const findHeaderIndex = (headers, field) => {
  const aliases = NORMALIZED_FIELD_ALIASES[field] || new Set();
  return headers.findIndex((header) => aliases.has(header));
};

const hasHeaderSignal = (headers) => headers.some((header) => (
  Object.values(NORMALIZED_FIELD_ALIASES).some((aliases) => aliases.has(header))
));

const looksLikePositionalDataRow = (cells) => {
  const numberCell = normalizeText(cells[1]);
  const wordCell = normalizeText(cells[2]);
  const definitionCell = normalizeText(cells[3]);
  return cells.length >= 4 && /^\d+$/.test(numberCell) && Boolean(wordCell || definitionCell);
};

const rowFromPositionalCells = (cells, index, defaultBookName) => ({
  bookName: cells[0] || defaultBookName,
  number: cells[1] || index + 1,
  word: cells[2] || '',
  definition: cells[3] || '',
  exampleSentence: cells[4] || '',
  exampleMeaning: cells[5] || '',
  category: cells[6] || '',
  subcategory: cells[7] || '',
  section: cells[8] || '',
  sourceSheet: cells[9] || '',
  sourceEntryId: cells[10] || '',
});

export const rowsFromCsvText = (csvText, options = {}) => {
  const defaultBookName = normalizeText(options.defaultBookName || 'Imported');
  const lines = normalizeText(csvText)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];

  const firstCells = parseCsvLine(lines[0]);
  const headers = firstCells.map(normalizeHeaderKey);
  const shouldUseHeaderRow = hasHeaderSignal(headers) && !looksLikePositionalDataRow(firstCells);

  if (!shouldUseHeaderRow) {
    return lines.map((line, index) => rowFromPositionalCells(parseCsvLine(line), index, defaultBookName));
  }

  const headerIndexes = Object.fromEntries(
    Object.keys(FIELD_ALIASES).map((field) => [field, findHeaderIndex(headers, field)]),
  );

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const row = {};
    for (const [field, headerIndex] of Object.entries(headerIndexes)) {
      if (headerIndex >= 0) row[field === 'headword' ? 'word' : field] = cells[headerIndex] || '';
    }
    if (!normalizeText(row.bookName)) row.bookName = defaultBookName;
    if (!normalizeText(row.number)) row.number = index + 1;
    return row;
  });
};

const rowsFromBooksWithNestedWords = (books, defaultBookName) => books.flatMap((book) => {
  const words = Array.isArray(book?.words) ? book.words : [];
  const bookId = normalizeText(readField(book, 'bookId') || book.id);
  const bookName = normalizeText(readField(book, 'bookName') || book.name || book.title || defaultBookName);
  return words.map((word, index) => ({
    ...word,
    bookId: readField(word, 'bookId') || bookId,
    bookName: readField(word, 'bookName') || bookName,
    number: readField(word, 'number') || index + 1,
  }));
});

const rowsFromWordsWithBooks = (words, books, defaultBookName) => {
  const booksById = new Map((Array.isArray(books) ? books : []).map((book) => {
    const id = normalizeText(readField(book, 'bookId') || book.id);
    return [id, book];
  }).filter(([id]) => Boolean(id)));

  return words.map((word, index) => {
    const bookId = normalizeText(readField(word, 'bookId'));
    const book = booksById.get(bookId);
    const bookName = normalizeText(
      readField(word, 'bookName')
      || readField(book, 'bookName')
      || book?.name
      || book?.title
      || defaultBookName
      || bookId,
    );

    return {
      ...word,
      bookId,
      bookName,
      number: readField(word, 'number') || index + 1,
    };
  });
};

export const rowsFromJsonPayload = (payload) => {
  const defaultBookName = normalizeText(payload?.defaultBookName || payload?.bookName || payload?.bookTitle || 'Imported');

  if (Array.isArray(payload)) return payload;

  if (payload?.source?.kind === 'rows' && Array.isArray(payload.source.rows)) {
    return payload.source.rows.map((row) => ({
      ...row,
      bookName: readField(row, 'bookName') || defaultBookName,
    }));
  }

  if (payload?.source?.kind === 'csv' && typeof payload.source.csvText === 'string') {
    return rowsFromCsvText(payload.source.csvText, { defaultBookName });
  }

  if (Array.isArray(payload?.importRows)) return payload.importRows;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.words)) return rowsFromWordsWithBooks(payload.words, payload.books, defaultBookName);
  if (Array.isArray(payload?.books)) return rowsFromBooksWithNestedWords(payload.books, defaultBookName);

  throw new Error('JSON input must be an array, {rows}, {importRows}, {words}, {books, words}, or CatalogImportRequest-like object.');
};

const rowsFromSheetMatrix = (rows, options = {}) => {
  const defaultBookName = normalizeText(options.defaultBookName || 'Imported');
  const sheetName = normalizeText(options.sheetName || '');
  const nonEmptyRows = rows.filter((row) => Array.isArray(row) && row.some((cell) => normalizeText(cell)));
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map(normalizeHeaderKey);
  const shouldUseHeaderRow = hasHeaderSignal(headers) && !looksLikePositionalDataRow(nonEmptyRows[0]);

  if (!shouldUseHeaderRow) {
    return nonEmptyRows.map((row, index) => ({
      ...rowFromPositionalCells(row, index, defaultBookName),
      sourceSheet: row[9] || sheetName,
    }));
  }

  const headerIndexes = Object.fromEntries(
    Object.keys(FIELD_ALIASES).map((field) => [field, findHeaderIndex(headers, field)]),
  );

  return nonEmptyRows.slice(1).map((row, index) => {
    const result = {};
    for (const [field, headerIndex] of Object.entries(headerIndexes)) {
      if (headerIndex >= 0) result[field === 'headword' ? 'word' : field] = row[headerIndex] || '';
    }
    if (!normalizeText(result.bookName)) result.bookName = defaultBookName;
    if (!normalizeText(result.number)) result.number = index + 1;
    if (!normalizeText(result.sourceSheet)) result.sourceSheet = sheetName;
    return result;
  });
};

const rowsFromXlsxFile = async (inputPath, options = {}) => {
  const XLSXImport = await import('xlsx');
  const XLSX = XLSXImport?.default ?? XLSXImport;
  const workbook = XLSX.readFile(inputPath, { cellText: false });
  const sheetEntries = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: null,
      blankrows: true,
    }),
  }));

  try {
    const { parseNounWorkbookSheets } = await import('../utils/nounWorkbookImport.js');
    const parsed = parseNounWorkbookSheets(sheetEntries);
    if (Array.isArray(parsed.importRows) && parsed.importRows.length > 0) {
      return parsed.importRows;
    }
  } catch {
    // Fall back to generic sheet parsing below.
  }

  return sheetEntries.flatMap((sheet) => rowsFromSheetMatrix(sheet.rows, {
    defaultBookName: options.defaultBookName || path.basename(inputPath, path.extname(inputPath)),
    sheetName: sheet.name,
  }));
};

const detectFormat = (inputPath, requestedFormat) => {
  if (requestedFormat && requestedFormat !== 'auto') return requestedFormat;
  const extension = path.extname(inputPath || '').toLowerCase();
  if (extension === '.json') return 'json';
  if (extension === '.csv') return 'csv';
  if (extension === '.xlsx' || extension === '.xls') return 'xlsx';
  return 'auto';
};

export const loadContentQaRows = async ({ inputPath, format = 'auto', stdinText, defaultBookName } = {}) => {
  const resolvedFormat = detectFormat(inputPath, format);
  const readText = async () => (
    stdinText !== undefined
      ? stdinText
      : fs.readFile(inputPath, 'utf8')
  );

  if (resolvedFormat === 'xlsx') {
    if (!inputPath || inputPath === '-') throw new Error('XLSX input requires a file path.');
    return rowsFromXlsxFile(inputPath, { defaultBookName });
  }

  const text = await readText();

  if (resolvedFormat === 'json') return rowsFromJsonPayload(JSON.parse(text));
  if (resolvedFormat === 'csv') return rowsFromCsvText(text, { defaultBookName });

  try {
    return rowsFromJsonPayload(JSON.parse(text));
  } catch (jsonError) {
    const csvRows = rowsFromCsvText(text, { defaultBookName });
    if (csvRows.length > 0) return csvRows;
    throw jsonError;
  }
};

const normalizeContentQaRows = (rawRows, options = {}) => rawRows.map((rawRow, index) => {
  const bookId = normalizeText(readField(rawRow, 'bookId'));
  const bookName = normalizeText(readField(rawRow, 'bookName') || options.defaultBookName || bookId || 'Unassigned');
  const sourceEntryIdRaw = readField(rawRow, 'sourceEntryId');

  return {
    rowNumber: index + 1,
    bookKey: bookId || bookName || 'Unassigned',
    bookId: bookId || null,
    bookName,
    number: parseMaybeNumber(readField(rawRow, 'number')) || index + 1,
    headword: normalizeText(readField(rawRow, 'headword')),
    definition: normalizeText(readField(rawRow, 'definition')),
    exampleSentence: normalizeText(readField(rawRow, 'exampleSentence')),
    exampleMeaning: normalizeText(readField(rawRow, 'exampleMeaning')),
    category: normalizeText(readField(rawRow, 'category')),
    subcategory: normalizeText(readField(rawRow, 'subcategory')),
    section: normalizeText(readField(rawRow, 'section')),
    sourceSheet: normalizeText(readField(rawRow, 'sourceSheet')),
    sourceEntryId: normalizeText(sourceEntryIdRaw),
  };
});

const createBookReport = (row) => ({
  bookId: row.bookId,
  bookName: row.bookName,
  rowCount: 0,
  wordCount: 0,
  blankFields: {
    rowsWithAnyBlank: 0,
    rowsWithRequiredBlank: 0,
    fields: Object.fromEntries(QA_FIELDS.map((field) => [field, 0])),
    samples: [],
  },
  sentinelValues: {
    count: 0,
    rowsWithSentinel: 0,
    fields: {},
    samples: [],
  },
  duplicates: {
    duplicateHeadwordCount: 0,
    duplicateRowCount: 0,
    headwords: [],
  },
  examples: {
    withExampleSentence: 0,
    missingExampleSentence: 0,
    withExampleMeaning: 0,
    missingExampleMeaning: 0,
    withCompleteExamplePair: 0,
    sentenceCoverageRate: null,
    meaningCoverageRate: null,
    completePairCoverageRate: null,
  },
  categoryCoverage: {
    withCategory: 0,
    missingCategory: 0,
    withSubcategory: 0,
    missingSubcategory: 0,
    coverageRate: null,
    subcategoryCoverageRate: null,
    uniqueCategoryCount: 0,
    uniqueSubcategoryCount: 0,
    categories: [],
    subcategories: [],
  },
  sourceCoverage: {
    withSourceSheet: 0,
    missingSourceSheet: 0,
    withSourceEntryId: 0,
    missingSourceEntryId: 0,
    withAnySource: 0,
    missingAnySource: 0,
    sheetCoverageRate: null,
    entryIdCoverageRate: null,
    anySourceCoverageRate: null,
    uniqueSourceSheetCount: 0,
    sourceSheets: [],
  },
  _headwords: new Map(),
  _categories: new Map(),
  _subcategories: new Map(),
  _sourceSheets: new Map(),
});

const incrementMap = (map, key) => {
  const safeKey = normalizeText(key) || 'Unspecified';
  map.set(safeKey, (map.get(safeKey) || 0) + 1);
};

const sortedCountEntries = (map, keyName, limit) => [...map.entries()]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ja'))
  .slice(0, limit)
  .map(([key, count]) => ({ [keyName]: key, wordCount: count }));

const createSentinelMatcher = (sentinels) => {
  const tokens = sentinels
    .map((sentinel) => normalizeText(sentinel).normalize('NFKC'))
    .filter(Boolean);

  return (value) => {
    const text = normalizeText(value);
    if (!text) return null;
    const normalized = text.normalize('NFKC').trim();
    const normalizedLower = normalized.toLowerCase();

    return tokens.find((token) => {
      const tokenLower = token.toLowerCase();
      if (normalizedLower === tokenLower) return true;
      const canMatchSubstring = token.includes('[') || token.includes('未抽出') || token.includes('要確認');
      return canMatchSubstring && normalizedLower.includes(tokenLower);
    }) || null;
  };
};

const finalizeBookReport = (book, options) => {
  const detailLimit = options.detailLimit ?? 100;

  const duplicateHeadwords = [...book._headwords.values()]
    .filter((entry) => entry.count > 1)
    .sort((left, right) => right.count - left.count || left.headword.localeCompare(right.headword, 'en'))
    .map((entry) => ({
      headword: entry.headword,
      count: entry.count,
      rowNumbers: entry.rowNumbers,
    }));

  book.duplicates.duplicateHeadwordCount = duplicateHeadwords.length;
  book.duplicates.duplicateRowCount = duplicateHeadwords.reduce((total, entry) => total + entry.count - 1, 0);
  book.duplicates.headwords = duplicateHeadwords.slice(0, detailLimit);

  book.examples.missingExampleSentence = book.rowCount - book.examples.withExampleSentence;
  book.examples.missingExampleMeaning = book.rowCount - book.examples.withExampleMeaning;
  book.examples.sentenceCoverageRate = rate(book.examples.withExampleSentence, book.rowCount);
  book.examples.meaningCoverageRate = rate(book.examples.withExampleMeaning, book.rowCount);
  book.examples.completePairCoverageRate = rate(book.examples.withCompleteExamplePair, book.rowCount);

  book.categoryCoverage.missingCategory = book.rowCount - book.categoryCoverage.withCategory;
  book.categoryCoverage.missingSubcategory = book.rowCount - book.categoryCoverage.withSubcategory;
  book.categoryCoverage.coverageRate = rate(book.categoryCoverage.withCategory, book.rowCount);
  book.categoryCoverage.subcategoryCoverageRate = rate(book.categoryCoverage.withSubcategory, book.rowCount);
  book.categoryCoverage.uniqueCategoryCount = book._categories.size;
  book.categoryCoverage.uniqueSubcategoryCount = book._subcategories.size;
  book.categoryCoverage.categories = sortedCountEntries(book._categories, 'category', detailLimit);
  book.categoryCoverage.subcategories = sortedCountEntries(book._subcategories, 'subcategory', detailLimit);

  book.sourceCoverage.missingSourceSheet = book.rowCount - book.sourceCoverage.withSourceSheet;
  book.sourceCoverage.missingSourceEntryId = book.rowCount - book.sourceCoverage.withSourceEntryId;
  book.sourceCoverage.missingAnySource = book.rowCount - book.sourceCoverage.withAnySource;
  book.sourceCoverage.sheetCoverageRate = rate(book.sourceCoverage.withSourceSheet, book.rowCount);
  book.sourceCoverage.entryIdCoverageRate = rate(book.sourceCoverage.withSourceEntryId, book.rowCount);
  book.sourceCoverage.anySourceCoverageRate = rate(book.sourceCoverage.withAnySource, book.rowCount);
  book.sourceCoverage.uniqueSourceSheetCount = book._sourceSheets.size;
  book.sourceCoverage.sourceSheets = sortedCountEntries(book._sourceSheets, 'sourceSheet', detailLimit);

  delete book._headwords;
  delete book._categories;
  delete book._subcategories;
  delete book._sourceSheets;

  return book;
};

export const generateContentQaReport = (rawRows, options = {}) => {
  if (!Array.isArray(rawRows)) throw new Error('generateContentQaReport expects an array of rows.');

  const rows = normalizeContentQaRows(rawRows, options);
  const sampleLimit = options.sampleLimit ?? 20;
  const sentinelMatcher = createSentinelMatcher(options.sentinels || DEFAULT_SENTINELS);
  const booksByKey = new Map();

  rows.forEach((row) => {
    if (!booksByKey.has(row.bookKey)) booksByKey.set(row.bookKey, createBookReport(row));
    const book = booksByKey.get(row.bookKey);
    const emptyFields = QA_FIELDS.filter((field) => !normalizeText(row[field]));

    book.rowCount += 1;
    if (row.headword) book.wordCount += 1;

    if (emptyFields.length > 0) {
      book.blankFields.rowsWithAnyBlank += 1;
      emptyFields.forEach((field) => {
        book.blankFields.fields[field] += 1;
      });
      if (book.blankFields.samples.length < sampleLimit) {
        book.blankFields.samples.push({
          rowNumber: row.rowNumber,
          number: row.number,
          headword: row.headword,
          fields: emptyFields,
        });
      }
    }

    if (!row.headword || !row.definition) book.blankFields.rowsWithRequiredBlank += 1;

    const sentinelMatches = QA_FIELDS.flatMap((field) => {
      const sentinel = sentinelMatcher(row[field]);
      return sentinel ? [{ field, sentinel }] : [];
    });
    if (sentinelMatches.length > 0) {
      book.sentinelValues.rowsWithSentinel += 1;
    }
    sentinelMatches.forEach(({ field, sentinel }) => {
      book.sentinelValues.count += 1;
      book.sentinelValues.fields[field] = (book.sentinelValues.fields[field] || 0) + 1;
      if (book.sentinelValues.samples.length < sampleLimit) {
        book.sentinelValues.samples.push({
          rowNumber: row.rowNumber,
          number: row.number,
          headword: row.headword,
          field,
          value: row[field],
          sentinel,
        });
      }
    });

    if (row.headword) {
      const headwordKey = normalizeLookupKey(row.headword);
      const current = book._headwords.get(headwordKey) || {
        headword: row.headword,
        count: 0,
        rowNumbers: [],
      };
      current.count += 1;
      current.rowNumbers.push(row.rowNumber);
      book._headwords.set(headwordKey, current);
    }

    if (row.exampleSentence) book.examples.withExampleSentence += 1;
    if (row.exampleMeaning) book.examples.withExampleMeaning += 1;
    if (row.exampleSentence && row.exampleMeaning) book.examples.withCompleteExamplePair += 1;

    if (row.category) {
      book.categoryCoverage.withCategory += 1;
      incrementMap(book._categories, row.category);
    }
    if (row.subcategory) {
      book.categoryCoverage.withSubcategory += 1;
      incrementMap(book._subcategories, row.subcategory);
    }

    if (row.sourceSheet) {
      book.sourceCoverage.withSourceSheet += 1;
      incrementMap(book._sourceSheets, row.sourceSheet);
    }
    if (row.sourceEntryId) book.sourceCoverage.withSourceEntryId += 1;
    if (row.sourceSheet || row.sourceEntryId) book.sourceCoverage.withAnySource += 1;
  });

  const books = [...booksByKey.values()]
    .sort((left, right) => left.bookName.localeCompare(right.bookName, 'ja') || String(left.bookId || '').localeCompare(String(right.bookId || '')))
    .map((book) => finalizeBookReport(book, options));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      bookCount: books.length,
      rowCount: books.reduce((total, book) => total + book.rowCount, 0),
      wordCount: books.reduce((total, book) => total + book.wordCount, 0),
      rowsWithAnyBlank: books.reduce((total, book) => total + book.blankFields.rowsWithAnyBlank, 0),
      rowsWithRequiredBlank: books.reduce((total, book) => total + book.blankFields.rowsWithRequiredBlank, 0),
      sentinelValueCount: books.reduce((total, book) => total + book.sentinelValues.count, 0),
      rowsWithSentinel: books.reduce((total, book) => total + book.sentinelValues.rowsWithSentinel, 0),
      duplicateHeadwordCount: books.reduce((total, book) => total + book.duplicates.duplicateHeadwordCount, 0),
      duplicateRowCount: books.reduce((total, book) => total + book.duplicates.duplicateRowCount, 0),
    },
    sentinelValues: {
      defaults: [...DEFAULT_SENTINELS],
      active: [...(options.sentinels || DEFAULT_SENTINELS)],
    },
    books,
  };
};

const usage = () => `Usage: node scripts/content-qa-report.mjs --input <path|-> [--format json|csv|xlsx|auto] [--output report.json]

Reads JSON rows, CatalogImportRequest-like JSON, {books, words} JSON, CSV, or XLSX and prints a book-level content QA report as JSON.
Options:
  -i, --input <path|->       Input file path, or - for stdin.
  -f, --format <format>      auto, json, csv, or xlsx. Default: auto.
  -o, --output <path>        Write JSON to a file instead of stdout.
  --default-book-name <name> Default book name for sources without book metadata.
  --sentinel <value>         Add a sentinel value to detect. Can be repeated.
  --sample-limit <number>    Max blank/sentinel samples per book. Default: 20.
  --detail-limit <number>    Max category/source/duplicate details per book. Default: 100.
  --compact                  Print compact JSON.
  --help                     Show this help.
`;

export const parseCliArgs = (argv) => {
  const options = {
    inputPath: null,
    outputPath: null,
    format: 'auto',
    defaultBookName: undefined,
    sentinels: [...DEFAULT_SENTINELS],
    sampleLimit: 20,
    detailLimit: 100,
    pretty: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input' || arg === '-i') {
      options.inputPath = nextValue();
    } else if (arg === '--format' || arg === '-f') {
      options.format = nextValue();
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = nextValue();
    } else if (arg === '--default-book-name') {
      options.defaultBookName = nextValue();
    } else if (arg === '--sentinel') {
      options.sentinels.push(nextValue());
    } else if (arg === '--sample-limit') {
      options.sampleLimit = Number.parseInt(nextValue(), 10);
    } else if (arg === '--detail-limit') {
      options.detailLimit = Number.parseInt(nextValue(), 10);
    } else if (arg === '--compact') {
      options.pretty = false;
    } else if (!arg.startsWith('-') && !options.inputPath) {
      options.inputPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.sampleLimit) || options.sampleLimit < 0) {
    throw new Error('--sample-limit must be a non-negative number.');
  }
  if (!Number.isFinite(options.detailLimit) || options.detailLimit < 1) {
    throw new Error('--detail-limit must be a positive number.');
  }

  return options;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

export const runCli = async (argv = process.argv.slice(2)) => {
  const options = parseCliArgs(argv);

  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  if (!options.inputPath) {
    throw new Error('Input is required. Pass --input <path> or --input - for stdin.');
  }

  const rows = await loadContentQaRows({
    inputPath: options.inputPath === '-' ? null : options.inputPath,
    format: options.format,
    stdinText: options.inputPath === '-' ? await readStdin() : undefined,
    defaultBookName: options.defaultBookName,
  });
  const report = generateContentQaReport(rows, options);
  const json = JSON.stringify(report, null, options.pretty ? 2 : 0);

  if (options.outputPath) {
    await fs.writeFile(options.outputPath, `${json}\n`, 'utf8');
  } else {
    process.stdout.write(`${json}\n`);
  }

  return 0;
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
