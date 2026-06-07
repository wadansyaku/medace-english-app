#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  buildBookWhereClause,
  extractWranglerJson,
  unwrapD1Results,
} from './run-d1-content-qa.mjs';

const DEFAULT_DATABASE = 'medace-db';
const DEFAULT_MARKER = '[未抽出]';
const DEFAULT_SAMPLE_LIMIT = 25;
const WRANGLER_PATH = 'node_modules/wrangler/bin/wrangler.js';

export const REFERENCE_CHECKS = Object.freeze([
  {
    key: 'learning_histories',
    existsSql: 'EXISTS (SELECT 1 FROM learning_histories r WHERE r.word_id = tw.id)',
  },
  {
    key: 'word_reports',
    existsSql: 'EXISTS (SELECT 1 FROM word_reports r WHERE r.word_id = tw.id)',
  },
  {
    key: 'learning_interaction_events',
    existsSql: 'EXISTS (SELECT 1 FROM learning_interaction_events r WHERE r.word_id = tw.id)',
  },
  {
    key: 'ai_generated_contents',
    existsSql: 'EXISTS (SELECT 1 FROM ai_generated_contents r WHERE r.word_id = tw.id)',
  },
  {
    key: 'ai_generated_examples',
    existsSql: 'EXISTS (SELECT 1 FROM ai_generated_examples r WHERE r.word_id = tw.id)',
  },
  {
    key: 'ai_generated_problems',
    existsSql: 'EXISTS (SELECT 1 FROM ai_generated_problems r WHERE r.word_id = tw.id)',
  },
  {
    key: 'assessment_item_metadata_via_ai_problem',
    existsSql: [
      'EXISTS (',
      '  SELECT 1',
      '  FROM assessment_item_metadata r',
      '  JOIN ai_generated_problems p ON p.id = r.problem_id',
      '  WHERE p.word_id = tw.id',
      ')',
    ].join(' '),
  },
  {
    key: 'cbt_problem_stats_via_ai_problem',
    existsSql: [
      'EXISTS (',
      '  SELECT 1',
      '  FROM cbt_problem_stats r',
      '  JOIN ai_generated_problems p ON p.id = r.problem_id',
      '  WHERE p.word_id = tw.id',
      ')',
    ].join(' '),
  },
  {
    key: 'japanese_translation_feedback_events',
    existsSql: 'EXISTS (SELECT 1 FROM japanese_translation_feedback_events r WHERE r.word_id = tw.id)',
  },
  {
    key: 'english_practice_attempts',
    existsSql: 'EXISTS (SELECT 1 FROM english_practice_attempts r WHERE r.word_id = tw.id)',
  },
  {
    key: 'cbt_learner_word_states',
    existsSql: 'EXISTS (SELECT 1 FROM cbt_learner_word_states r WHERE r.word_id = tw.id)',
  },
  {
    key: 'weekly_mission_assignment_json',
    existsSql: [
      'EXISTS (',
      '  SELECT 1 FROM weekly_mission_assignments r',
      "  WHERE instr(COALESCE(r.new_word_ids_json, ''), tw.id) > 0",
      "     OR instr(COALESCE(r.review_word_ids_json, ''), tw.id) > 0",
      ')',
    ].join(' '),
  },
  {
    key: 'product_events_soft_word_subject',
    existsSql: "EXISTS (SELECT 1 FROM product_events r WHERE r.subject_type = 'word' AND r.subject_id = tw.id)",
  },
  {
    key: 'words_with_r2_example_image_key',
    existsSql: "COALESCE(TRIM(tw.example_image_key), '') != ''",
  },
]);

const sqlValue = (value) => `'${String(value).replace(/'/g, "''")}'`;

const escapeLikeText = (value) => String(value).replace(/[\\%_]/g, (match) => `\\${match}`);

const sqlLikeValue = (value) => sqlValue(`%${escapeLikeText(value)}%`);

