import { HttpError } from './http';
import { syncWritingActivitySideEffects } from './writing-actions/mutation-side-effects';
import type { AppEnv } from './types';

export type SideEffectJobStatus = 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETED';
export type SideEffectJobType = 'SYNC_WRITING_ACTIVITY';

interface DbSideEffectJobRow {
  id: string;
  job_type: SideEffectJobType;
  dedupe_key: string;
  status: SideEffectJobStatus;
  payload_json: string;
  attempt_count: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  last_attempt_at: number | null;
  completed_at: number | null;
}

export interface WritingActivitySideEffectPayload {
  studentUid: string;
  writingAssignmentId: string;
  organizationId?: string | null;
  activityAt: number;
}

export interface SideEffectJobRunResult {
  jobId: string;
  status: SideEffectJobStatus;
  attemptCount: number;
  lastError?: string;
}

const readJobById = async (env: AppEnv, jobId: string): Promise<DbSideEffectJobRow | null> => (
  env.DB.prepare('SELECT * FROM side_effect_jobs WHERE id = ?').bind(jobId).first() as Promise<DbSideEffectJobRow | null>
);

const readJobByDedupeKey = async (env: AppEnv, dedupeKey: string): Promise<DbSideEffectJobRow | null> => (
  env.DB.prepare('SELECT * FROM side_effect_jobs WHERE dedupe_key = ?').bind(dedupeKey).first() as Promise<DbSideEffectJobRow | null>
);

const parsePayload = <TPayload>(raw: string): TPayload => JSON.parse(raw) as TPayload;

const formatErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error || 'Unknown side effect failure')
);

const executeSideEffectJob = async (env: AppEnv, row: DbSideEffectJobRow): Promise<void> => {
  switch (row.job_type) {
    case 'SYNC_WRITING_ACTIVITY':
      await syncWritingActivitySideEffects(env, parsePayload<WritingActivitySideEffectPayload>(row.payload_json));
      return;
    default:
      throw new HttpError(500, `Unsupported side effect job type: ${row.job_type}`);
  }
};

export const buildWritingActivityJobDedupeKey = (
  payload: WritingActivitySideEffectPayload,
): string => `writing-activity:${payload.writingAssignmentId}:${payload.studentUid}:${payload.activityAt}`;

export const enqueueWritingActivitySideEffect = async (
  env: AppEnv,
  payload: WritingActivitySideEffectPayload,
): Promise<DbSideEffectJobRow> => {
  const now = Date.now();
  const jobId = crypto.randomUUID();
  const dedupeKey = buildWritingActivityJobDedupeKey(payload);

  await env.DB.prepare(`
    INSERT INTO side_effect_jobs (
      id,
      job_type,
      dedupe_key,
      status,
      payload_json,
      attempt_count,
      last_error,
      created_at,
      updated_at,
      last_attempt_at,
      completed_at
    ) VALUES (?, 'SYNC_WRITING_ACTIVITY', ?, 'PENDING', ?, 0, NULL, ?, ?, NULL, NULL)
    ON CONFLICT(dedupe_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      status = CASE
        WHEN side_effect_jobs.status = 'COMPLETED' THEN side_effect_jobs.status
        ELSE 'PENDING'
      END,
      last_error = NULL,
      updated_at = excluded.updated_at
  `).bind(
    jobId,
    dedupeKey,
    JSON.stringify(payload),
    now,
    now,
  ).run();

  const row = await readJobByDedupeKey(env, dedupeKey);
  if (!row) {
    throw new HttpError(500, 'side effect job の作成に失敗しました。');
  }
  return row;
};

export const runSideEffectJobById = async (
  env: AppEnv,
  jobId: string,
): Promise<SideEffectJobRunResult> => {
  const row = await readJobById(env, jobId);
  if (!row) {
    throw new HttpError(404, 'side effect job が見つかりません。');
  }
  if (row.status === 'COMPLETED') {
    return {
      jobId: row.id,
      status: row.status,
      attemptCount: Number(row.attempt_count || 0),
    };
  }

  const attemptNow = Date.now();
  const nextAttemptCount = Number(row.attempt_count || 0) + 1;
  await env.DB.prepare(`
    UPDATE side_effect_jobs
    SET status = 'RUNNING',
        attempt_count = ?,
        last_attempt_at = ?,
        updated_at = ?,
        last_error = NULL
    WHERE id = ?
  `).bind(
    nextAttemptCount,
    attemptNow,
    attemptNow,
    row.id,
  ).run();

  try {
    await executeSideEffectJob(env, row);
    const completedAt = Date.now();
    await env.DB.prepare(`
      UPDATE side_effect_jobs
      SET status = 'COMPLETED',
          updated_at = ?,
          completed_at = ?,
          last_error = NULL
      WHERE id = ?
    `).bind(
      completedAt,
      completedAt,
      row.id,
    ).run();
    return {
      jobId: row.id,
      status: 'COMPLETED',
      attemptCount: nextAttemptCount,
    };
  } catch (error) {
    const failedAt = Date.now();
    const message = formatErrorMessage(error);
    await env.DB.prepare(`
      UPDATE side_effect_jobs
      SET status = 'FAILED',
          updated_at = ?,
          last_error = ?
      WHERE id = ?
    `).bind(
      failedAt,
      message,
      row.id,
    ).run();
    return {
      jobId: row.id,
      status: 'FAILED',
      attemptCount: nextAttemptCount,
      lastError: message,
    };
  }
};

export const replayPendingSideEffectJobs = async (
  env: AppEnv,
  limit = 20,
): Promise<{
  completed: number;
  failed: number;
  results: SideEffectJobRunResult[];
}> => {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM side_effect_jobs
    WHERE status IN ('PENDING', 'FAILED')
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(limit).all<DbSideEffectJobRow>();

  const jobs = rows.results || [];
  const results: SideEffectJobRunResult[] = [];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = await runSideEffectJobById(env, job.id);
    results.push(result);
    if (result.status === 'COMPLETED') {
      completed += 1;
    } else if (result.status === 'FAILED') {
      failed += 1;
    }
  }

  return { completed, failed, results };
};
