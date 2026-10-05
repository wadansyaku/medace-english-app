import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commitTeacherReviewDecision,
  setAssignmentCompleted,
} from '../functions/_shared/writing-actions/mutation-state';
import type { AppEnv, D1PreparedStatement, DbUserRow } from '../functions/_shared/types';
import { WritingAssignmentStatus } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const postCommitMocks = vi.hoisted(() => ({ syncWritingActivity: vi.fn() }));
vi.mock('../functions/_shared/writing-actions/access', async () => ({
  ...await vi.importActual<typeof import('../functions/_shared/writing-actions/access')>('../functions/_shared/writing-actions/access'),
  // Authorization has separate boundary tests; these tests execute the real
  // reads, review transaction, product event insert, and durable job machinery.
  guardTeacher: vi.fn(),
  ensureAssignmentAccess: vi.fn(),
}));
vi.mock('../functions/_shared/writing-actions/mutation-side-effects', () => ({
  syncWritingActivitySideEffects: postCommitMocks.syncWritingActivity,
}));

import { handleApproveWritingReturn, handleRequestWritingRevision } from '../functions/_shared/writing-actions/mutations';

const sqliteFixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => {
  sqliteFixtures.splice(0).forEach(({ sqlite }) => sqlite.close());
  vi.restoreAllMocks();
});

const createEnv = (changes: [number, number]) => {
  const prepared: Array<{ sql: string; bindings: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const record = { sql, bindings: [] as unknown[] };
    prepared.push(record);
    const statement = {
      bind: (...bindings: unknown[]) => {
        record.bindings = bindings;
        return statement;
      },
    } as D1PreparedStatement;
    return statement;
  });
  const batch = vi.fn(async () => changes.map((count) => ({
    success: true,
    meta: { changes: count },
  })));
  return {
    env: { DB: { prepare, batch } } as unknown as AppEnv,
    prepared,
    batch,
  };
};

const params = {
  submissionId: 'submission-2',
  reviewId: 'review-2',
  reviewerUserId: 'instructor-1',
  payload: {
    selectedEvaluationId: 'evaluation-2',
    publicComment: 'Good revision.',
    privateMemo: 'Internal note.',
  },
  decision: 'APPROVED_RETURN' as const,
  assignmentId: 'assignment-1',
  assignmentStatus: WritingAssignmentStatus.COMPLETED,
  now: 123,
};

