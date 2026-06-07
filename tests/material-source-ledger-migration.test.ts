import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(`${process.cwd()}/migrations/0033_material_source_ledger.sql`, 'utf8');

describe('material source ledger migration', () => {
  it('seeds a ledger row for every currently distributed official material', () => {
    const ledgerRows = [...migration.matchAll(/\('ledger-[^']+',\s*'[^']+',\s*'([^']+)'/g)];

    expect(ledgerRows).toHaveLength(45);
    expect(ledgerRows.filter((match) => match[1] === 'STEADY_STUDY_ORIGINAL')).toHaveLength(6);
    expect(ledgerRows.filter((match) => match[1] === 'LICENSED_PARTNER')).toHaveLength(39);
    expect(migration).toContain('material_source_ledger');
    expect(migration).toContain('content_qa_report');
    expect(migration).toContain('qa_rows_with_sentinel');
  });

  it('does not mark licensed partner material approved before rights review', () => {
    const licensedRows = migration
      .split('\n')
      .filter((line) => line.includes("'LICENSED_PARTNER'"));

    expect(licensedRows).toHaveLength(39);
    licensedRows.forEach((line) => {
      expect(line).toContain("'pending', 'needs_review'");
      expect(line).not.toContain("'approved', 'approved'");
    });
  });
});
