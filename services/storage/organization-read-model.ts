import {
  InterventionKind,
  OrganizationAuditEvent,
  OrganizationCohort,
  OrganizationDashboardSnapshot,
  OrganizationMemberSummary,
  OrganizationRole,
  OrganizationSettingsSnapshot,
  RecommendedActionType,
  StudentRiskLevel,
  StudentSummary,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserProfile,
  UserRole,
  WeeklyMissionStatus,
  WeaknessDimension,
  WeaknessSignalLevel,
  WordData,
} from '../../types';
import {
  FOLLOW_UP_WINDOW_MS,
  getContinuityBand,
  resolveInterventionOutcome,
  resolveNeedsFollowUpNow,
  resolveRecommendedActionType,
} from '../../shared/retention';
import {
  buildMissionTrackCompletion,
  buildMissionWritingReturnRateByTrack,
  calculateMissionOverdueRecoveryRate,
  calculateMissionStartedRate,
} from '../../shared/missions';
import { isDemoEmail } from '../../utils/demo';
import {
  FALLBACK_WORKSHEET_WORD_LIMIT,
  GetStore,
  readAllStoreRecords,
  STORES,
  WORKSHEET_STATUSES,
  type StoredAssignmentRecord,
  type StoredLearningHistoryRecord,
} from './idb-support';
import {
  IDB_MOCK_ORGANIZATION_IDS,
  IDB_MOCK_ASSIGNMENTS,
  IDB_MOCK_USERS,
} from './mockData';
import {
  getLocalMissionAssignmentByStudent,
  listLocalMissionAssignments,
} from './missions';
import {
  getUserLearningHistories,
  toWorksheetMasteryStatus,
} from './learning-history';

export interface OrganizationReadModelContext {
  getStore: GetStore;
  getSession: () => Promise<UserProfile | null>;
  getBooks: () => Promise<Array<{ id: string; title: string; }>>;
  getWordsByBook: (bookId: string) => Promise<WordData[]>;
}

interface LocalOrganizationRecord {
  organizationId: string;
  displayName: string;
  nameKey: string;
  subscriptionPlan: SubscriptionPlan;
  updatedAt: number;
}

