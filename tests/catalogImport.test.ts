import { describe, expect, it } from 'vitest';

import { normalizeCatalogImport } from '../functions/_shared/catalog-import';

describe('normalizeCatalogImport', () => {
  it('skips empty row values from row-based imports and reports row numbers', () => {
    const result = normalizeCatalogImport({
      defaultBookName: 'Imported',
      source: {
        kind: 'rows',
        rows: [
          { word: 'care', definition: '注意' },
          { word: '', definition: '空文字' },
          { word: 'heal', definition: '' },
        ],
      },
    });

    expect(result.rows).toEqual([
      { bookName: 'Imported', number: 1, word: 'care', definition: '注意' },
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'EMPTY_WORD', rowNumber: 2 }),
      expect.objectContaining({ code: 'EMPTY_DEFINITION', rowNumber: 3 }),
    ]);
  });

  it('returns a structured warning when required CSV columns are missing', () => {
    const result = normalizeCatalogImport({
      defaultBookName: 'Imported',
      source: {
        kind: 'csv',
        csvText: 'BookName,Number,Word\nStarter,1,care',
      },
    });

    expect(result.rows).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'MISSING_REQUIRED_COLUMNS',
        message: expect.stringContaining('`Word` と `Meaning`'),
      }),
    ]);
  });

  it('parses CSV rows with quoted commas and preserves row-level warnings', () => {
    const result = normalizeCatalogImport({
      defaultBookName: 'Quoted',
      source: {
        kind: 'csv',
        csvText: [
          'BookName,Number,Word,Meaning',
          '"Quoted, Book",1,"take off","離陸する, 脱ぐ"',
          '"Quoted, Book",2,"","空欄"',
        ].join('\n'),
      },
    });

    expect(result.rows).toEqual([
      {
        bookName: 'Quoted, Book',
        number: 1,
        word: 'take off',
        definition: '離陸する, 脱ぐ',
      },
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'EMPTY_WORD', rowNumber: 3 }),
    ]);
  });
});
