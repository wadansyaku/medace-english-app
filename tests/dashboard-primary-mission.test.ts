import { describe, expect, it, vi } from 'vitest';

import {
  buildDashboardPrimaryMission,
  type DashboardSuggestedPrimaryMissionBuilder,
} from '../functions/_shared/dashboard-primary-mission';
import {
  EnglishLevel,
  LearningPreferenceIntensity,
  LearningTrack,
  MissionNextActionType,
  UserGrade,
  UserRole,
  WeeklyMissionStatus,
  type LearningPlan,
  type LearningPreference,
  type MissionAssignment,
  type MissionProgressSummary,
  type PrimaryMissionSnapshot,
} from '../types';

const dueAt = Date.parse('2026-06-25T23:59:59+09:00');
const assignedAt = Date.parse('2026-06-19T09:00:00+09:00');

const progress: MissionProgressSummary = {
  newWordsCompleted: 0,
  newWordsTarget: 12,
  reviewWordsCompleted: 0,
  reviewWordsTarget: 8,
  quizCompletedCount: 0,
  quizTargetCount: 1,
  writingCompleted: false,
  writingRequired: false,
  completionRate: 0,
  overdue: false,
  status: WeeklyMissionStatus.ASSIGNED,
  nextActionType: MissionNextActionType.OPEN_STUDY,
  nextActionLabel: '単語を始める',
  blockers: [],
};

const studentUser = {
  id: 'student-1',
  role: UserRole.STUDENT,
  grade: UserGrade.JHS3,
  english_level: EnglishLevel.B1,
};

const suggestedMission: PrimaryMissionSnapshot = {
  ...progress,
  track: LearningTrack.SCHOOL_TERM,
  title: 'Suggested Mission',
  rationale: '学習計画から今日の単語を提案します。',
  dueAt,
  dueDate: '2026-06-25',
  isSuggested: true,
};

