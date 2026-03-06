import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const DEFAULT_EXCLUDED_BOOKS = new Set(['TOEFLテスト英単語3800']);
const DEFAULT_LICENSED_INPUT = '/Users/Yodai/projects/language_database_2_2/output_curated/20260208_225334/MASTER_DATABASE_REFINED.csv';
const DEFAULT_ORIGINAL_INPUT = '/Users/Yodai/projects/NanjyoEnglishApp/docs/wordbank_pos_audit/20260208_225334/ORIGINAL_WORDBANK_JHS_HS_FINAL_CONFIRMED.csv';
const DEFAULT_OUTPUT = './tmp/d1-seed.sql';
const DEFAULT_CATALOG_SOURCE = 'LICENSED_PARTNER';
const DEFAULT_ACCESS_SCOPE = 'BUSINESS_ONLY';

const excludedBooks = new Set(DEFAULT_EXCLUDED_BOOKS);
const positionalArgs = [];
const originalCsvs = [];
const licensedCsvs = [];
const genericInputs = [];
let remoteMode = false;
let fallbackCatalogSource = DEFAULT_CATALOG_SOURCE;
let fallbackAccessScope = DEFAULT_ACCESS_SCOPE;

for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === '--remote') {
    remoteMode = true;
    continue;
  }
  if (value === '--exclude-book') {
    const bookName = args[index + 1];
    if (!bookName) {
      throw new Error('--exclude-book requires a book title');
    }
    excludedBooks.add(bookName);
    index += 1;
    continue;
  }
  if (value === '--catalog-source') {
    fallbackCatalogSource = args[index + 1] || DEFAULT_CATALOG_SOURCE;
    index += 1;
    continue;
  }
  if (value === '--access-scope') {
    fallbackAccessScope = args[index + 1] || DEFAULT_ACCESS_SCOPE;
    index += 1;
    continue;
  }
  if (value === '--original-csv') {
    const csvPath = args[index + 1];
    if (!csvPath) {
      throw new Error('--original-csv requires a file path');
    }
    originalCsvs.push(path.resolve(csvPath));
    index += 1;
    continue;
  }
  if (value === '--licensed-csv') {
    const csvPath = args[index + 1];
    if (!csvPath) {
      throw new Error('--licensed-csv requires a file path');
    }
    licensedCsvs.push(path.resolve(csvPath));
    index += 1;
    continue;
  }
  if (value === '--input') {
    const csvPath = args[index + 1];
    if (!csvPath) {
      throw new Error('--input requires a file path');
    }
    genericInputs.push(path.resolve(csvPath));
    index += 1;
    continue;
  }
  positionalArgs.push(value);
}

const datasets = [];
let outputPath = path.resolve(DEFAULT_OUTPUT);

if (originalCsvs.length === 0 && licensedCsvs.length === 0 && genericInputs.length === 0) {
  datasets.push({
    inputPath: path.resolve(positionalArgs[0] || DEFAULT_LICENSED_INPUT),
    catalogSource: fallbackCatalogSource,
    accessScope: fallbackAccessScope,
  });
  outputPath = path.resolve(positionalArgs[1] || DEFAULT_OUTPUT);
} else {
  originalCsvs.forEach((inputPath) => {
    datasets.push({
      inputPath,
      catalogSource: 'STEADY_STUDY_ORIGINAL',
      accessScope: 'BUSINESS_ONLY',
    });
  });
  licensedCsvs.forEach((inputPath) => {
    datasets.push({
      inputPath,
      catalogSource: 'LICENSED_PARTNER',
      accessScope: 'BUSINESS_ONLY',
    });
  });
  genericInputs.forEach((inputPath) => {
    datasets.push({
      inputPath,
      catalogSource: fallbackCatalogSource,
      accessScope: fallbackAccessScope,
    });
  });

  if (datasets.length === 0) {
    datasets.push({
      inputPath: path.resolve(DEFAULT_LICENSED_INPUT),
      catalogSource: DEFAULT_CATALOG_SOURCE,
      accessScope: DEFAULT_ACCESS_SCOPE,
    });
  }

  if (positionalArgs.length > 1) {
    throw new Error('When using --original-csv / --licensed-csv / --input, only the output path may be positional.');
  }

  outputPath = path.resolve(positionalArgs[0] || DEFAULT_OUTPUT);
}

const slugifySegment = (value) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')
  .slice(0, 48);

const hashString = (value) => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const createBookId = (bookName, catalogSource) => {
  const slug = slugifySegment(bookName) || 'book';
  return `${slug}-${hashString(`official:${catalogSource}:${bookName}`)}`;
};

const parseCsv = (content) => {
  let text = content;
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const rows = [];
  const lines = [];
  let currentRow = [];
  let currentValue = '';
  let inQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuote) {
      if (char === '"' && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else if (char === '"') {
        inQuote = false;
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
    } else if (char === ',') {
      currentRow.push(currentValue);
      currentValue = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && nextChar === '\n') index += 1;
      currentRow.push(currentValue);
      if (currentRow.length > 1 || currentRow[0] !== '') {
        lines.push(currentRow);
      }
      currentRow = [];
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  if (currentValue || currentRow.length > 0) {
    currentRow.push(currentValue);
    lines.push(currentRow);
  }

  if (lines.length < 2) return [];

  const headers = lines[0];
  for (let index = 1; index < lines.length; index += 1) {
    const values = lines[index];
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || '';
    });
    rows.push(row);
  }

  return rows;
};

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
};

