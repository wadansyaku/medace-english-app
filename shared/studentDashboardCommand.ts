import {
  MissionNextActionType,
  RecommendedActionType,
  type LearningTaskIntent,
  type PrimaryMissionSnapshot,
  type WeaknessSignalSummary,
} from '../types';
import {
  createCoachTaskIntent,
  createMissionTaskIntent,
  createTodayFocusTaskIntent,
  createWeaknessTaskIntent,
} from './learningTask';

export type StudentDashboardLearningRouteId = 'today' | 'mission' | 'weakness' | 'englishPractice' | 'writing';
export type StudentDashboardTaskId = StudentDashboardLearningRouteId
  | 'coach' | 'plan' | 'library' | 'progress' | 'announcements' | 'companion' | 'motivation' | 'account';
export type DashboardPracticeLane = 'grammar' | 'translation' | 'reading' | 'writing';
export type StudentDashboardSectionId = Exclude<StudentDashboardTaskId, 'today' | 'englishPractice'>;

type MissionContext = { missionAssignmentId?: string };
export type StudentDashboardCommand = MissionContext & (
  | { type: 'start_learning'; task: LearningTaskIntent }
  | { type: 'open_plan' }
  | { type: 'create_book' }
  | { type: 'open_practice'; lane: DashboardPracticeLane }
  | { type: 'open_section'; sectionId: StudentDashboardSectionId }
);

export interface StudentDashboardCommandInput {
  hasStudyBooks: boolean;
  canCreateBook?: boolean;
  canShowWritingSection: boolean;
  hasActionableWriting: boolean;
  primaryMission: PrimaryMissionSnapshot | null;
  topWeakness: WeaknessSignalSummary | null;
  preferredBookIds: string[];
  coachRecommendedActionType: RecommendedActionType | null;
  hasLearningPlan: boolean;
  practiceLane: DashboardPracticeLane;
}

export const resolveStudentDashboardCommand = (
  taskId: StudentDashboardTaskId,
  input: StudentDashboardCommandInput,
): StudentDashboardCommand => {
  const { primaryMission: mission } = input;
  const emptyLearningCommand: StudentDashboardCommand = input.canCreateBook === false
    ? { type: 'open_section', sectionId: 'library' }
    : { type: 'create_book' };
  const missionContext: MissionContext = mission?.assignmentId
    ? { missionAssignmentId: mission.assignmentId }
    : {};

  switch (taskId) {
    case 'today':
    case 'companion':
      return input.hasStudyBooks
        ? { type: 'start_learning', task: createTodayFocusTaskIntent({ preferredBookIds: input.preferredBookIds }) }
        : emptyLearningCommand;
    case 'mission': {
      if (!mission) return { type: 'open_plan' };
      if (mission.nextActionType === MissionNextActionType.OPEN_PLAN) {
        return { type: 'open_plan', ...missionContext };
      }
      if (mission.nextActionType === MissionNextActionType.OPEN_WRITING) {
        return input.canShowWritingSection
          ? { type: 'open_section', sectionId: 'writing', ...missionContext }
          : { type: 'open_plan', ...missionContext };
      }
      if (!input.hasStudyBooks) return input.canCreateBook === false
        ? { type: 'open_section', sectionId: 'library', ...missionContext }
        : { type: 'create_book', ...missionContext };
      const task = mission.nextTaskIntent || createMissionTaskIntent(mission);
      return task
        ? { type: 'start_learning', task, ...missionContext }
        : { type: 'open_plan', ...missionContext };
    }
    case 'writing':
      // A writing task must open writing even while the mission's next step is vocabulary.
      return input.canShowWritingSection
        ? { type: 'open_section', sectionId: 'writing', ...(input.hasActionableWriting ? missionContext : {}) }
        : { type: 'open_plan' };
    case 'weakness':
      if (input.topWeakness?.recommendedActionType === RecommendedActionType.OPEN_PLAN) {
        return { type: 'open_plan' };
      }
      return input.hasStudyBooks
        ? { type: 'start_learning', task: createWeaknessTaskIntent(input.topWeakness) }
        : emptyLearningCommand;
    case 'coach': {
      if (input.coachRecommendedActionType === RecommendedActionType.OPEN_PLAN) return { type: 'open_plan' };
      if (!input.coachRecommendedActionType) return { type: 'open_section', sectionId: 'coach' };
      if (!input.hasStudyBooks) return emptyLearningCommand;
      const task = createCoachTaskIntent({
        recommendedActionType: input.coachRecommendedActionType,
        hasLearningPlan: input.hasLearningPlan,
      });
      return task ? { type: 'start_learning', task } : { type: 'open_section', sectionId: 'coach' };
    }
    case 'englishPractice':
      return { type: 'open_practice', lane: input.practiceLane };
    case 'plan':
      return { type: 'open_plan' };
    default:
      return { type: 'open_section', sectionId: taskId };
  }
};
