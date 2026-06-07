#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';

const DEFAULT_THRESHOLDS = Object.freeze({
  minBookCount: 1,
  minWordCount: 1,
  maxRequiredBlankRows: 0,
  maxRowsWithSentinel: 0,
  maxSentinelValueCount: 0,
});

const parseInteger = (value, optionName, minimum = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${optionName} must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
};

export const parseCliArgs = (argv) => {
  const options = {
    inputPath: null,
    thresholds: { ...DEFAULT_THRESHOLDS },
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input' || arg === '-i') {
      options.inputPath = nextValue();
    } else if (arg === '--min-book-count') {
      options.thresholds.minBookCount = parseInteger(nextValue(), '--min-book-count', 0);
    } else if (arg === '--min-word-count') {
      options.thresholds.minWordCount = parseInteger(nextValue(), '--min-word-count', 0);
    } else if (arg === '--max-required-blank-rows') {
      options.thresholds.maxRequiredBlankRows = parseInteger(nextValue(), '--max-required-blank-rows', 0);
    } else if (arg === '--max-rows-with-sentinel') {
      options.thresholds.maxRowsWithSentinel = parseInteger(nextValue(), '--max-rows-with-sentinel', 0);
    } else if (arg === '--max-sentinel-value-count') {
      options.thresholds.maxSentinelValueCount = parseInteger(nextValue(), '--max-sentinel-value-count', 0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.inputPath) {
    throw new Error('--input is required.');
  }

  return options;
};

const metric = (summary, key) => Number(summary?.[key] || 0);

export const evaluateContentQaReport = (report, thresholds = DEFAULT_THRESHOLDS) => {
  const summary = report?.summary || {};
  const minCheck = (key, actual, expected) => ({
    key,
    status: actual >= expected ? 'ok' : 'error',
    message: actual >= expected
      ? `${key} ${actual} meets minimum ${expected}`
      : `${key} ${actual} is below minimum ${expected}`,
  });
  const maxCheck = (key, actual, expected) => ({
    key,
    status: actual <= expected ? 'ok' : 'error',
    message: actual <= expected
      ? `${key} ${actual} is within maximum ${expected}`
      : `${key} ${actual} exceeds maximum ${expected}`,
  });
  const checks = [
    minCheck('bookCount', metric(summary, 'bookCount'), thresholds.minBookCount),
    minCheck('wordCount', metric(summary, 'wordCount'), thresholds.minWordCount),
    maxCheck('rowsWithRequiredBlank', metric(summary, 'rowsWithRequiredBlank'), thresholds.maxRequiredBlankRows),
    maxCheck('rowsWithSentinel', metric(summary, 'rowsWithSentinel'), thresholds.maxRowsWithSentinel),
    maxCheck('sentinelValueCount', metric(summary, 'sentinelValueCount'), thresholds.maxSentinelValueCount),
  ];
  const errors = checks.filter((check) => check.status === 'error');

  return {
    ok: errors.length === 0,
    checks,
    errors,
    summary: {
      bookCount: metric(summary, 'bookCount'),
      wordCount: metric(summary, 'wordCount'),
      rowsWithRequiredBlank: metric(summary, 'rowsWithRequiredBlank'),
      rowsWithSentinel: metric(summary, 'rowsWithSentinel'),
      sentinelValueCount: metric(summary, 'sentinelValueCount'),
      duplicateHeadwordCount: metric(summary, 'duplicateHeadwordCount'),
      duplicateRowCount: metric(summary, 'duplicateRowCount'),
    },
  };
};

const usage = () => `Usage: node scripts/check-content-qa-report.mjs --input report.json

Fails release when content QA has blocking issues. Defaults require at least one book/word and zero required blanks or sentinel markers.
Options:
  -i, --input <path>              content:qa report JSON.
  --min-book-count <number>       Default: ${DEFAULT_THRESHOLDS.minBookCount}.
  --min-word-count <number>       Default: ${DEFAULT_THRESHOLDS.minWordCount}.
  --max-required-blank-rows <n>   Default: ${DEFAULT_THRESHOLDS.maxRequiredBlankRows}.
  --max-rows-with-sentinel <n>    Default: ${DEFAULT_THRESHOLDS.maxRowsWithSentinel}.
  --max-sentinel-value-count <n>  Default: ${DEFAULT_THRESHOLDS.maxSentinelValueCount}.
  --help                         Show this help.
`;

export const runCli = async (argv = process.argv.slice(2)) => {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  const report = JSON.parse(await fs.readFile(options.inputPath, 'utf8'));
  const evaluation = evaluateContentQaReport(report, options.thresholds);
  process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
  return evaluation.ok ? 0 : 1;
};

const isMain = process.argv[1]?.endsWith('/check-content-qa-report.mjs')
  || process.argv[1]?.endsWith('\\check-content-qa-report.mjs');

if (isMain) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
