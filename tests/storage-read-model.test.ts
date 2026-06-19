import { describe, expect, it } from 'vitest';

import {
  BookAccessScope,
  BookCatalogSource,
  EnglishLevel,
  LearningPreferenceIntensity,
  MissionNextActionType,
  SubscriptionPlan,
  type BookMetadata,
  type LearningPlan,
  type LearningPreference,
  type UserProfile,
  UserGrade,
  UserRole,
  WeeklyMissionStatus,
  type WordData,
} from '../types';
import { type StoredLearningHistoryRecord } from '../services/storage/idb-support';
import {
  getBookProgressFromHistoryRecords,
  getDueCountFromHistoryRecords,
  getMasteryDistributionFromHistoryRecords,
  getStudiedWordIdsByBookFromHistoryRecords,
} from '../services/storage/learning-history';
import { buildWorksheetWordsFromHistoryRecords } from '../services/storage/organization-read-model';
import {
  getDashboardSnapshot,
  type DashboardReadModelContext,
} from '../services/storage/dashboard-read-model';
import { resetLocalMissionState } from '../services/storage/missions';

const uid = 'student-1';
const now = 1_000;

const records: StoredLearningHistoryRecord[] = [
  {
    id: `${uid}_w1`,
    data: {
      wordId: 'w1',
      bookId: 'book-1',
      status: 'learning',
      lastStudiedAt: 900,
      nextReviewDate: 900,
      interval: 4,
      easeFactor: 2.5,
      correctCount: 2,
      attemptCount: 2,
      totalResponseTimeMs: 1400,
      interactionSource: 'STUDY',
    },
  },
  {
    id: `${uid}_w2`,
    data: {
      wordId: 'w2',
      bookId: 'book-1',
      status: 'learning',
      lastStudiedAt: 950,
      nextReviewDate: 700,
      interval: 7,
      easeFactor: 2.5,
      correctCount: 1,
      attemptCount: 1,
      totalResponseTimeMs: 1200,
      interactionSource: 'QUIZ',
    },
  },
  {
    id: `${uid}_w3`,
    data: {
      wordId: 'w3',
      bookId: 'book-1',
      status: 'graduated',
      lastStudiedAt: 980,
      nextReviewDate: 4_000,
      interval: 30,
      easeFactor: 2.7,
      correctCount: 5,
      attemptCount: 5,
      totalResponseTimeMs: 4200,
      interactionSource: 'STUDY',
    },
  },
  {
    id: `${uid}_w4`,
    data: {
      wordId: 'w4',
      bookId: 'book-1',
      status: 'new',
      lastStudiedAt: 990,
      nextReviewDate: 5_000,
      interval: 0,
      easeFactor: 2.5,
      correctCount: 0,
      attemptCount: 0,
      totalResponseTimeMs: 0,
      interactionSource: 'STUDY',
    },
  },
  {
    id: `other-user_w5`,
    data: {
      wordId: 'w5',
      bookId: 'book-1',
      status: 'learning',
      lastStudiedAt: 990,
      nextReviewDate: 500,
      interval: 3,
      easeFactor: 2.5,
      correctCount: 1,
      attemptCount: 1,
      totalResponseTimeMs: 900,
      interactionSource: 'STUDY',
    },
  },
];

const wordsById = new Map<string, WordData>([
  ['w1', { id: 'w1', bookId: 'book-1', number: 1, word: 'triage', definition: 'トリアージ' }],
  ['w2', { id: 'w2', bookId: 'book-1', number: 2, word: 'monitor', definition: '観察する' }],
  ['w3', { id: 'w3', bookId: 'book-1', number: 3, word: 'diagnosis', definition: '診断' }],
  ['w4', { id: 'w4', bookId: 'book-1', number: 4, word: 'stabilize', definition: '安定させる' }],
]);

const makeStudent = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'student-local-1',
  displayName: 'Local Student',
  email: 'student@example.com',
  role: UserRole.STUDENT,
  grade: UserGrade.JHS3,
  englishLevel: EnglishLevel.B1,
  subscriptionPlan: SubscriptionPlan.TOB_PAID,
  stats: {
    xp: 0,
    level: 1,
    currentStreak: 0,
    lastLoginDate: '2026-06-19',
  },
  ...overrides,
});

const makeDashboardBook = (
  id: string,
  title: string,
  selectable = true,
): BookMetadata => ({
  id,
  title,
  wordCount: 240,
  isPriority: false,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  accessScope: BookAccessScope.ALL_PLANS,
  qualityGate: {
    status: selectable ? 'approved' : 'source_review_required',
    label: selectable ? '承認済み' : '出典確認',
    summary: selectable ? 'source ledgerとcontent QAの両方を通過しています。' : 'source ledger確認待ちです。',
    isApprovedForLearner: selectable,
    isSelectableForToday: selectable,
    blockingReasons: selectable ? [] : ['権利確認が pending です。'],
    warnings: [],
  },
});