describe('buildDashboardPrimaryMission', () => {
  it('prioritizes an assigned mission over generated suggestions', () => {
    const builder = vi.fn(() => suggestedMission) as unknown as DashboardSuggestedPrimaryMissionBuilder;
    const assignedMission: MissionAssignment = {
      id: 'assignment-1',
      missionId: 'mission-1',
      studentUid: 'student-1',
      studentName: 'Student One',
      assignedByUid: 'admin-1',
      assignedByName: 'Admin',
      assignedAt,
      progress,
      mission: {
        id: 'mission-1',
        createdByUid: 'admin-1',
        learningTrack: LearningTrack.EIKEN_2,
        title: 'Assigned Mission',
        rationale: '講師が指定した週次ミッションです。',
        bookId: 'book-1',
        bookTitle: 'DUO 3.0',
        newWordsTarget: 12,
        reviewWordsTarget: 8,
        quizTargetCount: 1,
        dueAt,
        status: WeeklyMissionStatus.ASSIGNED,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };

    const primaryMission = buildDashboardPrimaryMission({
      user: studentUser,
      todaySelectableBooks: [
        {
          id: 'book-1',
          title: 'DUO 3.0',
        },
      ],
      learningPlan: null,
      learningPreference: null,
      assignedMission,
      suggestedMissionBuilder: builder,
    });

    expect(builder).not.toHaveBeenCalled();
    expect(primaryMission).toMatchObject({
      assignmentId: 'assignment-1',
      track: LearningTrack.EIKEN_2,
      title: 'Assigned Mission',
      sourceBookId: 'book-1',
      sourceBookTitle: 'DUO 3.0',
      isSuggested: false,
    });
  });

  it('removes source-based actions from assigned missions when their book is no longer selectable', () => {
    const builder = vi.fn(() => suggestedMission) as unknown as DashboardSuggestedPrimaryMissionBuilder;
    const assignedMission: MissionAssignment = {
      id: 'assignment-1',
      missionId: 'mission-1',
      studentUid: 'student-1',
      studentName: 'Student One',
      assignedByUid: 'admin-1',
      assignedByName: 'Admin',
      assignedAt,
      progress,
      mission: {
        id: 'mission-1',
        createdByUid: 'admin-1',
        learningTrack: LearningTrack.EIKEN_2,
        title: 'Assigned Mission',
        rationale: '講師が指定した週次ミッションです。',
        bookId: 'blocked-book',
        bookTitle: 'Blocked Book',
        newWordsTarget: 12,
        reviewWordsTarget: 8,
        quizTargetCount: 1,
        dueAt,
        status: WeeklyMissionStatus.ASSIGNED,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };

    const primaryMission = buildDashboardPrimaryMission({
      user: studentUser,
      todaySelectableBooks: [
        {
          id: 'book-1',
          title: 'DUO 3.0',
        },
      ],
      learningPlan: null,
      learningPreference: null,
      assignedMission,
      suggestedMissionBuilder: builder,
    });

    expect(builder).not.toHaveBeenCalled();
    expect(primaryMission).toMatchObject({
      assignmentId: 'assignment-1',
      sourceBookId: undefined,
      sourceBookTitle: 'Blocked Book',
      nextActionType: MissionNextActionType.OPEN_PLAN,
      nextActionLabel: '教材設定を確認',
      blockers: ['指定教材を確認してください'],
      isSuggested: false,
    });
    expect(primaryMission?.nextTaskIntent).toBeNull();
  });

  it('passes student learning plan and preference context into suggestion generation', () => {
    const builder = vi.fn(() => suggestedMission) as unknown as DashboardSuggestedPrimaryMissionBuilder;
    const learningPlan: LearningPlan = {
      uid: 'student-1',
      createdAt: Date.now(),
      targetDate: '2026-07-01',
      goalDescription: '毎日 DUO を進める',
      dailyWordGoal: 18,
      selectedBookIds: ['book-2'],
      status: 'ACTIVE',
    };
    const learningPreference: LearningPreference = {
      userUid: 'student-1',
      targetExam: '高校入試',
      targetScore: '80',
      examDate: '2027-02-01',
      weeklyStudyDays: 5,
      dailyStudyMinutes: 30,
      weakSkillFocus: '長文',
      motivationNote: '短時間で継続',
      intensity: LearningPreferenceIntensity.REVIEW_HEAVY,
      updatedAt: Date.now(),
    };
    const todaySelectableBooks = [
      {
        id: 'book-2',
        title: 'Core Words',
        description: 'School term words',
        source_context: 'school-term',
        word_count: 300,
        is_priority: 1,
      },
    ];

    const primaryMission = buildDashboardPrimaryMission({
      user: studentUser,
      todaySelectableBooks,
      learningPlan,
      learningPreference,
      suggestedMissionBuilder: builder,
    });

    expect(primaryMission).toBe(suggestedMission);
    expect(builder).toHaveBeenCalledWith({
      user: studentUser,
      books: todaySelectableBooks,
      learningPlan: {
        dailyWordGoal: 18,
        selectedBookIds: ['book-2'],
      },
      learningPreference: {
        targetExam: '高校入試',
        targetScore: '80',
        weeklyStudyDays: 5,
        dailyStudyMinutes: 30,
        weakSkillFocus: '長文',
        examDate: '2027-02-01',
        intensity: LearningPreferenceIntensity.REVIEW_HEAVY,
      },
    });
  });

  it('does not create suggested dashboard missions for non-student users', () => {
    const builder = vi.fn(() => suggestedMission) as unknown as DashboardSuggestedPrimaryMissionBuilder;

    const primaryMission = buildDashboardPrimaryMission({
      user: {
        ...studentUser,
        role: UserRole.ADMIN,
      },
      todaySelectableBooks: [],
      learningPlan: null,
      learningPreference: null,
      suggestedMissionBuilder: builder,
    });

    expect(primaryMission).toBeNull();
    expect(builder).not.toHaveBeenCalled();
  });
});
