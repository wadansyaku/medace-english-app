import { describe, expect, it } from 'vitest';

import {
  generateContentQaReport,
  rowsFromCsvText,
  rowsFromJsonPayload,
} from '../scripts/content-qa-report.mjs';

describe('content-qa-report', () => {
  it('builds book-level QA metrics for blanks, sentinels, duplicates, examples, categories, and sources', () => {
    const report = generateContentQaReport([
      {
        bookName: 'Starter',
        number: 1,
        word: 'care',
        definition: '注意',
        exampleSentence: 'Take care of your notes.',
        exampleMeaning: 'ノートを大切にしなさい。',
        category: '生活',
        subcategory: '学校',
        sourceSheet: 'Sheet A',
        sourceEntryId: 1,
      },
      {
        bookName: 'Starter',
        number: 2,
        word: 'care',
        definition: '[未抽出]',
        exampleSentence: '',
        category: '生活',
        sourceSheet: '',
      },
      {
        bookName: 'Starter',
        number: 3,
        word: 'heal',
        definition: '治す',
        exampleSentence: 'Doctors heal patients.',
        category: '医療',
        sourceEntryId: 3,
      },
      {
        bookName: 'Starter',
        number: 4,
        word: '',
        definition: '空の単語',
        exampleSentence: '',
      },
      {
        bookName: 'Advanced',
        number: 1,
        word: 'analyze',
        definition: '分析する',
        exampleSentence: 'Analyze the report.',
        category: '学習',
        sourceSheet: 'Sheet B',
      },
    ], { sampleLimit: 5 });

    expect(report.summary.bookCount).toBe(2);
    expect(report.summary.wordCount).toBe(4);
    expect(report.summary.sentinelValueCount).toBe(1);
    expect(report.summary.rowsWithSentinel).toBe(1);
    expect(report.summary.duplicateHeadwordCount).toBe(1);

    const starter = report.books.find((book) => book.bookName === 'Starter');
    expect(starter).toBeTruthy();
    expect(starter.rowCount).toBe(4);
    expect(starter.wordCount).toBe(3);
    expect(starter.blankFields.fields.headword).toBe(1);
    expect(starter.blankFields.rowsWithRequiredBlank).toBe(1);
    expect(starter.sentinelValues.fields.definition).toBe(1);
    expect(starter.sentinelValues.rowsWithSentinel).toBe(1);
    expect(starter.sentinelValues.samples[0]).toEqual(expect.objectContaining({
      field: 'definition',
      sentinel: '[未抽出]',
      headword: 'care',
    }));
    expect(starter.duplicates).toEqual(expect.objectContaining({
      duplicateHeadwordCount: 1,
      duplicateRowCount: 1,
    }));
    expect(starter.duplicates.headwords[0]).toEqual({
      headword: 'care',
      count: 2,
      rowNumbers: [1, 2],
    });
    expect(starter.examples).toEqual(expect.objectContaining({
      withExampleSentence: 2,
      missingExampleSentence: 2,
      sentenceCoverageRate: 0.5,
    }));
    expect(starter.categoryCoverage).toEqual(expect.objectContaining({
      withCategory: 3,
      missingCategory: 1,
      coverageRate: 0.75,
      uniqueCategoryCount: 2,
    }));
    expect(starter.sourceCoverage).toEqual(expect.objectContaining({
      withSourceSheet: 1,
      withSourceEntryId: 2,
      withAnySource: 2,
      anySourceCoverageRate: 0.5,
      uniqueSourceSheetCount: 1,
    }));
  });

  it('normalizes D1-shaped JSON with separate books and words arrays', () => {
    const rows = rowsFromJsonPayload({
      books: [
        { id: 'book-a', title: 'Book A' },
      ],
      words: [
        {
          book_id: 'book-a',
          word_number: 1,
          word: 'clinic',
          definition: '診療所',
          example_sentence: 'The clinic opens at nine.',
          category: '医療',
          source_sheet: 'seed',
          source_entry_id: 10,
        },
      ],
    });
    const report = generateContentQaReport(rows);

    expect(report.books).toHaveLength(1);
    expect(report.books[0]).toEqual(expect.objectContaining({
      bookId: 'book-a',
      bookName: 'Book A',
      wordCount: 1,
    }));
    expect(report.books[0].examples.sentenceCoverageRate).toBe(1);
    expect(report.books[0].sourceCoverage.anySourceCoverageRate).toBe(1);
  });

  it('accepts CatalogImportRequest-like JSON rows without going through storage', () => {
    const rows = rowsFromJsonPayload({
      defaultBookName: 'Imported',
      source: {
        kind: 'rows',
        rows: [
          { word: 'access', definition: '利用の機会', category: '生活' },
        ],
      },
    });
    const report = generateContentQaReport(rows);

    expect(report.books[0]).toEqual(expect.objectContaining({
      bookName: 'Imported',
      rowCount: 1,
      wordCount: 1,
    }));
    expect(report.books[0].categoryCoverage.coverageRate).toBe(1);
  });

  it('parses header and positional CSV sources into the same report model', () => {
    const headerRows = rowsFromCsvText([
      'BookName,Number,Headword,Meaning,ExampleSentence,Category,SourceSheet,SourceEntryId',
      'CSV Book,1,world,世界,There are many people in the world.,国際,Sheet 1,7',
    ].join('\n'));
    const positionalRows = rowsFromCsvText('CSV Book,2,trip,旅行,I enjoyed the trip.,,国際,移動,,Sheet 1,8');
    const report = generateContentQaReport([...headerRows, ...positionalRows]);

    expect(report.books).toHaveLength(1);
    expect(report.books[0].bookName).toBe('CSV Book');
    expect(report.books[0].wordCount).toBe(2);
    expect(report.books[0].examples.sentenceCoverageRate).toBe(1);
    expect(report.books[0].categoryCoverage.coverageRate).toBe(1);
    expect(report.books[0].sourceCoverage.anySourceCoverageRate).toBe(1);
  });
});
