import { describe, expect, it } from 'vitest';

import {
  buildActivationFunnel,
  runProductAnalyticsSnapshotJob,
} from '../functions/_shared/product-kpi';
import type { ProductKpiDailySnapshot } from '../types';

const makeSnapshot = (overrides: Partial<ProductKpiDailySnapshot> = {}): ProductKpiDailySnapshot => ({
  dateKey: '2026-06-19',
  totalUsers: 0,
  activeStudents1d: 0,
  activeStudents7d: 0,
  activeStudents30d: 0,
  totalOrganizations: 0,
  activeOrganizations30d: 0,
  studySessionsStarted30d: 0,
  studySessionsFinished30d: 0,
  quizSessionsStarted30d: 0,
  spellingChecksStarted30d: 0,
  commercialFormOpenCount30d: 0,
  commercialRequestCount30d: 0,
  organizationsWithCohortCount: 0,
  organizationsWithAssignmentCount: 0,
  organizationsWithMissionCount: 0,
  organizationsWithNotificationCount: 0,
  organizationsWithWritingAssignmentCount: 0,
  organizationsWithWritingSubmissionCount: 0,
  organizationsWithWritingReviewCount: 0,
  organizationsCreatedCohort30d: 0,
  organizationsAssignedStudent30d: 0,
  organizationsCreatedFirstMission30d: 0,
  organizationsSentNotification30d: 0,
  organizationsWithWritingAssignment30d: 0,
  organizationsWithWritingSubmission30d: 0,
  organizationsWithWritingReview30d: 0,
  writingAssignmentsCreated30d: 0,
  writingSubmissionsReceived30d: 0,
  writingReviewsCompleted30d: 0,
  generationCount30d: 0,
  cacheHitCount30d: 0,
  exampleGenerationCount30d: 0,
  exampleCacheHitCount30d: 0,
  imageGenerationCount30d: 0,
  imageCacheHitCount30d: 0,
  estimatedAiCostMilliYen30d: 0,
  estimatedProviderAiCostMilliYen30d: 0,
  estimatedAvoidedCostMilliYen30d: 0,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('buildActivationFunnel', () => {
  it('surfaces the weakest organization-level activation gap', () => {
    const funnel = buildActivationFunnel(makeSnapshot({
      totalOrganizations: 10,
      organizationsWithCohortCount: 8,
      organizationsWithAssignmentCount: 4,
      organizationsWithMissionCount: 2,
      organizationsWithNotificationCount: 1,
      organizationsWithWritingAssignmentCount: 0,
      organizationsWithWritingSubmissionCount: 0,
      organizationsWithWritingReviewCount: 0,
      organizationsCreatedCohort30d: 3,
      organizationsAssignedStudent30d: 2,
      organizationsCreatedFirstMission30d: 2,
      organizationsSentNotification30d: 1,
      organizationsWithWritingAssignment30d: 0,
      organizationsWithWritingSubmission30d: 0,
      organizationsWithWritingReview30d: 0,
      writingAssignmentsCreated30d: 5,
      writingSubmissionsReceived30d: 2,
      writingReviewsCompleted30d: 1,
    }));

    expect(funnel.completionRate).toBe(0);
    expect(funnel.steps.map((step) => [step.id, step.count, step.dropOffCount, step.dropOffRate])).toEqual([
      ['organization', 10, 0, 0],
      ['cohort', 8, 2, 20],
      ['assignment', 4, 4, 50],
      ['mission', 2, 2, 50],
      ['notification', 1, 1, 50],
      ['writing', 0, 1, 100],
      ['submission', 0, 0, 0],
      ['review', 0, 0, 0],
    ]);
    expect(funnel.weakestGap).toMatchObject({
      fromStepId: 'notification',
      toStepId: 'writing',
      dropOffCount: 1,
      dropOffRate: 100,
      severity: 'blocked',
    });
    expect(funnel.activationVelocity30d).toMatchObject({
      organizationsCreatedCohort: 3,
      organizationsAssignedStudent: 2,
      organizationsCreatedFirstMission: 2,
      organizationsSentNotification: 1,
      organizationsWithWritingAssignment: 0,
    });
  });

  it('keeps zero baselines explicit instead of reporting a false gap', () => {
    const funnel = buildActivationFunnel(makeSnapshot());

    expect(funnel.completionRate).toBe(0);
    expect(funnel.weakestGap).toBeNull();
    expect(funnel.steps).toHaveLength(8);
    expect(funnel.gaps.every((gap) => gap.severity === 'ok')).toBe(true);
  });
});

describe('runProductAnalyticsSnapshotJob', () => {
  it('counts writing activation from issued assignment rows rather than draft creation events', async () => {
    const preparedSql: string[] = [];
    const resolveCount = (sql: string): number => {
      if (sql.includes("event_name = 'writing_assignment_created'")) {
        return 99;
      }
      if (
        sql.includes('COUNT(DISTINCT resolved_organization_id) AS count')
        && sql.includes('FROM writing_teacher_reviews r')
      ) {
        return 1;
      }
      if (
        sql.includes('COUNT(DISTINCT resolved_organization_id) AS count')
        && sql.includes('FROM writing_submissions s')
      ) {
        return 2;
      }
      if (
        sql.includes('COUNT(DISTINCT resolved_organization_id) AS count')
        && sql.includes('FROM writing_assignments w')
        && sql.includes("w.status != 'DRAFT'")
        && sql.includes('COALESCE(w.issued_at, w.updated_at)')
      ) {
        return 1;
      }
      if (
        sql.includes('COUNT(DISTINCT resolved_organization_id) AS count')
        && sql.includes('FROM writing_assignments w')
        && sql.includes("w.status != 'DRAFT'")
      ) {
        return 2;
      }
      if (
        sql.includes('COUNT(*) AS count')
        && sql.includes('FROM writing_assignments')
        && sql.includes("status != 'DRAFT'")
        && sql.includes('COALESCE(issued_at, updated_at)')
      ) {
        return 1;
      }
      if (sql.includes('SELECT COUNT(*) AS count FROM organizations')) {
        return 3;
      }
      return 0;
    };
    const env = {
      DB: {
        prepare: (sql: string) => {
          preparedSql.push(sql);
          return {
            bind: (..._bindings: unknown[]) => ({
              all: async () => ({
                results: sql.includes('SELECT id FROM organizations ORDER BY id ASC') ? [] : [],
              }),
              first: async () => ({ count: resolveCount(sql) }),
              run: async () => ({ success: true }),
            }),
          };
        },
      },
    };

    const result = await runProductAnalyticsSnapshotJob(
      env as unknown as Parameters<typeof runProductAnalyticsSnapshotJob>[0],
      Date.parse('2026-06-19T12:00:00+09:00'),
    );

    expect(result.snapshot.totalOrganizations).toBe(3);
    expect(result.snapshot.organizationsWithWritingAssignmentCount).toBe(2);
    expect(result.snapshot.organizationsWithWritingSubmissionCount).toBe(2);
    expect(result.snapshot.organizationsWithWritingReviewCount).toBe(1);
    expect(result.snapshot.organizationsWithWritingAssignment30d).toBe(1);
    expect(result.snapshot.writingAssignmentsCreated30d).toBe(1);
    expect(result.snapshot.writingAssignmentsCreated30d).not.toBe(99);
    expect(preparedSql.some((sql) => (
      sql.includes("event_name = 'writing_assignment_created'")
      && sql.includes('writing_assignments_created_30d')
    ))).toBe(false);
  });
});
