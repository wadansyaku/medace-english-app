import {
  CatalogImportIssue,
  CatalogImportRequest,
  CatalogImportRow,
} from '../../contracts/storage';

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
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

export interface NormalizedCatalogImportRow {
  bookName: string;
  number: number;
  word: string;
  definition: string;
}

export interface NormalizedCatalogImport {
  rows: NormalizedCatalogImportRow[];
  warnings: CatalogImportIssue[];
}

const normalizeRow = (
  row: CatalogImportRow,
  defaultBookName: string,
  rowNumber: number,
): { row?: NormalizedCatalogImportRow; warning?: CatalogImportIssue } => {
  const bookName = (row.bookName || defaultBookName || 'Imported').trim();
  const word = row.word.trim();
  const definition = row.definition.trim();
  const parsedNumber = Number.parseInt(String(row.number || rowNumber), 10);

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

  return {
    row: {
      bookName,
      number: Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : rowNumber,
      word,
      definition,
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
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      warnings: [{ code: 'EMPTY_PAYLOAD', message: 'CSV に有効なデータがありません。' }],
    };
  }

  const headers = parseCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const bookIndex = headers.indexOf('bookname') >= 0 ? headers.indexOf('bookname') : headers.indexOf('book_name');
  const numberIndex = headers.indexOf('number');
  const wordIndex = headers.indexOf('word');
  const meaningIndex = headers.indexOf('meaning') >= 0 ? headers.indexOf('meaning') : headers.indexOf('definition');

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
  const rows = lines.slice(1).flatMap((line, index) => {
    const cells = parseCsvLine(line);
    const normalized = normalizeRow({
      bookName: bookIndex >= 0 ? cells[bookIndex] : request.defaultBookName,
      number: numberIndex >= 0 ? cells[numberIndex] : index + 1,
      word: cells[wordIndex] || '',
      definition: cells[meaningIndex] || '',
    }, request.defaultBookName, index + 2);
    if (normalized.warning) warnings.push(normalized.warning);
    return normalized.row ? [normalized.row] : [];
  });

  return { rows, warnings };
};