describe('writing teacher review CAS', () => {
  it('guards both writes with REVIEW_READY and the latest submission predicate', async () => {
    const { env, prepared } = createEnv([1, 1]);

    await expect(commitTeacherReviewDecision(env, params)).resolves.toBeUndefined();

    expect(prepared).toHaveLength(2);
    for (const statement of prepared) {
      expect(statement.sql).toContain('status = ?');
      expect(statement.sql).toContain('target.assignment_id = writing_assignments.id');
      expect(statement.sql).toContain('ORDER BY latest.submitted_at DESC, latest.attempt_no DESC, latest.id DESC');
      expect(statement.bindings).toContain(WritingAssignmentStatus.REVIEW_READY);
      expect(statement.bindings).toContain(params.submissionId);
      expect(statement.bindings).toContain(params.assignmentId);
    }
  });

  it.each([
    [0, 0],
    [1, 0],
    [0, 1],
  ] as const)('returns 409 unless both conditional writes win: %s/%s', async (reviewChanges, assignmentChanges) => {
    const { env } = createEnv([reviewChanges, assignmentChanges]);

    await expect(commitTeacherReviewDecision(env, params)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('writing completion CAS', () => {
  const createCompletionEnv = (changes: number) => {
    const record = { sql: '', bindings: [] as unknown[] };
    const run = vi.fn(async () => ({ success: true, meta: { changes } }));
    const prepare = vi.fn((sql: string) => {
      record.sql = sql;
      const statement = {
        bind: (...bindings: unknown[]) => {
          record.bindings = bindings;
          return statement;
        },
        run,
      } as unknown as D1PreparedStatement;
      return statement;
    });
    return {
      env: { DB: { prepare } } as unknown as AppEnv,
      record,
    };
  };

  it('moves only RETURNED assignments to COMPLETED', async () => {
    const { env, record } = createCompletionEnv(1);

    await expect(setAssignmentCompleted(env, {
      assignmentId: 'assignment-1',
      now: 456,
    })).resolves.toBeUndefined();

    expect(record.sql).toContain('WHERE id = ? AND status = ?');
    expect(record.bindings).toEqual([
      WritingAssignmentStatus.COMPLETED,
      456,
      'assignment-1',
      WritingAssignmentStatus.RETURNED,
    ]);
  });

  it('returns 409 when another transition wins the completion race', async () => {
    const { env } = createCompletionEnv(0);

    await expect(setAssignmentCompleted(env, {
      assignmentId: 'assignment-1',
      now: 456,
    })).rejects.toMatchObject({ status: 409 });
  });
});

describe('writing teacher review post-commit recovery', () => {
  const setup = () => {
    const fixture = createSqliteD1();
    sqliteFixtures.push(fixture);
    postCommitMocks.syncWritingActivity.mockReset().mockResolvedValue(undefined);
    const migrationDirectory = new URL('../migrations/', import.meta.url);
    for (const migration of readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()) {
      fixture.sqlite.exec(readFileSync(new URL(migration, migrationDirectory), 'utf8'));
    }
    fixture.sqlite.exec(`
      INSERT INTO users (id, email, display_name, role, subscription_plan, created_at, updated_at)
      VALUES ('student-1', 'student@example.test', 'Student', 'STUDENT', 'TOB_PAID', 1, 1),
        ('instructor-1', 'teacher@example.test', 'Instructor', 'INSTRUCTOR', 'TOB_PAID', 1, 1),
        ('instructor-2', 'other@example.test', 'Other instructor', 'INSTRUCTOR', 'TOB_PAID', 1, 1);
      INSERT INTO writing_assignments (
        id, organization_name, instructor_user_id, student_user_id, exam_category, template_type,
        prompt_title, prompt_text, guidance, word_count_min, word_count_max, submission_code,
        prompt_snapshot, status, attempt_count, max_attempts, created_at, updated_at
      ) VALUES ('assignment-1', 'Test', 'instructor-1', 'student-1', 'EIKEN', 'OPINION',
        'Test prompt', 'Test question', 'Guidance', 40, 60, 'TEST-01', '{}', 'REVIEW_READY', 1, 2, 1, 1);
      INSERT INTO writing_submissions (
        id, assignment_id, attempt_no, submission_source, submitted_by_user_id, transcript,
        processing_state, selected_evaluation_id, created_at, submitted_at, updated_at, ocr_meta
      ) VALUES ('submission-2', 'assignment-1', 1, 'ONLINE', 'student-1', 'Fixture response',
        'EVALUATED', 'evaluation-2', 1, 1, 1, '{"provenance":{"mode":"live","provider":"GEMINI","model":"gemini-2.5-flash"}}');
      INSERT INTO writing_ai_evaluations (
        id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
        sentence_corrections_json, corrected_draft, model_answer, prompt_snapshot, is_default, created_at, raw_payload
      ) VALUES ('evaluation-2', 'submission-2', 'GEMINI', 14, '{}', '[]', '[]', '[]', '', '', '{}', 1, 1, '{"provenance":{"mode":"live","provider":"GEMINI","model":"gemini-2.5-flash"}}');
    `);
    return {
      ...fixture,
      env: { DB: fixture.DB } as AppEnv,
      teacher: fixture.sqlite.prepare("SELECT * FROM users WHERE id = 'instructor-1'").get() as unknown as DbUserRow,
      otherTeacher: fixture.sqlite.prepare("SELECT * FROM users WHERE id = 'instructor-2'").get() as unknown as DbUserRow,
      review: () => fixture.sqlite.prepare('SELECT * FROM writing_teacher_reviews').get(),
      count: (table: 'writing_teacher_reviews' | 'product_events' | 'side_effect_jobs') => Number(fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count),
    };
  };

  it.each(['product_events', 'side_effect_jobs'] as const)('recovers a failed %s write on exact retry without rewriting the review', async (failedTable) => {
    const fixture = setup();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    let failOnce = true;
    fixture.beforeRun((sql) => {
      if (failOnce && sql.includes(`INSERT INTO ${failedTable}`)) {
        failOnce = false;
        throw new Error('temporary post-commit failure');
      }
    });
    await expect(handleApproveWritingReturn(fixture.env, fixture.teacher, params.submissionId, params.payload))
      .rejects.toThrow('temporary post-commit failure');
    const committedReview = fixture.review();
    expect(committedReview?.released_at).toBe(1000);
    expect(fixture.count('side_effect_jobs')).toBe(0);

    now.mockReturnValue(2000);
    const recovered = await handleApproveWritingReturn(fixture.env, fixture.otherTeacher, params.submissionId, params.payload);
    expect(recovered.assignment.status).toBe(WritingAssignmentStatus.RETURNED);
    await handleApproveWritingReturn(fixture.env, fixture.teacher, params.submissionId, params.payload);

    expect(fixture.review()).toEqual(committedReview);
    expect(fixture.count('writing_teacher_reviews')).toBe(1);
    expect(fixture.count('product_events')).toBe(1);
    expect(fixture.count('side_effect_jobs')).toBe(1);
    expect(fixture.sqlite.prepare('SELECT user_id, created_at FROM product_events').get())
      .toMatchObject({ user_id: 'instructor-1', created_at: 1000 });
    const job = fixture.sqlite.prepare('SELECT status, payload_json FROM side_effect_jobs').get()!;
    expect(job.status).toBe('COMPLETED');
    expect(JSON.parse(String(job.payload_json)).activityAt).toBe(1000);
    expect(postCommitMocks.syncWritingActivity).toHaveBeenCalledTimes(1);
  });

  it('recovers a failed projection using the original durable job and revision timestamp', async () => {
    const fixture = setup();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    postCommitMocks.syncWritingActivity.mockRejectedValueOnce(new Error('projection temporarily unavailable'));
    const first = await handleRequestWritingRevision(fixture.env, fixture.teacher, params.submissionId, params.payload);
    expect(first.sideEffectJob?.status).toBe('FAILED');
    const committedReview = fixture.review();
    const originalJob = fixture.sqlite.prepare('SELECT id FROM side_effect_jobs').get()!;

    now.mockReturnValue(3000);
    const second = await handleRequestWritingRevision(fixture.env, fixture.teacher, params.submissionId, params.payload);
    expect(second.assignment.status).toBe(WritingAssignmentStatus.REVISION_REQUESTED);
    expect(second.sideEffectJob).toBeUndefined();
    expect(fixture.review()).toEqual(committedReview);
    expect(fixture.count('product_events')).toBe(1);
    expect(fixture.count('side_effect_jobs')).toBe(1);
    expect(fixture.sqlite.prepare('SELECT id, status, attempt_count FROM side_effect_jobs').get())
      .toMatchObject({ id: originalJob.id, status: 'COMPLETED', attempt_count: 2 });
    expect(postCommitMocks.syncWritingActivity).toHaveBeenLastCalledWith(fixture.env, expect.objectContaining({ activityAt: 1000 }));
  });

  it('deduplicates the event and job when exact retries arrive concurrently', async () => {
    const fixture = setup();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    let failOnce = true;
    fixture.beforeRun((sql) => {
      if (failOnce && sql.includes('INSERT INTO product_events')) {
        failOnce = false;
        throw new Error('event unavailable');
      }
    });
    await expect(handleApproveWritingReturn(fixture.env, fixture.teacher, params.submissionId, params.payload))
      .rejects.toThrow('event unavailable');
    const committedReview = fixture.review();
    await Promise.all(Array.from({ length: 3 }, () => handleApproveWritingReturn(fixture.env, fixture.teacher, params.submissionId, params.payload)));
    expect(fixture.review()).toEqual(committedReview);
    expect(fixture.count('product_events')).toBe(1);
    expect(fixture.count('side_effect_jobs')).toBe(1);
  });
});