const parsePositiveInteger = (value, optionName) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive number.`);
  }
  return parsed;
};

export const parseCliArgs = (argv) => {
  const options = {
    database: DEFAULT_DATABASE,
    mode: null,
    marker: DEFAULT_MARKER,
    apply: false,
    expectRows: null,
    outputPath: null,
    persistTo: null,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
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
    } else if (arg === '--remote' || arg === '--local') {
      const nextMode = arg.slice(2);
      if (options.mode && options.mode !== nextMode) {
        throw new Error('Pass only one of --remote or --local.');
      }
      options.mode = nextMode;
    } else if (arg === '--marker') {
      options.marker = nextValue();
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--expect-rows') {
      options.expectRows = parsePositiveInteger(nextValue(), '--expect-rows');
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = nextValue();
    } else if (arg === '--persist-to') {
      options.persistTo = nextValue();
    } else if (arg === '--sample-limit') {
      options.sampleLimit = parsePositiveInteger(nextValue(), '--sample-limit');
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
  if (!options.marker) throw new Error('--marker must not be empty.');
  if (!options.mode) throw new Error('Pass either --remote or --local explicitly.');
  if (options.mode === 'remote' && options.persistTo) {
    throw new Error('--persist-to can only be used with --local.');
  }
  if (options.apply && options.expectRows === null) {
    throw new Error('--apply requires --expect-rows so production changes are bounded.');
  }

  return options;
};

export const buildTargetWhereClause = (options, wordAlias = 'w', bookAlias = 'b') => {
  const markerLike = sqlLikeValue(options.marker || DEFAULT_MARKER);
  const markerClause = [
    `(${wordAlias}.word LIKE ${markerLike} ESCAPE '\\'`,
    `OR ${wordAlias}.definition LIKE ${markerLike} ESCAPE '\\')`,
  ].join(' ');
  const bookClause = buildBookWhereClause(options, bookAlias).replace(/^WHERE\s+/i, '');
  return [markerClause, bookClause].filter(Boolean).join(' AND ');
};

const buildTargetWordsCte = (options) => `
WITH target_words AS (
  SELECT
    w.id,
    w.book_id,
    w.word_number,
    w.example_image_key
  FROM words w
  JOIN books b ON b.id = w.book_id
  WHERE ${buildTargetWhereClause(options)}
)
`;

export const buildTargetBooksSql = (options) => `
SELECT
  b.id AS book_id,
  b.title,
  b.word_count AS declared_word_count,
  COUNT(*) AS target_rows,
  MIN(w.word_number) AS min_word_number,
  MAX(w.word_number) AS max_word_number
FROM words w
JOIN books b ON b.id = w.book_id
WHERE ${buildTargetWhereClause(options)}
GROUP BY b.id, b.title, b.word_count
ORDER BY target_rows DESC, b.title, b.id;
`;

export const buildTargetWordsSql = (options) => `
SELECT
  w.id,
  w.book_id,
  b.title,
  w.word_number,
  w.word,
  w.definition,
  w.example_image_key
FROM words w
JOIN books b ON b.id = w.book_id
WHERE ${buildTargetWhereClause(options)}
ORDER BY b.title, w.word_number, w.id
`;

export const buildReferenceCountSql = (options) => {
  const referenceColumns = REFERENCE_CHECKS.map((check) => (
    `COALESCE(SUM(CASE WHEN ${check.existsSql} THEN 1 ELSE 0 END), 0) AS ${check.key}`
  ));

  return `
${buildTargetWordsCte(options)}
SELECT
  COUNT(*) AS target_rows,
  ${referenceColumns.join(',\n  ')}
FROM target_words tw;
`;
};

export const buildDeleteTargetWordsSql = (wordIds) => {
  if (!Array.isArray(wordIds) || wordIds.length === 0) return null;
  return `
DELETE FROM words
WHERE id IN (${wordIds.map(sqlValue).join(', ')});
`;
};

export const buildRefreshBookCountsSql = (bookIds, updatedAtMs) => {
  if (!Array.isArray(bookIds) || bookIds.length === 0) return null;
  return `
UPDATE books
SET
  word_count = (
    SELECT COUNT(*)
    FROM words w
    WHERE w.book_id = books.id
  ),
  updated_at = ${Number(updatedAtMs)}
