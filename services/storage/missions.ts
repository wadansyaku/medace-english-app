import {
  LearningTrack,
  MissionProgressEventType,
  type MissionAssignment,
  type PrimaryMissionSnapshot,
  type UserProfile,
  UserRole,
  WeeklyMissionStatus,
  type WeeklyMission,
  type WeeklyMissionBoard,
  type BookMetadata,
  type LearningPlan,
  type LearningPreference,
} from '../../types';
import {
  buildMissionProgress,
  buildSuggestedMissionDraft,
  toPrimaryMissionSnapshot,
} from '../../shared/missions';
import { IDB_MOCK_ORGANIZATION_IDS } from './mockData';

const now = Date.now();

const seededMission = (
  mission: WeeklyMission,
  studentUid: string,
  studentName: string,
  progressOverrides: Partial<MissionAssignment['progress']> = {},
): MissionAssignment => {
  const progress = {
    ...buildMissionProgress({
      assignedAt: now - 3 * 86400000,
      startedAt: progressOverrides.startedAt,
      restartedAt: progressOverrides.restartedAt,
      lastActivityAt: progressOverrides.lastActivityAt,
      completedAt: progressOverrides.completedAt,
      dueAt: mission.dueAt,
      newWordsCompleted: progressOverrides.newWordsCompleted || 0,
      newWordsTarget: mission.newWordsTarget,
      reviewWordsCompleted: progressOverrides.reviewWordsCompleted || 0,
      reviewWordsTarget: mission.reviewWordsTarget,
      quizCompletedCount: progressOverrides.quizCompletedCount || 0,
      quizTargetCount: mission.quizTargetCount,
      writingRequired: Boolean(mission.writingAssignmentId),
      writingCompleted: Boolean(progressOverrides.writingCompleted),
      now,
    }),
    ...progressOverrides,
  };

  return {
    id: `mission-assignment-${studentUid}-${mission.id}`,
    missionId: mission.id,
    studentUid,
    studentName,
    assignedByUid: 'mock-group-admin-001',
    assignedByName: '朝比奈 由奈',
    assignedAt: now - 3 * 86400000,
    progress,
    mission: {
      ...mission,
      status: progress.status,
    },
  };
};

const createSeedWeeklyMissions = (): WeeklyMission[] => [
  {
    id: 'mission-local-overdue',
    organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    createdByUid: 'mock-group-admin-001',
    learningTrack: LearningTrack.EIKEN_2,
    title: '英検2級 今週ミッション',
    rationale: '模試前に新出と復習をまとめて進めます。',
    bookId: 'book-local-eiken2',
    bookTitle: '英検2級 重点単語',
    newWordsTarget: 24,
    reviewWordsTarget: 16,
    quizTargetCount: 1,
    dueAt: now - 12 * 3600_000,
    status: WeeklyMissionStatus.OVERDUE,
    createdAt: now - 4 * 86400000,
    updatedAt: now - 12 * 3600_000,
  },
  {
    id: 'mission-local-assigned',
    organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    createdByUid: 'mock-group-admin-001',
    learningTrack: LearningTrack.SCHOOL_TERM,
    title: '学校進度 今週ミッション',
    rationale: '教科書進度に合わせて未着手をなくします。',
    bookId: 'book-local-school',
    bookTitle: '学校進度ベーシック',
    newWordsTarget: 18,
    reviewWordsTarget: 12,
    quizTargetCount: 1,
    dueAt: now + 3 * 86400000,
    status: WeeklyMissionStatus.ASSIGNED,
    createdAt: now - 86400000,
    updatedAt: now - 86400000,
  },
  {
    id: 'mission-local-completed',
    organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    createdByUid: 'mock-group-admin-001',
    learningTrack: LearningTrack.COMMON_TEST,
    title: '共通テスト 今週ミッション',
    rationale: '安定層は次の共通テスト帯へ進めます。',
    bookId: 'book-local-common',
    bookTitle: '共通テスト頻出',
    newWordsTarget: 20,
    reviewWordsTarget: 12,
    quizTargetCount: 1,
    dueAt: now + 2 * 86400000,
    status: WeeklyMissionStatus.COMPLETED,
    createdAt: now - 5 * 86400000,
    updatedAt: now - 3600_000,
  },
];

