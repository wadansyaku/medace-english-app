import {
  EnglishLevel,
  LearningTrack,
  MissionNextActionType,
  type MissionAssignment,
  type MissionTrackCompletionSummary,
  type MissionTrackWritingReturnSummary,
  type MissionProgressSummary,
  type PrimaryMissionSnapshot,
  type WeeklyMission,
  type WeeklyMissionStatus,
  UserGrade,
  type BookMetadata,
  type LearningPlan,
  type LearningPreference,
  type WritingAssignmentStatus,
  WritingAssignmentStatus as WritingAssignmentStatusEnum,
  WeeklyMissionStatus as WeeklyMissionStatusEnum,
} from '../types';
import { getBookProgressionIndex, getTargetBookProgressionIndex } from './bookProgression';
import { createMissionTaskIntent } from './learningTask';
import { formatDateKey, shiftDateKey } from '../utils/date';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const DEFAULT_TARGETS: Record<LearningTrack, { newWords: number; reviewWords: number; quizCount: number }> = {
  [LearningTrack.EIKEN_PRE2]: { newWords: 24, reviewWords: 16, quizCount: 1 },
  [LearningTrack.EIKEN_2]: { newWords: 30, reviewWords: 18, quizCount: 1 },
  [LearningTrack.COMMON_TEST]: { newWords: 36, reviewWords: 20, quizCount: 1 },
  [LearningTrack.SCHOOL_TERM]: { newWords: 18, reviewWords: 12, quizCount: 1 },
};

const TRACK_PROGRESSION_OFFSET: Record<LearningTrack, number> = {
  [LearningTrack.EIKEN_PRE2]: 0,
  [LearningTrack.EIKEN_2]: 1,
  [LearningTrack.COMMON_TEST]: 1,
  [LearningTrack.SCHOOL_TERM]: 0,
};

const WRITING_COMPLETED_STATUSES = new Set<WritingAssignmentStatus>([
  WritingAssignmentStatusEnum.RETURNED,
  WritingAssignmentStatusEnum.COMPLETED,
]);

export const isWritingReturnedForMission = (status?: WritingAssignmentStatus | null): boolean => (
  Boolean(status && WRITING_COMPLETED_STATUSES.has(status))
);

export const inferLearningTrack = ({
  grade,
  level,
  learningPreference,
}: {
  grade?: UserGrade;
  level?: EnglishLevel;
  learningPreference?: LearningPreference | null;
}): LearningTrack => {
  const targetExam = `${learningPreference?.targetExam || ''} ${learningPreference?.targetScore || ''}`.toLowerCase();
  if (targetExam.includes('準2')) return LearningTrack.EIKEN_PRE2;
  if (targetExam.includes('英検2') || targetExam.includes('2級')) return LearningTrack.EIKEN_2;
  if (grade === UserGrade.SHS2 || grade === UserGrade.SHS3) return LearningTrack.COMMON_TEST;
  if (level === EnglishLevel.B2 || level === EnglishLevel.C1 || level === EnglishLevel.C2) return LearningTrack.COMMON_TEST;
  return LearningTrack.SCHOOL_TERM;
};

export const getDefaultMissionTargets = ({
  track,
  learningPlan,
}: {
  track: LearningTrack;
  learningPlan?: LearningPlan | null;
}): { newWordsTarget: number; reviewWordsTarget: number; quizTargetCount: number } => {
  const defaults = DEFAULT_TARGETS[track];
  const baseGoal = learningPlan?.dailyWordGoal || defaults.newWords;
  const newWordsTarget = clamp(Math.round(baseGoal * (track === LearningTrack.SCHOOL_TERM ? 1.6 : 2.0)), 12, 42);
  const reviewWordsTarget = clamp(Math.round(newWordsTarget * 0.6), 8, 28);
  return {
    newWordsTarget,
    reviewWordsTarget,
    quizTargetCount: defaults.quizCount,
  };
};

export const getDefaultMissionDueAt = (now = Date.now()): number => {
  const dueDateKey = shiftDateKey(formatDateKey(now), 6);
  return Date.parse(`${dueDateKey}T23:59:59+09:00`);
};

