#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { extractWranglerJson } from './run-d1-content-qa.mjs';

const DEFAULT_DATABASE = 'medace-db';
const WRANGLER_PATH = 'node_modules/wrangler/bin/wrangler.js';

export const parseCliArgs = (argv) => {
  const options = {
    database: DEFAULT_DATABASE,
    mode: null,
    outputPath: null,
    persistTo: null,
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
    } else if (arg === '--compact') {
      options.compact = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.help) return options;
  if (!options.database) throw new Error('--database must not be empty.');
  if (!options.mode) throw new Error('Pass either --remote or --local explicitly.');
  if (options.mode === 'remote' && options.persistTo) {
    throw new Error('--persist-to can only be used with --local.');
  }

  return options;
};

export const normalizeD1StatementResults = (payload) => {
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.flatMap((entry) => {
    if (Array.isArray(entry?.result)) return entry.result;
    return [entry];
  }).map((entry) => ({
    success: entry?.success !== false,
    results: Array.isArray(entry?.results) ? entry.results : [],
    meta: entry?.meta || null,
    error: entry?.error || entry?.errors || null,
  }));
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
  if (options.mode === 'local') args.splice(4, 0, '--local');
  if (options.mode === 'local' && options.persistTo) {
    args.push('--persist-to', options.persistTo);
  }

  let raw;
  try {
    raw = execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        FORCE_COLOR: '0',
      },
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (error) {
    const details = [
      error?.message,
      error?.stdout,
      error?.stderr,
    ].filter(Boolean).join('\n');
    throw new Error(details || 'Failed to query D1 production baseline.');
  }

  return normalizeD1StatementResults(extractWranglerJson(raw));
};