interface LocalOrganizationCohortRecord {
  id: string;
  organizationId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

const toNameKey = (value: string): string => value.trim().toLocaleLowerCase('en-US');

const LOCAL_ORGANIZATIONS = new Map<string, LocalOrganizationRecord>([
  [
    IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    {
      organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
      displayName: 'Steady Study Demo Academy',
      nameKey: toNameKey('Steady Study Demo Academy'),
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      updatedAt: Date.now() - 2 * 3600_000,
    },
  ],
  [
    IDB_MOCK_ORGANIZATION_IDS.HQ,
    {
      organizationId: IDB_MOCK_ORGANIZATION_IDS.HQ,
      displayName: 'Steady Study HQ',
      nameKey: toNameKey('Steady Study HQ'),
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      updatedAt: Date.now() - 6 * 3600_000,
    },
  ],
]);

const LOCAL_ORGANIZATION_AUDIT_LOGS = new Map<string, OrganizationAuditEvent[]>([
  [
    IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    [
      {
        id: 1,
        organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
        actorUserId: 'mock-group-admin-001',
        actorDisplayName: '朝比奈 由奈',
        actionType: 'COMMERCIAL_PROVISIONED',
        targetType: 'USER',
        targetId: 'mock-student-biz-001',
        payload: { source: 'local-demo' },
        createdAt: Date.now() - 48 * 3600_000,
      },
      {
        id: 2,
        organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
        actorUserId: 'mock-group-admin-001',
        actorDisplayName: '朝比奈 由奈',
        actionType: 'STUDENT_ASSIGNMENT_CHANGED',
        targetType: 'STUDENT',
        targetId: 'student-biz-2',
        payload: { nextInstructorUid: 'mock-instructor-001' },
        createdAt: Date.now() - 6 * 3600_000,
      },
    ],
  ],
]);

const LOCAL_ORGANIZATION_STUDENT_UIDS = new Map<string, string[]>([
  [
    IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    ['student-biz-1', 'student-biz-2', 'student-biz-3'],
  ],
]);

const LOCAL_ORGANIZATION_COHORTS = new Map<string, LocalOrganizationCohortRecord[]>([
  [
    IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    [
      {
        id: 'cohort_demo_foundations',
        organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
        name: '基礎クラス',
        createdAt: Date.now() - 7 * 86400000,
        updatedAt: Date.now() - 7 * 86400000,
      },
      {
        id: 'cohort_demo_advanced',
        organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
        name: '演習クラス',
        createdAt: Date.now() - 6 * 86400000,
        updatedAt: Date.now() - 6 * 86400000,
      },
    ],
  ],
]);

const LOCAL_STUDENT_COHORT_ASSIGNMENTS = new Map<string, string>([
  ['student-biz-1', 'cohort_demo_foundations'],
  ['student-biz-2', 'cohort_demo_foundations'],
  ['student-biz-3', 'cohort_demo_advanced'],
]);

const LOCAL_INSTRUCTOR_COHORT_ASSIGNMENTS = new Map<string, string[]>([
  ['mock-instructor-001', ['cohort_demo_foundations']],
]);

const readLocalOrganizationRecord = (organizationId?: string): LocalOrganizationRecord | null => {
  if (!organizationId) return null;
  return LOCAL_ORGANIZATIONS.get(organizationId) || null;
};

const touchLocalOrganization = (organizationId: string, updatedAt = Date.now()): void => {
  const organization = LOCAL_ORGANIZATIONS.get(organizationId);
  if (organization) {
    organization.updatedAt = updatedAt;
  }
};

const appendLocalOrganizationAuditEvent = (
  organizationId: string,
  event: Omit<OrganizationAuditEvent, 'id' | 'organizationId' | 'createdAt'> & {
    createdAt?: number;
  },
): void => {
  const createdAt = event.createdAt || Date.now();
  const existingEvents = LOCAL_ORGANIZATION_AUDIT_LOGS.get(organizationId) || [];
  const nextId = Math.max(0, ...existingEvents.map((candidate) => candidate.id)) + 1;
  const nextEvent: OrganizationAuditEvent = {
    id: nextId,
    organizationId,
    actorUserId: event.actorUserId,
    actorDisplayName: event.actorDisplayName,
    actionType: event.actionType,
    targetType: event.targetType,
    targetId: event.targetId,
    payload: event.payload,
    createdAt,
  };
  LOCAL_ORGANIZATION_AUDIT_LOGS.set(organizationId, [nextEvent, ...existingEvents]);
  touchLocalOrganization(organizationId, createdAt);
};

const listLocalOrganizationStudentUids = (organizationId: string): string[] => (
  [...(LOCAL_ORGANIZATION_STUDENT_UIDS.get(organizationId) || [])]
);

const listLocalOrganizationCohortRecords = (organizationId: string): LocalOrganizationCohortRecord[] => (
  [...(LOCAL_ORGANIZATION_COHORTS.get(organizationId) || [])]
    .sort((left, right) => left.name.localeCompare(right.name, 'ja-JP'))
);

const getLocalOrganizationCohorts = (organizationId: string): OrganizationCohort[] => {
  const studentUids = listLocalOrganizationStudentUids(organizationId);
  const instructors = listLocalOrganizationMembers(organizationId)
    .filter((member) => member.organizationRole === OrganizationRole.INSTRUCTOR)
    .map((member) => member.userUid);

  return listLocalOrganizationCohortRecords(organizationId).map((cohort) => ({
    id: cohort.id,
    organizationId: cohort.organizationId,
    name: cohort.name,
    studentCount: studentUids.filter((studentUid) => LOCAL_STUDENT_COHORT_ASSIGNMENTS.get(studentUid) === cohort.id).length,
    instructorCount: instructors.filter((instructorUid) => (
      (LOCAL_INSTRUCTOR_COHORT_ASSIGNMENTS.get(instructorUid) || []).includes(cohort.id)
    )).length,
    updatedAt: cohort.updatedAt,
  }));
};

const getLocalInstructorCohortMap = (organizationId: string): Record<string, string[]> => {
  const instructorUids = listLocalOrganizationMembers(organizationId)
    .filter((member) => member.organizationRole === OrganizationRole.INSTRUCTOR)
    .map((member) => member.userUid);
  const result: Record<string, string[]> = {};
  instructorUids.forEach((instructorUid) => {
    const cohortIds = LOCAL_INSTRUCTOR_COHORT_ASSIGNMENTS.get(instructorUid) || [];
    if (cohortIds.length > 0) {
      result[instructorUid] = [...cohortIds].sort();
    }
  });
  return result;
};

const getLocalStudentCohortSummary = (
  studentUid: string,
): { cohortId: string; cohortName: string; organizationId: string } | null => {
  const cohortId = LOCAL_STUDENT_COHORT_ASSIGNMENTS.get(studentUid);
  if (!cohortId) return null;

  for (const [organizationId, cohorts] of LOCAL_ORGANIZATION_COHORTS.entries()) {
    const cohort = cohorts.find((candidate) => candidate.id === cohortId);
    if (cohort) {
      return {
        cohortId,
        cohortName: cohort.name,
        organizationId,
      };
    }
  }

  return null;
};

const resolveLocalOrganizationForUser = (user: UserProfile | null): LocalOrganizationRecord | null => {
  if (!user) return null;
  const byId = readLocalOrganizationRecord(user.organizationId);
  if (byId) return byId;
  if (!user.organizationName) return null;
  for (const organization of LOCAL_ORGANIZATIONS.values()) {
    if (organization.displayName === user.organizationName) return organization;
  }
  return null;
};

const listLocalOrganizationMembers = (organizationId: string): OrganizationMemberSummary[] => (
  IDB_MOCK_USERS
    .filter((user) => user.organizationId === organizationId && user.organizationRole)
    .map((user) => ({
      userUid: user.uid,
      displayName: user.displayName,
      email: user.email,
      userRole: user.role,
      organizationRole: user.organizationRole as OrganizationRole,
      subscriptionPlan: user.subscriptionPlan || SubscriptionPlan.TOC_FREE,
      joinedAt: Date.now() - 14 * 86400000,
      updatedAt: Date.now() - 3600_000,
    }))
    .sort((left, right) => {
      if (left.organizationRole !== right.organizationRole) {
        return left.organizationRole.localeCompare(right.organizationRole);
      }
      return left.displayName.localeCompare(right.displayName, 'ja-JP');
    })
);

const listLocalOrganizationAuditEvents = (organizationId: string): OrganizationAuditEvent[] => (
  [...(LOCAL_ORGANIZATION_AUDIT_LOGS.get(organizationId) || [])]
    .sort((left, right) => right.createdAt - left.createdAt)
);

const buildMockWeakness = (
  dimension: WeaknessDimension,
  overrides: Partial<NonNullable<StudentSummary['topWeaknesses']>[number]> = {},
): NonNullable<StudentSummary['topWeaknesses']>[number] => ({
  dimension,
  level: WeaknessSignalLevel.HIGH,
  score: 58,
  sampleSize: 12,
  reason: dimension === WeaknessDimension.RETENTION_STABILITY
    ? '復習間隔が空いた単語で忘れやすさが出ています。'
    : dimension === WeaknessDimension.SPELLING_RECALL
      ? 'スペリング問題で綴りの取りこぼしが続いています。'
      : '意味から英語を思い出す問題で取りこぼしが出ています。',
  nextActionLabel: dimension === WeaknessDimension.ADVANCED_BAND_CONFIDENCE ? '今日のプランに戻る' : '復習を10語始める',
  recommendedActionType: dimension === WeaknessDimension.ADVANCED_BAND_CONFIDENCE ? RecommendedActionType.OPEN_PLAN : RecommendedActionType.START_REVIEW,
  targetQuestionModes: dimension === WeaknessDimension.SPELLING_RECALL ? ['SPELLING_HINT'] : ['JA_TO_EN'],
  updatedAt: Date.now() - 3 * 3600_000,
  ...overrides,
});

const getLocalSettingsSnapshot = (organization: LocalOrganizationRecord): OrganizationSettingsSnapshot => ({
  organizationId: organization.organizationId,
  displayName: organization.displayName,
  nameKey: organization.nameKey,
  subscriptionPlan: organization.subscriptionPlan,
  members: listLocalOrganizationMembers(organization.organizationId),
  cohorts: getLocalOrganizationCohorts(organization.organizationId),
  instructorCohorts: getLocalInstructorCohortMap(organization.organizationId),
  auditEvents: listLocalOrganizationAuditEvents(organization.organizationId),
  updatedAt: organization.updatedAt,
});

const buildFallbackWorksheetWords = async (
  context: Pick<OrganizationReadModelContext, 'getBooks' | 'getWordsByBook'>,
): Promise<StudentWorksheetSnapshot['words']> => {
  const books = await context.getBooks();
  const words: StudentWorksheetSnapshot['words'] = [];

  if (books.length > 0) {
    const candidateBooks = books.slice(0, Math.min(5, books.length));
    const perBookLimit = Math.max(4, Math.ceil(FALLBACK_WORKSHEET_WORD_LIMIT / Math.max(candidateBooks.length, 1)));

    for (const [bookIndex, book] of candidateBooks.entries()) {
      const bookWords = await context.getWordsByBook(book.id);
      bookWords.slice(0, perBookLimit).forEach((word, wordIndex) => {
        if (words.length >= FALLBACK_WORKSHEET_WORD_LIMIT) return;
        words.push({
          wordId: word.id,
          bookId: book.id,
          bookTitle: book.title,
          word: word.word,
          definition: word.definition,
          status: WORKSHEET_STATUSES[wordIndex % WORKSHEET_STATUSES.length],
          lastStudiedAt: Date.now() - (bookIndex + wordIndex + 1) * 86400000,
          attemptCount: 3 + wordIndex,
          correctCount: 2 + wordIndex,
        });
      });
      if (words.length >= FALLBACK_WORKSHEET_WORD_LIMIT) break;
    }
  }

  if (words.length > 0) return words;

  return [
    {
      wordId: 'worksheet-1',
      bookId: 'mock-book-1',
      bookTitle: 'ビジネス英単語 小テスト',
      word: 'diagnosis',
      definition: '診断',
      status: 'graduated',
      lastStudiedAt: Date.now() - 86400000,
      attemptCount: 6,
      correctCount: 5,
    },
    {
      wordId: 'worksheet-2',
      bookId: 'mock-book-1',
      bookTitle: 'ビジネス英単語 小テスト',
      word: 'treatment',
      definition: '治療',
      status: 'review',
      lastStudiedAt: Date.now() - 2 * 86400000,
      attemptCount: 4,
      correctCount: 3,
    },
    {
      wordId: 'worksheet-3',
      bookId: 'mock-book-2',
      bookTitle: '医療英語ベーシック',
      word: 'symptom',
      definition: '症状',
      status: 'learning',
      lastStudiedAt: Date.now() - 3 * 86400000,
      attemptCount: 2,
      correctCount: 1,
    },
  ];
};

export const buildWorksheetWordsFromHistoryRecords = ({
  records,
  studentUid,
  booksById,
  wordsById,
}: {
  records: StoredLearningHistoryRecord[];
  studentUid: string;
  booksById: Map<string, { id: string; title: string; }>;
  wordsById: Map<string, WordData>;
}): StudentWorksheetSnapshot['words'] => {
  const words = getUserLearningHistories(records, studentUid)
    .reduce<StudentWorksheetSnapshot['words']>((result, history) => {
      const status = toWorksheetMasteryStatus(history);
      const word = wordsById.get(history.wordId);
      const book = booksById.get(history.bookId);
      if (!status || !word || !book) return result;
      result.push({
        wordId: word.id,
        bookId: word.bookId,
        bookTitle: book.title,
        word: word.word,
        definition: word.definition,
        status,
        lastStudiedAt: history.lastStudiedAt,
        attemptCount: history.attemptCount,
        correctCount: history.correctCount,
      });
      return result;
    }, []);

  return words.sort((left, right) => {
    const leftPriority = left.status === 'graduated' ? 0 : left.status === 'review' ? 1 : 2;
    const rightPriority = right.status === 'graduated' ? 0 : right.status === 'review' ? 1 : 2;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    if (left.lastStudiedAt !== right.lastStudiedAt) return right.lastStudiedAt - left.lastStudiedAt;
    if (left.bookTitle !== right.bookTitle) return left.bookTitle.localeCompare(right.bookTitle);
    const leftWord = wordsById.get(left.wordId);
    const rightWord = wordsById.get(right.wordId);
    return (leftWord?.number || 0) - (rightWord?.number || 0);
  });
};

export const getAllStudentsProgress = async (
  context: Pick<OrganizationReadModelContext, 'getStore' | 'getSession'>,
): Promise<StudentSummary[]> => {
  const now = Date.now();
  const sessionUser = await context.getSession();
  const sessionOrganization = resolveLocalOrganizationForUser(sessionUser);
  const businessOrganizationName = sessionOrganization?.displayName || 'Steady Study Demo Academy';
  const assignmentStore = await context.getStore(STORES.ASSIGNMENTS);
  const assignments = await readAllStoreRecords<StoredAssignmentRecord>(assignmentStore);
  const mergedAssignments = new Map<string, string | null>(
    [...IDB_MOCK_ASSIGNMENTS, ...assignments].map((entry) => [entry.studentUid, entry.instructorUid]),
  );

  const allStudents: StudentSummary[] = [
    {
      uid: 'student-free-1',
      name: '鈴木 健太',
      email: 'kenta@medace.com',
      totalLearned: 150,
      totalAttempts: 300,
      lastActive: now,
      riskLevel: StudentRiskLevel.SAFE,
      accuracy: 0.85,
      subscriptionPlan: SubscriptionPlan.TOC_FREE,
      hasLearningPlan: true,
      activeStudyDays7d: 5,
      topWeaknesses: [buildMockWeakness(WeaknessDimension.MEANING_RECOGNITION, {
        level: WeaknessSignalLevel.LOW,
        score: 18,
        sampleSize: 14,
        reason: '英語を見て意味を取る力は安定しています。',
      })],
      weaknessProfileUpdatedAt: now - 2 * 3600_000,
      riskReasons: ['直近7日で安定して学習'],
      recommendedAction: '称賛して現状維持',
    },
    {
      uid: 'student-biz-1',
      name: '黒田 颯太',
      email: 'sota@demo-school.jp',
      totalLearned: 96,
      totalAttempts: 130,
      lastActive: now - 86400000,
      riskLevel: StudentRiskLevel.WARNING,
      accuracy: 0.76,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationName: businessOrganizationName,
      lastNotificationAt: now - 36 * 60 * 60 * 1000,
      lastNotificationMessage: 'Oak先生より: 昨日の復習を10語だけ戻しましょう。',
      latestInterventionKind: InterventionKind.REVIEW_RESTART,
      hasLearningPlan: true,
      hasReactivatedSinceNotification: true,
      lastReactivatedAt: now - 12 * 60 * 60 * 1000,
      activeStudyDays7d: 4,
      topWeaknesses: [buildMockWeakness(WeaknessDimension.RETENTION_STABILITY)],
      weaknessProfileUpdatedAt: now - 4 * 3600_000,
      riskReasons: ['1日学習が空いている', '復習を先に戻したい段階'],
      recommendedAction: '復習10語の再開を促す',
    },
    {
      uid: 'student-biz-2',
      name: '田中 陽葵',
      email: 'hina@demo-school.jp',
      totalLearned: 45,
      totalAttempts: 60,
      lastActive: now - 86400000 * 4,
      riskLevel: StudentRiskLevel.DANGER,
      accuracy: 0.60,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationName: businessOrganizationName,
      lastNotificationAt: now - 96 * 60 * 60 * 1000,
      lastNotificationMessage: 'Oak先生より: まずは10語だけ復習して流れを戻しましょう。',
      latestInterventionKind: InterventionKind.REVIEW_RESTART,
      hasLearningPlan: false,
      hasReactivatedSinceNotification: false,
      activeStudyDays7d: 1,
      topWeaknesses: [buildMockWeakness(WeaknessDimension.SPELLING_RECALL, {
        score: 71,
        sampleSize: 10,
      })],
      weaknessProfileUpdatedAt: now - 5 * 3600_000,
      riskReasons: ['3日以上学習が停止', '正答率が60%台', '学習プラン未設定'],
      recommendedAction: '担当講師が短い再開タスクを指定',
    },
    {
      uid: 'student-biz-3',
      name: '森 結月',
      email: 'yuzuki@demo-school.jp',
      totalLearned: 188,
      totalAttempts: 240,
      lastActive: now,
      riskLevel: StudentRiskLevel.SAFE,
      accuracy: 0.88,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationName: businessOrganizationName,
      lastNotificationAt: now - 20 * 60 * 60 * 1000,
      lastNotificationMessage: 'Oak先生より: このリズムを維持できています。次も同じペースでいきましょう。',
      latestInterventionKind: InterventionKind.PRAISE,
      hasLearningPlan: true,
      activeStudyDays7d: 6,
      topWeaknesses: [buildMockWeakness(WeaknessDimension.ADVANCED_BAND_CONFIDENCE, {
        level: WeaknessSignalLevel.MEDIUM,
        score: 34,
        sampleSize: 9,
        reason: '今の難度帯で正答が安定しきっていません。',
        nextActionLabel: '今日のプランに戻る',
        recommendedActionType: RecommendedActionType.OPEN_PLAN,
        targetQuestionModes: ['JA_TO_EN', 'EN_TO_JA'],
      })],
      weaknessProfileUpdatedAt: now - 2 * 3600_000,
      riskReasons: ['高い正答率で安定'],
      recommendedAction: '次の教材へ拡張',
    },
  ];

  const withAssignments = allStudents.map((student) => {
    const assignedInstructorUid = mergedAssignments.get(student.uid) || undefined;
    const assignedInstructor = IDB_MOCK_USERS.find((user) => user.uid === assignedInstructorUid);
    const missionAssignment = getLocalMissionAssignmentByStudent(student.uid);
    const cohortSummary = student.organizationName ? getLocalStudentCohortSummary(student.uid) : null;
    const missionOverdue = Boolean(
      missionAssignment?.progress.overdue
      || missionAssignment?.progress.status === WeeklyMissionStatus.OVERDUE,
    );
    const latestInterventionAt = student.lastNotificationAt;
    const latestInterventionOutcome = resolveInterventionOutcome({
      latestInterventionAt,
      lastReactivatedAt: student.lastReactivatedAt,
      now,
    });
    return {
      ...student,
      cohortId: cohortSummary?.cohortId,
      cohortName: cohortSummary?.cohortName,
      assignedInstructorUid,
      assignedInstructorName: assignedInstructor?.displayName,
      continuityBand: getContinuityBand(student.activeStudyDays7d || 0),
      latestInterventionAt,
      latestInterventionOutcome,
      latestRecommendedActionType: resolveRecommendedActionType({
        interventionKind: student.latestInterventionKind,
        hasLearningPlan: student.hasLearningPlan,
      }),
      needsFollowUpNow: resolveNeedsFollowUpNow({
        riskLevel: student.riskLevel,
      latestInterventionAt,
      latestInterventionOutcome,
      missionOverdue,
      now,
    }),
      primaryMissionStatus: missionAssignment?.progress.status,
      primaryMissionTrack: missionAssignment?.mission.learningTrack,
      primaryMissionTitle: missionAssignment?.mission.title,
      primaryMissionCompletionRate: missionAssignment?.progress.completionRate,
      missionDueAt: missionAssignment?.mission.dueAt,
      missionOverdue,
      missionLastActivityAt: missionAssignment?.progress.lastActivityAt,
    };
  });

  if (sessionUser?.role === UserRole.ADMIN) return withAssignments;

  if (sessionOrganization) {
    const orgStudents = withAssignments.filter((student) => student.organizationName === sessionOrganization.displayName);
    const bypassAssignment =
      sessionUser.organizationRole === OrganizationRole.GROUP_ADMIN
      || (
        sessionUser.role === UserRole.INSTRUCTOR
        && sessionUser.organizationRole === OrganizationRole.INSTRUCTOR
        && isDemoEmail(sessionUser.email)
      );
    if (bypassAssignment) return orgStudents;
    const visibleCohortIds = new Set(LOCAL_INSTRUCTOR_COHORT_ASSIGNMENTS.get(sessionUser.uid) || []);
    return orgStudents.filter((student) => (
      student.assignedInstructorUid === sessionUser.uid
      || Boolean(student.cohortId && visibleCohortIds.has(student.cohortId))
    ));
  }

  return withAssignments.filter((student) => !student.organizationName);
};

export const getStudentWorksheetSnapshot = async (
  context: OrganizationReadModelContext,
  studentUid: string,
): Promise<StudentWorksheetSnapshot> => {
  const students = await getAllStudentsProgress(context);
  const targetStudent = students.find((student) => student.uid === studentUid);
  if (!targetStudent) {
    throw new Error('担当範囲の生徒のみ問題印刷できます。');
  }
  const books = await context.getBooks();
  const wordsById = new Map<string, WordData>();

  for (const book of books) {
    const words = await context.getWordsByBook(book.id);
    words.forEach((word) => {
      wordsById.set(word.id, word);
    });
  }

  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  const worksheetWords = buildWorksheetWordsFromHistoryRecords({
    records,
    studentUid,
    booksById: new Map(books.map((book) => [book.id, book])),
    wordsById,
  });

  return {
    studentUid: targetStudent.uid,
    studentName: targetStudent.name,
    organizationName: targetStudent.organizationName,
    words: worksheetWords.length > 0 ? worksheetWords : await buildFallbackWorksheetWords(context),
  };
};

export const sendInstructorNotification = async (
  _context: OrganizationReadModelContext,
  _studentUid: string,
  _message: string,
  _triggerReason: string,
  _usedAi: boolean,
  _interventionKind: InterventionKind,
  _recommendedActionType?: RecommendedActionType,
): Promise<void> => {
};

export const getOrganizationDashboardSnapshot = async (
  context: Pick<OrganizationReadModelContext, 'getSession' | 'getStore'>,
): Promise<OrganizationDashboardSnapshot> => {
  const sessionUser = await context.getSession();
  const sessionOrganization = resolveLocalOrganizationForUser(sessionUser)
    || readLocalOrganizationRecord(IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY);
  if (!sessionOrganization) {
    throw new Error('ローカル組織情報が見つかりません。');
  }
  const students = await getAllStudentsProgress(context);
  const missionAssignments = listLocalMissionAssignments(sessionUser)
    .filter((assignment) => assignment.progress.status !== WeeklyMissionStatus.ARCHIVED)
    .filter((assignment) => assignment.mission.organizationId === sessionOrganization.organizationId);
  const now = Date.now();
  const instructors = IDB_MOCK_USERS
    .filter((user) => user.role === UserRole.INSTRUCTOR && user.organizationId === sessionOrganization.organizationId)
    .map((user) => ({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      organizationRole: user.organizationRole,
      notifiedStudentCount: user.organizationRole === OrganizationRole.GROUP_ADMIN ? students.length : Math.max(1, students.length - 1),
      notifications7d: user.organizationRole === OrganizationRole.GROUP_ADMIN ? 5 : 3,
      assignedStudentCount: students.filter((student) => student.assignedInstructorUid === user.uid).length,
    }));

  const assignedStudents = students.filter((student) => student.assignedInstructorUid).length;
  const atRiskStudents = students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE);
  const weeklyContinuityStudents = students.filter((student) => (student.activeStudyDays7d || 0) >= 4).length;
  const followedUpAtRiskStudents = atRiskStudents.filter((student) => (
    Boolean(student.latestInterventionAt) && now - Number(student.latestInterventionAt || 0) <= FOLLOW_UP_WINDOW_MS
  )).length;
  const instructorBacklog = instructors.map((instructor) => {
    const assigned = students.filter((student) => student.assignedInstructorUid === instructor.uid);
    const immediateCount = assigned.filter((student) => student.needsFollowUpNow).length;
    const waitingCount = assigned.filter((student) => (
      !student.needsFollowUpNow && student.latestInterventionOutcome === 'PENDING'
    )).length;
    const reactivatedCount = assigned.filter((student) => student.latestInterventionOutcome === 'REACTIVATED').length;
    return {
      uid: instructor.uid,
      displayName: instructor.displayName,
      email: instructor.email,
      organizationRole: instructor.organizationRole,
      assignedStudentCount: instructor.assignedStudentCount,
      immediateCount,
      waitingCount,
      reactivatedCount,
      backlogCount: immediateCount + waitingCount,
    };
  });
  const trackCompletion = buildMissionTrackCompletion(missionAssignments);
  const writingReturnRateByTrack = buildMissionWritingReturnRateByTrack(missionAssignments);