const scoreMissionBook = ({
  book,
  preferredBookIds,
  targetIndex,
}: {
  book: Pick<BookMetadata, 'id' | 'title' | 'description' | 'sourceContext' | 'wordCount' | 'isPriority'>;
  preferredBookIds: string[];
  targetIndex: number;
}): number => {
  const progressionIndex = getBookProgressionIndex(book);
  const progressionScore = progressionIndex === null
    ? 0
    : Math.max(0, 48 - Math.abs(progressionIndex - targetIndex) * 12);
  const preferredScore = preferredBookIds.includes(book.id) ? 80 : 0;
  const priorityScore = book.isPriority ? 28 : 0;
  const wordCountScore = Math.min(Math.max(book.wordCount || 0, 120) / 20, 18);

  return preferredScore + progressionScore + priorityScore + wordCountScore;
};

export const selectMissionBook = ({
  books,
  track,
  grade,
  level,
  learningPlan,
}: {
  books: BookMetadata[];
  track: LearningTrack;
  grade?: UserGrade;
  level?: EnglishLevel;
  learningPlan?: LearningPlan | null;
}): BookMetadata | null => {
  if (books.length === 0) return null;
  const preferredBookIds = learningPlan?.selectedBookIds || [];
  const targetIndex = clamp(
    getTargetBookProgressionIndex({ grade, level }) + TRACK_PROGRESSION_OFFSET[track],
    1,
    6,
  );

  return [...books]
    .sort((left, right) => (
      scoreMissionBook({ book: right, preferredBookIds, targetIndex })
        - scoreMissionBook({ book: left, preferredBookIds, targetIndex })
      || (right.wordCount || 0) - (left.wordCount || 0)
      || left.title.localeCompare(right.title, 'ja')
    ))[0] || null;
};

export const buildSuggestedMissionDraft = ({
  grade,
  level,
  learningPlan,
  learningPreference,
  books,
  writingAssignmentId,
  writingPromptTitle,
  now = Date.now(),
}: {
  grade?: UserGrade;
  level?: EnglishLevel;
  learningPlan?: LearningPlan | null;
  learningPreference?: LearningPreference | null;
  books: BookMetadata[];
  writingAssignmentId?: string;
  writingPromptTitle?: string;
  now?: number;
}): Omit<WeeklyMission, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt' | 'organizationId'> => {
  const track = inferLearningTrack({ grade, level, learningPreference });
  const selectedBook = selectMissionBook({ books, track, grade, level, learningPlan });
  const targets = getDefaultMissionTargets({ track, learningPlan });
  const dueAt = getDefaultMissionDueAt(now);

  return {
    learningTrack: track,
    title: `${track === LearningTrack.SCHOOL_TERM ? '学校進度' : '受験対策'}の今週ミッション`,
    rationale: selectedBook
      ? `${selectedBook.title} を中心に、今週は新出と復習を1つの流れで進めます。`
      : '今週は診断レベルに合った単語と復習を1つの流れで進めます。',
    bookId: selectedBook?.id,
    bookTitle: selectedBook?.title,
    newWordsTarget: targets.newWordsTarget,
    reviewWordsTarget: targets.reviewWordsTarget,
    quizTargetCount: targets.quizTargetCount,
    writingAssignmentId,
    writingPromptTitle,
    dueAt,
    status: WeeklyMissionStatusEnum.ASSIGNED,
    isSuggested: true,
  };
};

export const buildMissionTrackCompletion = (
  assignments: MissionAssignment[],
): MissionTrackCompletionSummary[] => (Object.values(LearningTrack) as LearningTrack[]).map((track) => {
  const trackAssignments = assignments.filter((assignment) => assignment.mission.learningTrack === track);
  const completed = trackAssignments.filter((assignment) => assignment.progress.status === WeeklyMissionStatusEnum.COMPLETED).length;
  const completionRate = trackAssignments.length > 0
    ? Math.round(trackAssignments.reduce((sum, assignment) => sum + assignment.progress.completionRate, 0) / trackAssignments.length)
    : 0;

  return {
    track,
    assignedCount: trackAssignments.length,
    completedCount: completed,
    overdueCount: trackAssignments.filter((assignment) => assignment.progress.status === WeeklyMissionStatusEnum.OVERDUE).length,
    completionRate,
  };
});

