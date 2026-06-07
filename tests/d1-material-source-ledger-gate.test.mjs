import { describe, expect, it } from 'vitest';

import {
  buildMaterialSourceLedgerSql,
  evaluateMaterialSourceLedgerSummary,
  parseCliArgs,
} from '../scripts/analysis/check-d1-material-source-ledger.mjs';

describe('check-d1-material-source-ledger', () => {
  it('requires explicit D1 mode and validates local persist usage', () => {
    expect(() => parseCliArgs([])).toThrow('Pass either --remote or --local');
    expect(parseCliArgs(['--remote'])).toEqual(expect.objectContaining({
      database: 'medace-db',
      mode: 'remote',
      minTodaySelectableBooks: 1,
    }));
    expect(parseCliArgs(['--local', '--persist-to', '/tmp/d1'])).toEqual(expect.objectContaining({
      mode: 'local',
      persistTo: '/tmp/d1',
    }));
    expect(() => parseCliArgs(['--remote', '--persist-to', '/tmp/d1'])).toThrow('--persist-to');
  });

  it('builds a SELECT-only source ledger summary query', () => {
    const sql = buildMaterialSourceLedgerSql();

    expect(sql).toContain('material_source_ledger');
    expect(sql).toContain('today_selectable_books');
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i);
  });

  it('passes complete ledger coverage while allowing review-pending licensed material', () => {
    const result = evaluateMaterialSourceLedgerSummary({
      official_books: 45,
      books_with_source_ledger: 45,
      books_missing_source_ledger: 0,
      source_approved_books: 6,
      source_review_required_books: 39,
      qa_blocked_books: 0,
      today_selectable_books: 6,
    });

    expect(result.ok).toBe(true);
  });

  it('fails missing ledger rows, QA blockers, and no approved Today material', () => {
    const result = evaluateMaterialSourceLedgerSummary({
      official_books: 45,
      books_with_source_ledger: 44,
      books_missing_source_ledger: 1,
      source_approved_books: 0,
      source_review_required_books: 44,
      qa_blocked_books: 1,
      today_selectable_books: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('missing source ledger');
    expect(result.errors.join('\n')).toContain('content QA blockers');
    expect(result.errors.join('\n')).toContain('below minimum');
  });
});