const createEmptyStore = (): IDBObjectStore => ({
  getAll: () => {
    throw new Error('empty fake IndexedDB store');
  },
} as unknown as IDBObjectStore);

const createDashboardReadModelContext = ({
  user,
  books,
  learningPlan = null,
  learningPreference = null,
}: {
  user: UserProfile;
  books: BookMetadata[];
  learningPlan?: LearningPlan | null;
  learningPreference?: LearningPreference | null;
}): DashboardReadModelContext => ({
  getStore: async () => createEmptyStore(),
  getSession: async () => user,
  getBooks: async () => books,
  getBookProgress: async (_uid, bookId) => ({
    bookId,
    learnedCount: 0,
    totalCount: books.find((book) => book.id === bookId)?.wordCount || 0,
    percentage: 0,
  }),
  getDueCount: async () => 0,
  getLearningPlan: async () => learningPlan,
  getLearningPreference: async () => learningPreference,
  getAllStudentsProgress: async () => [],
  getCoachNotifications: async () => [],
});

describe('storage read model helpers', () => {
  it('applies the same study-only filter across due, studied ids, progress, and distribution', () => {
    expect(getDueCountFromHistoryRecords(records, uid, now)).toBe(1);
    expect(getStudiedWordIdsByBookFromHistoryRecords(records, uid, 'book-1')).toEqual(['w1', 'w3', 'w4']);
    expect(getBookProgressFromHistoryRecords(records, uid, 'book-1', 4)).toEqual({
      bookId: 'book-1',
      learnedCount: 2,
      totalCount: 4,
      percentage: 50,
    });
    expect(getMasteryDistributionFromHistoryRecords(records, uid)).toEqual({
      new: 0,
      learning: 1,
      review: 1,
      graduated: 1,
      total: 3,
    });
  });

  it('builds worksheet rows from mastery-progress histories only', () => {
    const worksheetWords = buildWorksheetWordsFromHistoryRecords({
      records,
      studentUid: uid,
      booksById: new Map([['book-1', { id: 'book-1', title: 'Medical Core' }]]),
      wordsById,
    });

    expect(worksheetWords.map((word) => word.wordId)).toEqual(['w3', 'w1']);
    expect(worksheetWords.map((word) => word.status)).toEqual(['graduated', 'review']);
  });

  it('builds a suggested primary mission in the local dashboard read model from selectable books and learning context', async () => {
    const user = makeStudent({ uid: 'student-without-assigned-mission' });
    const learningPlan: LearningPlan = {
      uid: user.uid,
      createdAt: Date.now(),
      targetDate: '2026-07-01',
      goalDescription: '承認済み教材を毎日進める',
      dailyWordGoal: 18,
      selectedBookIds: ['blocked-book'],
      status: 'ACTIVE',
    };
    const learningPreference: LearningPreference = {
      userUid: user.uid,
      targetExam: '高校入試',
      targetScore: '80',
      examDate: '2027-02-01',
      weeklyStudyDays: 5,
      dailyStudyMinutes: 30,
      weakSkillFocus: '長文',
      motivationNote: '',
      intensity: LearningPreferenceIntensity.REVIEW_HEAVY,
      updatedAt: Date.now(),
    };

    const snapshot = await getDashboardSnapshot(
      createDashboardReadModelContext({
        user,
        books: [
          makeDashboardBook('blocked-book', 'Blocked Mission Book', false),
          makeDashboardBook('approved-book', 'Approved Mission Book', true),
        ],
        learningPlan,
        learningPreference,
      }),
      user.uid,
    );

    expect(snapshot.primaryMission).toMatchObject({
      isSuggested: true,
      sourceBookId: 'approved-book',
      sourceBookTitle: 'Approved Mission Book',
      newWordsTarget: 29,
      reviewWordsTarget: 17,
    });
  });

  it('prioritizes local assigned missions and gates unavailable source-book actions in the read model', async () => {
    resetLocalMissionState();
    const user = makeStudent({
      uid: 'student-biz-1',
      displayName: '黒田 颯太',
      organizationName: 'Steady Study Demo Academy',
    });

    const snapshot = await getDashboardSnapshot(
      createDashboardReadModelContext({
        user,
        books: [
          makeDashboardBook('book-local-school', '学校進度ベーシック', false),
          makeDashboardBook('approved-book', 'Approved Mission Book', true),
        ],
      }),
      user.uid,
    );

    expect(snapshot.primaryMission).toMatchObject({
      assignmentId: 'mission-assignment-student-biz-1-mission-local-assigned',
      isSuggested: false,
      status: WeeklyMissionStatus.ASSIGNED,
      title: '学校進度 今週ミッション',
      sourceBookId: undefined,
      sourceBookTitle: '学校進度ベーシック',
      nextActionType: MissionNextActionType.OPEN_PLAN,
      nextActionLabel: '教材設定を確認',
    });
    expect(snapshot.primaryMission?.blockers).toContain('指定教材を確認してください');
    expect(snapshot.primaryMission?.nextTaskIntent).toBeNull();
  });
});
