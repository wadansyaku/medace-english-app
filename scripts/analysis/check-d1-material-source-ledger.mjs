#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  extractWranglerJson,
  unwrapD1Results,
} from './run-d1-content-qa.mjs';

const DEFAULT_DATABASE = 'medace-db';
const WRANGLER_PATH = 'node_modules/wrangler/bin/wrangler.js';

export const parseCliArgs = (argv) => {
  const options = {
    database: DEFAULT_DATABASE,
    mode: null,
    outputPath: null,
    persistTo: null,
    minTodaySelectableBooks: 1,
    maxWarningBooks: null,
    compact: false,
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
    } else if (arg === '--database') {
      options.database = nextValue();
    } else if (arg === '--remote' || arg === '--local') {
      const mode = arg.slice(2);
      if (options.mode && options.mode !== mode) throw new Error('Pass only one of --remote or --local.');
      options.mode = mode;
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = nextValue();
    } else if (arg === '--persist-to') {
      options.persistTo = nextValue();
    } else if (arg === '--min-today-selectable-books') {
      options.minTodaySelectableBooks = Number.parseInt(nextValue(), 10);
    } else if (arg === '--max-warning-books') {
      options.maxWarningBooks = Number.parseInt(nextValue(), 10);
    } else if (arg === '--compact') {
      options.compact = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.database) throw new Error('--database must not be empty.');
  if (!options.mode) throw new Error('Pass either --remote or --local explicitly.');
  if (options.mode === 'remote' && options.persistTo) {
    throw new Error('--persist-to can only be used with --local.');
  }
  if (!Number.isFinite(options.minTodaySelectableBooks) || options.minTodaySelectableBooks < 0) {
    throw new Error('--min-today-selectable-books must be a non-negative number.');
  }
  if (options.maxWarningBooks !== null && (!Number.isFinite(options.maxWarningBooks) || options.maxWarningBooks < 0)) {
    throw new Error('--max-warning-books must be a non-negative number.');
  }

  return options;
};

export const buildMaterialSourceLedgerSql = () => `
SELECT
  COUNT(*) AS official_books,
  COALESCE(SUM(CASE WHEN m.book_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS books_with_source_ledger,
  COALESCE(SUM(CASE WHEN m.book_id IS NULL THEN 1 ELSE 0 END), 0) AS books_missing_source_ledger,
  COALESCE(SUM(CASE WHEN m.rights_status = 'approved' AND m.review_status = 'approved' THEN 1 ELSE 0 END), 0) AS source_approved_books,
  COALESCE(SUM(CASE WHEN m.book_id IS NOT NULL AND (m.rights_status != 'approved' OR m.review_status != 'approved') THEN 1 ELSE 0 END), 0) AS source_review_required_books,
  COALESCE(SUM(CASE WHEN COALESCE(m.qa_word_count, 0) <= 0 OR COALESCE(m.qa_required_blank_rows, 0) > 0 OR COALESCE(m.qa_rows_with_sentinel, 0) > 0 OR COALESCE(m.qa_sentinel_value_count, 0) > 0 THEN 1 ELSE 0 END), 0) AS qa_blocked_books,
  COALESCE(SUM(CASE WHEN m.book_id IS NOT NULL AND (COALESCE(m.qa_duplicate_headword_count, 0) > 0 OR COALESCE(m.qa_source_coverage_rate, 0) < 1 OR COALESCE(m.qa_example_pair_coverage_rate, 0) < 1) THEN 1 ELSE 0 END), 0) AS warning_books,
  COALESCE(SUM(CASE WHEN m.rights_status = 'approved' AND m.review_status = 'approved' AND COALESCE(m.qa_word_count, 0) > 0 AND COALESCE(m.qa_required_blank_rows, 0) = 0 AND COALESCE(m.qa_rows_with_sentinel, 0) = 0 AND COALESCE(m.qa_sentinel_value_count, 0) = 0 THEN 1 ELSE 0 END), 0) AS today_selectable_books
FROM books b
LEFT JOIN material_source_ledger m ON m.book_id = b.id
WHERE b.created_by IS NULL
  AND COALESCE(b.catalog_source, '') != 'USER_GENERATED';
`;

const runWranglerQuery = (options, sql) => {
  const args = [
    WRANGLER_PATH,
    'd1',
    'execute',
    options.database,
    '--command',
    sql,
    '--json',
  ];
  if (options.mode === 'remote') args.splice(4, 0, '--remote');
  if (options.mode === 'local' && options.persistTo) {
    args.push('--persist-to', options.persistTo);
  }

  const raw = execFileSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
    },
    maxBuffer: 128 * 1024 * 1024,
  });

  return unwrapD1Results(extractWranglerJson(raw));
};

export const evaluateMaterialSourceLedgerSummary = (summary, thresholds = {}) => {
  const minTodaySelectableBooks = thresholds.minTodaySelectableBooks ?? 1;
  const maxWarningBooks = thresholds.maxWarningBooks;
  const errors = [];
  const warnings = [];
  if (Number(summary.official_books || 0) < 1) {
    errors.push('No official books were found.');
  }
  if (Number(summary.books_missing_source_ledger || 0) > 0) {
    errors.push(`${summary.books_missing_source_ledger} official book(s) are missing source ledger rows.`);
  }
  if (Number(summary.qa_blocked_books || 0) > 0) {
    errors.push(`${summary.qa_blocked_books} official book(s) have content QA blockers.`);
  }
  if (Number(summary.today_selectable_books || 0) < minTodaySelectableBooks) {
    errors.push(`Today-selectable approved books ${summary.today_selectable_books || 0} is below minimum ${minTodaySelectableBooks}.`);
  }
  if (Number(summary.warning_books || 0) > 0) {
    warnings.push(`${summary.warning_books} official book(s) have source ledger warning metrics.`);
  }
  if (maxWarningBooks !== undefined && maxWarningBooks !== null && Number(summary.warning_books || 0) > maxWarningBooks) {
    errors.push(`Source ledger warning books ${summary.warning_books || 0} exceeds maximum ${maxWarningBooks}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary,
  };
};

const usage = () => `Usage: node scripts/analysis/check-d1-material-source-ledger.mjs --remote|--local [--database medace-db]

Reads D1 source ledger status and fails release when official books lack ledger rows, QA blockers remain, or no approved material can feed Today Focus.
Options:
  --database <name>                    D1 database name. Default: medace-db.
  --remote                             Query remote D1. Must be explicit.
  --local                              Query local D1. Must be explicit.
  -o, --output <path>                  Write JSON result to file.
  --persist-to <dir>                   Local D1 persist directory. Only with --local.
  --min-today-selectable-books <num>   Default: 1.
  --max-warning-books <num>            Fail if source-ledger warning books exceed this value. Default: report only.
  --compact                            Print compact JSON.
  --help                               Show this help.
`;

export const runCli = async (argv = process.argv.slice(2), runQuery = runWranglerQuery) => {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  const [summary = {}] = runQuery(options, buildMaterialSourceLedgerSql());
  const evaluation = evaluateMaterialSourceLedgerSummary(summary, {
    minTodaySelectableBooks: options.minTodaySelectableBooks,
    maxWarningBooks: options.maxWarningBooks,
  });
  const json = JSON.stringify(evaluation, null, options.compact ? 0 : 2);

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${json}\n`, 'utf8');
  } else {
    process.stdout.write(`${json}\n`);
  }

  return evaluation.ok ? 0 : 1;
};

const isMain = process.argv[1]?.endsWith('/check-d1-material-source-ledger.mjs')
  || process.argv[1]?.endsWith('\\check-d1-material-source-ledger.mjs');

if (isMain) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
