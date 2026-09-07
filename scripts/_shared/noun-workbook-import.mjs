export const NOUN_WORKBOOK_BOOK_TITLE = 'ナルシスト';
export const NOUN_WORKBOOK_BOOK_DESCRIPTION = '中学生用の名詞単語帳。カテゴリ別のまとまりと原本例文を保持した暫定版です。';
export const NOUN_WORKBOOK_SOURCE_CONTEXT = '中学生用名詞教材';
/**
 * @typedef {Readonly<{
 *   maxWarningIssueCount: number;
 *   maxUnmatchedIndexWordCount: number;
 *   maxUnmatchedImportedWordCount: number;
 *   maxDuplicateHeadwordCount: number;
 * }>} NounWorkbookImportGuardrails
 */
/** @type {NounWorkbookImportGuardrails} */
export const NOUN_WORKBOOK_IMPORT_GUARDRAILS = Object.freeze({
  maxWarningIssueCount: 0,
  maxUnmatchedIndexWordCount: 0,
  maxUnmatchedImportedWordCount: 0,
  maxDuplicateHeadwordCount: 0,
});

const INDEX_SHEET_NAME = '名詞一覧';
const BLOCK_WIDTH = 5;
const MIN_DATA_BLOCK_WIDTH = 4;
const LATIN_PATTERN = /[A-Za-z]/;
const JAPANESE_PATTERN = /[ぁ-んァ-ヶ一-龠々ー]/;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const INDEX_HEADER_LABELS = new Set(['単語', 'word', 'headword']);

// The source workbook intentionally has index/import asymmetries for aliases,
// combined headwords, and non-noun carryover entries. Keep that review ledger
// explicit so new mismatches still fail closed.
export const NOUN_WORKBOOK_REVIEWED_INDEX_ONLY_HEADWORDS = Object.freeze([
  'advantage',
  'advertisement',
  'arrest',
  'ball',
  'bath',
  'bathroom',
  'bathtub',
  'bicycle',
  'bike',
  'block',
  'bottle',
  'broaden',
  'burn',
  'cause',
  'cell phone',
  'Christmas',
  'cloth',
  'clothes',
  'cloud, rain, snow, sun',
  'date',
  'farmer',
  'fate',
  'favorite',
  'feet',
  'firewood',
  'float',
  'foot',
  'fun',
  'heat',
  'interview',
  'kind',
  'lawyer',
  'mom',
  'name',
  'need',
  'octopus',
  'official',
  'pair',
  'particular',
  'phone',
  'photo',
  'plastic',
  'pollution',
  'present',
  'print',
  'prize',
  'program',
  'rest',
  'same',
  'share',
  'shelf',
  'sightseeing',
  'smartphone',
  'step',
  'support',
  'tail',
  'talk',
  'teeth',
  'telephone',
  'the same',
  'timing',
  'tooth',
  'top',
  'touch',
  'tourlist',
  'track',
  'type',
  'U.S.',
  'United States',
  'waterfall',
  'wave',
  'while',
  'women',
  'yesterday',
  'zoo',
]);

export const NOUN_WORKBOOK_REVIEWED_IMPORTED_ONLY_HEADWORDS = Object.freeze([
  'tourist',
  'truck',
  'bike(bicycle)',
  'west',
  'Paris',
  'Sweden',
  'United States(U.S.)',
  'woman',
  'male',
  'female',
  'bath, bathtub',
  'pear',
  'phone/cell phone/telephone/smartphone',
  'convenience store',
  'cloth/clothes',
  'outside',
  'lawyer, attorney',
  'designer',
  'climate change',
  'tooth/teeth',
  'foot/feet',
  'cloud',
]);

export const NOUN_WORKBOOK_REVIEWED_DUPLICATE_HEADWORDS = Object.freeze([
  'goal',
  'aquarium',
  'captain',
  'garbage',
  'plant',
  'problem',
  'second',
  'story',
  'sun',
]);

const normalizeCellText = (value) => (
  value === null || value === undefined
    ? ''
    : String(value)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ')
      .replace(/\u3000/g, ' ')
      .trim()
);

