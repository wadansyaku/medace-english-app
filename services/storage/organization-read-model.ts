import {
  LearningHistory,
  OrganizationDashboardSnapshot,
  OrganizationRole,
  StudentRiskLevel,
  StudentSummary,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserProfile,
  UserRole,
  WordData,
} from '../../types';
import { isDemoEmail } from '../../utils/demo';
import { getMasteryDistributionBucket } from '../../shared/learningHistory';
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
  IDB_MOCK_ASSIGNMENTS,
  IDB_MOCK_USERS,
} from './mockData';
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
  const sessionUser = await context.getSession();
  const assignmentStore = await context.getStore(STORES.ASSIGNMENTS);
  const assignments = await readAllStoreRecords<StoredAssignmentRecord>(assignmentStore);
  const mergedAssignments = new Map<string, string | null>(
    [...IDB_MOCK_ASSIGNMENTS, ...assignments].map((entry) => [entry.studentUid, entry.instructorUid]),
  );

  const allStudents: StudentSummary[] = [
    { uid: 'student-free-1', name: '鈴木 健太', email: 'kenta@medace.com', totalLearned: 150, totalAttempts: 300, lastActive: Date.now(), riskLevel: StudentRiskLevel.SAFE, accuracy: 0.85, subscriptionPlan: SubscriptionPlan.TOC_FREE, hasLearningPlan: true, riskReasons: ['直近7日で安定して学習'], recommendedAction: '称賛して現状維持' },
    { uid: 'student-biz-1', name: '黒田 颯太', email: 'sota@demo-school.jp', totalLearned: 96, totalAttempts: 130, lastActive: Date.now() - 86400000, riskLevel: StudentRiskLevel.WARNING, accuracy: 0.76, subscriptionPlan: SubscriptionPlan.TOB_PAID, organizationName: 'Steady Study Demo Academy', lastNotificationAt: Date.now() - 86400000, lastNotificationMessage: 'Oak先生より: 昨日の復習を10語だけ戻しましょう。', hasLearningPlan: true, hasReactivatedSinceNotification: true, lastReactivatedAt: Date.now() - 43200000, riskReasons: ['1日学習が空いている', '復習を先に戻したい段階'], recommendedAction: '復習10語の再開を促す' },
    { uid: 'student-biz-2', name: '田中 陽葵', email: 'hina@demo-school.jp', totalLearned: 45, totalAttempts: 60, lastActive: Date.now() - 86400000 * 4, riskLevel: StudentRiskLevel.DANGER, accuracy: 0.60, subscriptionPlan: SubscriptionPlan.TOB_PAID, organizationName: 'Steady Study Demo Academy', lastNotificationAt: Date.now() - 86400000, lastNotificationMessage: 'Oak先生より: 2日空いたので、まずは10語だけ復習しましょう。', hasLearningPlan: false, hasReactivatedSinceNotification: false, riskReasons: ['3日以上学習が停止', '正答率が60%台', '学習プラン未設定'], recommendedAction: '担当講師が短い再開タスクを指定' },
    { uid: 'student-biz-3', name: '森 結月', email: 'yuzuki@demo-school.jp', totalLearned: 188, totalAttempts: 240, lastActive: Date.now(), riskLevel: StudentRiskLevel.SAFE, accuracy: 0.88, subscriptionPlan: SubscriptionPlan.TOB_PAID, organizationName: 'Steady Study Demo Academy', hasLearningPlan: true, riskReasons: ['高い正答率で安定'], recommendedAction: '次の教材へ拡張' },
  ];

  const withAssignments = allStudents.map((student) => {
    const assignedInstructorUid = mergedAssignments.get(student.uid) || undefined;
    const assignedInstructor = IDB_MOCK_USERS.find((user) => user.uid === assignedInstructorUid);
    return {
      ...student,
      assignedInstructorUid,
      assignedInstructorName: assignedInstructor?.displayName,
    };
  });

  if (sessionUser?.role === UserRole.ADMIN) return withAssignments;

  if (sessionUser?.organizationName) {
    const orgStudents = withAssignments.filter((student) => student.organizationName === sessionUser.organizationName);
    const bypassAssignment =
      sessionUser.organizationRole === OrganizationRole.GROUP_ADMIN
      || (
        sessionUser.role === UserRole.INSTRUCTOR
        && sessionUser.organizationRole === OrganizationRole.INSTRUCTOR
        && isDemoEmail(sessionUser.email)
      );
    if (bypassAssignment) return orgStudents;
    return orgStudents.filter((student) => !student.assignedInstructorUid || student.assignedInstructorUid === sessionUser.uid);
  }

  return withAssignments.filter((student) => !student.organizationName);
};

export const getStudentWorksheetSnapshot = async (
  context: OrganizationReadModelContext,
  studentUid: string,
): Promise<StudentWorksheetSnapshot> => {
  const students = await getAllStudentsProgress(context);
  const targetStudent = students.find((student) => student.uid === studentUid) || students[0];
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
    studentUid: targetStudent?.uid || studentUid,
    studentName: targetStudent?.name || '対象生徒',
    organizationName: targetStudent?.organizationName,
    words: worksheetWords.length > 0 ? worksheetWords : await buildFallbackWorksheetWords(context),
  };
};

export const sendInstructorNotification = async (
  _context: OrganizationReadModelContext,
  _studentUid: string,
  _message: string,
  _triggerReason: string,
  _usedAi: boolean,
): Promise<void> => {
};

export const getOrganizationDashboardSnapshot = async (
  context: Pick<OrganizationReadModelContext, 'getSession' | 'getStore'>,
): Promise<OrganizationDashboardSnapshot> => {
  const sessionUser = await context.getSession();
  const students = await getAllStudentsProgress(context);
  const instructors = IDB_MOCK_USERS
    .filter((user) => user.role === UserRole.INSTRUCTOR && user.organizationName === sessionUser?.organizationName)
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

  return {
    organizationName: sessionUser?.organizationName || 'Steady Study Demo Academy',
    subscriptionPlan: sessionUser?.subscriptionPlan || SubscriptionPlan.TOB_PAID,
    totalMembers: instructors.length + students.length,
    totalStudents: students.length,
    totalInstructors: instructors.length,
    activeStudents7d: students.filter((student) => Date.now() - student.lastActive < 7 * 86400000).length,
    atRiskStudents: students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE).length,
    learningPlanCount: Math.max(1, students.length - 1),
    notifications7d: 8,
    reactivatedStudents7d: Math.max(0, students.length - 2),
    reactivationRate7d: students.length > 0 ? Math.round((Math.max(0, students.length - 2) / students.length) * 100) : 0,
    assignmentCoverageRate: students.length > 0 ? Math.round((assignedStudents / students.length) * 100) : 0,
    planCoverageRate: students.length > 0 ? Math.round((Math.max(1, students.length - 1) / students.length) * 100) : 0,
    unassignedStudents: students.filter((student) => !student.assignedInstructorUid).length,
    instructors,
    atRiskStudentList: students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE),
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
