import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  NOUN_WORKBOOK_BOOK_TITLE,
  evaluateNounWorkbookImportGuardrails,
  parseNounWorkbookSheets,
  workbookToSheetEntries,
} from '../utils/nounWorkbookImport';
import {
  createNounWorkbookGuardrailFailureSheets,
  nounWorkbookFixtureExpectedSummary,
  nounWorkbookFixtureImportRows,
  nounWorkbookFixtureWorkbookSheets,
} from './fixtures/nounWorkbookFixture.js';

const toSheetEntries = (workbook: XLSX.WorkBook) => workbookToSheetEntries(
  workbook,
  (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null, blankrows: true }),
);

const createWorkbookFromFixture = (sheets: Array<{ name: string; rows: unknown[][] }>): XLSX.WorkBook => {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  });
  return workbook;
};

describe('nounWorkbookImport', () => {
  it('parses a workbook-derived fixture without loss and keeps source metadata', () => {
    const workbook = createWorkbookFromFixture(nounWorkbookFixtureWorkbookSheets);
    const parsed = parseNounWorkbookSheets(toSheetEntries(workbook));

    expect(parsed.summary.hasIndexSheet).toBe(nounWorkbookFixtureExpectedSummary.hasIndexSheet);
    expect(parsed.summary.importBookCount).toBe(nounWorkbookFixtureExpectedSummary.importBookCount);
    expect(parsed.summary.importWordCount).toBe(nounWorkbookFixtureExpectedSummary.importWordCount);
    expect(parsed.summary.indexWordCount).toBe(nounWorkbookFixtureExpectedSummary.indexWordCount);
    expect(parsed.summary.categoryCount).toBe(nounWorkbookFixtureExpectedSummary.categoryCount);
    expect(parsed.summary.sectionMarkerCount).toBe(nounWorkbookFixtureExpectedSummary.sectionMarkerCount);
    expect(parsed.summary.missingSentenceCount).toBe(nounWorkbookFixtureExpectedSummary.missingSentenceCount);
    expect(parsed.summary.duplicateHeadwordCount).toBe(nounWorkbookFixtureExpectedSummary.duplicateHeadwordCount);
    expect(parsed.summary.issueCount).toBe(nounWorkbookFixtureExpectedSummary.issueCount);
    expect(parsed.summary.warningIssueCount).toBe(nounWorkbookFixtureExpectedSummary.warningIssueCount);
    expect(parsed.summary.infoIssueCount).toBe(nounWorkbookFixtureExpectedSummary.infoIssueCount);
    expect(parsed.summary.unmatchedIndexWordCount).toBe(nounWorkbookFixtureExpectedSummary.unmatchedIndexWordCount);
    expect(parsed.summary.unmatchedImportedWordCount).toBe(nounWorkbookFixtureExpectedSummary.unmatchedImportedWordCount);
    expect(parsed.summary.unreviewedIndexOnlyWordCount).toBe(nounWorkbookFixtureExpectedSummary.unreviewedIndexOnlyWordCount);
    expect(parsed.summary.unreviewedImportedOnlyWordCount).toBe(nounWorkbookFixtureExpectedSummary.unreviewedImportedOnlyWordCount);
    expect(parsed.summary.unreviewedDuplicateHeadwordCount).toBe(nounWorkbookFixtureExpectedSummary.unreviewedDuplicateHeadwordCount);
    expect(parsed.books.map((book) => book.bookName)).toEqual([
      NOUN_WORKBOOK_BOOK_TITLE,
    ]);
    expect(parsed.importRows).toEqual(nounWorkbookFixtureImportRows);
    expect(parsed.missingExampleRows).toEqual([]);
    expect(parsed.categories.map((entry) => `${entry.category}:${entry.wordCount}`)).toEqual([
      '国際 移動:3',
      '色:1',
      '生活:1',
    ]);
  });

  it('blocks import when workbook analysis shows mismatches or warning issues', () => {
    const workbook = createWorkbookFromFixture(createNounWorkbookGuardrailFailureSheets());
    const parsed = parseNounWorkbookSheets(toSheetEntries(workbook));
    const guardrail = evaluateNounWorkbookImportGuardrails(parsed);

    expect(parsed.summary.warningIssueCount).toBe(1);
    expect(parsed.summary.unmatchedIndexWordCount).toBe(1);
    expect(parsed.summary.unmatchedImportedWordCount).toBe(1);
    expect(guardrail.shouldBlockImport).toBe(true);
    expect(guardrail.blockingReasons).toEqual([
      '要確認 issue が 1 件あり、許容上限 0 件を超えています。',
      '未確認の索引だけに存在する単語が 1 件あり、許容上限 0 件を超えています。',
      '未確認の取り込み結果だけに存在する単語が 1 件あり、許容上限 0 件を超えています。',
    ]);
  });

  it('blocks arbitrary XLSX files that do not contain the required noun index sheet', () => {
    const workbook = createWorkbookFromFixture([
      {
        name: 'Sheet1',
        rows: [
          ['id', 'word', 'meaning', 'example'],
          [1, 'clinic', '診療所', 'The clinic opens at nine.'],
        ],
      },
    ]);
    const parsed = parseNounWorkbookSheets(toSheetEntries(workbook));
    const guardrail = evaluateNounWorkbookImportGuardrails(parsed);

    expect(parsed.summary.hasIndexSheet).toBe(false);
    expect(parsed.summary.warningIssueCount).toBeGreaterThan(0);
    expect(parsed.issues.map((issue) => issue.code)).toContain('MISSING_INDEX_SHEET');
    expect(guardrail.shouldBlockImport).toBe(true);
    expect(guardrail.blockingReasons[0]).toContain('要確認 issue');
  });

  it('ignores human audit sheets instead of parsing them as workbook data', () => {
    const workbook = createWorkbookFromFixture([
      ...nounWorkbookFixtureWorkbookSheets,
      {
        name: '修正ログ',
        rows: [
          ['sourceEntryId', 'before', 'after', 'reason'],
          [224, 'old value', 'new value', 'human review only'],
        ],
      },
    ]);
    const parsed = parseNounWorkbookSheets(toSheetEntries(workbook));

    expect(parsed.importRows).toEqual(nounWorkbookFixtureImportRows);
    expect(parsed.summary.warningIssueCount).toBe(0);
    expect(parsed.summary.unmatchedImportedWordCount).toBe(0);
  });

  it('blocks duplicate headwords before official import', () => {
    const duplicatedSheets = createNounWorkbookGuardrailFailureSheets();
    duplicatedSheets[0].rows = [
      ['単語', '印'],
      ['world', '○'],
    ];
    duplicatedSheets.splice(2);
    duplicatedSheets[1].rows.push([8, 'world', '世界中', 'The word world appears twice.', null]);

    const workbook = createWorkbookFromFixture(duplicatedSheets);
    const parsed = parseNounWorkbookSheets(toSheetEntries(workbook));
    const guardrail = evaluateNounWorkbookImportGuardrails(parsed, {
      maxWarningIssueCount: 99,
      maxUnmatchedIndexWordCount: 99,
      maxUnmatchedImportedWordCount: 99,
      maxDuplicateHeadwordCount: 0,
    });

    expect(parsed.summary.duplicateHeadwordCount).toBe(1);
    expect(guardrail.shouldBlockImport).toBe(true);
    expect(guardrail.blockingReasons).toEqual([
      '未確認の重複 headword が 1 件あり、許容上限 0 件を超えています。',
    ]);
  });

  it('supports real workbook sheets without an index header and with four-column data blocks', () => {
    const workbook = createWorkbookFromFixture([
      {
        name: '名詞一覧',
        rows: [
          ['color', '○'],
          ['weather', '○'],
        ],
      },
      {
        name: '色',
        rows: [
          [null, '色', null, null],
          [1, 'color', '色', 'Blue is my favorite color.'],
        ],
      },
      {
        name: '天気',
        rows: [
          [null, '天気', null, null],
          [2, 'weather', '天気', 'The weather was very fine yesterday.'],
        ],
      },
    ]);
    const parsed = parseNounWorkbookSheets(toSheetEntries(workbook));
    const guardrail = evaluateNounWorkbookImportGuardrails(parsed);

    expect(parsed.summary.indexWordCount).toBe(2);
    expect(parsed.summary.indexMarkedCount).toBe(2);
    expect(parsed.summary.dataSheetCount).toBe(2);
    expect(parsed.summary.importWordCount).toBe(2);
    expect(parsed.importRows.map((row) => row.word)).toEqual(['color', 'weather']);
    expect(guardrail.shouldBlockImport).toBe(false);
  });

  it('allows only reviewed source-workbook asymmetries and duplicate headwords', () => {
    const workbook = createWorkbookFromFixture([
      {
        name: '名詞一覧',
        rows: [
          ['bike', '○'],
          ['bicycle', '○'],
          ['goal', '○'],
        ],
      },
      {
        name: '生活',
        rows: [
          [null, '生活', null, null, null],
          [1, 'bike(bicycle)', '自転車', 'I go to school by bike.', null],
          [2, 'goal', '目標', 'Set a goal for the year.', null],
          [3, 'goal', '得点', 'The team scored a goal.', null],
        ],
      },
    ]);
    const parsed = parseNounWorkbookSheets(toSheetEntries(workbook));
    const guardrail = evaluateNounWorkbookImportGuardrails(parsed);

    expect(parsed.summary.unmatchedIndexWordCount).toBe(2);
    expect(parsed.summary.unmatchedImportedWordCount).toBe(1);
    expect(parsed.summary.duplicateHeadwordCount).toBe(1);
    expect(parsed.summary.reviewedIndexOnlyWordCount).toBe(2);
    expect(parsed.summary.reviewedImportedOnlyWordCount).toBe(1);
    expect(parsed.summary.reviewedDuplicateHeadwordCount).toBe(1);
    expect(parsed.summary.unreviewedIndexOnlyWordCount).toBe(0);
    expect(parsed.summary.unreviewedImportedOnlyWordCount).toBe(0);
    expect(parsed.summary.unreviewedDuplicateHeadwordCount).toBe(0);
    expect(guardrail.shouldBlockImport).toBe(false);
  });
});
