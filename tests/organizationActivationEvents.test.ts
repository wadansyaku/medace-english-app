import { describe, expect, it } from 'vitest';

import { handleRecordClassroomWorksheetLifecycleEvent } from '../functions/_shared/organization-activation-events';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import {
  OrganizationRole,
  SubscriptionPlan,
  UserRole,
} from '../types';

const user: DbUserRow = {
  id: 'teacher-1',
  email: 'teacher@example.com',
  password_hash: null,
  display_name: 'Teacher',
  role: UserRole.INSTRUCTOR,
  grade: null,
  english_level: null,
  subscription_plan: SubscriptionPlan.TOB_PAID,
  organization_id: 'org-1',
  organization_name: 'Demo School',
  organization_role: OrganizationRole.INSTRUCTOR,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 1,
  updated_at: 1,
};

const makeUser = (overrides: Partial<DbUserRow> = {}): DbUserRow => ({
  ...user,
  ...overrides,
});

interface RecordedStatement {
  sql: string;
  bindings: unknown[];
}

interface FakeActivationDbOptions {
  activeRunId?: string | null;
  membershipRoles?: Record<string, OrganizationRole>;
  visibleStudentIds?: string[];
  studentOrganizationId?: string;
}

class FakeActivationDb {
  statements: RecordedStatement[] = [];

  private readonly activeRunId: string | null;

  private readonly membershipRoles: Record<string, OrganizationRole>;

  private readonly visibleStudentIds: Set<string>;

  private readonly studentOrganizationId: string;

  constructor(options: FakeActivationDbOptions = {}) {
    this.activeRunId = options.activeRunId ?? null;
    this.membershipRoles = {
      [user.id]: OrganizationRole.INSTRUCTOR,
      ...options.membershipRoles,
    };
    this.visibleStudentIds = new Set(options.visibleStudentIds || ['student-1']);
    this.studentOrganizationId = options.studentOrganizationId || 'org-1';
  }

  prepare(sql: string) {
    return {
      bind: (...bindings: unknown[]) => ({
        first: async () => this.first(sql, bindings),
        all: async () => ({ results: this.all(sql), meta: {} }),
        run: async () => {
          this.statements.push({ sql, bindings });
          return { meta: {}, success: true };
        },
      }),
    };
  }

  private first(sql: string, bindings: unknown[]): Record<string, unknown> | null {
    if (sql.includes('FROM organization_memberships m') && sql.includes('JOIN organizations o')) {
      const userId = String(bindings[0] || '');
      return {
        organization_id: 'org-1',
        organization_name: 'Demo School',
        subscription_plan: SubscriptionPlan.TOB_PAID,
        organization_role: this.membershipRoles[userId] || OrganizationRole.INSTRUCTOR,
      };
    }
    if (sql.includes('FROM users u') && sql.includes('LEFT JOIN organization_memberships')) {
      const studentUid = String(bindings[0] || 'student-1');
      return {
        id: studentUid,
        display_name: 'Student',
        role: UserRole.STUDENT,
        organization_role: OrganizationRole.STUDENT,
        organization_id: this.studentOrganizationId,
        organization_name: 'Demo School',
      };
    }
    if (sql.includes('FROM classroom_activation_runs')) {
      return this.activeRunId ? { id: this.activeRunId } : null;
    }
    return null;
  }

  private all(sql: string): Array<Record<string, unknown>> {
    if (sql.includes('AS student_uid') && (
      sql.includes('FROM student_instructor_assignments')
      || sql.includes('FROM users u')
    )) {
      return [...this.visibleStudentIds].map((studentUid) => ({ student_uid: studentUid }));
    }
    return [];
  }
}

