import type {
  ActivityLog,
  AdminDashboardSnapshot,
  BookMetadata,
  BookProgress,
  DashboardSnapshot,
  InterventionKind,
  LeaderboardEntry,
  LearningPlan,
  LearningPreference,
  LearningTaskIntent,
  LearningTaskIntentType,
  LearningTrack,
  MasteryDistribution,
  MissionAssignment,
  MissionProgressEventType,
  OrganizationCohort,
  OrganizationDashboardSnapshot,
  OrganizationRole,
  OrganizationSettingsSnapshot,
  ProductAnnouncement,
  ProductAnnouncementFeed,
  RecommendedActionType,
  StudentSummary,
  StudentWorksheetSnapshot,
  UserProfile,
  UserRole,
  WeeklyMission,
  WeeklyMissionBoard,
  WordData,
} from '../../types';
import type {
  CatalogImportRequest,
  CatalogImportResult,
  CommercialRequestPayload,
  CommercialRequestUpdatePayload,
  ProductAnnouncementUpsertPayload,
} from '../../contracts/storage';

export interface SessionStorageService {
  login(role: UserRole, demoPassword?: string, organizationRole?: OrganizationRole): Promise<UserProfile | null>;
  authenticate(email: string, password: string, isSignUp: boolean, role?: UserRole, displayName?: string): Promise<UserProfile | null>;
  saveSession(user: UserProfile): Promise<void>;
  updateSessionUser(user: UserProfile): Promise<void>;
  clearSession(): Promise<void>;
  getSession(): Promise<UserProfile | null>;
  addXP(user: UserProfile, amount: number): Promise<{ user: UserProfile; leveledUp: boolean }>;
}

export interface CatalogStorageService {
  batchImportWords(request: CatalogImportRequest, onProgress?: (progress: number) => void): Promise<CatalogImportResult>;
  getBooks(): Promise<BookMetadata[]>;
  deleteBook(bookId: string): Promise<void>;
  getWordsByBook(bookId: string): Promise<WordData[]>;
  updateWord(word: WordData): Promise<void>;
  reportWord(wordId: string, reason: string): Promise<void>;
  updateWordCache(wordId: string, sentence: string, translation: string): Promise<void>;
}

export interface LearningStorageService {
  getDailySessionWords(uid: string, limit: number, taskIntent?: LearningTaskIntent): Promise<WordData[]>;
  getBookSession(uid: string, bookId: string, limit: number, taskIntent?: LearningTaskIntent): Promise<WordData[]>;
  getDueCount(uid: string): Promise<number>;
  saveSRSHistory(
    uid: string,
    word: WordData,
    rating: number,
    responseTimeMs?: number,
    missionAssignmentId?: string,
    taskIntentType?: LearningTaskIntentType,
  ): Promise<void>;
  recordQuizAttempt(
    uid: string,
    wordId: string,
    bookId: string,
    correct: boolean,
    questionMode: 'EN_TO_JA' | 'JA_TO_EN' | 'SPELLING_HINT',
    responseTimeMs?: number,
    missionAssignmentId?: string,
    taskIntentType?: LearningTaskIntentType,
  ): Promise<void>;
  getStudiedWordIdsByBook(uid: string, bookId: string): Promise<string[]>;
  getBookProgress(uid: string, bookId: string): Promise<BookProgress>;
  saveLearningPlan(plan: LearningPlan): Promise<void>;
  getLearningPlan(uid: string): Promise<LearningPlan | null>;
  saveLearningPreference(preference: LearningPreference): Promise<void>;
  getLearningPreference(uid: string): Promise<LearningPreference | null>;
  getMasteryDistribution(uid: string): Promise<MasteryDistribution>;
  getActivityLogs(uid: string): Promise<ActivityLog[]>;
}

export interface DashboardStorageService {
  getDashboardSnapshot(uid: string): Promise<DashboardSnapshot>;
  getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot>;
  getLeaderboard(currentUid: string): Promise<LeaderboardEntry[]>;
}

export interface OrganizationOpsStorageService {
  getAllStudentsProgress(): Promise<StudentSummary[]>;
  getStudentWorksheetSnapshot(studentUid: string): Promise<StudentWorksheetSnapshot>;
  sendInstructorNotification(
    studentUid: string,
    message: string,
    triggerReason: string,
    usedAi: boolean,
    interventionKind: InterventionKind,
    recommendedActionType?: RecommendedActionType,
  ): Promise<void>;
  assignStudentInstructor(studentUid: string, instructorUid: string | null): Promise<void>;
  getOrganizationDashboardSnapshot(): Promise<OrganizationDashboardSnapshot>;
  getOrganizationSettingsSnapshot(): Promise<OrganizationSettingsSnapshot>;
  updateOrganizationProfile(displayName: string): Promise<OrganizationSettingsSnapshot>;
  upsertOrganizationCohort(cohortId: string | undefined, name: string): Promise<OrganizationCohort>;
  setStudentCohort(studentUid: string, cohortId: string | null): Promise<void>;
  setInstructorCohorts(instructorUid: string, cohortIds: string[]): Promise<void>;
}

export interface MissionStorageService {
  createWeeklyMission(payload: {
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
  }): Promise<WeeklyMission>;
  assignWeeklyMission(missionId: string, studentUid: string): Promise<MissionAssignment>;
  getWeeklyMissionBoard(): Promise<WeeklyMissionBoard>;
  updateMissionProgress(assignmentId: string, eventType: MissionProgressEventType): Promise<MissionAssignment>;
}

export interface CommercialStorageService {
  getCommercialRequestStatus(): Promise<import('../../types').CommercialRequest[]>;
  submitCommercialRequest(payload: CommercialRequestPayload): Promise<import('../../types').CommercialRequest>;
  listCommercialRequests(): Promise<import('../../types').CommercialRequest[]>;
  updateCommercialRequest(payload: CommercialRequestUpdatePayload): Promise<import('../../types').CommercialRequest>;
}

export interface AnnouncementStorageService {
  listProductAnnouncements(): Promise<ProductAnnouncementFeed>;
  markAnnouncementSeen(announcementId: string): Promise<void>;
  acknowledgeAnnouncement(announcementId: string): Promise<void>;
  listProductAnnouncementsAdmin(): Promise<ProductAnnouncement[]>;
  upsertProductAnnouncement(payload: ProductAnnouncementUpsertPayload): Promise<ProductAnnouncement>;
}

export interface AdminStorageService {
  resetAllData(): Promise<void>;
}

export type IStorageService =
  & SessionStorageService
  & CatalogStorageService
  & LearningStorageService
  & DashboardStorageService
  & OrganizationOpsStorageService
  & MissionStorageService
  & CommercialStorageService
  & AnnouncementStorageService
  & AdminStorageService;