const normalizeLookupKey = (value) => normalizeCellText(value)
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\s+/g, ' ');

const toReviewedSet = (values) => new Set(values.map((value) => normalizeLookupKey(value)));

const REVIEWED_INDEX_ONLY_LOOKUP = toReviewedSet(NOUN_WORKBOOK_REVIEWED_INDEX_ONLY_HEADWORDS);
const REVIEWED_IMPORTED_ONLY_LOOKUP = toReviewedSet(NOUN_WORKBOOK_REVIEWED_IMPORTED_ONLY_HEADWORDS);
const REVIEWED_DUPLICATE_LOOKUP = toReviewedSet(NOUN_WORKBOOK_REVIEWED_DUPLICATE_HEADWORDS);

const parseNumericId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isLikelyLexicalEntry = (word, definition) => Boolean(word) && Boolean(definition) && LATIN_PATTERN.test(word);

const isLikelyMisplacedExample = (word, definition, exampleSentence) => (
  Boolean(word)
  && Boolean(definition)
  && LATIN_PATTERN.test(word)
  && LATIN_PATTERN.test(definition)
  && !JAPANESE_PATTERN.test(definition)
  && !exampleSentence
);

const isLikelySectionMarker = (word, definition, exampleSentence, note) => (
  Boolean(word)
  && !definition
  && !exampleSentence
  && !note
  && !LATIN_PATTERN.test(word)
);

const pushCount = (map, key, field = 'wordCount') => {
  const safeKey = key || '未分類';
  const current = map.get(safeKey) || { key: safeKey, wordCount: 0, missingSentenceCount: 0 };
  current[field] += 1;
  map.set(safeKey, current);
};

export const workbookToSheetEntries = (workbook, toRows) => workbook.SheetNames.map((name) => ({
  name,
  rows: toRows(workbook.Sheets[name]),
}));

const getIndexRows = (rows) => {
  const firstRow = Array.isArray(rows?.[0]) ? rows[0] : [];
  const firstCell = normalizeLookupKey(firstRow[0]);
  return INDEX_HEADER_LABELS.has(firstCell) ? rows.slice(1) : rows;
};

const isLikelyNounWorkbookDataSheet = (entry) => {
  const rows = Array.isArray(entry?.rows) ? entry.rows : [];
  if (rows.length < 2) return false;

  const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  if (columnCount < MIN_DATA_BLOCK_WIDTH) return false;

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const hasWorkbookBlockHeader = Array
    .from({ length: Math.ceil(columnCount / BLOCK_WIDTH) }, (_, index) => index * BLOCK_WIDTH)
    .some((blockStart) => {
      const blockLabel = normalizeCellText(headerRow[blockStart + 1]);
      return Boolean(blockLabel) && JAPANESE_PATTERN.test(blockLabel);
    });
  if (!hasWorkbookBlockHeader) return false;

  return rows.slice(1).some((row) => {
    const cells = Array.isArray(row) ? row : [];
    for (let blockStart = 0; blockStart < columnCount; blockStart += BLOCK_WIDTH) {
      const word = normalizeCellText(cells[blockStart + 1]);
      const definition = normalizeCellText(cells[blockStart + 2]);
      const exampleSentence = normalizeCellText(cells[blockStart + 3]);
      const note = normalizeCellText(cells[blockStart + 4]);
      if (isLikelyLexicalEntry(word, definition) || isLikelySectionMarker(word, definition, exampleSentence, note)) {
        return true;
      }
    }
    return false;
  });
};

const buildIssue = ({
  severity = 'warning',
  code,
  message,
  sheetName,
  bookName,
  category,
  subcategory,
  section,
  sheetRow,
  blockColumn,
  sourceEntryId,
  word,
  definition,
}) => ({
  severity,
  code,
  message,
  sheetName,
  bookName,
  category,
  subcategory,
  section,
  sheetRow,
  blockColumn,
  sourceEntryId,
  word,
  definition,
});

