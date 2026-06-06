import { describe, expect, it } from 'vitest';

import {
  LearningTrack,
  MissionProgressEventType,
  MissionNextActionType,
  OrganizationRole,
  StudentRiskLevel,
  UserRole,
  WeeklyMissionStatus,
  type MissionAssignment,
  type UserProfile,
} from '../types';
import {
  buildMissionProgress,
  buildMissionTrackCompletion,
  calculateMissionOverdueRecoveryRate,
  calculateMissionStartedRate,
} from '../shared/missions';
import { getInstructorQueueSegment } from '../shared/retention';
import {
  assignLocalWeeklyMission,
  createLocalWeeklyMission,
  resetLocalMissionState,
  updateLocalMissionProgress,
} from '../services/storage/missions';

const makeMissionUser = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'admin-local',
  displayName: 'Local Admin',
  role: UserRole.ADMIN,
  email: 'admin-local@example.test',
  organizationId: 'org-local',
  organizationRole: OrganizationRole.GROUP_ADMIN,
  ...overrides,
});

describe('missions', () => {
  it('keeps untouched missions in ASSIGNED until the first action happens', () => {
    const progress = buildMissionProgress({
      assignedAt: 1_000,
      dueAt: 10_000,
      newWordsCompleted: 0,
      newWordsTarget: 20,
      reviewWordsCompleted: 0,
      reviewWordsTarget: 10,
      quizCompletedCount: 0,
      quizTargetCount: 1,
      writingRequired: false,
      writingCompleted: false,
      now: 5_000,
    });

    expect(progress.status).toBe(WeeklyMissionStatus.ASSIGNED);
    expect(progress.completionRate).toBe(0);
  });

  it('marks overdue missions as immediate in the instructor queue', () => {
    const segment = getInstructorQueueSegment({
      riskLevel: StudentRiskLevel.SAFE,
      latestInterventionAt: undefined,
      latestInterventionOutcome: undefined,
      needsFollowUpNow: false,
      primaryMissionStatus: WeeklyMissionStatus.OVERDUE,
      missionOverdue: true,
      missionDueAt: 1_000,
    });

    expect(segment).toBe('IMMEDIATE');
  });

  it('routes quiz blockers to OPEN_QUIZ instead of generic study', () => {
    const progress = buildMissionProgress({
      assignedAt: 1_000,
      startedAt: 2_000,
      dueAt: 10_000,
      newWordsCompleted: 20,
      newWordsTarget: 20,
      reviewWordsCompleted: 10,
      reviewWordsTarget: 10,
      quizCompletedCount: 0,
      quizTargetCount: 1,
      writingRequired: false,
      writingCompleted: false,
      now: 5_000,
    });

    expect(progress.nextActionType).toBe(MissionNextActionType.OPEN_QUIZ);
    expect(progress.nextActionLabel).toBe('確認クイズを始める');
  });

  it('starts fresh missions with new words before review-only work', () => {
    const progress = buildMissionProgress({
      assignedAt: 1_000,
      dueAt: 10_000,
      newWordsCompleted: 0,
      newWordsTarget: 8,
      reviewWordsCompleted: 0,
      reviewWordsTarget: 4,
      quizCompletedCount: 0,
      quizTargetCount: 1,
      writingRequired: false,
      writingCompleted: false,
      now: 5_000,
    });

    expect(progress.nextActionType).toBe(MissionNextActionType.OPEN_STUDY);
    expect(progress.nextActionLabel).toBe('新出を8語進める');
  });

  it('keeps student mission updates to normal progress events while staff can manually complete', () => {
    resetLocalMissionState();
    const admin = makeMissionUser();
    const student = makeMissionUser({
      uid: 'student-local',
      displayName: 'Local Student',
      role: UserRole.STUDENT,
      email: 'student-local@example.test',
      organizationRole: OrganizationRole.STUDENT,
    });
    const mission = createLocalWeeklyMission(admin, {
      learningTrack: LearningTrack.EIKEN_2,
      title: 'Manual Complete Guard',
      newWordsTarget: 2,
      reviewWordsTarget: 0,
      quizTargetCount: 0,
    });
    const assignment = assignLocalWeeklyMission(admin, mission.id, student.uid, student.displayName);

    expect(updateLocalMissionProgress(student, assignment.id, MissionProgressEventType.OPENED).progress.status)
      .toBe(WeeklyMissionStatus.IN_PROGRESS);
    expect(() => updateLocalMissionProgress(student, assignment.id, MissionProgressEventType.MANUAL_COMPLETE))
      .toThrow('ミッションの手動完了は講師または管理者が実行してください。');
    expect(updateLocalMissionProgress(admin, assignment.id, MissionProgressEventType.MANUAL_COMPLETE).progress.status)
      .toBe(WeeklyMissionStatus.COMPLETED);
  });

  it('aggregates track completion, started rate, and overdue recovery rate from mission assignments', () => {
    const assignments: MissionAssignment[] = [
      {
        id: 'a',
        missionId: 'mission-a',
        studentUid: 'student-a',
        studentName: 'Alpha',
        assignedByUid: 'admin',
        assignedByName: 'Admin',
        assignedAt: 1_000,
        mission: {
          id: 'mission-a',
          createdByUid: 'admin',
          learningTrack: LearningTrack.EIKEN_2,
          title: 'Mission A',
          rationale: 'focus',
          newWordsTarget: 20,
          reviewWordsTarget: 10,
          quizTargetCount: 1,
          dueAt: 10_000,
          status: WeeklyMissionStatus.IN_PROGRESS,
          createdAt: 1_000,
          updatedAt: 2_000,
        },
        progress: {
          startedAt: 2_000,
          lastActivityAt: 3_000,
          newWordsCompleted: 10,
          newWordsTarget: 20,
          reviewWordsCompleted: 4,
          reviewWordsTarget: 10,
          quizCompletedCount: 0,
          quizTargetCount: 1,
          writingRequired: false,
          writingCompleted: false,
          completionRate: 45,
          overdue: false,
          status: WeeklyMissionStatus.IN_PROGRESS,
          nextActionType: MissionNextActionType.OPEN_STUDY,
          nextActionLabel: '続ける',
          blockers: ['新出 10語'],
        },
      },
      {
        id: 'b',
        missionId: 'mission-b',
        studentUid: 'student-b',
        studentName: 'Beta',
        assignedByUid: 'admin',
        assignedByName: 'Admin',
        assignedAt: 1_000,
        mission: {
          id: 'mission-b',
          createdByUid: 'admin',
          learningTrack: LearningTrack.EIKEN_2,
          title: 'Mission B',
          rationale: 'focus',
          newWordsTarget: 20,
          reviewWordsTarget: 10,
          quizTargetCount: 1,
          dueAt: 10_000,
          status: WeeklyMissionStatus.COMPLETED,
          createdAt: 1_000,
          updatedAt: 4_000,
        },
        progress: {
          startedAt: 2_000,
          completedAt: 4_000,
          newWordsCompleted: 20,
          newWordsTarget: 20,
          reviewWordsCompleted: 10,
          reviewWordsTarget: 10,
          quizCompletedCount: 1,
          quizTargetCount: 1,
          writingRequired: false,
          writingCompleted: false,
          completionRate: 100,
          overdue: false,
          status: WeeklyMissionStatus.COMPLETED,
          nextActionType: MissionNextActionType.OPEN_STUDY,
          nextActionLabel: '達成',
          blockers: [],
        },
      },
      {
        id: 'c',
        missionId: 'mission-c',
        studentUid: 'student-c',
        studentName: 'Gamma',
        assignedByUid: 'admin',
        assignedByName: 'Admin',
        assignedAt: 1_000,
        mission: {
          id: 'mission-c',
          createdByUid: 'admin',
          learningTrack: LearningTrack.EIKEN_2,
          title: 'Mission C',
          rationale: 'focus',
          newWordsTarget: 20,
          reviewWordsTarget: 10,
          quizTargetCount: 1,
          dueAt: 2_500,
          status: WeeklyMissionStatus.OVERDUE,
          createdAt: 1_000,
          updatedAt: 4_000,
        },
        progress: {
          startedAt: 2_000,
          restartedAt: 3_200,
          lastActivityAt: 3_200,
          newWordsCompleted: 4,
          newWordsTarget: 20,
          reviewWordsCompleted: 2,
          reviewWordsTarget: 10,
          quizCompletedCount: 0,
          quizTargetCount: 1,
          writingRequired: false,
          writingCompleted: false,
          completionRate: 18,
          overdue: true,
          status: WeeklyMissionStatus.OVERDUE,
          nextActionType: MissionNextActionType.OPEN_STUDY,
          nextActionLabel: '再開する',
          blockers: ['新出 16語'],
        },
      },
    ];

    const trackSummary = buildMissionTrackCompletion(assignments).find((track) => track.track === LearningTrack.EIKEN_2);
    expect(trackSummary).toMatchObject({
      assignedCount: 3,
      completedCount: 1,
      overdueCount: 1,
      completionRate: 54,
    });
    expect(calculateMissionStartedRate(assignments)).toBe(100);
    expect(calculateMissionOverdueRecoveryRate(assignments, 4_000)).toBe(100);
  });
});
