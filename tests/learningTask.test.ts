import { describe, expect, it } from 'vitest';

import {
  LearningTaskIntentType,
  LearningTrack,
  MissionNextActionType,
  WeaknessDimension,
  type PrimaryMissionSnapshot,
  type WeaknessSignalSummary,
  WeaknessSignalLevel,
  RecommendedActionType,
  WeeklyMissionStatus,
} from '../types';
import {
  createCoachTaskIntent,
  createMissionTaskIntent,
  createTodayFocusTaskIntent,
  createWeaknessTaskIntent,
} from '../shared/learningTask';

describe('learning tasks', () => {
  it('builds a due-first task for Today Focus', () => {
    expect(createTodayFocusTaskIntent()).toMatchObject({
      mode: 'study',
      intentType: LearningTaskIntentType.TODAY_FOCUS,
      selectionPolicy: 'DUE_FIRST',
      limit: 20,
    });
  });

  it('routes meaning and spelling weaknesses into direct quiz tasks', () => {
    const baseSignal: WeaknessSignalSummary = {
      dimension: WeaknessDimension.MEANING_RECALL,
      level: WeaknessSignalLevel.HIGH,
      score: 71,
      sampleSize: 8,
      reason: 'recall',
      nextActionLabel: '意味から英語クイズを始める',
      recommendedActionType: RecommendedActionType.START_REVIEW,
      targetQuestionModes: ['JA_TO_EN'],
      updatedAt: 1_000,
    };

    expect(createWeaknessTaskIntent(baseSignal)).toMatchObject({
      mode: 'quiz',
      intentType: LearningTaskIntentType.WEAKNESS_QUIZ,
      autoStart: true,
      targetQuestionModes: ['JA_TO_EN'],
    });

    expect(createWeaknessTaskIntent({
      ...baseSignal,
      dimension: WeaknessDimension.SPELLING_RECALL,
      targetQuestionModes: ['SPELLING_HINT'],
    })).toMatchObject({
      mode: 'quiz',
      targetQuestionModes: ['SPELLING_HINT'],
    });
  });

  it('routes retention weakness into study tasks', () => {
    const signal: WeaknessSignalSummary = {
      dimension: WeaknessDimension.RETENTION_STABILITY,
      level: WeaknessSignalLevel.MEDIUM,
      score: 41,
      sampleSize: 12,
      reason: 'retention',
      nextActionLabel: '復習を10語始める',
      recommendedActionType: RecommendedActionType.START_REVIEW,
      targetQuestionModes: ['JA_TO_EN', 'EN_TO_JA'],
      targetBandIndex: 4,
      updatedAt: 2_000,
    };

    expect(createWeaknessTaskIntent(signal)).toMatchObject({
      mode: 'study',
      intentType: LearningTaskIntentType.WEAKNESS_STUDY,
      selectionPolicy: 'WEAKNESS_FOCUS',
      targetBandIndex: 4,
    });
  });

  it('keeps coach review tasks executable even when a learning plan already exists', () => {
    expect(createCoachTaskIntent({
      recommendedActionType: RecommendedActionType.START_REVIEW,
      hasLearningPlan: true,
    })).toMatchObject({
      mode: 'study',
      intentType: LearningTaskIntentType.COACH_REVIEW,
      selectionPolicy: 'DUE_FIRST',
    });

    expect(createCoachTaskIntent({
      recommendedActionType: RecommendedActionType.OPEN_PLAN,
      hasLearningPlan: true,
    })).toBeNull();
  });

  it('builds mission review/new/quiz tasks from mission blockers', () => {
    const baseMission: PrimaryMissionSnapshot = {
      assignmentId: 'assignment-1',
      missionId: 'mission-1',
      track: LearningTrack.EIKEN_2,
      title: 'Mission',
      rationale: 'focus',
      dueAt: 10_000,
      dueDate: '2026-03-16',
      sourceBookId: 'book-1',
      sourceBookTitle: 'Book 1',
      isSuggested: false,
      startedAt: 1_000,
      newWordsCompleted: 0,
      newWordsTarget: 10,
      reviewWordsCompleted: 0,
      reviewWordsTarget: 6,
      quizCompletedCount: 0,
      quizTargetCount: 1,
      writingCompleted: false,
      writingRequired: false,
      completionRate: 0,
      overdue: false,
      status: WeeklyMissionStatus.ASSIGNED,
      nextActionType: MissionNextActionType.OPEN_STUDY,
      nextActionLabel: '新出を10語進める',
      blockers: ['新出 10語', '復習 6語'],
    };

    expect(createMissionTaskIntent(baseMission)).toMatchObject({
      mode: 'study',
      intentType: LearningTaskIntentType.MISSION_NEW,
      selectionPolicy: 'BOOK_NEW_ONLY',
      missionAssignmentId: 'assignment-1',
    });

    const inProgressMission: PrimaryMissionSnapshot = {
      ...baseMission,
      status: WeeklyMissionStatus.IN_PROGRESS,
      newWordsCompleted: 4,
      completionRate: 20,
      nextActionLabel: '復習を6語進める',
    };

    expect(createMissionTaskIntent({
      ...inProgressMission,
      newWordsCompleted: 10,
      reviewWordsCompleted: 0,
      nextActionLabel: '復習を6語進める',
    })).toMatchObject({
      mode: 'study',
      intentType: LearningTaskIntentType.MISSION_REVIEW,
      selectionPolicy: 'BOOK_REVIEW_ONLY',
    });

    expect(createMissionTaskIntent({
      ...inProgressMission,
      nextActionLabel: '新出を6語進める',
      reviewWordsCompleted: 6,
      newWordsCompleted: 4,
    })).toMatchObject({
      mode: 'study',
      intentType: LearningTaskIntentType.MISSION_NEW,
      selectionPolicy: 'BOOK_NEW_ONLY',
    });

    expect(createMissionTaskIntent({
      ...inProgressMission,
      reviewWordsCompleted: 6,
      newWordsCompleted: 10,
      nextActionType: MissionNextActionType.OPEN_QUIZ,
      nextActionLabel: '確認クイズを始める',
    })).toMatchObject({
      mode: 'quiz',
      intentType: LearningTaskIntentType.MISSION_QUIZ,
      autoStart: true,
    });
  });
});