  return {
    organizationId: sessionOrganization.organizationId,
    organizationName: sessionOrganization.displayName,
    subscriptionPlan: sessionOrganization.subscriptionPlan,
    totalMembers: instructors.length + students.length,
    totalStudents: students.length,
    totalInstructors: instructors.length,
    activeStudents7d: students.filter((student) => Date.now() - student.lastActive < 7 * 86400000).length,
    atRiskStudents: atRiskStudents.length,
    learningPlanCount: Math.max(1, students.length - 1),
    notifications7d: 8,
    reactivatedStudents7d: Math.max(0, students.length - 2),
    reactivationRate7d: students.length > 0 ? Math.round((Math.max(0, students.length - 2) / students.length) * 100) : 0,
    weeklyContinuityRate: students.length > 0 ? Math.round((weeklyContinuityStudents / students.length) * 100) : 0,
    followUpCoverageRate48h: atRiskStudents.length > 0 ? Math.round((followedUpAtRiskStudents / atRiskStudents.length) * 100) : 0,
    interventionBacklogCount: students.filter((student) => student.needsFollowUpNow).length,
    overdueMissionCount: missionAssignments.filter((assignment) => assignment.progress.status === WeeklyMissionStatus.OVERDUE).length,
    missionStartedRate: calculateMissionStartedRate(missionAssignments),
    overdueMissionRecoveryRate: calculateMissionOverdueRecoveryRate(missionAssignments, now),
    assignmentCoverageRate: students.length > 0 ? Math.round((assignedStudents / students.length) * 100) : 0,
    planCoverageRate: students.length > 0 ? Math.round((Math.max(1, students.length - 1) / students.length) * 100) : 0,
    unassignedStudents: students.filter((student) => !student.assignedInstructorUid).length,
    unassignedAtRiskCount: students.filter((student) => !student.assignedInstructorUid && student.riskLevel !== StudentRiskLevel.SAFE).length,
    trackCompletion,
    writingReturnRateByTrack,
    instructors,
    instructorBacklog,
    atRiskStudentList: atRiskStudents,
    studentAssignments: students,
    assignmentEvents: [
      {
        id: 1,
        studentUid: students[0]?.uid || 'student-biz-1',
        studentName: students[0]?.name || '黒田 颯太',
        previousInstructorUid: undefined,
        previousInstructorName: undefined,
        nextInstructorUid: instructors[0]?.uid,
        nextInstructorName: instructors[0]?.displayName,
        changedByUid: sessionUser?.uid || 'mock-group-admin-001',
        changedByName: sessionUser?.displayName || '朝比奈 由奈',
        createdAt: Date.now() - 2 * 3600_000,
      },
    ],
    trend: [],
  };
};

