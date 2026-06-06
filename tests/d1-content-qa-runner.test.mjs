import { describe, expect, it } from 'vitest';

import {
  buildWordsSql,
  buildBookWhereClause,
  extractWranglerJson,
  fetchD1ContentRows,
  parseCliArgs,
  unwrapD1Results,
} from '../scripts/analysis/run-d1-content-qa.mjs';

describe('run-d1-content-qa', () => {
  it('requires explicit remote/local mode and validates paging options', () => {
    expect(() => parseCliArgs([])).toThrow('Pass either --remote or --local');
    expect(parseCliArgs(['--remote'])).toEqual(expect.objectContaining({
      database: 'medace-db',
      mode: 'remote',
      pageSize: 5000,
      includeUserBooks: false,
    }));
    expect(parseCliArgs(['--local', '--database', 'preview-db', '--page-size', '2', '--persist-to', '/tmp/d1'])).toEqual(expect.objectContaining({
      database: 'preview-db',
      mode: 'local',
      pageSize: 2,
      persistTo: '/tmp/d1',
    }));
    expect(() => parseCliArgs(['--remote', '--page-size', '0'])).toThrow('--page-size');
    expect(() => parseCliArgs(['--remote', '--persist-to', '/tmp/d1'])).toThrow('--persist-to');
  });

  it('extracts Wrangler JSON even when logs precede the payload', () => {
    const payload = extractWranglerJson('wrangler log\n[{"success":true,"results":[{"id":"book-a"}]}]');

    expect(unwrapD1Results(payload)).toEqual([{ id: 'book-a' }]);
  });

  it('builds official-only filters by default', () => {
    expect(buildBookWhereClause({ includeUserBooks: false, bookIds: [], catalogSources: [], accessScopes: [], titleLike: null }))
      .toContain('b.created_by IS NULL');
    expect(buildBookWhereClause({ includeUserBooks: false, bookIds: [], catalogSources: [], accessScopes: [], titleLike: null }))
      .toContain("catalog_source, '') != 'USER_GENERATED'");
    expect(buildBookWhereClause({
      includeUserBooks: true,
      bookIds: ['book-a'],
      catalogSources: ['LICENSED_PARTNER'],
      accessScopes: ['BUSINESS_ONLY'],
      titleLike: 'Stock',
    })).toContain("b.id IN ('book-a')");
  });

  it('builds a paginated SELECT-only words query', () => {
    const sql = buildWordsSql({
      limit: 25,
      cursor: { bookId: 'book-a', wordNumber: 50, id: 'word-50' },
      filters: { includeUserBooks: false, bookIds: [], catalogSources: [], accessScopes: [], titleLike: null },
    });

    expect(sql).toContain('SELECT');
    expect(sql).toContain('FROM words');
    expect(sql).toContain('JOIN books');
    expect(sql).toContain('w.book_id >');
    expect(sql).toContain('LIMIT 25');
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i);
  });

  it('fetches books and words until the final short page', () => {
    const calls = [];
    const result = fetchD1ContentRows(
      { pageSize: 2 },
      (_options, sql) => {
        calls.push(sql);
        if (sql.includes('FROM books')) {
          return [{ id: 'book-a', title: 'Book A' }];
        }
        if (sql.includes('OFFSET 0')) {
          throw new Error('OFFSET pagination should not be used');
        }
        if (!sql.includes('w.book_id >')) {
          return [
            { id: 'w1', book_id: 'book-a', word_number: 1, word: 'care', definition: '注意' },
            { id: 'w2', book_id: 'book-a', word_number: 2, word: 'heal', definition: '治す' },
          ];
        }
        if (sql.includes('word-50')) {
          throw new Error('Unexpected cursor from unrelated test');
        }
        if (sql.includes("w.id > 'w2'")) {
          return [{ id: 'w3', book_id: 'book-a', word_number: 3, word: 'clinic', definition: '診療所' }];
        }
        return [];
      },
    );

    expect(result.books).toHaveLength(1);
    expect(result.words.map((word) => word.id)).toEqual(['w1', 'w2', 'w3']);
    expect(result.metadata).toEqual(expect.objectContaining({
      bookCount: 1,
      wordCount: 3,
      schemaVersion: 1,
    }));
    expect(calls).toHaveLength(3);
  });
});