export const parseNounWorkbookSheets = (sheetEntries) => {
  const entries = Array.isArray(sheetEntries) ? sheetEntries : [];
  const summary = {
    bookTitle: NOUN_WORKBOOK_BOOK_TITLE,
    indexSheetName: INDEX_SHEET_NAME,
    hasIndexSheet: false,
    dataSheetCount: 0,
    importBookCount: 0,
    importWordCount: 0,
    indexWordCount: 0,
    indexMarkedCount: 0,
    sectionMarkerCount: 0,
    missingSentenceCount: 0,
    duplicateHeadwordCount: 0,
    issueCount: 0,
    warningIssueCount: 0,
    infoIssueCount: 0,
    unmatchedIndexWordCount: 0,
    unmatchedImportedWordCount: 0,
    reviewedIndexOnlyWordCount: 0,
    reviewedImportedOnlyWordCount: 0,
    unreviewedIndexOnlyWordCount: 0,
    unreviewedImportedOnlyWordCount: 0,
    reviewedDuplicateHeadwordCount: 0,
    unreviewedDuplicateHeadwordCount: 0,
    categoryCount: 0,
  };
  const books = [];
  const issues = [];
  const importRows = [];
  const duplicateHeadwords = [];
  const missingExampleRows = [];

  const indexWords = [];
  const importedWords = [];
  const duplicateCounter = new Map();
  const categoryCounts = new Map();
  const subcategoryCounts = new Map();

  const indexSheet = entries.find((entry) => entry.name === INDEX_SHEET_NAME);
  summary.hasIndexSheet = Boolean(indexSheet);
  if (indexSheet?.rows) {
    summary.indexSheetName = indexSheet.name;
    getIndexRows(indexSheet.rows).forEach((row) => {
      const word = normalizeCellText(row?.[0]);
      const mark = normalizeCellText(row?.[1]);
      if (!word) return;
      indexWords.push(word);
      if (mark === '○') summary.indexMarkedCount += 1;
    });
    summary.indexWordCount = indexWords.length;
  } else {
    issues.push(buildIssue({
      code: 'MISSING_INDEX_SHEET',
      message: `必須シート \`${INDEX_SHEET_NAME}\` が見つかりません。この XLSX は名詞 workbook として取り込みません。`,
      sheetName: INDEX_SHEET_NAME,
      bookName: NOUN_WORKBOOK_BOOK_TITLE,
    }));
  }

  const dataSheets = (indexSheet
    ? entries.filter((entry) => entry !== indexSheet)
    : entries
  ).filter(isLikelyNounWorkbookDataSheet);
  summary.dataSheetCount = dataSheets.length;

  let minSourceId = null;
  let maxSourceId = null;

  dataSheets.forEach((entry) => {
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    if (rows.length === 0) return;

    const category = normalizeCellText(entry.name);
    const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
    const blockHeaders = new Map();
    const currentSectionByBlock = new Map();

    for (let blockStart = 0; blockStart < columnCount; blockStart += BLOCK_WIDTH) {
      const blockLabel = normalizeCellText(headerRow[blockStart + 1]);
      if (blockLabel) blockHeaders.set(blockStart, blockLabel);
    }

    rows.slice(1).forEach((row, rowOffset) => {
      const sheetRow = rowOffset + 2;
      const cells = Array.isArray(row) ? row : [];

      for (let blockStart = 0; blockStart < columnCount; blockStart += BLOCK_WIDTH) {
        const sourceId = parseNumericId(cells[blockStart]);
        const word = normalizeCellText(cells[blockStart + 1]);
        const definition = normalizeCellText(cells[blockStart + 2]);
        const exampleSentence = normalizeCellText(cells[blockStart + 3]);
        const note = normalizeCellText(cells[blockStart + 4]);
        const subcategory = blockHeaders.get(blockStart) || category;
        const section = currentSectionByBlock.get(blockStart) || '';

        if (!sourceId && !word && !definition && !exampleSentence && !note) continue;

        if (isLikelyMisplacedExample(word, definition, exampleSentence)) {
          issues.push(buildIssue({
            code: 'MISPLACED_EXAMPLE_OR_MISSING_JA',
            message: '日本語訳が欠け、英語例文が日本語訳列にずれている可能性があります。この行は取り込みません。',
            sheetName: entry.name,
            bookName: NOUN_WORKBOOK_BOOK_TITLE,
            category,
            subcategory,
            section,
            sheetRow,
            blockColumn: blockStart + 3,
            sourceEntryId: sourceId,
            word,
            definition,
          }));
          continue;
        }

        if (isLikelyLexicalEntry(word, definition)) {
          const number = sourceId ?? importRows.length + 1;
          importRows.push({
            bookName: NOUN_WORKBOOK_BOOK_TITLE,
            number,
            word,
            definition,
            ...(exampleSentence ? { exampleSentence } : {}),
            category,
            subcategory,
            ...(section ? { section } : {}),
            sourceSheet: entry.name,
            ...(sourceId !== null ? { sourceEntryId: sourceId } : {}),
          });
          importedWords.push(word);
          duplicateCounter.set(normalizeLookupKey(word), (duplicateCounter.get(normalizeLookupKey(word)) || 0) + 1);
          pushCount(categoryCounts, category);
          pushCount(subcategoryCounts, `${category} > ${subcategory}`);
          if (!exampleSentence) {
            summary.missingSentenceCount += 1;
            pushCount(categoryCounts, category, 'missingSentenceCount');
            pushCount(subcategoryCounts, `${category} > ${subcategory}`, 'missingSentenceCount');
            missingExampleRows.push({
              word,
              definition,
              category,
              subcategory,
              section: section || null,
              sourceEntryId: sourceId,
              sheetName: entry.name,
            });
          }
          if (sourceId !== null) {
            minSourceId = minSourceId === null ? sourceId : Math.min(minSourceId, sourceId);
            maxSourceId = maxSourceId === null ? sourceId : Math.max(maxSourceId, sourceId);
          } else {
            issues.push(buildIssue({
              code: 'MISSING_SOURCE_ID',
              message: '元のIDが空のため、連番で補完して取り込みます。',
              sheetName: entry.name,
              bookName: NOUN_WORKBOOK_BOOK_TITLE,
              category,
              subcategory,
              section,
              sheetRow,
              blockColumn: blockStart + 1,
              sourceEntryId: sourceId,
              word,
              definition,
            }));
          }
          if (EMOJI_PATTERN.test(definition)) {
            issues.push(buildIssue({
              severity: 'info',
              code: 'EMOJI_IN_DEFINITION',
              message: '日本語訳に絵文字が含まれています。',
              sheetName: entry.name,
              bookName: NOUN_WORKBOOK_BOOK_TITLE,
              category,
              subcategory,
              section,
              sheetRow,
              blockColumn: blockStart + 3,
              sourceEntryId: sourceId,
              word,
              definition,
            }));
          }
          if (exampleSentence && !LATIN_PATTERN.test(exampleSentence)) {
            issues.push(buildIssue({
              code: 'NON_ENGLISH_EXAMPLE',
              message: '例文欄が英語例文ではない可能性があります。',
              sheetName: entry.name,
              bookName: NOUN_WORKBOOK_BOOK_TITLE,
              category,
              subcategory,
              section,
              sheetRow,
              blockColumn: blockStart + 4,
              sourceEntryId: sourceId,
              word,
              definition,
            }));
          }
          continue;
        }

        if (isLikelySectionMarker(word, definition, exampleSentence, note)) {
          currentSectionByBlock.set(blockStart, word);
          summary.sectionMarkerCount += 1;
          continue;
        }

        if (word && LATIN_PATTERN.test(word) && !definition) {
          issues.push(buildIssue({
            code: 'MISSING_DEFINITION',
            message: '英単語はありますが日本語訳が空です。この行は取り込みません。',
            sheetName: entry.name,
            bookName: NOUN_WORKBOOK_BOOK_TITLE,
            category,
            subcategory,
            section,
            sheetRow,
            blockColumn: blockStart + 1,
            sourceEntryId: sourceId,
            word,
            definition,
          }));
          continue;
        }

        if (!word && definition) {
          issues.push(buildIssue({
            code: 'MISSING_WORD',
            message: '日本語訳はありますが英単語が空です。この行は取り込みません。',
            sheetName: entry.name,
            bookName: NOUN_WORKBOOK_BOOK_TITLE,
            category,
            subcategory,
            section,
            sheetRow,
            blockColumn: blockStart + 3,
            sourceEntryId: sourceId,
            word,
            definition,
          }));
          continue;
        }

        if (word || definition || exampleSentence || note || sourceId !== null) {
          issues.push(buildIssue({
            severity: 'info',
            code: 'UNPARSED_BLOCK',
            message: '分類ラベルまたは崩れたブロックとしてスキップしました。',
            sheetName: entry.name,
            bookName: NOUN_WORKBOOK_BOOK_TITLE,
            category,
            subcategory,
            section,
            sheetRow,
            blockColumn: blockStart + 1,
            sourceEntryId: sourceId,
            word,
            definition,
          }));
        }
      }
    });
  });

  [...duplicateCounter.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'en'))
    .forEach(([headword, count]) => {
      duplicateHeadwords.push({ headword, count });
    });

  summary.importBookCount = importRows.length > 0 ? 1 : 0;
  summary.importWordCount = importRows.length;
  summary.duplicateHeadwordCount = duplicateHeadwords.length;
  summary.issueCount = issues.length;
  summary.warningIssueCount = issues.filter((issue) => issue.severity !== 'info').length;
  summary.infoIssueCount = issues.filter((issue) => issue.severity === 'info').length;
  summary.categoryCount = categoryCounts.size;

  const importedLookup = new Set(importedWords.map((word) => normalizeLookupKey(word)));
  const indexLookup = new Set(indexWords.map((word) => normalizeLookupKey(word)));
  const unmatchedIndexOnlyWords = [...indexLookup].filter((word) => !importedLookup.has(word));
  const unmatchedImportedOnlyWords = [...importedLookup].filter((word) => !indexLookup.has(word));
  const reviewedIndexOnlyWords = unmatchedIndexOnlyWords.filter((word) => REVIEWED_INDEX_ONLY_LOOKUP.has(word));
  const reviewedImportedOnlyWords = unmatchedImportedOnlyWords.filter((word) => REVIEWED_IMPORTED_ONLY_LOOKUP.has(word));
  const unreviewedIndexOnlyWords = unmatchedIndexOnlyWords.filter((word) => !REVIEWED_INDEX_ONLY_LOOKUP.has(word));
  const unreviewedImportedOnlyWords = unmatchedImportedOnlyWords.filter((word) => !REVIEWED_IMPORTED_ONLY_LOOKUP.has(word));
  const reviewedDuplicateHeadwords = duplicateHeadwords
    .map((entry) => entry.headword)
    .filter((word) => REVIEWED_DUPLICATE_LOOKUP.has(word));
  const unreviewedDuplicateHeadwords = duplicateHeadwords
    .map((entry) => entry.headword)
    .filter((word) => !REVIEWED_DUPLICATE_LOOKUP.has(word));
  summary.unmatchedIndexWordCount = unmatchedIndexOnlyWords.length;
  summary.unmatchedImportedWordCount = unmatchedImportedOnlyWords.length;
  summary.reviewedIndexOnlyWordCount = reviewedIndexOnlyWords.length;
  summary.reviewedImportedOnlyWordCount = reviewedImportedOnlyWords.length;
  summary.unreviewedIndexOnlyWordCount = unreviewedIndexOnlyWords.length;
  summary.unreviewedImportedOnlyWordCount = unreviewedImportedOnlyWords.length;
  summary.reviewedDuplicateHeadwordCount = reviewedDuplicateHeadwords.length;
  summary.unreviewedDuplicateHeadwordCount = unreviewedDuplicateHeadwords.length;

  if (summary.importWordCount > 0) {
    books.push({
      bookName: NOUN_WORKBOOK_BOOK_TITLE,
      sheetName: 'all',
      wordCount: summary.importWordCount,
      missingSentenceCount: summary.missingSentenceCount,
      minSourceId,
      maxSourceId,
      categoryCount: summary.categoryCount,
    });
  }

  const categories = [...categoryCounts.values()]
    .sort((left, right) => right.wordCount - left.wordCount || left.key.localeCompare(right.key, 'ja'))
    .map((entry) => ({
      category: entry.key,
      wordCount: entry.wordCount,
      missingSentenceCount: entry.missingSentenceCount,
    }));

  const subcategories = [...subcategoryCounts.values()]
    .sort((left, right) => right.wordCount - left.wordCount || left.key.localeCompare(right.key, 'ja'))
    .map((entry) => ({
      label: entry.key,
      wordCount: entry.wordCount,
      missingSentenceCount: entry.missingSentenceCount,
    }));

  return {
    summary,
    books,
    categories,
    subcategories,
    importRows,
    issues,
    duplicateHeadwords,
    missingExampleRows,
    reviewedIndexOnlyWords,
    reviewedImportedOnlyWords,
    reviewedDuplicateHeadwords,
    unreviewedIndexOnlyWords,
    unreviewedImportedOnlyWords,
    unreviewedDuplicateHeadwords,
  };
};

