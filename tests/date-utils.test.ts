import { describe, expect, it } from 'vitest';

import { getTokyoMonthRange } from '../utils/date';

describe('date utils', () => {
  it('keeps JST month ranges aligned at month boundaries', () => {
    const range = getTokyoMonthRange('2026-03');

    expect(new Date(range.start).toISOString()).toBe('2026-02-28T15:00:00.000Z');
    expect(new Date(range.end).toISOString()).toBe('2026-03-31T15:00:00.000Z');
  });

  it('handles year rollover without truncating the month end', () => {
    const range = getTokyoMonthRange('2026-12');

    expect(new Date(range.start).toISOString()).toBe('2026-11-30T15:00:00.000Z');
    expect(new Date(range.end).toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });
});