export const getOrganizationSettingsSnapshot = async (
  context: Pick<OrganizationReadModelContext, 'getSession'>,
): Promise<OrganizationSettingsSnapshot> => {
  const sessionUser = await context.getSession();
  const organization = resolveLocalOrganizationForUser(sessionUser)
    || readLocalOrganizationRecord(IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY);
  if (!organization) {
    throw new Error('組織設定を表示できません。');
  }
  return getLocalSettingsSnapshot(organization);
};

export const updateOrganizationProfile = async (
  context: Pick<OrganizationReadModelContext, 'getSession'>,
  displayName: string,
): Promise<OrganizationSettingsSnapshot> => {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new Error('組織名を入力してください。');
  }

  const sessionUser = await context.getSession();
  const organization = resolveLocalOrganizationForUser(sessionUser)
    || readLocalOrganizationRecord(IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY);
  if (!organization) {
    throw new Error('組織設定を更新できません。');
  }

  const nextNameKey = toNameKey(trimmed);
  const duplicate = [...LOCAL_ORGANIZATIONS.values()].find((candidate) => (
    candidate.organizationId !== organization.organizationId && candidate.nameKey === nextNameKey
  ));
  if (duplicate) {
    throw new Error('同名の組織が既に存在します。');
  }

  organization.displayName = trimmed;
  organization.nameKey = nextNameKey;
  organization.updatedAt = Date.now();
  IDB_MOCK_USERS.forEach((user) => {
    if (user.organizationId === organization.organizationId) {
      user.organizationName = trimmed;
    }
  });

  const actor = IDB_MOCK_USERS.find((user) => user.uid === sessionUser?.uid) || IDB_MOCK_USERS.find((user) => user.organizationRole === OrganizationRole.GROUP_ADMIN);
  appendLocalOrganizationAuditEvent(organization.organizationId, {
    actorUserId: actor?.uid || 'local-group-admin',
    actorDisplayName: actor?.displayName || 'ローカル管理者',
    actionType: 'ORGANIZATION_RENAMED',
    targetType: 'ORGANIZATION',
    targetId: organization.organizationId,
    payload: { displayName: trimmed },
  });

  return getLocalSettingsSnapshot(organization);
};