WHERE id IN (${bookIds.map(sqlValue).join(', ')});
`;
};

export const buildApplySqls = (targetWords, targetBooks, updatedAtMs) => [
  buildDeleteTargetWordsSql(targetWords.map((word) => word.id)),
  buildRefreshBookCountsSql(targetBooks.map((book) => book.book_id), updatedAtMs),
].filter(Boolean);

export const extractD1ExecutionSummaries = (payload) => {
  const sections = Array.isArray(payload) ? payload : [payload];
  return sections.map((section) => ({
    success: section?.success === true,
    resultCount: Array.isArray(section?.results) ? section.results.length : 0,
    changes: section?.meta?.changes ?? null,
    rowsRead: section?.meta?.rows_read ?? null,
    rowsWritten: section?.meta?.rows_written ?? null,
    durationMs: section?.meta?.duration ?? section?.meta?.sql_duration_ms ?? null,
  }));
};

const runWranglerExecute = (options, sql) => {
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

  return extractWranglerJson(raw);
};

const queryRows = (options, sql, execute = runWranglerExecute) => unwrapD1Results(execute(options, sql));

export const fetchRemediationPlan = (options, execute = runWranglerExecute) => {
  const targetBooks = queryRows(options, buildTargetBooksSql(options), execute);
  const targetWords = queryRows(options, buildTargetWordsSql(options), execute);
  const referenceCounts = queryRows(options, buildReferenceCountSql(options), execute)[0] || { target_rows: 0 };
  const targetRows = targetWords.length;
  const referenceTargetRows = Number(referenceCounts.target_rows || 0);
  const blockedReferences = REFERENCE_CHECKS
    .map((check) => ({
      key: check.key,
      count: Number(referenceCounts[check.key] || 0),
    }))
    .filter((check) => check.count > 0);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    database: options.database,
    mode: options.mode,
    marker: options.marker,
    filters: {
      includeUserBooks: options.includeUserBooks,
      bookIds: options.bookIds,
      catalogSources: options.catalogSources,
      accessScopes: options.accessScopes,
      titleLike: options.titleLike,
    },
    targetRows,
    referenceTargetRows,
    countsConsistent: targetRows === referenceTargetRows,
    targetBooks,
    targetWords,
    referenceCounts,
    blockedReferences,
    samples: targetWords.slice(0, options.sampleLimit || DEFAULT_SAMPLE_LIMIT),
    canApply: targetRows > 0 && targetRows === referenceTargetRows && blockedReferences.length === 0,
  };
};

export const validatePlanForApply = (options, plan) => {
  if (!options.apply) return;
  if (options.expectRows === null) {
    throw new Error('--apply requires --expect-rows so production changes are bounded.');
  }
  if (plan.targetRows !== options.expectRows) {
    throw new Error(`Refusing to apply: expected ${options.expectRows} target rows, found ${plan.targetRows}.`);
  }
  if (!plan.countsConsistent) {
    throw new Error(`Refusing to apply: target word count ${plan.targetRows} differs from reference count ${plan.referenceTargetRows}.`);
  }
  if (plan.targetRows <= 0) {
    throw new Error('Refusing to apply: no target rows were found.');
  }
  const uniqueWordIds = new Set(plan.targetWords.map((word) => word.id));
  if (uniqueWordIds.size !== plan.targetWords.length) {
    throw new Error('Refusing to apply: target word ids contain duplicates.');
  }
  if (plan.blockedReferences.length > 0) {
    const detail = plan.blockedReferences.map((item) => `${item.key}=${item.count}`).join(', ');
    throw new Error(`Refusing to apply: target rows are still referenced (${detail}).`);
  }
};

export const applyRemediation = (options, execute = runWranglerExecute, now = Date.now) => {
  const before = fetchRemediationPlan(options, execute);
  validatePlanForApply(options, before);

  const updatedAtMs = Number(now());
  const sqls = buildApplySqls(before.targetWords, before.targetBooks, updatedAtMs);
  const mutations = sqls.map((sql) => ({
    sql,
    summaries: extractD1ExecutionSummaries(execute(options, sql)),
  }));
  const after = fetchRemediationPlan(options, execute);
  if (after.targetRows !== 0) {
    throw new Error(`Remediation applied but ${after.targetRows} target rows still remain.`);
  }

  return {
    action: 'apply',
    appliedAt: new Date(updatedAtMs).toISOString(),
    before,
    mutations,
    after,
  };
};

const usage = () => `Usage: node scripts/analysis/remediate-blocked-content-markers.mjs --remote|--local --expect-rows <n> [--apply]

Builds a dry-run plan for removing blocked content marker rows from D1. With --apply, it deletes target words and refreshes affected books.word_count.
Options:
  --database <name>       D1 database name. Default: medace-db.
  --remote                Query remote D1. Must be explicit.
  --local                 Query local D1 instead of remote. Must be explicit.
  --marker <text>         Marker to match in word/definition. Default: [未抽出].
  --apply                 Apply the deletion. Without this, dry-run only.
  --expect-rows <number>  Required with --apply. Refuses mutation if count differs.
  -o, --output <path>     Write plan/result JSON to file instead of stdout.
  --persist-to <dir>      Local D1 persist directory. Only with --local.
  --include-user-books    Include user-created books. Default excludes created_by rows.
  --book-id <id>          Limit to a book id. Can be repeated.
  --catalog-source <src>  Limit to a catalog_source. Can be repeated.
  --access-scope <scope>  Limit to an access_scope. Can be repeated.
  --title-like <text>     Limit to book titles containing text.
  --sample-limit <number> Sample rows in the plan. Default: ${DEFAULT_SAMPLE_LIMIT}.
  --compact               Print compact JSON.
  --help                  Show this help.
`;

export const runCli = async (argv = process.argv.slice(2)) => {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  const result = options.apply
    ? applyRemediation(options)
    : { action: 'dry-run', plan: fetchRemediationPlan(options) };
  const json = JSON.stringify(result, null, options.compact ? 0 : 2);

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${json}\n`, 'utf8');
  } else {
    process.stdout.write(`${json}\n`);
  }

  return 0;
};

const isMain = process.argv[1]?.endsWith('/remediate-blocked-content-markers.mjs')
  || process.argv[1]?.endsWith('\\remediate-blocked-content-markers.mjs');

if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
