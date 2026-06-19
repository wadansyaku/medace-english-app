import {
  BookAccessScope,
  BookCatalogSource,
  type EnglishLevel,
  type LearningPlan,
  type LearningPreference,
  LearningPreferenceIntensity,
  type MissionAssignment,
  MissionNextActionType,
  type MissionProgressSummary,
  type PrimaryMissionSnapshot,
  type UserGrade,
  UserRole,
} from '../../types';
import {
  buildMissionProgress,
  buildSuggestedMissionDraft,
  toPrimaryMissionSnapshot,
} from '../../shared/missions';
import type { DbUserRow } from './types';

export type DashboardPrimaryMissionBook = {
  id: string;
  title: string;
  description?: string | null;
  source_context?: string | null;
  word_count?: number | null;
  is_priority?: number | null;
};

export type DashboardSuggestedPrimaryMissionBuilder = (input: {
  user: Pick<DbUserRow, 'id' | 'grade' | 'english_level'>;
  books: DashboardPrimaryMissionBook[];
  learningPlan?: { dailyWordGoal: number; selectedBookIds: string[] } | null;
  learningPreference?: {
    targetExam?: string | null;
    targetScore?: string | null;
    weeklyStudyDays?: number | null;
    dailyStudyMinutes?: number | null;
    weakSkillFocus?: string | null;
    examDate?: string | null;
    intensity?: string | null;
  } | null;
  writingAssignmentId?: string;
  writingPromptTitle?: string;
  now?: number;
}) => PrimaryMissionSnapshot;

export interface DashboardPrimaryMissionInput {
  user: Pick<DbUserRow, 'id' | 'role' | 'grade' | 'english_level'>;
  todaySelectableBooks: DashboardPrimaryMissionBook[];
  learningPlan: LearningPlan | null;
  learningPreference: LearningPreference | null;
  assignedMission?: MissionAssignment | null;
  suggestedMissionBuilder?: DashboardSuggestedPrimaryMissionBuilder;
}

const SOURCE_BOOK_UNAVAILABLE_BLOCKER = '指定教材を確認してください';

const requiresSelectableSourceBook = (progress: MissionProgressSummary): boolean => (
  progress.nextActionType === MissionNextActionType.OPEN_STUDY
  || progress.nextActionType === MissionNextActionType.OPEN_QUIZ
);

const normalizeAssignedMissionProgress = ({
  progress,
  sourceBookSelectable,
}: {
  progress: MissionProgressSummary;
  sourceBookSelectable: boolean;
}): MissionProgressSummary => {
  if (sourceBookSelectable || !requiresSelectableSourceBook(progress)) {
    return progress;
  }

  return {
    ...progress,
    nextActionType: MissionNextActionType.OPEN_PLAN,
    nextActionLabel: '教材設定を確認',
    blockers: progress.blockers.includes(SOURCE_BOOK_UNAVAILABLE_BLOCKER)
      ? progress.blockers
      : [...progress.blockers, SOURCE_BOOK_UNAVAILABLE_BLOCKER],
  };
};