export const upsertOrganizationCohort = async (
  context: Pick<OrganizationReadModelContext, 'getSession'>,
  cohortId: string | undefined,
  name: string,
): Promise<OrganizationCohort> => {
  const sessionUser = await context.getSession();
  const organization = resolveLocalOrganizationForUser(sessionUser)
    || readLocalOrganizationRecord(IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY);
  if (!organization) {
    throw new Error('組織設定を更新できません。');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('クラス/担当グループ名を入力してください。');
  }

  const existingCohorts = LOCAL_ORGANIZATION_COHORTS.get(organization.organizationId) || [];
  const duplicate = existingCohorts.find((cohort) => (
    cohort.name.toLocaleLowerCase('ja-JP') === trimmedName.toLocaleLowerCase('ja-JP')
    && cohort.id !== cohortId
  ));
  if (duplicate) {
    throw new Error('同じクラス/担当グループ名が既に存在します。');
  }

  const actor = IDB_MOCK_USERS.find((user) => user.uid === sessionUser?.uid) || IDB_MOCK_USERS.find((user) => user.organizationRole === OrganizationRole.GROUP_ADMIN);
  const now = Date.now();

  if (cohortId) {
    const currentCohort = existingCohorts.find((cohort) => cohort.id === cohortId);
    if (!currentCohort) {
      throw new Error('対象のクラス/担当グループが見つかりません。');
    }
    if (currentCohort.name !== trimmedName) {
      currentCohort.name = trimmedName;
      currentCohort.updatedAt = now;
      appendLocalOrganizationAuditEvent(organization.organizationId, {
        actorUserId: actor?.uid || 'local-group-admin',
        actorDisplayName: actor?.displayName || 'ローカル管理者',
        actionType: 'ORGANIZATION_COHORT_RENAMED',
        targetType: 'COHORT',
        targetId: cohortId,
        payload: {
          nextName: trimmedName,
        },
        createdAt: now,
      });
    }
  } else {
    const nextCohortId = `cohort_local_${crypto.randomUUID().replace(/-/g, '')}`;
    existingCohorts.push({
      id: nextCohortId,
      organizationId: organization.organizationId,
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
    });
    LOCAL_ORGANIZATION_COHORTS.set(organization.organizationId, existingCohorts);
    appendLocalOrganizationAuditEvent(organization.organizationId, {
      actorUserId: actor?.uid || 'local-group-admin',
      actorDisplayName: actor?.displayName || 'ローカル管理者',
      actionType: 'ORGANIZATION_COHORT_CREATED',
      targetType: 'COHORT',
      targetId: nextCohortId,
      payload: {
        nextName: trimmedName,
      },
      createdAt: now,
    });
    cohortId = nextCohortId;
  }

  const savedCohort = getLocalOrganizationCohorts(organization.organizationId)
    .find((cohort) => cohort.id === cohortId);
  if (!savedCohort) {
    throw new Error('クラス/担当グループの保存に失敗しました。');
  }
  return savedCohort;
};

