#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  generateContentQaReport,
  rowsFromJsonPayload,
} from '../content-qa-report.mjs';

const DEFAULT_DATABASE = 'medace-db';
const DEFAULT_PAGE_SIZE = 5000;
const WRANGLER_PATH = 'node_modules/wrangler/bin/wrangler.js';

export const parseCliArgs = (argv) => {
  const options = {
    database: DEFAULT_DATABASE,
    mode: null,
    outputPath: null,
    rawOutputPath: null,
    persistTo: null,
    pageSize: DEFAULT_PAGE_SIZE,
    sampleLimit: 20,
    detailLimit: 100,
    includeUserBooks: false,
    bookIds: [],
    catalogSources: [],
    accessScopes: [],
    titleLike: null,
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
    } else if (arg === '--remote') {
      options.mode = 'remote';
    } else if (arg === '--local') {
      options.mode = 'local';
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = nextValue();
    } else if (arg === '--raw-output') {
      options.rawOutputPath = nextValue();
    } else if (arg === '--persist-to') {
      options.persistTo = nextValue();
    } else if (arg === '--page-size') {
      options.pageSize = Number.parseInt(nextValue(), 10);
    } else if (arg === '--sample-limit') {
      options.sampleLimit = Number.parseInt(nextValue(), 10);
    } else if (arg === '--detail-limit') {
      options.detailLimit = Number.parseInt(nextValue(), 10);
    } else if (arg === '--include-user-books') {
      options.includeUserBooks = true;
    } else if (arg === '--book-id') {
      options.bookIds.push(nextValue());
    } else if (arg === '--catalog-source') {
      options.catalogSources.push(nextValue());
    } else if (arg === '--access-scope') {
      options.accessScopes.push(nextValue());
    } else if (arg === '--title-like') {
      options.titleLike = nextValue();
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
  if (!Number.isFinite(options.pageSize) || options.pageSize < 1) {
    throw new Error('--page-size must be a positive number.');
  }
  if (!Number.isFinite(options.sampleLimit) || options.sampleLimit < 0) {
    throw new Error('--sample-limit must be a non-negative number.');
  }
  if (!Number.isFinite(options.detailLimit) || options.detailLimit < 1) {
    throw new Error('--detail-limit must be a positive number.');
  }

  return options;
};

const sqlValue = (value) => `'${String(value).replace(/'/g, "''")}'`;

const sqlLikeValue = (value) => sqlValue(`%${String(value).replace(/[%_]/g, (match) => `\\${match}`)}%`);

export const buildBookWhereClause = (options, tableAlias = 'b') => {
  const safeOptions = {
    includeUserBooks: false,
    bookIds: [],
    catalogSources: [],
    accessScopes: [],
    titleLike: null,
    ...options,
  };
  const clauses = [];
  if (!safeOptions.includeUserBooks) {
    clauses.push(`${tableAlias}.created_by IS NULL`);
    clauses.push(`COALESCE(${tableAlias}.catalog_source, '') != 'USER_GENERATED'`);
  }
  if (safeOptions.bookIds.length > 0) {
    clauses.push(`${tableAlias}.id IN (${safeOptions.bookIds.map(sqlValue).join(', ')})`);
  }
  if (safeOptions.catalogSources.length > 0) {
    clauses.push(`${tableAlias}.catalog_source IN (${safeOptions.catalogSources.map(sqlValue).join(', ')})`);
  }
  if (safeOptions.accessScopes.length > 0) {
    clauses.push(`${tableAlias}.access_scope IN (${safeOptions.accessScopes.map(sqlValue).join(', ')})`);
  }
  if (safeOptions.titleLike) {
    clauses.push(`${tableAlias}.title LIKE ${sqlLikeValue(safeOptions.titleLike)} ESCAPE '\\'`);
  }
  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
};

export const extractWranglerJson = (raw) => {
  const arrayIndex = raw.indexOf('[');
  const objectIndex = raw.indexOf('{');
  const start = [arrayIndex, objectIndex]
    .filter((value) => value >= 0)
    .sort((left, right) => left - right)[0];

  if (start === undefined) {
    throw new Error(`Failed to parse Wrangler JSON output.\n${raw}`);
  }

  return JSON.parse(raw.slice(start));
};

export const unwrapD1Results = (payload) => {
  const sections = Array.isArray(payload) ? payload : [payload];
  return sections.flatMap((section) => {
    if (Array.isArray(section?.results)) return section.results;
    if (Array.isArray(section?.result?.[0]?.results)) return section.result[0].results;
    return [];
  });
};

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

export const buildBooksSql = (options) => `
SELECT
  b.id,
  b.title,
  b.word_count,
  b.catalog_source,
  b.access_scope,
  b.source_context,
  b.description,
  b.created_by
FROM books b
${buildBookWhereClause(options)}
ORDER BY b.catalog_source, b.title, b.id;
`;

export const buildWordsSql = ({ limit, cursor, filters }) => {
  const cursorClause = cursor
    ? `(
      w.book_id > ${sqlValue(cursor.bookId)}
      OR (w.book_id = ${sqlValue(cursor.bookId)} AND w.word_number > ${Number(cursor.wordNumber)})
      OR (w.book_id = ${sqlValue(cursor.bookId)} AND w.word_number = ${Number(cursor.wordNumber)} AND w.id > ${sqlValue(cursor.id)})
    )`
    : '';
  const bookWhereClause = buildBookWhereClause(filters);
  const clauses = [
    ...(bookWhereClause ? [bookWhereClause.replace(/^WHERE\s+/i, '')] : []),
    ...(cursorClause ? [cursorClause] : []),
  ];
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  return `
SELECT
  w.id,
  w.book_id,
  w.word_number,
  w.word,
  w.definition,
  w.category,
  w.subcategory,
  w.section,
  w.source_sheet,
  w.source_entry_id,
  w.example_sentence,
  w.example_meaning,
  w.example_audit_status,
  w.example_image_key,
  w.example_image_audit_status
FROM words w
JOIN books b ON b.id = w.book_id
${whereClause}
ORDER BY w.book_id, w.word_number, w.id
LIMIT ${limit};
`;
};

export const fetchD1ContentRows = (options, runQuery = runWranglerQuery) => {
  const safeOptions = {
    includeUserBooks: false,
    bookIds: [],
    catalogSources: [],
    accessScopes: [],
    titleLike: null,
    ...options,
  };
  const books = runQuery(safeOptions, buildBooksSql(safeOptions));
  const words = [];

  let cursor = null;
  for (;;) {
    const page = runQuery(safeOptions, buildWordsSql({ limit: safeOptions.pageSize, cursor, filters: safeOptions }));
    words.push(...page);
    if (page.length < safeOptions.pageSize) break;
    const last = page[page.length - 1];
    cursor = {
      bookId: last.book_id,
      wordNumber: last.word_number,
      id: last.id,
    };
  }

  return {
    metadata: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      database: safeOptions.database,
      mode: safeOptions.mode,
      filters: {
        includeUserBooks: safeOptions.includeUserBooks,
        bookIds: safeOptions.bookIds,
        catalogSources: safeOptions.catalogSources,
        accessScopes: safeOptions.accessScopes,
        titleLike: safeOptions.titleLike,
      },
      bookCount: books.length,
      wordCount: words.length,
    },
    books,
    words,
  };
};

