import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const DEFAULT_EXCLUDED_BOOKS = new Set(['TOEFLテスト英単語3800']);
const DEFAULT_LICENSED_INPUT = '/Users/Yodai/projects/language_database_2_2/output_curated/20260208_225334/MASTER_DATABASE_REFINED.csv';
const DEFAULT_OUTPUT = './tmp/d1-seed.sql';
const DEFAULT_CATALOG_SOURCE = 'LICENSED_PARTNER';
const DEFAULT_ACCESS_SCOPE = 'BUSINESS_ONLY';
const DEFAULT_ORIGINAL_CATALOG_SOURCE = 'STEADY_STUDY_ORIGINAL';
const DEFAULT_ORIGINAL_ACCESS_SCOPE = 'BUSINESS_ONLY';
const DEFAULT_LICENSED_CATALOG_SOURCE = 'LICENSED_PARTNER';
const DEFAULT_LICENSED_ACCESS_SCOPE = 'BUSINESS_ONLY';
const BLOCKED_CONTENT_MARKERS = [
  '[未抽出]',
];
const CSV_HEADER_ALIASES = {
  word: ['単語', 'Word', 'word', 'headword', 'headword_norm'],
  definition: ['日本語訳', 'Meaning', 'meaning', 'definition', 'meaning_ja_short', 'meaning_ja'],
  exampleSentence: ['exampleSentence', 'ExampleSentence', 'example_sentence', '例文', '英文例文', 'example_en'],
  exampleMeaning: ['exampleMeaning', 'ExampleMeaning', 'example_meaning', '例文訳', '例文日本語訳', 'example_ja'],
  category: ['category', 'カテゴリ', '大分類', 'stage_label'],
  subcategory: ['subcategory', '小分類', 'grade_bucket_default_label'],
  section: ['section', 'セクション', 'source_primary_title', 'source_primary_name', 'source_primary_label'],
  sourceSheet: ['sourceSheet', 'source_sheet', 'sheet', 'シート', '出典シート'],
  sourceEntryId: ['sourceEntryId', 'source_entry_id', 'entry_id', 'source_primary_number', '出典番号', 'sourceid', 'source_id'],
};
const BALANCED_ORIGINAL_LEVELS = [
  { title: 'レベル1', audience: '中1目安' },
  { title: 'レベル2', audience: '中2目安' },
  { title: 'レベル3', audience: '中3目安' },
  { title: 'レベル4', audience: '高1目安' },
  { title: 'レベル5', audience: '高2目安' },
  { title: 'レベル6', audience: '高3目安' },
];
const ORIGINAL_STAGE_ORDER = {
  JHS_Foundation: 1,
  HS_Basic: 2,
  HS_Core: 3,
  HS_Advanced: 4,
};