export const setStudentCohort = async (
  context: Pick<OrganizationReadModelContext, 'getSession'>,
  studentUid: string,
  cohortId: string | null,
): Promise<void> => {
  const sessionUser = await context.getSession();
  const organization = resolveLocalOrganizationForUser(sessionUser)
    || readLocalOrganizationRecord(IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY);
  if (!organization) {
    throw new Error('組織設定を更新できません。');
  }
  if (!studentUid) {
    throw new Error('対象生徒を指定してください。');
  }
  if (!listLocalOrganizationStudentUids(organization.organizationId).includes(studentUid)) {
    throw new Error('対象生徒が見つかりません。');
  }

  const availableCohorts = getLocalOrganizationCohorts(organization.organizationId);
  if (cohortId && !availableCohorts.some((cohort) => cohort.id === cohortId)) {
    throw new Error('指定したクラス/担当グループが見つかりません。');
  }

  const previousCohort = getLocalStudentCohortSummary(studentUid);
  if ((previousCohort?.cohortId || null) === cohortId) {
    return;
  }

  if (cohortId) {
    LOCAL_STUDENT_COHORT_ASSIGNMENTS.set(studentUid, cohortId);
  } else {
    LOCAL_STUDENT_COHORT_ASSIGNMENTS.delete(studentUid);
  }

  const nextCohort = cohortId
    ? getLocalOrganizationCohorts(organization.organizationId).find((cohort) => cohort.id === cohortId) || null
    : null;
  const actor = IDB_MOCK_USERS.find((user) => user.uid === sessionUser?.uid) || IDB_MOCK_USERS.find((user) => user.organizationRole === OrganizationRole.GROUP_ADMIN);
  appendLocalOrganizationAuditEvent(organization.organizationId, {
    actorUserId: actor?.uid || 'local-group-admin',
    actorDisplayName: actor?.displayName || 'ローカル管理者',
    actionType: 'STUDENT_COHORT_CHANGED',
    targetType: 'STUDENT',
    targetId: studentUid,
    payload: {
      previousCohortId: previousCohort?.cohortId || null,
      previousCohortName: previousCohort?.cohortName || null,
      nextCohortId: nextCohort?.id || null,
      nextCohortName: nextCohort?.name || null,
    },
  });
};