export const evaluateNounWorkbookImportGuardrails = (
  parsed,
  guardrails = NOUN_WORKBOOK_IMPORT_GUARDRAILS,
) => {
  const blockingReasons = [];
  const maxWarningIssueCount = Math.max(0, Math.trunc(guardrails.maxWarningIssueCount ?? 0));
  const maxUnmatchedIndexWordCount = Math.max(0, Math.trunc(guardrails.maxUnmatchedIndexWordCount ?? 0));
  const maxUnmatchedImportedWordCount = Math.max(0, Math.trunc(guardrails.maxUnmatchedImportedWordCount ?? 0));
  const maxDuplicateHeadwordCount = Math.max(0, Math.trunc(guardrails.maxDuplicateHeadwordCount ?? 0));
  const warningIssueCount = parsed?.summary?.warningIssueCount ?? 0;
  const unmatchedIndexWordCount = parsed?.summary?.unreviewedIndexOnlyWordCount
    ?? parsed?.summary?.unmatchedIndexWordCount
    ?? 0;
  const unmatchedImportedWordCount = parsed?.summary?.unreviewedImportedOnlyWordCount
    ?? parsed?.summary?.unmatchedImportedWordCount
    ?? 0;
  const duplicateHeadwordCount = parsed?.summary?.unreviewedDuplicateHeadwordCount
    ?? parsed?.summary?.duplicateHeadwordCount
    ?? 0;

  if (warningIssueCount > maxWarningIssueCount) {
    blockingReasons.push(
      `要確認 issue が ${warningIssueCount} 件あり、許容上限 ${maxWarningIssueCount} 件を超えています。`,
    );
  }
  if (unmatchedIndexWordCount > maxUnmatchedIndexWordCount) {
    blockingReasons.push(
      `未確認の索引だけに存在する単語が ${unmatchedIndexWordCount} 件あり、許容上限 ${maxUnmatchedIndexWordCount} 件を超えています。`,
    );
  }
  if (unmatchedImportedWordCount > maxUnmatchedImportedWordCount) {
    blockingReasons.push(
      `未確認の取り込み結果だけに存在する単語が ${unmatchedImportedWordCount} 件あり、許容上限 ${maxUnmatchedImportedWordCount} 件を超えています。`,
    );
  }
  if (duplicateHeadwordCount > maxDuplicateHeadwordCount) {
    blockingReasons.push(
      `未確認の重複 headword が ${duplicateHeadwordCount} 件あり、許容上限 ${maxDuplicateHeadwordCount} 件を超えています。`,
    );
  }

  return {
    shouldBlockImport: blockingReasons.length > 0,
    blockingReasons,
    maxWarningIssueCount,
    maxUnmatchedIndexWordCount,
    maxUnmatchedImportedWordCount,
    maxDuplicateHeadwordCount,
  };
};
