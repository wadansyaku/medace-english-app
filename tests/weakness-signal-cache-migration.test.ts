import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(`${process.cwd()}/migrations/0034_clear_weakness_signal_cache.sql`, 'utf8');

describe('weakness signal cache migration', () => {
  it('clears the derived weakness cache after material source gates are introduced', () => {
    expect(migration).toContain('DELETE FROM student_weakness_signals;');
    expect(migration).toContain('derived cache');
  });
});