export const querySections = [
  {
    name: 'user_mix',
    sql: "SELECT role, subscription_plan, COUNT(*) AS users FROM users GROUP BY role, subscription_plan ORDER BY role, subscription_plan;",
  },
  {
    name: 'organization_mix',
    sql: "SELECT o.display_name, o.subscription_plan, SUM(CASE WHEN m.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_members, SUM(CASE WHEN m.status = 'ACTIVE' AND m.role = 'STUDENT' THEN 1 ELSE 0 END) AS students, SUM(CASE WHEN m.status = 'ACTIVE' AND m.role IN ('INSTRUCTOR', 'GROUP_ADMIN') THEN 1 ELSE 0 END) AS staff FROM organizations o LEFT JOIN organization_memberships m ON m.organization_id = o.id GROUP BY o.id, o.display_name, o.subscription_plan ORDER BY students DESC, active_members DESC;",
  },
  {
    name: 'catalog_mix',
    sql: "SELECT catalog_source, access_scope, COUNT(*) AS books, SUM(word_count) AS declared_words FROM books GROUP BY catalog_source, access_scope ORDER BY declared_words DESC;",
  },
  {
    name: 'hint_asset_coverage',
    sql: "SELECT COUNT(*) AS words, SUM(CASE WHEN example_sentence IS NOT NULL AND TRIM(example_sentence) != '' THEN 1 ELSE 0 END) AS words_with_examples, SUM(CASE WHEN example_image_key IS NOT NULL AND TRIM(example_image_key) != '' THEN 1 ELSE 0 END) AS words_with_images, SUM(CASE WHEN example_audit_status = 'APPROVED' THEN 1 ELSE 0 END) AS examples_approved, SUM(CASE WHEN example_audit_status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END) AS examples_review_required, SUM(CASE WHEN example_image_audit_status = 'APPROVED' THEN 1 ELSE 0 END) AS images_approved, SUM(CASE WHEN example_image_audit_status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END) AS images_review_required FROM words;",
  },
  {
    name: 'hint_asset_audit_backlog',
    sql: "SELECT SUM(CASE WHEN example_audit_status IS NULL THEN 1 ELSE 0 END) AS example_audit_null, SUM(CASE WHEN example_audit_status = 'PENDING' THEN 1 ELSE 0 END) AS example_audit_pending, SUM(CASE WHEN example_audit_status = 'FAILED' THEN 1 ELSE 0 END) AS example_audit_failed, SUM(CASE WHEN example_generated_at IS NOT NULL AND (example_audited_at IS NULL OR example_audited_at < example_generated_at) THEN 1 ELSE 0 END) AS example_due_or_never_audited, SUM(CASE WHEN example_image_audit_status IS NULL THEN 1 ELSE 0 END) AS image_audit_null, SUM(CASE WHEN example_image_audit_status = 'PENDING' THEN 1 ELSE 0 END) AS image_audit_pending, SUM(CASE WHEN example_image_audit_status = 'FAILED' THEN 1 ELSE 0 END) AS image_audit_failed, SUM(CASE WHEN example_image_generated_at IS NOT NULL AND (example_image_audited_at IS NULL OR example_image_audited_at < example_image_generated_at) THEN 1 ELSE 0 END) AS image_due_or_never_audited FROM words;",
  },
  {
    name: 'learning_activity_windows',
    sql: "SELECT COUNT(DISTINCT user_id) AS active_users_7d, COUNT(*) AS events_7d FROM learning_interaction_events WHERE created_at >= (strftime('%s', 'now') - 7 * 24 * 60 * 60) * 1000; SELECT COUNT(DISTINCT user_id) AS active_users_30d, COUNT(*) AS events_30d FROM learning_interaction_events WHERE created_at >= (strftime('%s', 'now') - 30 * 24 * 60 * 60) * 1000;",
  },
  {
    name: 'learning_interaction_mix',
    sql: "SELECT interaction_source, COALESCE(question_mode, '(none)') AS question_mode, COUNT(*) AS events FROM learning_interaction_events GROUP BY interaction_source, question_mode ORDER BY events DESC;",
  },
  {
    name: 'learning_history_summary',
    sql: "SELECT COUNT(*) AS histories, COUNT(DISTINCT user_id) AS learners, COUNT(DISTINCT book_id) AS books_touched, AVG(correct_count * 1.0 / NULLIF(attempt_count, 0)) AS avg_accuracy FROM learning_histories; SELECT status, COUNT(*) AS rows FROM learning_histories GROUP BY status ORDER BY rows DESC;",
  },
  {
    name: 'learning_daily_activity_30d',
    sql: "SELECT date(datetime(created_at / 1000, 'unixepoch', 'localtime')) AS day, COUNT(DISTINCT user_id) AS active_users, COUNT(*) AS events FROM learning_interaction_events WHERE created_at >= (strftime('%s', 'now') - 30 * 24 * 60 * 60) * 1000 GROUP BY day ORDER BY day;",
  },
  {
    name: 'book_adoption',
    sql: "SELECT b.title, b.catalog_source, COUNT(DISTINCT lh.user_id) AS learners, COUNT(*) AS history_rows FROM learning_histories lh JOIN books b ON b.id = lh.book_id GROUP BY b.id, b.title, b.catalog_source ORDER BY learners DESC, history_rows DESC LIMIT 10;",
  },
  {
    name: 'ai_usage_by_month_and_action',
    sql: "SELECT month_key, action, COUNT(*) AS requests, SUM(estimated_cost_milli_yen) AS milli_yen, SUM(CASE WHEN used_ai = 1 THEN 1 ELSE 0 END) AS used_ai_requests FROM ai_usage_events GROUP BY month_key, action ORDER BY month_key DESC, milli_yen DESC;",
  },
  {
    name: 'ai_usage_by_plan',
    sql: "SELECT u.subscription_plan, a.action, COUNT(*) AS requests, SUM(a.estimated_cost_milli_yen) AS milli_yen FROM ai_usage_events a JOIN users u ON u.id = a.user_id GROUP BY u.subscription_plan, a.action ORDER BY milli_yen DESC;",
  },
  {
    name: 'commercial_requests',
    sql: "SELECT kind, status, COALESCE(teaching_format, '(none)') AS teaching_format, source, COUNT(*) AS requests FROM commercial_requests GROUP BY kind, status, teaching_format, source ORDER BY requests DESC, kind;",
  },
  {
    name: 'writing_activity',
    sql: "SELECT COUNT(*) AS assignments, COUNT(DISTINCT student_user_id) AS students_with_assignments FROM writing_assignments; SELECT status, COUNT(*) AS assignments FROM writing_assignments GROUP BY status ORDER BY assignments DESC; SELECT COUNT(*) AS submissions FROM writing_submissions; SELECT processing_state, COUNT(*) AS submissions FROM writing_submissions GROUP BY processing_state ORDER BY submissions DESC; SELECT COUNT(*) AS ai_evaluations, SUM(cost_milli_yen) AS eval_cost_milli_yen FROM writing_ai_evaluations; SELECT COUNT(*) AS teacher_reviews FROM writing_teacher_reviews;",
  },
  {
    name: 'mission_and_signal_activity',
    sql: "SELECT status, COUNT(*) AS assignments FROM weekly_mission_assignments GROUP BY status ORDER BY assignments DESC; SELECT COUNT(*) AS missions FROM weekly_missions; SELECT COUNT(*) AS plans FROM learning_plans; SELECT dimension, level, COUNT(*) AS signals FROM student_weakness_signals GROUP BY dimension, level ORDER BY signals DESC;",
  },
  {
    name: 'business_ops_activity',
    sql: "SELECT COUNT(*) AS assignment_rows, COUNT(DISTINCT student_user_id) AS assigned_students, COUNT(DISTINCT instructor_user_id) AS active_instructors FROM student_instructor_assignments; SELECT COUNT(*) AS notifications, COUNT(DISTINCT student_user_id) AS notified_students FROM instructor_notifications; SELECT COUNT(*) AS kpi_snapshots FROM organization_kpi_daily_snapshots;",
  },
  {
    name: 'product_telemetry_recency',
    sql: "SELECT 'product_events' AS table_name, COUNT(*) AS row_count, MAX(created_at) AS latest_created_at FROM product_events; SELECT 'product_kpi_daily_snapshots' AS table_name, COUNT(*) AS row_count, MAX(updated_at) AS latest_updated_at, MAX(date_key) AS latest_date_key FROM product_kpi_daily_snapshots;",
  },
  {
    name: 'integrity_org_membership',
    sql: "SELECT COUNT(*) AS org_users, SUM(CASE WHEN organization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.user_id = users.id AND m.organization_id = users.organization_id AND m.status = 'ACTIVE') THEN 1 ELSE 0 END) AS org_users_without_active_membership, SUM(CASE WHEN organization_id IS NULL AND role IN ('INSTRUCTOR', 'STUDENT') AND subscription_plan IN ('TOB_FREE', 'TOB_PAID') THEN 1 ELSE 0 END) AS business_plan_users_without_org FROM users; SELECT SUM(CASE WHEN m.status = 'ACTIVE' AND (u.organization_id IS NULL OR u.organization_id != m.organization_id) THEN 1 ELSE 0 END) AS active_membership_user_org_mismatch, SUM(CASE WHEN m.status = 'ACTIVE' AND COALESCE(u.organization_role, '') != COALESCE(m.role, '') THEN 1 ELSE 0 END) AS active_membership_role_mismatch FROM organization_memberships m JOIN users u ON u.id = m.user_id;",
  },
  {
    name: 'integrity_books_and_plans',
    sql: "SELECT COUNT(*) AS books_checked, SUM(CASE WHEN COALESCE(word_totals.actual_words, 0) != books.word_count THEN 1 ELSE 0 END) AS mismatched_word_counts, SUM(CASE WHEN COALESCE(word_totals.actual_words, 0) = books.word_count THEN 1 ELSE 0 END) AS matched_word_counts FROM books LEFT JOIN (SELECT book_id, COUNT(*) AS actual_words FROM words GROUP BY book_id) AS word_totals ON word_totals.book_id = books.id; SELECT COUNT(*) AS plans, SUM(CASE WHEN json_array_length(selected_book_ids) = 0 THEN 1 ELSE 0 END) AS empty_plan_book_arrays FROM learning_plans; SELECT COUNT(*) AS plans_with_missing_book_refs FROM ( SELECT lp.user_id FROM learning_plans lp JOIN json_each(lp.selected_book_ids) je LEFT JOIN books b ON b.id = je.value GROUP BY lp.user_id HAVING SUM(CASE WHEN b.id IS NULL THEN 1 ELSE 0 END) > 0 );",
  },
  {
    name: 'recency_markers',
    sql: "SELECT 'users' AS table_name, MAX(updated_at) AS latest_ts FROM users; SELECT 'learning_interaction_events' AS table_name, MAX(created_at) AS latest_ts FROM learning_interaction_events; SELECT 'ai_usage_events' AS table_name, MAX(created_at) AS latest_ts FROM ai_usage_events; SELECT 'learning_plans' AS table_name, MAX(updated_at) AS latest_ts FROM learning_plans; SELECT 'commercial_requests' AS table_name, MAX(updated_at) AS latest_ts FROM commercial_requests; SELECT 'weekly_missions' AS table_name, MAX(updated_at) AS latest_ts FROM weekly_missions; SELECT 'writing_assignments' AS table_name, MAX(updated_at) AS latest_ts FROM writing_assignments;",
  },
];

