import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  buildWordsSql,
  buildBookWhereClause,
  extractWranglerJson,
  fetchD1ContentRows,
  parseCliArgs,
  runCli,
  toContentQaSummary,
  unwrapD1Results,
} from '../scripts/analysis/run-d1-content-qa.mjs';
import { generateContentQaReport } from '../scripts/content-qa-report.mjs';
import { evaluateContentQaReport } from '../scripts/check-content-qa-report.mjs';

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
    expect(parseCliArgs(['--remote', '--summary-only']).summaryOnly).toBe(true);
    expect(() => parseCliArgs(['--remote', '--summary-only', '--raw-output', '/tmp/raw.json']))
      .toThrow('--summary-only cannot be combined with --raw-output');
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

  it.each([
    { label: 'valid content', rows: [{ word: 'care', definition: '注意' }], ok: true },
    { label: 'missing required definition', rows: [{ word: 'care', definition: '' }], ok: false },
    { label: 'sentinel in example', rows: [{ word: 'care', definition: '注意', example_sentence: '[未抽出] private-example' }], ok: false },
    { label: 'empty catalog', rows: [], ok: false },
  ])('keeps the same release decision for $label', ({ rows, ok }) => {
    const report = generateContentQaReport(rows);
    report.source = { database: 'test-db', mode: 'local', bookCount: report.summary.bookCount, wordCount: rows.length };
    const summary = toContentQaSummary(report);

    expect(evaluateContentQaReport(summary)).toEqual(evaluateContentQaReport(report));
    expect(evaluateContentQaReport(summary).ok).toBe(ok);
  });

  it('allows only aggregate fields even if future report objects gain private data', () => {
    const report = generateContentQaReport([{ bookName: 'private-title', word: 'private-word', definition: '[未抽出] private-definition' }]);
    report.summary.futurePrivateField = 'private-summary-value';
    report.source = {
      database: 'test-db', mode: 'local', bookCount: 1, wordCount: 1,
      filters: { bookIds: ['private-book-id'], titleLike: 'private-title' },
      futurePrivateField: 'private-source-value',
    };
    const summary = toContentQaSummary(report);

    expect(Object.keys(summary)).toEqual(['generatedAt', 'summary', 'source']);
    expect(Object.keys(summary.source)).toEqual(['database', 'mode', 'bookCount', 'wordCount']);
    expect(Object.values(summary.summary).every((value) => typeof value === 'number')).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('private-');
    delete report.summary.wordCount;
    expect(() => toContentQaSummary(report)).toThrow('wordCount is missing or invalid');
  });

  it('writes only summary evidence to both files and stdout without weakening the content gate', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'medace-content-summary-'));
    const outputPath = path.join(directory, 'report.json');
    const query = (_options, sql) => sql.includes('FROM books')
      ? [{ id: 'private-book-id', title: 'private-title' }]
      : [{
        id: 'private-word-id', book_id: 'private-book-id', word_number: 1,
        word: 'private-word', definition: '[未抽出] private-definition',
        example_sentence: 'private-example', source_sheet: 'private-source-sheet',
      }];
    const argv = ['--local', '--summary-only', '--compact', '--book-id', 'private-book-id', '--title-like', 'private-title'];
    try {
      await runCli([...argv, '--output', outputPath], query);
      const fileJson = await readFile(outputPath, 'utf8');
      expect(fileJson).not.toContain('private-');
      expect(evaluateContentQaReport(JSON.parse(fileJson)).ok).toBe(false);
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        await runCli(argv, query);
        const stdoutJson = stdout.mock.calls.map(([value]) => String(value)).join('');
        expect(stdoutJson).not.toContain('private-');
        expect(JSON.parse(stdoutJson).summary).toEqual(JSON.parse(fileJson).summary);
      } finally {
        stdout.mockRestore();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps failed raw query output out of public summary-mode errors', async () => {
    await expect(runCli(['--local', '--summary-only'], () => {
      throw new Error('query failed: private-word-id private-definition');
    })).rejects.toThrow(/^D1 content QA query failed; raw query output omitted in summary-only mode\.$/);
  });

  it('captures real child stderr before reporting a summary-mode query failure', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'medace-content-stderr-'));
    const wranglerDirectory = path.join(directory, 'node_modules', 'wrangler', 'bin');
    const privateFixture = 'private-material-definition-from-child';
    try {
      await mkdir(wranglerDirectory, { recursive: true });
      await writeFile(path.join(wranglerDirectory, 'wrangler.js'),
        `process.stderr.write(${JSON.stringify(`${privateFixture}\n`)}); process.exit(1);\n`);
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL('../scripts/analysis/run-d1-content-qa.mjs', import.meta.url)),
        '--local', '--summary-only',
      ], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('D1 content QA query failed; raw query output omitted in summary-only mode.\n');
      expect(`${result.stdout}${result.stderr}`).not.toContain(privateFixture);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
