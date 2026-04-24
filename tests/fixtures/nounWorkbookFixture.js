import {
  NOUN_WORKBOOK_BOOK_DESCRIPTION,
  NOUN_WORKBOOK_BOOK_TITLE,
  NOUN_WORKBOOK_SOURCE_CONTEXT,
} from '../../utils/nounWorkbookImport.js';

const BALANCED_SHEETS = [
  {
    name: '名詞一覧',
    rows: [
      ['単語', '印'],
      ['access', '○'],
      ['world', '○'],
      ['trip', '○'],
      ['goal', '○'],
      ['color', '○'],
    ],
  },
  {
    name: '国際 移動',
    rows: [
      [null, '国際', null, null, null, null, '移動', null, null, null],
      [1, 'world', '世界', 'There are many people in the world.', null, 2, 'trip', '旅行', 'I enjoyed the trip.', null],
      [null, '到達', null, null, null, null, null, null, null, null],
      [3, 'goal', '目標', 'Set a goal for the year.', null, null, null, null, null, null],
    ],
  },
  {
    name: '生活',
    rows: [
      [null, '生活', null, null, null],
      [4, 'access', '利用の機会', 'Students need easy access to the library.', null],
    ],
  },
  {
    name: '色',
    rows: [
      [null, '色', null, null, null],
      [5, 'color', '色', 'Blue is my favorite color.', null],
    ],
  },
];

const cloneSheetEntries = (entries) => entries.map((entry) => ({
  name: entry.name,
  rows: entry.rows.map((row) => [...row]),
}));

export const nounWorkbookFixtureWorkbookSheets = cloneSheetEntries(BALANCED_SHEETS);

export const nounWorkbookFixtureImportRows = Object.freeze([
  {
    bookName: NOUN_WORKBOOK_BOOK_TITLE,
    number: 1,
    word: 'world',
    definition: '世界',
    exampleSentence: 'There are many people in the world.',
    category: '国際 移動',
    subcategory: '国際',
    sourceSheet: '国際 移動',
    sourceEntryId: 1,
  },
  {
    bookName: NOUN_WORKBOOK_BOOK_TITLE,
    number: 2,
    word: 'trip',
    definition: '旅行',
    exampleSentence: 'I enjoyed the trip.',
    category: '国際 移動',
    subcategory: '移動',
    sourceSheet: '国際 移動',
    sourceEntryId: 2,
  },
  {
    bookName: NOUN_WORKBOOK_BOOK_TITLE,
    number: 3,
    word: 'goal',
    definition: '目標',
    exampleSentence: 'Set a goal for the year.',
    category: '国際 移動',
    subcategory: '国際',
    section: '到達',
    sourceSheet: '国際 移動',
    sourceEntryId: 3,
  },
  {
    bookName: NOUN_WORKBOOK_BOOK_TITLE,
    number: 4,
    word: 'access',
    definition: '利用の機会',
    exampleSentence: 'Students need easy access to the library.',
    category: '生活',
    subcategory: '生活',
    sourceSheet: '生活',
    sourceEntryId: 4,
  },
  {
    bookName: NOUN_WORKBOOK_BOOK_TITLE,
    number: 5,
    word: 'color',
    definition: '色',
    exampleSentence: 'Blue is my favorite color.',
    category: '色',
    subcategory: '色',
    sourceSheet: '色',
    sourceEntryId: 5,
  },
]);

export const nounWorkbookFixtureExpectedSummary = Object.freeze({
  hasIndexSheet: true,
  importBookCount: 1,
  importWordCount: 5,
  indexWordCount: 5,
  sectionMarkerCount: 1,
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
  categoryCount: 3,
});

export const nounWorkbookFixtureBookTitle = NOUN_WORKBOOK_BOOK_TITLE;
export const nounWorkbookFixtureBookDescription = NOUN_WORKBOOK_BOOK_DESCRIPTION;
export const nounWorkbookFixtureSourceContext = NOUN_WORKBOOK_SOURCE_CONTEXT;
export const nounWorkbookFixtureImportProfile = Object.freeze({
  kind: 'NOUN_WORKBOOK',
  summary: {
    hasIndexSheet: nounWorkbookFixtureExpectedSummary.hasIndexSheet,
    importWordCount: nounWorkbookFixtureExpectedSummary.importWordCount,
    warningIssueCount: nounWorkbookFixtureExpectedSummary.warningIssueCount,
    unmatchedIndexWordCount: nounWorkbookFixtureExpectedSummary.unmatchedIndexWordCount,
    unmatchedImportedWordCount: nounWorkbookFixtureExpectedSummary.unmatchedImportedWordCount,
    duplicateHeadwordCount: nounWorkbookFixtureExpectedSummary.duplicateHeadwordCount,
    reviewedIndexOnlyWordCount: nounWorkbookFixtureExpectedSummary.reviewedIndexOnlyWordCount,
    reviewedImportedOnlyWordCount: nounWorkbookFixtureExpectedSummary.reviewedImportedOnlyWordCount,
    unreviewedIndexOnlyWordCount: nounWorkbookFixtureExpectedSummary.unreviewedIndexOnlyWordCount,
    unreviewedImportedOnlyWordCount: nounWorkbookFixtureExpectedSummary.unreviewedImportedOnlyWordCount,
    reviewedDuplicateHeadwordCount: nounWorkbookFixtureExpectedSummary.reviewedDuplicateHeadwordCount,
    unreviewedDuplicateHeadwordCount: nounWorkbookFixtureExpectedSummary.unreviewedDuplicateHeadwordCount,
  },
  guardrail: {
    shouldBlockImport: false,
    blockingReasons: [],
  },
});

export const createNounWorkbookGuardrailFailureSheets = () => {
  const entries = cloneSheetEntries(BALANCED_SHEETS);
  entries[0].rows.push(['bonus', '○']);
  entries[2].rows.push([6, 'clinic', '診療所', 'The clinic opens at nine.', null]);
  entries[2].rows.push([7, 'omission', null, null, null]);
  return entries;
};