const errorMessage = (error) => error?.message || String(error);

export const generateProductionBaselineReport = (
  options,
  runQuery = runWranglerQuery,
  generatedAt = new Date(),
) => ({
  generatedAt: generatedAt.toISOString(),
  database: options.database,
  mode: options.mode,
  sections: querySections.map((section) => {
    try {
      return {
        name: section.name,
        queryResults: runQuery(options, section.sql),
      };
    } catch (error) {
      return {
        name: section.name,
        queryResults: [],
        error: errorMessage(error),
      };
    }
  }),
});

export const evaluateProductionBaselineReport = (report) => {
  const errors = [];

  report.sections.forEach((section) => {
    if (section.error) {
      errors.push(`${section.name}: ${section.error}`);
      return;
    }
    section.queryResults.forEach((result, index) => {
      if (result.success === false) {
        errors.push(`${section.name}[${index}]: ${JSON.stringify(result.error || result.meta || 'query failed')}`);
      }
    });
  });

  return {
    ok: errors.length === 0,
    errors,
  };
};

const usage = () => `Usage: node scripts/analysis/run-production-baseline.mjs --remote|--local [--database medace-db]

Generates a JSON production baseline report from read-only D1 queries and exits non-zero when any query section fails.
Options:
  --database <name>   D1 database name. Default: medace-db.
  --remote            Query remote D1. Must be explicit.
  --local             Query local D1. Must be explicit.
  -o, --output <path> Write JSON report to file.
  --persist-to <dir>  Local D1 persist directory. Only with --local.
  --compact           Print compact JSON.
  --help              Show this help.
`;

export const runCli = async (argv = process.argv.slice(2), runQuery = runWranglerQuery) => {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  const report = generateProductionBaselineReport(options, runQuery);
  const evaluation = evaluateProductionBaselineReport(report);
  const payload = {
    ...report,
    ok: evaluation.ok,
    errors: evaluation.errors,
  };
  const json = JSON.stringify(payload, null, options.compact ? 0 : 2);

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${json}\n`, 'utf8');
  } else {
    process.stdout.write(`${json}\n`);
  }

  return evaluation.ok ? 0 : 1;
};

const isMain = process.argv[1]?.endsWith('/run-production-baseline.mjs')
  || process.argv[1]?.endsWith('\\run-production-baseline.mjs');

if (isMain) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