const excludedBooks = new Set(DEFAULT_EXCLUDED_BOOKS);
const positionalArgs = [];
const originalCsvs = [];
const licensedCsvs = [];
const genericInputs = [];
let remoteMode = false;
let fallbackCatalogSource = DEFAULT_CATALOG_SOURCE;
let fallbackAccessScope = DEFAULT_ACCESS_SCOPE;
let originalCatalogSource = DEFAULT_ORIGINAL_CATALOG_SOURCE;
let originalAccessScope = DEFAULT_ORIGINAL_ACCESS_SCOPE;
let licensedCatalogSource = DEFAULT_LICENSED_CATALOG_SOURCE;
let licensedAccessScope = DEFAULT_LICENSED_ACCESS_SCOPE;

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
  if (value === '--original-catalog-source') {
    originalCatalogSource = args[index + 1] || DEFAULT_ORIGINAL_CATALOG_SOURCE;
    index += 1;
    continue;
  }
  if (value === '--licensed-catalog-source') {
    licensedCatalogSource = args[index + 1] || DEFAULT_LICENSED_CATALOG_SOURCE;
    index += 1;
    continue;
  }
  if (value === '--access-scope') {
    fallbackAccessScope = args[index + 1] || DEFAULT_ACCESS_SCOPE;
    index += 1;
    continue;
  }
  if (value === '--original-access-scope') {
    originalAccessScope = args[index + 1] || DEFAULT_ORIGINAL_ACCESS_SCOPE;
    index += 1;
    continue;
  }
  if (value === '--licensed-access-scope') {
    licensedAccessScope = args[index + 1] || DEFAULT_LICENSED_ACCESS_SCOPE;
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
      catalogSource: originalCatalogSource,
      accessScope: originalAccessScope,
    });
  });
  licensedCsvs.forEach((inputPath) => {
    datasets.push({
      inputPath,
      catalogSource: licensedCatalogSource,
      accessScope: licensedAccessScope,
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

const pickFirst = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
};

const normalizeOptionalText = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const normalizeOptionalInteger = (value) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toCoverageRate = (coveredCount, totalCount) => (
  totalCount > 0 ? Math.round((coveredCount / totalCount) * 10000) / 10000 : 0
);

const countDuplicateHeadwords = (words) => {
  const counts = new Map();
  words.forEach((word) => {
    const key = String(word.searchKey || word.word || '').trim().toLowerCase();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
};

const buildMaterialLedgerInsert = (group, now) => {
  const isApprovedOriginal = group.catalogSource === originalCatalogSource || group.catalogSource === DEFAULT_ORIGINAL_CATALOG_SOURCE;
  const sourceCoverageRate = toCoverageRate(
    group.words.filter((word) => word.sourceSheet && Number.isFinite(word.sourceEntryId)).length,
    group.words.length,
  );
  const examplePairCoverageRate = toCoverageRate(
    group.words.filter((word) => word.exampleSentence && word.exampleMeaning).length,
    group.words.length,
  );
  return `INSERT INTO material_source_ledger (source_id, book_id, catalog_source, book_title, edition, rights_status, review_status, source_file, extracted_at, transform_log, content_qa_report, qa_word_count, qa_required_blank_rows, qa_rows_with_sentinel, qa_sentinel_value_count, qa_duplicate_headword_count, qa_source_coverage_rate, qa_example_pair_coverage_rate, notes, created_at, updated_at) VALUES (${sqlValue(`ledger-${group.id}`)}, ${sqlValue(group.id)}, ${sqlValue(group.catalogSource)}, ${sqlValue(group.title)}, 'seed-sql', ${sqlValue(isApprovedOriginal ? 'approved' : 'pending')}, ${sqlValue(isApprovedOriginal ? 'approved' : 'needs_review')}, ${sqlValue(group.sourceContext || 'seed-sql')}, ${sqlValue(new Date(now).toISOString())}, 'scripts/build-seed-sql.mjs', 'seed-sql-inline-content-qa', ${group.words.length}, 0, 0, 0, ${countDuplicateHeadwords(group.words)}, ${sourceCoverageRate}, ${examplePairCoverageRate}, ${sqlValue(isApprovedOriginal ? 'Steady Study original seed. Required fields were normalized and blocked markers were rejected before storage.' : 'Seeded official material registered for review. Rights evidence and source granularity must be approved before Today Focus selection.')}, ${now}, ${now}) ON CONFLICT(book_id) DO UPDATE SET source_id = excluded.source_id, catalog_source = excluded.catalog_source, book_title = excluded.book_title, edition = excluded.edition, rights_status = excluded.rights_status, review_status = excluded.review_status, source_file = excluded.source_file, extracted_at = excluded.extracted_at, transform_log = excluded.transform_log, content_qa_report = excluded.content_qa_report, qa_word_count = excluded.qa_word_count, qa_required_blank_rows = excluded.qa_required_blank_rows, qa_rows_with_sentinel = excluded.qa_rows_with_sentinel, qa_sentinel_value_count = excluded.qa_sentinel_value_count, qa_duplicate_headword_count = excluded.qa_duplicate_headword_count, qa_source_coverage_rate = excluded.qa_source_coverage_rate, qa_example_pair_coverage_rate = excluded.qa_example_pair_coverage_rate, notes = excluded.notes, updated_at = excluded.updated_at;`;
};

const hasBlockedContentMarker = (value) => {
  const normalized = String(value || '').normalize('NFKC').trim();
  return BLOCKED_CONTENT_MARKERS.some((marker) => normalized.includes(marker));
};

const assertAllowedRequiredContent = ({ inputBasename, bookName, rowIndex, word, definition }) => {
  const blockedFields = [
    ['word', word],
    ['definition', definition],
  ].filter(([, value]) => hasBlockedContentMarker(value));

  if (blockedFields.length === 0) return;

  const fieldList = blockedFields.map(([field]) => field).join(', ');
  throw new Error(
    `Blocked content marker found in ${inputBasename} row ${rowIndex + 2} (${bookName}): ${fieldList}. Re-extract the source before building seed SQL.`,
  );
};

const getDatasetLabel = (catalogSource) => {
  if (catalogSource === 'STEADY_STUDY_ORIGINAL') return 'Steady Study Original';
  if (catalogSource === 'LICENSED_PARTNER') return '既存公式教材';
  return '取り込み教材';
};

const buildOfficialBookDescription = (catalogSource, datasetLabel) => {
  if (catalogSource === 'LICENSED_PARTNER') {
    return '既存の公式単語帳をそのまま学習できます。';
  }
  return `${datasetLabel}として登録された教材です。`;
};

const buildOfficialBookSourceContext = (catalogSource, datasetLabel) => {
  if (catalogSource === 'LICENSED_PARTNER') {
    return '既存公式教材';
  }
  return datasetLabel;
};

const getFormat = (rows) => {
  const sample = rows[0] || {};
  if ('headword' in sample || 'meaning_ja_short' in sample) {
    return 'ORIGINAL_WORDBANK';
  }
  return 'BOOK_CSV';
};

const toSortableNumber = (value, fallback = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const rebucketOriginalRows = (rows) => {
  const sortedRows = [...rows].sort((left, right) => {
    const byDefaultOrder = toSortableNumber(left['grade_bucket_default_order']) - toSortableNumber(right['grade_bucket_default_order']);
    if (byDefaultOrder !== 0) return byDefaultOrder;

    const byStage = (ORIGINAL_STAGE_ORDER[left['stage_label']] || 99) - (ORIGINAL_STAGE_ORDER[right['stage_label']] || 99);
    if (byStage !== 0) return byStage;

    const bySourceNumber = toSortableNumber(left['source_primary_number']) - toSortableNumber(right['source_primary_number']);
    if (bySourceNumber !== 0) return bySourceNumber;

    const byBookRank = toSortableNumber(left['book_rank_primary']) - toSortableNumber(right['book_rank_primary']);
    if (byBookRank !== 0) return byBookRank;

    return String(left['headword_norm'] || left['headword'] || '').localeCompare(String(right['headword_norm'] || right['headword'] || ''), 'en');
  });

  const baseSize = Math.floor(sortedRows.length / BALANCED_ORIGINAL_LEVELS.length);
  const remainder = sortedRows.length % BALANCED_ORIGINAL_LEVELS.length;
  const nextRows = [];
  let offset = 0;

  BALANCED_ORIGINAL_LEVELS.forEach((level, index) => {
    const chunkSize = baseSize + (index < remainder ? 1 : 0);
    const chunk = sortedRows.slice(offset, offset + chunkSize);
    offset += chunkSize;

    chunk.forEach((row) => {
      nextRows.push({
        ...row,
        __balancedOriginalTitle: level.title,
        __balancedOriginalAudience: level.audience,
        __balancedOriginalOrder: String(index + 1),
      });
    });
  });

  return nextRows;
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
  const normalizedRows = format === 'ORIGINAL_WORDBANK' ? rebucketOriginalRows(rows) : rows;

  normalizedRows.forEach((row, index) => {
    const isOriginalWordbank = format === 'ORIGINAL_WORDBANK';
    const bookName = isOriginalWordbank
      ? (row.__balancedOriginalTitle || row['grade_bucket_default_label'] || row['stage_label'] || `${datasetLabel} Imported`).trim()
      : (row['単語帳名'] || row['BookName'] || row['book_name'] || 'Imported').trim();
    if (!bookName || excludedBooks.has(bookName)) return;

    const word = isOriginalWordbank
      ? (row['headword'] || row['headword_norm'] || '').trim()
      : (row['単語'] || row['Word'] || '').trim();
    const definition = isOriginalWordbank
      ? (row['meaning_ja_short'] || row['meaning_ja'] || '').trim()
      : (row['日本語訳'] || row['Meaning'] || '').trim();
    if (!word || !definition) return;

    assertAllowedRequiredContent({
      inputBasename,
      bookName,
      rowIndex: index,
      word,
      definition,
    });

    const groupKey = `${dataset.catalogSource}:${bookName}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        id: createBookId(bookName, dataset.catalogSource),
        title: bookName,
        catalogSource: dataset.catalogSource,
        accessScope: dataset.accessScope,
        description: isOriginalWordbank
          ? `オリジナル単語データベースを ${bookName} (${row.__balancedOriginalAudience || row['grade_bucket_default_label'] || row['stage_label'] || '学年別'}) 向けに再編成`
          : buildOfficialBookDescription(dataset.catalogSource, datasetLabel),
        sourceContext: isOriginalWordbank
          ? `オリジナル単語データベース / ${row.__balancedOriginalAudience || row['stage_label'] || 'Original Wordbank'}`
          : buildOfficialBookSourceContext(dataset.catalogSource, datasetLabel),
        sortOrder: isOriginalWordbank
          ? Number.parseInt(row.__balancedOriginalOrder || row['grade_bucket_default_order'] || row['group_order'] || String(grouped.size + 1), 10) || grouped.size + 1
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
    const sourceSheet = normalizeOptionalText(pickFirst(row, CSV_HEADER_ALIASES.sourceSheet)) || inputBasename;

    group.words.push({
      id: `${group.id}_${wordIdSuffix}_${index}`,
      bookId: group.id,
      number,
      word,
      definition,
      searchKey,
      category: normalizeOptionalText(pickFirst(row, CSV_HEADER_ALIASES.category)),
      subcategory: normalizeOptionalText(pickFirst(row, CSV_HEADER_ALIASES.subcategory)),
      section: normalizeOptionalText(pickFirst(row, CSV_HEADER_ALIASES.section)),
      sourceSheet,
      sourceEntryId: normalizeOptionalInteger(pickFirst(row, CSV_HEADER_ALIASES.sourceEntryId)),
      exampleSentence: normalizeOptionalText(pickFirst(row, CSV_HEADER_ALIASES.exampleSentence)),
      exampleMeaning: normalizeOptionalText(pickFirst(row, CSV_HEADER_ALIASES.exampleMeaning)),
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
  'DELETE FROM material_source_ledger;',
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
  lines.push(buildMaterialLedgerInsert(group, now));

  group.words.forEach((word) => {
    lines.push(
      `INSERT INTO words (id, book_id, word_number, word, definition, search_key, category, subcategory, section, source_sheet, source_entry_id, example_sentence, example_meaning, is_reported, created_at, updated_at) VALUES (${sqlValue(word.id)}, ${sqlValue(word.bookId)}, ${word.number}, ${sqlValue(word.word)}, ${sqlValue(word.definition)}, ${sqlValue(word.searchKey)}, ${sqlValue(word.category)}, ${sqlValue(word.subcategory)}, ${sqlValue(word.section)}, ${sqlValue(word.sourceSheet)}, ${sqlValue(word.sourceEntryId)}, ${sqlValue(word.exampleSentence)}, ${sqlValue(word.exampleMeaning)}, 0, ${now}, ${now});`
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
