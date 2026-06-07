import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import BusinessAdminAssignmentsSection from '../components/dashboard/businessAdmin/BusinessAdminAssignmentsSection';
import type { BusinessAdminDashboardController } from '../components/dashboard/businessAdmin/shared';
import {
  BookAccessScope,
  BookCatalogSource,
  LearningTrack,
  StudentRiskLevel,
  type BookMetadata,
  type OrganizationDashboardSnapshot,
  type StudentSummary,
} from '../types';

const blockedBook: BookMetadata = {
  id: 'pending-official',
  title: '確認中公式教材',
  wordCount: 180,
  isPriority: true,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  accessScope: BookAccessScope.ALL_PLANS,
  qualityGate: {
    status: 'source_review_required',
    label: '出典確認',
    summary: 'source ledger確認待ちです。',
    isApprovedForLearner: false,
    isSelectableForToday: false,
    blockingReasons: ['権利確認が pending です。'],
    warnings: [],
  },
};

const student: StudentSummary = {
  uid: 'student-1',
  name: '佐藤 花子',
  email: 'student@example.com',
  totalLearned: 0,
  totalAttempts: 0,
  lastActive: 0,
  riskLevel: StudentRiskLevel.SAFE,
};

const snapshot = {
  unassignedAtRiskCount: 0,
  interventionBacklogCount: 0,
  followUpCoverageRate48h: 100,
  assignmentEvents: [],
  instructors: [],
} as unknown as OrganizationDashboardSnapshot;

const controller = {
  filteredAssignments: [student],
  assignmentFilter: 'ALL',
  setAssignmentFilter: () => undefined,
  assignmentQuery: '',
  setAssignmentQuery: () => undefined,
  selectedAssignmentStudent: student,
  setSelectedStudentUid: () => undefined,
  selectedStudentMission: null,
  assignmentSavingUid: null,
  handleAssignmentChange: () => undefined,
  studentCohortSavingUid: null,
  handleStudentCohortChange: () => undefined,
  missionTrack: LearningTrack.EIKEN_2,
  setMissionTrack: () => undefined,
  missionBookId: blockedBook.id,
  setMissionBookId: () => undefined,
  missionNewWordsTarget: '12',
  setMissionNewWordsTarget: () => undefined,
  missionReviewWordsTarget: '24',
  setMissionReviewWordsTarget: () => undefined,
  missionQuizTargetCount: '8',
  setMissionQuizTargetCount: () => undefined,
  missionDueDate: '2026-06-14',
  setMissionDueDate: () => undefined,
  missionWritingAssignmentId: '',
  setMissionWritingAssignmentId: () => undefined,
  missionSavingUid: null,
  handleIssueMission: () => undefined,
} as unknown as BusinessAdminDashboardController;

describe('BusinessAdminAssignmentsSection material gate', () => {
  it('blocks issuing a weekly mission when the selected material is review-pending', () => {
    const rendered = renderToStaticMarkup(
      <BusinessAdminAssignmentsSection
        controller={controller}
        snapshot={snapshot}
        settingsSnapshot={null}
        books={[blockedBook]}
        writingAssignments={[]}
      />,
    );

    expect(rendered).toContain('承認済み教材のみ配布できます。利用可 0 冊 / 確認中 1 冊');
    expect(rendered).toContain('選択中の教材は確認中です。承認済み教材を選ぶか、smart-session に任せてください。');
    expect(rendered).toMatch(/data-testid="weekly-mission-issue-submit"[^>]*disabled=""/);
  });
});