export const buildSuggestedDashboardPrimaryMission: DashboardSuggestedPrimaryMissionBuilder = ({
  user,
  books,
  learningPlan,
  learningPreference,
  writingAssignmentId,
  writingPromptTitle,
  now = Date.now(),
}) => {
  const missionBooks = books.map((book) => ({
    id: book.id,
    title: book.title,
    wordCount: Number(book.word_count || 0),
    isPriority: Boolean(book.is_priority),
    description: book.description || undefined,
    sourceContext: book.source_context || undefined,
    catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
    accessScope: BookAccessScope.ALL_PLANS,
  }));
  const draft = buildSuggestedMissionDraft({
    grade: user.grade as UserGrade | undefined,
    level: user.english_level as EnglishLevel | undefined,
    learningPlan: learningPlan
      ? {
          uid: user.id,
          createdAt: now,
          targetDate: '',
          goalDescription: '',
          dailyWordGoal: learningPlan.dailyWordGoal,
          selectedBookIds: learningPlan.selectedBookIds,
          status: 'ACTIVE',
        }
      : null,
    learningPreference: learningPreference
      ? {
          userUid: user.id,
          targetExam: learningPreference.targetExam || '',
          targetScore: learningPreference.targetScore || '',
          examDate: learningPreference.examDate || '',
          weeklyStudyDays: Number(learningPreference.weeklyStudyDays || 4),
          dailyStudyMinutes: Number(learningPreference.dailyStudyMinutes || 20),
          weakSkillFocus: learningPreference.weakSkillFocus || '',
          motivationNote: '',
          intensity: (learningPreference.intensity as LearningPreferenceIntensity | null) || LearningPreferenceIntensity.BALANCED,
          updatedAt: now,
        }
      : null,
    books: missionBooks,
    writingAssignmentId,
    writingPromptTitle,
    now,
  });

  const progress = buildMissionProgress({
    dueAt: draft.dueAt,
    newWordsCompleted: 0,
    newWordsTarget: draft.newWordsTarget,
    reviewWordsCompleted: 0,
    reviewWordsTarget: draft.reviewWordsTarget,
    quizCompletedCount: 0,
    quizTargetCount: draft.quizTargetCount,
    writingRequired: Boolean(draft.writingAssignmentId),
    writingCompleted: false,
    now,
  });

  return toPrimaryMissionSnapshot({
    track: draft.learningTrack,
    title: draft.title,
    rationale: draft.rationale,
    dueAt: draft.dueAt,
    sourceBookId: draft.bookId,
    sourceBookTitle: draft.bookTitle,
    writingAssignmentId: draft.writingAssignmentId,
    writingPromptTitle: draft.writingPromptTitle,
    isSuggested: true,
    progress,
  });
};

export const buildDashboardPrimaryMission = ({
  user,
  todaySelectableBooks,
  learningPlan,
  learningPreference,
  assignedMission,
  suggestedMissionBuilder = buildSuggestedDashboardPrimaryMission,
}: DashboardPrimaryMissionInput): PrimaryMissionSnapshot | null => {
  if (assignedMission) {
    const assignedSourceBookId = assignedMission.mission.bookId;
    const sourceBookSelectable = !assignedSourceBookId
      || todaySelectableBooks.some((book) => book.id === assignedSourceBookId);
    const progress = normalizeAssignedMissionProgress({
      progress: assignedMission.progress,
      sourceBookSelectable,
    });

    return toPrimaryMissionSnapshot({
      assignmentId: assignedMission.id,
      track: assignedMission.mission.learningTrack,
      title: assignedMission.mission.title,
      rationale: assignedMission.mission.rationale,
      dueAt: assignedMission.mission.dueAt,
      sourceBookId: sourceBookSelectable ? assignedSourceBookId : undefined,
      sourceBookTitle: assignedMission.mission.bookTitle,
      writingAssignmentId: assignedMission.mission.writingAssignmentId,
      writingPromptTitle: assignedMission.mission.writingPromptTitle,
      isSuggested: false,
      progress,
    });
  }

  if (user.role !== UserRole.STUDENT) {
    return null;
  }

  return suggestedMissionBuilder({
    user,
    books: todaySelectableBooks,
    learningPlan: learningPlan
      ? {
          dailyWordGoal: learningPlan.dailyWordGoal,
          selectedBookIds: learningPlan.selectedBookIds,
        }
      : null,
    learningPreference: learningPreference
      ? {
          targetExam: learningPreference.targetExam,
          targetScore: learningPreference.targetScore,
          weeklyStudyDays: learningPreference.weeklyStudyDays,
          dailyStudyMinutes: learningPreference.dailyStudyMinutes,
          weakSkillFocus: learningPreference.weakSkillFocus,
          examDate: learningPreference.examDate,
          intensity: learningPreference.intensity,
        }
      : null,
  });
};
