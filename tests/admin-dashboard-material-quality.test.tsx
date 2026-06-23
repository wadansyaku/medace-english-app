import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AdminDashboardView from '../components/admin/AdminDashboardView';
import { buildActivationFunnel } from '../functions/_shared/product-kpi';
import {
  type ProductKpiDailySnapshot,
  StudentRiskLevel,
  SubscriptionPlan,
  type AdminDashboardSnapshot,
} from '../types';

const productKpis: ProductKpiDailySnapshot = {
  dateKey: '2026-06-07',
  totalUsers: 0,
  activeStudents1d: 0,
  activeStudents7d: 0,
  activeStudents30d: 0,
  totalOrganizations: 4,
  activeOrganizations30d: 0,
  studySessionsStarted30d: 0,
  studySessionsFinished30d: 0,
  quizSessionsStarted30d: 0,
  spellingChecksStarted30d: 0,
  commercialFormOpenCount30d: 0,
  commercialRequestCount30d: 0,
  organizationsWithCohortCount: 3,
  organizationsWithAssignmentCount: 2,
  organizationsWithMissionCount: 1,
  organizationsWithNotificationCount: 1,
  organizationsWithWritingAssignmentCount: 0,
  organizationsWithWritingSubmissionCount: 0,
  organizationsWithWritingReviewCount: 0,
  organizationsCreatedCohort30d: 2,
  organizationsAssignedStudent30d: 1,
  organizationsCreatedFirstMission30d: 1,
  organizationsSentNotification30d: 1,
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
  updatedAt: 1,
};

const snapshot: AdminDashboardSnapshot = {
  overview: {
    totalStudents: 0,
    activeToday: 0,
    active7d: 0,
    atRiskCount: 0,
    studentsWithPlan: 0,
    averageLearnedWords: 0,
    averageAccuracyRate: 0,
    officialBookCount: 3,
    customBookCount: 0,
    totalWordCount: 300,
    reportedWordCount: 0,
    notifications7d: 0,
    aiRequestsThisMonth: 0,
    aiCostThisMonthMilliYen: 0,
  },
  planBreakdown: [],
  riskBreakdown: [
    { riskLevel: StudentRiskLevel.SAFE, count: 0 },
    { riskLevel: StudentRiskLevel.WARNING, count: 0 },
    { riskLevel: StudentRiskLevel.DANGER, count: 0 },
  ],
  trend: [],
  topBooks: [],
  materialQuality: {
    officialBookCount: 3,
    approvedBookCount: 1,
    selectableTodayBookCount: 1,
    warningBookCount: 1,
    reviewRequiredBookCount: 1,
    qaBlockedBookCount: 1,
    missingLedgerBookCount: 0,
  },
  aiActions: [],
  recentNotifications: [],
  recentReports: [],
  organizations: [],
  atRiskStudents: [],
  productKpis,
  activationFunnel: buildActivationFunnel(productKpis),
  aiEconomics: {
    monthKey: '2026-06',
    generationCount: 0,
    cacheHitCount: 0,
    cacheHitRatio: 0,
    exampleCacheHitRatio: 0,
    imageCacheHitRatio: 0,
    estimatedCostMilliYen: 0,
    estimatedProviderCostMilliYen: 0,
    avoidedCostMilliYen: 0,
  },
};

describe('AdminDashboardView material quality', () => {
  it('shows the quality queue from the global material summary even when top books are empty', () => {
    const rendered = renderToStaticMarkup(
      <AdminDashboardView
        snapshot={snapshot}
        loading={false}
        error={null}
        headline="運営ダッシュボード"
        subcopy="教材品質を確認します。"
      />,
    );

    expect(rendered).toContain('教材品質キュー');
    expect(rendered).toContain('承認済み 1 / 3 冊。');
    expect(rendered).toContain('運用警告 1 冊、確認中 1 冊、QA停止 1 冊、台帳なし 0 冊です。');
    expect(rendered).toContain('最大の欠測');
    expect(rendered).toContain('初回通知 -&gt; 作文配布で 1 組織');
    expect(rendered).toContain('30日内の進行: クラス 2 / 担当 1 / ミッション 1 / 通知 1 / 作文配布 0 / 提出 0 / 返却 0 組織');
    expect(rendered).toContain('累積到達: 作文配布済み 0 組織 / 提出あり 0 組織 / 返却済み 0 組織');
  });
});