const createSeedMissionAssignments = (missions: WeeklyMission[]): MissionAssignment[] => [
  seededMission(missions[0], 'student-biz-2', '田中 陽葵', {
    status: WeeklyMissionStatus.OVERDUE,
    newWordsCompleted: 8,
    reviewWordsCompleted: 3,
    quizCompletedCount: 0,
    startedAt: now - 2 * 86400000,
    lastActivityAt: now - 30 * 3600_000,
    overdue: true,
    completionRate: 31,
    nextActionLabel: 'ミッションを再開',
  }),
  seededMission(missions[1], 'student-biz-1', '黒田 颯太', {
    status: WeeklyMissionStatus.ASSIGNED,
    completionRate: 0,
    overdue: false,
    blockers: ['新出 18語', '復習 12語', '確認クイズ'],
    nextActionLabel: 'ミッションを再開',
  }),
  seededMission(missions[2], 'student-biz-3', '森 結月', {
    status: WeeklyMissionStatus.COMPLETED,
    newWordsCompleted: 20,
    reviewWordsCompleted: 12,
    quizCompletedCount: 1,
    startedAt: now - 4 * 86400000,
    lastActivityAt: now - 2 * 3600_000,
    completedAt: now - 2 * 3600_000,
    overdue: false,
    completionRate: 100,
    nextActionLabel: '今週のミッション達成',
  }),
];

let LOCAL_WEEKLY_MISSIONS: WeeklyMission[] = createSeedWeeklyMissions();
let LOCAL_MISSION_ASSIGNMENTS: MissionAssignment[] = createSeedMissionAssignments(LOCAL_WEEKLY_MISSIONS);

const isDemoBusinessMember = (user: UserProfile | null): boolean => (
  Boolean(user?.organizationId === IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY)
);

const findMission = (missionId: string): WeeklyMission => {
  const mission = LOCAL_WEEKLY_MISSIONS.find((candidate) => candidate.id === missionId);
  if (!mission) {
    throw new Error('ミッションが見つかりません。');
  }
  return mission;
};

const getAssignmentIndex = (assignmentId: string): number => {
  const index = LOCAL_MISSION_ASSIGNMENTS.findIndex((candidate) => candidate.id === assignmentId);
  if (index < 0) {
    throw new Error('ミッション割当が見つかりません。');
  }
  return index;
};

export const listLocalMissionAssignments = (user: UserProfile | null): MissionAssignment[] => {
  if (!user) return [];
  if (user.role === UserRole.ADMIN) return [...LOCAL_MISSION_ASSIGNMENTS];
  if (user.role === UserRole.STUDENT) {
    return LOCAL_MISSION_ASSIGNMENTS.filter((assignment) => assignment.studentUid === user.uid);
  }
  if (isDemoBusinessMember(user)) {
    return LOCAL_MISSION_ASSIGNMENTS.filter((assignment) => (
      assignment.mission.organizationId === user.organizationId
    ));
  }
  return [];
};

export const getLocalMissionAssignmentByStudent = (studentUid: string): MissionAssignment | null => (
  LOCAL_MISSION_ASSIGNMENTS.find((assignment) => (
    assignment.studentUid === studentUid
    && assignment.progress.status !== WeeklyMissionStatus.ARCHIVED
  )) || null
);