const getDatasetLabel = (catalogSource) => {
  if (catalogSource === 'STEADY_STUDY_ORIGINAL') return 'Steady Study Original';
  if (catalogSource === 'LICENSED_PARTNER') return 'Licensed Partner Catalog';
  return 'Imported Catalog';
};

const getFormat = (rows) => {
  const sample = rows[0] || {};
  if ('headword' in sample || 'meaning_ja_short' in sample) {
    return 'ORIGINAL_WORDBANK';
  }
  return 'BOOK_CSV';
};

const grouped = new Map();
let totalImportedWords = 0;

for (const dataset of datasets) {
  const content = await fs.readFile(dataset.inputPath, 'utf8');
  const rows = parseCsv(content);

  if (rows.length === 0) {
    throw new Error(`No rows found in ${dataset.inputPath}`);
  }

  const format = getFormat(rows);
  const datasetLabel = getDatasetLabel(dataset.catalogSource);
  const inputBasename = path.basename(dataset.inputPath);

  rows.forEach((row, index) => {
    const isOriginalWordbank = format === 'ORIGINAL_WORDBANK';
    const bookName = isOriginalWordbank
      ? (row['grade_bucket_default_label'] || row['stage_label'] || `${datasetLabel} Imported`).trim()
      : (row['単語帳名'] || row['BookName'] || row['book_name'] || 'Imported').trim();
    if (!bookName || excludedBooks.has(bookName)) return;

    const word = isOriginalWordbank
      ? (row['headword'] || row['headword_norm'] || '').trim()
      : (row['単語'] || row['Word'] || '').trim();
    const definition = isOriginalWordbank
      ? (row['meaning_ja_short'] || row['meaning_ja'] || '').trim()
      : (row['日本語訳'] || row['Meaning'] || '').trim();
    if (!word || !definition) return;

    const groupKey = `${dataset.catalogSource}:${bookName}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        id: createBookId(bookName, dataset.catalogSource),
        title: bookName,
        catalogSource: dataset.catalogSource,
        accessScope: dataset.accessScope,
        description: isOriginalWordbank
          ? `Nanjyo English App のオリジナル単語データベースを ${bookName} 向けに再編成`
          : `${datasetLabel} として ${inputBasename} から投入`,
        sourceContext: isOriginalWordbank
          ? `Nanjyo English App / ${row['stage_label'] || 'Original Wordbank'}`
          : inputBasename,
        sortOrder: isOriginalWordbank
          ? Number.parseInt(row['grade_bucket_default_order'] || row['group_order'] || String(grouped.size + 1), 10) || grouped.size + 1
          : grouped.size + 1,
        words: [],
      });
    }

    const group = grouped.get(groupKey);
    const number = group.words.length + 1;
    const searchKey = isOriginalWordbank
      ? (row['headword_norm'] || word).trim().toLowerCase()
      : word.toLowerCase();
    const wordIdSuffix = row['entry_id'] || row['source_primary_number'] || row['単語番号'] || number;

    group.words.push({
      id: `${group.id}_${wordIdSuffix}_${index}`,
      bookId: group.id,
      number,
      word,
      definition,
      searchKey,
    });
    totalImportedWords += 1;
  });
}

if (grouped.size === 0 || totalImportedWords === 0) {
  throw new Error('No importable rows were found after filtering.');
}

const now = Date.now();
const lines = [
  '-- Generated by scripts/build-seed-sql.mjs',
  'DELETE FROM word_reports;',
  'DELETE FROM learning_histories;',
  'DELETE FROM words;',
  'DELETE FROM books;',
];

if (!remoteMode) {
  lines.splice(1, 0, 'BEGIN TRANSACTION;');
}

for (const group of [...grouped.values()].sort((left, right) => {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return left.title.localeCompare(right.title, 'ja');
})) {
  lines.push(
    `INSERT INTO books (id, title, word_count, is_priority, description, source_context, created_by, catalog_source, access_scope, created_at, updated_at) VALUES (${sqlValue(group.id)}, ${sqlValue(group.title)}, ${group.words.length}, ${/duo/i.test(group.title) ? 1 : 0}, ${sqlValue(group.description)}, ${sqlValue(group.sourceContext)}, NULL, ${sqlValue(group.catalogSource)}, ${sqlValue(group.accessScope)}, ${now}, ${now});`
  );

  group.words.forEach((word) => {
    lines.push(
      `INSERT INTO words (id, book_id, word_number, word, definition, search_key, example_sentence, example_meaning, is_reported, created_at, updated_at) VALUES (${sqlValue(word.id)}, ${sqlValue(word.bookId)}, ${word.number}, ${sqlValue(word.word)}, ${sqlValue(word.definition)}, ${sqlValue(word.searchKey)}, NULL, NULL, 0, ${now}, ${now});`
    );
  });
}

if (!remoteMode) {
  lines.push('COMMIT;');
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`Generated ${outputPath}`);
console.log(`Books: ${grouped.size}`);
console.log(`Words: ${Array.from(grouped.values()).reduce((sum, group) => sum + group.words.length, 0)}`);
console.log(`Mode: ${remoteMode ? 'remote' : 'local'}`);
console.log(`Datasets: ${datasets.map((dataset) => `${path.basename(dataset.inputPath)} [${dataset.catalogSource}/${dataset.accessScope}]`).join(', ')}`);
console.log(`Excluded books: ${Array.from(excludedBooks).join(', ') || '(none)'}`);
