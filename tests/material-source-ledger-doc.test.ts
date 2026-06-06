import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const doc = readFileSync('docs/material-source-ledger-minimum-ops.md', 'utf8');

const REQUIRED_LEDGER_FIELDS = [
  'source_id',
  'catalog_source',
  'book_title',
  'edition',
  'rights_status',
  'source_file',
  'extracted_at',
  'transform_log',
  'review_status',
  'notes',
] as const;

describe('material source ledger documentation', () => {
  it('keeps every required ledger field documented', () => {
    for (const field of REQUIRED_LEDGER_FIELDS) {
      expect(doc).toContain(`\`${field}\``);
    }
  });

  it('documents the display gate and the operational boundaries around personal decks, D1, and content QA', () => {
    for (const requiredTerm of [
      '公式教材',
      'ライセンス教材',
      'My単語帳',
      'D1',
      'content:qa',
      'STEADY_STUDY_ORIGINAL',
      'LICENSED_PARTNER',
      'USER_GENERATED',
      'access_scope',
      'approved',
    ]) {
      expect(doc).toContain(requiredTerm);
    }
  });
});