export const getLocalPrimaryMissionSnapshot = ({
  user,
  books,
  learningPlan,
  learningPreference,
  nowValue = Date.now(),
}: {
  user: UserProfile;
  books: BookMetadata[];
  learningPlan?: LearningPlan | null;
  learningPreference?: LearningPreference | null;
  nowValue?: number;
}): PrimaryMissionSnapshot | null => {
  const assignment = getLocalMissionAssignmentByStudent(user.uid);
  if (assignment) {
    return toPrimaryMissionSnapshot({
      assignmentId: assignment.id,
      track: assignment.mission.learningTrack,
      title: assignment.mission.title,
      rationale: assignment.mission.rationale,
      dueAt: assignment.mission.dueAt,
      sourceBookId: assignment.mission.bookId,
      sourceBookTitle: assignment.mission.bookTitle,
      writingAssignmentId: assignment.mission.writingAssignmentId,
      writingPromptTitle: assignment.mission.writingPromptTitle,
      isSuggested: false,
      progress: assignment.progress,
    });
  }

  if (user.role !== UserRole.STUDENT) return null;
  const draft = buildSuggestedMissionDraft({
    grade: user.grade,
    level: user.englishLevel,
    learningPlan,
    learningPreference,
    books,
    now: nowValue,
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
    now: nowValue,
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

export const createLocalWeeklyMission = (
  user: UserProfile,
  payload: {
    learningTrack: LearningTrack;
    title?: string;
    rationale?: string;
    bookId?: string;
    bookTitle?: string;
    newWordsTarget: number;
    reviewWordsTarget: number;
    quizTargetCount: number;
    writingAssignmentId?: string;
    dueAt?: number;
  },
): WeeklyMission => {
  const createdAt = Date.now();
  const mission: WeeklyMission = {
    id: `mission-local-${createdAt.toString(36)}`,
    organizationId: user.organizationId,
    createdByUid: user.uid,
    learningTrack: payload.learningTrack,
    title: payload.title?.trim() || `${payload.learningTrack} ミッション`,
    rationale: payload.rationale?.trim() || '今週の主課題として配布します。',
    bookId: payload.bookId,
    bookTitle: payload.bookTitle,
    newWordsTarget: payload.newWordsTarget,
    reviewWordsTarget: payload.reviewWordsTarget,
    quizTargetCount: payload.quizTargetCount,
    writingAssignmentId: payload.writingAssignmentId,
    dueAt: payload.dueAt || createdAt + 7 * 86400000,
    status: WeeklyMissionStatus.ASSIGNED,
    createdAt,
    updatedAt: createdAt,
  };
  LOCAL_WEEKLY_MISSIONS.unshift(mission);
  return mission;
};

export const assignLocalWeeklyMission = (
  user: UserProfile,
  missionId: string,
  studentUid: string,
  studentName?: string,
): MissionAssignment => {
  LOCAL_MISSION_ASSIGNMENTS.forEach((assignment, index) => {
    if (assignment.studentUid !== studentUid) return;
    LOCAL_MISSION_ASSIGNMENTS[index] = {
      ...assignment,
      progress: {
        ...assignment.progress,
        status: WeeklyMissionStatus.ARCHIVED,
      },
      mission: {
        ...assignment.mission,
        status: WeeklyMissionStatus.ARCHIVED,
      },
    };
  });

  const mission = findMission(missionId);
  const assignedAt = Date.now();
  const assignment: MissionAssignment = {
    id: `mission-assignment-local-${assignedAt.toString(36)}`,
    missionId,
    studentUid,
    studentName: studentName || studentUid,
    assignedByUid: user.uid,
    assignedByName: user.displayName,
    assignedAt,
    progress: buildMissionProgress({
      assignedAt,
      dueAt: mission.dueAt,
      newWordsCompleted: 0,
      newWordsTarget: mission.newWordsTarget,
      reviewWordsCompleted: 0,
      reviewWordsTarget: mission.reviewWordsTarget,
      quizCompletedCount: 0,
      quizTargetCount: mission.quizTargetCount,
      writingRequired: Boolean(mission.writingAssignmentId),
      writingCompleted: false,
      now: assignedAt,
    }),
    mission: {
      ...mission,
      status: WeeklyMissionStatus.ASSIGNED,
      updatedAt: assignedAt,
    },
  };
  LOCAL_MISSION_ASSIGNMENTS.unshift(assignment);
  return assignment;
};

export const getLocalWeeklyMissionBoard = (user: UserProfile | null): WeeklyMissionBoard => ({
  assignments: listLocalMissionAssignments(user).filter((assignment) => assignment.progress.status !== WeeklyMissionStatus.ARCHIVED),
});

export const updateLocalMissionProgress = (
  user: UserProfile,
  assignmentId: string,
  eventType: MissionProgressEventType,
): MissionAssignment => {
  const index = getAssignmentIndex(assignmentId);
  const current = LOCAL_MISSION_ASSIGNMENTS[index];
  if (user.role === UserRole.STUDENT && current.studentUid !== user.uid) {
    throw new Error('自分のミッションのみ更新できます。');
  }

  const nowValue = Date.now();
  const progress = buildMissionProgress({
    assignedAt: current.assignedAt,
    startedAt: current.progress.startedAt || nowValue,
    restartedAt: current.progress.restartedAt || nowValue,
    lastActivityAt: nowValue,
    completedAt: eventType === MissionProgressEventType.MANUAL_COMPLETE ? nowValue : current.progress.completedAt,
    dueAt: current.mission.dueAt,
    newWordsCompleted: current.progress.newWordsCompleted,
    newWordsTarget: current.mission.newWordsTarget,
    reviewWordsCompleted: current.progress.reviewWordsCompleted,
    reviewWordsTarget: current.mission.reviewWordsTarget,
    quizCompletedCount: current.progress.quizCompletedCount,
    quizTargetCount: current.mission.quizTargetCount,
    writingRequired: current.progress.writingRequired,
    writingCompleted: current.progress.writingCompleted,
    now: nowValue,
  });

  const nextAssignment: MissionAssignment = {
    ...current,
    progress: eventType === MissionProgressEventType.MANUAL_COMPLETE
      ? {
          ...progress,
          completedAt: nowValue,
          completionRate: 100,
          status: WeeklyMissionStatus.COMPLETED,
          nextActionLabel: '今週のミッション達成',
        }
      : progress,
    mission: {
      ...current.mission,
      status: eventType === MissionProgressEventType.MANUAL_COMPLETE
        ? WeeklyMissionStatus.COMPLETED
        : progress.status,
      updatedAt: nowValue,
    },
  };

  LOCAL_MISSION_ASSIGNMENTS[index] = nextAssignment;
  return nextAssignment;
};

export const resetLocalMissionState = (): void => {
  LOCAL_WEEKLY_MISSIONS = createSeedWeeklyMissions();
  LOCAL_MISSION_ASSIGNMENTS = createSeedMissionAssignments(LOCAL_WEEKLY_MISSIONS);
};