export const buildMissionWritingReturnRateByTrack = (
  assignments: MissionAssignment[],
): MissionTrackWritingReturnSummary[] => (Object.values(LearningTrack) as LearningTrack[]).map((track) => {
  const trackAssignments = assignments.filter((assignment) => assignment.mission.learningTrack === track);
  const assignedCount = trackAssignments.filter((assignment) => assignment.progress.writingRequired).length;
  const returnedCount = trackAssignments.filter((assignment) => assignment.progress.writingRequired && assignment.progress.writingCompleted).length;

  return {
    track,
    assignedCount,
    returnedCount,
    returnRate: assignedCount > 0
      ? Math.round((returnedCount / assignedCount) * 100)
      : 0,
  };
});

const hasStartedMission = (assignment: MissionAssignment): boolean => (
  Boolean(
    assignment.progress.startedAt
    || assignment.progress.restartedAt
    || assignment.progress.lastActivityAt
    || assignment.progress.completedAt
    || assignment.progress.completionRate > 0
    || (assignment.progress.writingRequired && assignment.progress.writingCompleted)
  )
);

export const calculateMissionStartedRate = (assignments: MissionAssignment[]): number => {
  if (assignments.length === 0) return 0;
  const startedAssignments = assignments.filter(hasStartedMission).length;
  return Math.round((startedAssignments / assignments.length) * 100);
};

export const calculateMissionOverdueRecoveryRate = (
  assignments: MissionAssignment[],
  now = Date.now(),
): number => {
  const overdueAssignments = assignments.filter((assignment) => assignment.mission.dueAt < now);
  if (overdueAssignments.length === 0) return 0;
  const recoveredAssignments = overdueAssignments.filter((assignment) => (
    Number(assignment.progress.completedAt || 0) > assignment.mission.dueAt
    || Number(assignment.progress.lastActivityAt || 0) > assignment.mission.dueAt
    || Number(assignment.progress.restartedAt || 0) > assignment.mission.dueAt
  )).length;
  return Math.round((recoveredAssignments / overdueAssignments.length) * 100);
};

