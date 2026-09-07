import { describe, expect, it, vi } from 'vitest';

import {
  commitTeacherReviewDecision,
  setAssignmentCompleted,
} from '../functions/_shared/writing-actions/mutation-state';
import type { AppEnv, D1PreparedStatement } from '../functions/_shared/types';
import { WritingAssignmentStatus } from '../types';

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
