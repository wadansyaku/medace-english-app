import { describe, expect, it } from 'vitest';

import {
  evaluateContentQaReport,
  parseCliArgs,
} from '../scripts/check-content-qa-report.mjs';

describe('check-content-qa-report', () => {
  it('requires an input report and exposes release-blocking defaults', () => {
    expect(() => parseCliArgs([])).toThrow('--input is required');
    expect(parseCliArgs(['--input', 'report.json'])).toEqual({
      inputPath: 'report.json',
      help: false,
      thresholds: {
        minBookCount: 1,
        minWordCount: 1,
        maxRequiredBlankRows: 0,
        maxRowsWithSentinel: 0,
        maxSentinelValueCount: 0,
      },
    });
    expect(parseCliArgs([
      '--input',
      'report.json',
      '--min-word-count',
      '100',
      '--max-rows-with-sentinel',
      '2',
    ])).toEqual(expect.objectContaining({
      thresholds: expect.objectContaining({
        minWordCount: 100,
        maxRowsWithSentinel: 2,
      }),
    }));
    expect(() => parseCliArgs(['--input', 'report.json', '--max-required-blank-rows', '-1'])).toThrow('--max-required-blank-rows');
  });

  it('passes a report with content and no required blanks or sentinels', () => {
    const result = evaluateContentQaReport({
      summary: {
        bookCount: 45,
        wordCount: 65684,
        rowsWithRequiredBlank: 0,
        rowsWithSentinel: 0,
        sentinelValueCount: 0,
        duplicateHeadwordCount: 83,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.summary.duplicateHeadwordCount).toBe(83);
  });

  it('fails release-blocking content problems', () => {
    const result = evaluateContentQaReport({
      summary: {
        bookCount: 0,
        wordCount: 0,
        rowsWithRequiredBlank: 1,
        rowsWithSentinel: 2,
        sentinelValueCount: 3,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.key)).toEqual([
      'bookCount',
      'wordCount',
      'rowsWithRequiredBlank',
      'rowsWithSentinel',
      'sentinelValueCount',
    ]);
  });
});