export const buildMissionProgress = ({
  assignedAt,
  startedAt,
  restartedAt,
  lastActivityAt,
  completedAt,
  dueAt,
  newWordsCompleted,
  newWordsTarget,
  reviewWordsCompleted,
  reviewWordsTarget,
  quizCompletedCount,
  quizTargetCount,
  writingRequired,
  writingCompleted,
  now = Date.now(),
}: {
  assignedAt?: number;
  startedAt?: number;
  restartedAt?: number;
  lastActivityAt?: number;
  completedAt?: number;
  dueAt: number;
  newWordsCompleted: number;
  newWordsTarget: number;
  reviewWordsCompleted: number;
  reviewWordsTarget: number;
  quizCompletedCount: number;
  quizTargetCount: number;
  writingRequired: boolean;
  writingCompleted: boolean;
  now?: number;
}): MissionProgressSummary => {
  const safeNewTarget = Math.max(newWordsTarget, 0);
  const safeReviewTarget = Math.max(reviewWordsTarget, 0);
  const safeQuizTarget = Math.max(quizTargetCount, 0);
  const completedUnits = Math.min(newWordsCompleted, safeNewTarget)
    + Math.min(reviewWordsCompleted, safeReviewTarget)
    + Math.min(quizCompletedCount, safeQuizTarget)
    + (writingRequired && writingCompleted ? 1 : 0);
  const targetUnits = safeNewTarget + safeReviewTarget + safeQuizTarget + (writingRequired ? 1 : 0);
  const completionRate = targetUnits > 0 ? Math.min(100, Math.round((completedUnits / targetUnits) * 100)) : 0;
  const overdue = completionRate < 100 && now > dueAt;
  const hasStarted = Boolean(startedAt || restartedAt || lastActivityAt || completedUnits > 0 || (writingRequired && writingCompleted));
  const status: WeeklyMissionStatus = completedAt || completionRate >= 100
    ? WeeklyMissionStatusEnum.COMPLETED
    : overdue
      ? WeeklyMissionStatusEnum.OVERDUE
      : hasStarted ? WeeklyMissionStatusEnum.IN_PROGRESS : WeeklyMissionStatusEnum.ASSIGNED;

  const blockers: string[] = [];
  if (newWordsCompleted < safeNewTarget) blockers.push(`新出 ${Math.max(safeNewTarget - newWordsCompleted, 0)}語`);
  if (reviewWordsCompleted < safeReviewTarget) blockers.push(`復習 ${Math.max(safeReviewTarget - reviewWordsCompleted, 0)}語`);
  if (quizCompletedCount < safeQuizTarget) blockers.push('確認クイズ');
  if (writingRequired && !writingCompleted) blockers.push('英作文');
  const shouldStartWithNewWords = (
    newWordsCompleted === 0
    && reviewWordsCompleted === 0
    && safeNewTarget > 0
  );

  let nextActionType = MissionNextActionType.OPEN_STUDY;
  let nextActionLabel = 'ミッションを再開';
  if (status === WeeklyMissionStatusEnum.COMPLETED) {
    nextActionLabel = '今週のミッション達成';
  } else if (writingRequired && !writingCompleted) {
    nextActionType = MissionNextActionType.OPEN_WRITING;
    nextActionLabel = '英作文課題を提出する';
  } else if (shouldStartWithNewWords) {
    nextActionLabel = `新出を${Math.max(safeNewTarget - newWordsCompleted, 1)}語進める`;
  } else if (reviewWordsCompleted < safeReviewTarget) {
    nextActionLabel = `復習を${Math.max(safeReviewTarget - reviewWordsCompleted, 1)}語進める`;
  } else if (newWordsCompleted < safeNewTarget) {
    nextActionLabel = `新出を${Math.max(safeNewTarget - newWordsCompleted, 1)}語進める`;
  } else if (quizCompletedCount < safeQuizTarget) {
    nextActionType = MissionNextActionType.OPEN_QUIZ;
    nextActionLabel = '確認クイズを始める';
  } else if (blockers.length === 0) {
    nextActionType = MissionNextActionType.OPEN_PLAN;
    nextActionLabel = '今日のプランに戻る';
  }

  return {
    startedAt,
    restartedAt,
    lastActivityAt,
    completedAt,
    newWordsCompleted,
    newWordsTarget: safeNewTarget,
    reviewWordsCompleted,
    reviewWordsTarget: safeReviewTarget,
    quizCompletedCount,
    quizTargetCount: safeQuizTarget,
    writingCompleted,
    writingRequired,
    completionRate,
    overdue,
    status,
    nextActionType,
    nextActionLabel,
    blockers,
  };
};

export const toPrimaryMissionSnapshot = ({
  assignmentId,
  missionId,
  track,
  title,
  rationale,
  dueAt,
  sourceBookId,
  sourceBookTitle,
  writingAssignmentId,
  writingPromptTitle,
  isSuggested,
  progress,
}: {
  assignmentId?: string;
  missionId?: string;
  track: LearningTrack;
  title: string;
  rationale: string;
  dueAt: number;
  sourceBookId?: string;
  sourceBookTitle?: string;
  writingAssignmentId?: string;
  writingPromptTitle?: string;
  isSuggested: boolean;
  progress: MissionProgressSummary;
}): PrimaryMissionSnapshot => ({
  assignmentId,
  missionId,
  track,
  title,
  rationale,
  dueAt,
  dueDate: formatDateKey(dueAt),
  sourceBookId,
  sourceBookTitle,
  writingAssignmentId,
  writingPromptTitle,
  isSuggested,
  ...progress,
  nextTaskIntent: createMissionTaskIntent({
    assignmentId,
    missionId,
    track,
    title,
    rationale,
    dueAt,
    dueDate: formatDateKey(dueAt),
    sourceBookId,
    sourceBookTitle,
    writingAssignmentId,
    writingPromptTitle,
    isSuggested,
    ...progress,
  }),
});