export const setInstructorCohorts = async (
  context: Pick<OrganizationReadModelContext, 'getSession'>,
  instructorUid: string,
  cohortIds: string[],
): Promise<void> => {
  const sessionUser = await context.getSession();
  const organization = resolveLocalOrganizationForUser(sessionUser)
    || readLocalOrganizationRecord(IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY);
  if (!organization) {
    throw new Error('組織設定を更新できません。');
  }
  if (!instructorUid) {
    throw new Error('対象講師を指定してください。');
  }

  const instructor = listLocalOrganizationMembers(organization.organizationId)
    .find((member) => member.userUid === instructorUid && member.organizationRole === OrganizationRole.INSTRUCTOR);
  if (!instructor) {
    throw new Error('対象講師が見つかりません。');
  }

  const availableCohortIds = new Set(getLocalOrganizationCohorts(organization.organizationId).map((cohort) => cohort.id));
  const nextCohortIds = [...new Set(cohortIds.filter((cohortId) => availableCohortIds.has(cohortId)))].sort();
  if (nextCohortIds.length !== cohortIds.filter(Boolean).length) {
    throw new Error('指定したクラス/担当グループが見つかりません。');
  }

  const previousCohortIds = [...(LOCAL_INSTRUCTOR_COHORT_ASSIGNMENTS.get(instructorUid) || [])].sort();
  if (previousCohortIds.join(',') === nextCohortIds.join(',')) {
    return;
  }

  if (nextCohortIds.length > 0) {
    LOCAL_INSTRUCTOR_COHORT_ASSIGNMENTS.set(instructorUid, nextCohortIds);
  } else {
    LOCAL_INSTRUCTOR_COHORT_ASSIGNMENTS.delete(instructorUid);
  }

  const actor = IDB_MOCK_USERS.find((user) => user.uid === sessionUser?.uid) || IDB_MOCK_USERS.find((user) => user.organizationRole === OrganizationRole.GROUP_ADMIN);
  appendLocalOrganizationAuditEvent(organization.organizationId, {
    actorUserId: actor?.uid || 'local-group-admin',
    actorDisplayName: actor?.displayName || 'ローカル管理者',
    actionType: 'INSTRUCTOR_COHORTS_CHANGED',
    targetType: 'INSTRUCTOR',
    targetId: instructorUid,
    payload: {
      previousCohortIds,
      nextCohortIds,
    },
  });
};