const usage = () => `Usage: node scripts/analysis/run-d1-content-qa.mjs --remote|--local [--database medace-db] [--output report.json]

Reads books/words from Cloudflare D1 with SELECT-only queries and emits the same JSON report as npm run content:qa.
Options:
  --database <name>       D1 database name. Default: medace-db.
  --remote                Query remote D1. Must be explicit.
  --local                 Query local D1 instead of remote. Must be explicit.
  -o, --output <path>     Write QA report JSON to file instead of stdout.
  --raw-output <path>     Also write raw {books, words} JSON to file.
  --persist-to <dir>      Local D1 persist directory. Only with --local.
  --include-user-books    Include user-created books. Default excludes created_by rows.
  --book-id <id>          Limit to a book id. Can be repeated.
  --catalog-source <src>  Limit to a catalog_source. Can be repeated.
  --access-scope <scope>  Limit to an access_scope. Can be repeated.
  --title-like <text>     Limit to book titles containing text.
  --page-size <number>    Words page size. Default: 5000.
  --sample-limit <number> Max blank/sentinel samples per book. Default: 20.
  --detail-limit <number> Max category/source/duplicate details per book. Default: 100.
  --compact               Print compact JSON.
  --help                  Show this help.
`;

export const runCli = async (argv = process.argv.slice(2)) => {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  const rawPayload = fetchD1ContentRows(options);
  const report = generateContentQaReport(rowsFromJsonPayload(rawPayload), {
    sampleLimit: options.sampleLimit,
    detailLimit: options.detailLimit,
  });
  report.source = rawPayload.metadata;
  const json = JSON.stringify(report, null, options.compact ? 0 : 2);

  if (options.rawOutputPath) {
    await fs.mkdir(path.dirname(options.rawOutputPath), { recursive: true });
    await fs.writeFile(options.rawOutputPath, `${JSON.stringify(rawPayload, null, options.compact ? 0 : 2)}\n`, 'utf8');
  }
  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${json}\n`, 'utf8');
  } else {
    process.stdout.write(`${json}\n`);
  }

  return 0;
};

const isMain = process.argv[1]?.endsWith('/run-d1-content-qa.mjs') || process.argv[1]?.endsWith('\\run-d1-content-qa.mjs');

if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
