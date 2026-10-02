import { describe, expect, it } from 'vitest';
import {
  resolveStudentDashboardCommand,
  type StudentDashboardCommandInput,
} from '../shared/studentDashboardCommand';
import { LearningTrack, MissionNextActionType, RecommendedActionType, WeeklyMissionStatus } from '../types';

const input = (overrides: Partial<StudentDashboardCommandInput> = {}): StudentDashboardCommandInput => ({
  hasStudyBooks: true,
  canShowWritingSection: true,
  hasActionableWriting: true,
  primaryMission: {
    assignmentId: 'assignment-1',
    missionId: 'mission-1',
    track: LearningTrack.EIKEN_2,
    title: '今週の学習',
    rationale: '語彙と英作文',
    dueAt: 100,
    dueDate: '2026-09-08',
    sourceBookId: 'book-1',
    sourceBookTitle: '教材1',
    isSuggested: false,
    newWordsCompleted: 0,
    newWordsTarget: 10,
    reviewWordsCompleted: 0,
    reviewWordsTarget: 0,
    quizCompletedCount: 0,
    quizTargetCount: 0,
    writingCompleted: false,
    writingRequired: true,
    completionRate: 0,
    overdue: false,
    status: WeeklyMissionStatus.IN_PROGRESS,
    nextActionType: MissionNextActionType.OPEN_STUDY,
    nextActionLabel: '語彙を進める',
    blockers: ['新出語', '英作文'],
  },
  topWeakness: null,
  preferredBookIds: ['book-2'],
  coachRecommendedActionType: RecommendedActionType.START_REVIEW,
  hasLearningPlan: true,
  practiceLane: 'grammar',
  ...overrides,
});

describe('student dashboard commands', () => {
  it('opens writing for a writing task even when the mission next action is vocabulary', () => {
    expect(resolveStudentDashboardCommand('writing', input())).toEqual({
      type: 'open_section', sectionId: 'writing', missionAssignmentId: 'assignment-1',
    });
    expect(resolveStudentDashboardCommand('mission', input())).toMatchObject({
      type: 'start_learning', task: { mode: 'study', bookId: 'book-1' }, missionAssignmentId: 'assignment-1',
    });
  });

  it('keeps writing accessible without a vocabulary book', () => {
    expect(resolveStudentDashboardCommand('writing', input({ hasStudyBooks: false }))).toMatchObject({
      type: 'open_section', sectionId: 'writing',
    });
  });

  it('uses the mission quiz contract, including its assignment and auto-start', () => {
    const context = input();
    context.primaryMission!.nextActionType = MissionNextActionType.OPEN_QUIZ;
    expect(resolveStudentDashboardCommand('mission', context)).toMatchObject({
      type: 'start_learning', task: { mode: 'quiz', missionAssignmentId: 'assignment-1', autoStart: true },
    });
  });

  it('opens material settings for a mission whose source book is unavailable', () => {
    const context = input({ hasStudyBooks: false });
    context.primaryMission!.nextActionType = MissionNextActionType.OPEN_PLAN;
    expect(resolveStudentDashboardCommand('mission', context)).toEqual({
      type: 'open_plan', missionAssignmentId: 'assignment-1',
    });
  });

  it.each(['today', 'weakness', 'coach'] as const)('offers material creation before %s if no study book exists', (taskId) => {
    expect(resolveStudentDashboardCommand(taskId, input({ hasStudyBooks: false }))).toEqual({ type: 'create_book' });
  });

  it.each(['today', 'weakness', 'coach'] as const)('opens available grammar instead of prohibited creation before %s', (taskId) => {
    expect(resolveStudentDashboardCommand(taskId, input({ hasStudyBooks: false, canCreateBook: false }))).toEqual({ type: 'open_practice', lane: 'grammar' });
  });

  it('keeps an unavailable assigned material directed to the library', () => {
    expect(resolveStudentDashboardCommand('mission', input({ hasStudyBooks: false, canCreateBook: false }))).toEqual({
      type: 'open_section', sectionId: 'library', missionAssignmentId: 'assignment-1',
    });
  });

  it('keeps the selected course order on the daily study command', () => {
    expect(resolveStudentDashboardCommand('today', input())).toMatchObject({
      type: 'start_learning', task: { preferredBookIds: ['book-2'], selectionPolicy: 'DUE_FIRST' },
    });
  });

  it('opens the selected practice lane directly', () => {
    expect(resolveStudentDashboardCommand('englishPractice', input({ practiceLane: 'reading' }))).toEqual({
      type: 'open_practice', lane: 'reading',
    });
  });

  it('routes a plan nudge to settings without requiring vocabulary material', () => {
    expect(resolveStudentDashboardCommand('coach', input({
      hasStudyBooks: false, coachRecommendedActionType: RecommendedActionType.OPEN_PLAN,
    }))).toEqual({ type: 'open_plan' });
  });

  it('does not start study for a coach message that has no action', () => {
    expect(resolveStudentDashboardCommand('coach', input({ coachRecommendedActionType: null }))).toEqual({
      type: 'open_section', sectionId: 'coach',
    });
  });

  it.each(['library', 'progress', 'account'] as const)('opens %s as a reference section', (taskId) => {
    expect(resolveStudentDashboardCommand(taskId, input())).toEqual({ type: 'open_section', sectionId: taskId });
  });
});