describe('classroom activation lifecycle events', () => {
  it('allows instructors to record worksheet lifecycle for visible students', async () => {
    const db = new FakeActivationDb();
    const result = await handleRecordClassroomWorksheetLifecycleEvent(
      { DB: db } as unknown as AppEnv,
      user,
      {
        studentUid: 'student-1',
        worksheetSource: 'catalog_fallback',
        lifecycleStatus: 'printed',
        payload: {
          questionMode: 'EN_TO_JA',
          generatedQuestionCount: 20,
        },
        occurredAt: 123_456,
      },
    );

    const runInsert = db.statements.find((statement) => statement.sql.includes('INSERT INTO classroom_activation_runs'));
    const worksheetInsert = db.statements.find((statement) => statement.sql.includes('INSERT INTO classroom_worksheet_lifecycle_events'));
    const activationInsert = db.statements.find((statement) => statement.sql.includes('INSERT INTO classroom_activation_events'));

    expect(result).toMatchObject({
      worksheetSource: 'catalog_fallback',
      lifecycleStatus: 'printed',
      occurredAt: 123_456,
    });
    expect(runInsert?.bindings.slice(0, 5)).toEqual([result.runId, 'org-1', null, 123_456, 'teacher-1']);
    expect(worksheetInsert?.bindings.slice(0, 6)).toEqual([
      result.worksheetEventId,
      result.runId,
      'org-1',
      'student-1',
      'catalog_fallback',
      'printed',
    ]);
    expect(JSON.parse(String(worksheetInsert?.bindings[6]))).toMatchObject({
      questionMode: 'EN_TO_JA',
      generatedQuestionCount: 20,
    });
    expect(activationInsert?.bindings.slice(0, 7)).toEqual([
      result.eventId,
      result.runId,
      'org-1',
      'worksheet',
      'worksheet_printed',
      'teacher-1',
      'student-1',
    ]);
    expect(JSON.parse(String(activationInsert?.bindings[7]))).toMatchObject({
      worksheetSource: 'catalog_fallback',
      lifecycleStatus: 'printed',
      worksheetEventId: result.worksheetEventId,
    });
  });

  it('reuses the active classroom activation run when one already exists', async () => {
    const db = new FakeActivationDb({ activeRunId: 'run-existing' });
    const result = await handleRecordClassroomWorksheetLifecycleEvent(
      { DB: db } as unknown as AppEnv,
      user,
      {
        studentUid: 'student-1',
        worksheetSource: 'history',
        lifecycleStatus: 'scored',
        occurredAt: 456_789,
      },
    );

    expect(result.runId).toBe('run-existing');
    expect(db.statements.some((statement) => statement.sql.includes('INSERT INTO classroom_activation_runs'))).toBe(false);
    expect(db.statements.some((statement) => statement.sql.includes('UPDATE classroom_activation_runs'))).toBe(true);
    expect(db.statements.find((statement) => statement.sql.includes('INSERT INTO classroom_worksheet_lifecycle_events'))?.bindings.slice(0, 6))
      .toEqual([result.worksheetEventId, 'run-existing', 'org-1', 'student-1', 'history', 'scored']);
  });

  it('allows group admins to record worksheet lifecycle for organization students', async () => {
    const groupAdmin = makeUser({
      id: 'group-admin-1',
      email: 'group-admin@example.com',
      organization_role: OrganizationRole.GROUP_ADMIN,
    });
    const db = new FakeActivationDb({
      membershipRoles: {
        [groupAdmin.id]: OrganizationRole.GROUP_ADMIN,
      },
      visibleStudentIds: ['student-1', 'student-2'],
    });

    const result = await handleRecordClassroomWorksheetLifecycleEvent(
      { DB: db } as unknown as AppEnv,
      groupAdmin,
      {
        studentUid: 'student-2',
        worksheetSource: 'history',
        lifecycleStatus: 'issued',
        occurredAt: 222_333,
      },
    );

    expect(result).toMatchObject({
      worksheetSource: 'history',
      lifecycleStatus: 'issued',
      occurredAt: 222_333,
    });
    expect(db.statements.find((statement) => statement.sql.includes('INSERT INTO classroom_worksheet_lifecycle_events'))?.bindings.slice(0, 6))
      .toEqual([result.worksheetEventId, result.runId, 'org-1', 'student-2', 'history', 'issued']);
  });

  it('rejects worksheet lifecycle recording for students outside instructor visibility', async () => {
    const db = new FakeActivationDb({ visibleStudentIds: ['student-1'] });

    await expect(handleRecordClassroomWorksheetLifecycleEvent(
      { DB: db } as unknown as AppEnv,
      user,
      {
        studentUid: 'student-2',
        worksheetSource: 'history',
        lifecycleStatus: 'printed',
        occurredAt: 333_444,
      },
    )).rejects.toMatchObject({
      status: 403,
      message: '担当範囲の生徒のみ worksheet lifecycle を記録できます。',
    });

    expect(db.statements.some((statement) => statement.sql.includes('INSERT INTO classroom_worksheet_lifecycle_events'))).toBe(false);
    expect(db.statements.some((statement) => statement.sql.includes('INSERT INTO classroom_activation_events'))).toBe(false);
  });
});
