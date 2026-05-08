import {
  ActivityLog,
  AdminDashboardSnapshot,
  AnnouncementAudienceRole,
  AnnouncementSeverity,
  CommercialRequest,
  CommercialRequestKind,
  CommercialRequestStatus,
  CommercialWorkspaceRole,
  TeachingFormat,
  AssignmentEvent,
  BookAccessScope,
  BookCatalogSource,
  BookMetadata,
  BookProgress,
  DashboardSnapshot,
  InterventionKind,
  LearningTrack,
  LearningTaskIntent,
  LearningTaskIntentType,
  LeaderboardEntry,
  LearningPlan,
  LearningPreference,
  MasteryDistribution,
  MissionAssignment,
  MissionProgressEventType,
  OrganizationCohort,
  OrganizationSettingsSnapshot,
  RecommendedActionType,
  ProductAnnouncement,
  ProductAnnouncementFeed,
  OrganizationDashboardSnapshot,
  OrganizationRole,
  StudentSummary,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserProfile,
  UserRole,
  WeeklyMission,
  WeeklyMissionBoard,
  WorksheetQuestionMode,
  WordHintAssetType,
  WordData,
} from '../types';

export interface CatalogImportRow {
  bookName?: string;
  number?: number | string;
  word: string;
  definition: string;
  exampleSentence?: string;
  exampleMeaning?: string;
  category?: string;
  subcategory?: string;
  section?: string;
  sourceSheet?: string;
  sourceEntryId?: number | string;
}

export interface CatalogImportOptions {
  catalogSource?: BookCatalogSource;
  accessScope?: BookAccessScope;
}

export interface CatalogImportCsvSource {
  kind: 'csv';
  csvText: string;
  fileName?: string;
}

export interface CatalogImportRowsSource {
  kind: 'rows';
  rows: CatalogImportRow[];
}

export type CatalogImportSource = CatalogImportCsvSource | CatalogImportRowsSource;

export interface CatalogImportRequest {
  source: CatalogImportSource;
  defaultBookName: string;
  createdByUid?: string;
  contextSummary?: string;
  bookDescription?: string;
  importProfile?: CatalogImportProfile;
  options?: CatalogImportOptions;
}

export interface CatalogImportIssue {
  code:
    | 'MISSING_REQUIRED_COLUMNS'
    | 'EMPTY_PAYLOAD'
    | 'EMPTY_WORD'
    | 'EMPTY_DEFINITION'
    | 'INVALID_NUMBER'
    | 'DUPLICATE_ROW';
  message: string;
  rowNumber?: number;
}

export interface CatalogImportResult {
  importedBookIds: string[];
  importedBookCount: number;
  importedWordCount: number;
  skippedRowCount: number;
  warnings: CatalogImportIssue[];
}

export interface NounWorkbookImportSummary {
  hasIndexSheet?: boolean;
  importWordCount: number;
  warningIssueCount: number;
  unmatchedIndexWordCount: number;
  unmatchedImportedWordCount: number;
  duplicateHeadwordCount: number;
  reviewedIndexOnlyWordCount?: number;
  reviewedImportedOnlyWordCount?: number;
  unreviewedIndexOnlyWordCount?: number;
  unreviewedImportedOnlyWordCount?: number;
  reviewedDuplicateHeadwordCount?: number;
  unreviewedDuplicateHeadwordCount?: number;
}

export interface NounWorkbookImportGuardrailResult {
  shouldBlockImport: boolean;
  blockingReasons: string[];
}

export interface NounWorkbookImportProfile {
  kind: 'NOUN_WORKBOOK';
  summary: NounWorkbookImportSummary;
  guardrail: NounWorkbookImportGuardrailResult;
}

export type CatalogImportProfile = NounWorkbookImportProfile;

export interface CommercialRequestPayload {
  kind: CommercialRequestKind;
  contactName: string;
  contactEmail: string;
  organizationName?: string;
  teachingFormat?: TeachingFormat;
  desiredStartTiming?: string;
  requestedWorkspaceRole?: CommercialWorkspaceRole;
  seatEstimate?: string;
  message: string;
  source: string;
}

export interface PrepareBookExamplesPayload {
  bookId: string;
}

export interface PrepareBookExamplesResult {
  bookId: string;
  preparedCount: number;
  remainingCount: number;
}

export interface GenerateWordHintAssetPayload {
  wordId: string;
  assetType: WordHintAssetType;
  forceRefresh?: boolean;
}

export interface CommercialRequestUpdatePayload {
  id: number;
  status: CommercialRequestStatus;
  resolutionNote?: string;
  linkedUserUid?: string;
  targetSubscriptionPlan?: SubscriptionPlan;
  targetOrganizationId?: string;
  targetOrganizationName?: string;
  targetOrganizationRole?: OrganizationRole;
}

export interface ProductAnnouncementUpsertPayload {
  id?: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  subscriptionPlans: SubscriptionPlan[];
  audienceRoles: AnnouncementAudienceRole[];
  startsAt?: number;
  endsAt?: number;
}

export interface StorageActionMap {
  addXP: {
    payload: { amount: number };
    response: { user: UserProfile; leveledUp: boolean };
  };
  batchImportWords: {
    payload: CatalogImportRequest;
    response: CatalogImportResult;
  };
  getBooks: {
    payload: undefined;
    response: BookMetadata[];
  };
  deleteBook: {
    payload: { bookId: string };
    response: null;
  };
  getWordsByBook: {
    payload: { bookId: string };
    response: WordData[];
  };
  updateWord: {
    payload: { word: WordData };
    response: null;
  };
  reportWord: {
    payload: { wordId: string; reason: string };
    response: null;
  };
  updateWordCache: {
    payload: { wordId: string; sentence: string; translation: string };
    response: null;
  };
  generateWordHintAsset: {
    payload: GenerateWordHintAssetPayload;
    response: WordData;
  };
  prepareBookExamples: {
    payload: PrepareBookExamplesPayload;
    response: PrepareBookExamplesResult;
  };
  getDailySessionWords: {
    payload: { limit: number; taskIntent?: LearningTaskIntent };
    response: WordData[];
  };
  getBookSession: {
    payload: { bookId: string; limit: number; taskIntent?: LearningTaskIntent };
    response: WordData[];
  };
  getDashboardSnapshot: {
    payload: undefined;
    response: DashboardSnapshot;
  };
  getAdminDashboardSnapshot: {
    payload: undefined;
    response: AdminDashboardSnapshot;
  };
  getOrganizationDashboardSnapshot: {
    payload: undefined;
    response: OrganizationDashboardSnapshot;
  };
  getOrganizationSettingsSnapshot: {
    payload: undefined;
    response: OrganizationSettingsSnapshot;
  };
  getDueCount: {
    payload: undefined;
    response: number;
  };
  saveSRSHistory: {
    payload: {
      word: WordData;
      rating: number;
      responseTimeMs: number;
      missionAssignmentId?: string;
      taskIntentType?: LearningTaskIntentType;
    };
    response: null;
  };
  recordQuizAttempt: {
    payload: {
      wordId: string;
      bookId: string;
      correct: boolean;
      questionMode: WorksheetQuestionMode;
      responseTimeMs: number;
      missionAssignmentId?: string;
      taskIntentType?: LearningTaskIntentType;
    };
    response: null;
  };
  getStudiedWordIdsByBook: {
    payload: { bookId: string };
    response: string[];
  };
  getBookProgress: {
    payload: { bookId: string };
    response: BookProgress;
  };
  getAllStudentsProgress: {
    payload: undefined;
    response: StudentSummary[];
  };
  getStudentWorksheetSnapshot: {
    payload: { studentUid: string };
    response: StudentWorksheetSnapshot;
  };
  sendInstructorNotification: {
    payload: {
      studentUid: string;
      message: string;
      triggerReason: string;
      usedAi: boolean;
      interventionKind: InterventionKind;
      recommendedActionType?: RecommendedActionType;
    };
    response: null;
  };
  resetAllData: {
    payload: undefined;
    response: null;
  };
  saveLearningPlan: {
    payload: { plan: LearningPlan };
    response: null;
  };
  getLearningPlan: {
    payload: undefined;
    response: LearningPlan | null;
  };
  saveLearningPreference: {
    payload: { preference: LearningPreference };
    response: null;
  };
  getLearningPreference: {
    payload: undefined;
    response: LearningPreference | null;
  };
  assignStudentInstructor: {
    payload: { studentUid: string; instructorUid: string | null };
    response: null;
  };
  createWeeklyMission: {
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
    };
    response: WeeklyMission;
  };
  assignWeeklyMission: {
    payload: { missionId: string; studentUid: string };
    response: MissionAssignment;
  };
  getWeeklyMissionBoard: {
    payload: undefined;
    response: WeeklyMissionBoard;
  };
  updateMissionProgress: {
    payload: {
      assignmentId: string;
      eventType: MissionProgressEventType;
    };
    response: MissionAssignment;
  };
  updateOrganizationProfile: {
    payload: { displayName: string };
    response: OrganizationSettingsSnapshot;
  };
  upsertOrganizationCohort: {
    payload: { cohortId?: string; name: string };
    response: OrganizationCohort;
  };
  setStudentCohort: {
    payload: { studentUid: string; cohortId: string | null };
    response: null;
  };
  setInstructorCohorts: {
    payload: { instructorUid: string; cohortIds: string[] };
    response: null;
  };
  getLeaderboard: {
    payload: undefined;
    response: LeaderboardEntry[];
  };
  getMasteryDistribution: {
    payload: undefined;
    response: MasteryDistribution;
  };
  getActivityLogs: {
    payload: undefined;
    response: ActivityLog[];
  };
  getCommercialRequestStatus: {
    payload: undefined;
    response: CommercialRequest[];
  };
  submitCommercialRequest: {
    payload: CommercialRequestPayload;
    response: CommercialRequest;
  };
  listProductAnnouncements: {
    payload: undefined;
    response: ProductAnnouncementFeed;
  };
  markAnnouncementSeen: {
    payload: { announcementId: string };
    response: null;
  };
  acknowledgeAnnouncement: {
    payload: { announcementId: string };
    response: null;
  };
  listCommercialRequests: {
    payload: undefined;
    response: CommercialRequest[];
  };
  updateCommercialRequest: {
    payload: CommercialRequestUpdatePayload;
    response: CommercialRequest;
  };
  listProductAnnouncementsAdmin: {
    payload: undefined;
    response: ProductAnnouncement[];
  };
  upsertProductAnnouncement: {
    payload: ProductAnnouncementUpsertPayload;
    response: ProductAnnouncement;
  };
}

export type StorageAction = keyof StorageActionMap;

export const STORAGE_ACTIONS = [
  'addXP',
  'batchImportWords',
  'getBooks',
  'deleteBook',
  'getWordsByBook',
  'updateWord',
  'reportWord',
  'updateWordCache',
  'generateWordHintAsset',
  'prepareBookExamples',
  'getDailySessionWords',
  'getBookSession',
  'getDashboardSnapshot',
  'getAdminDashboardSnapshot',
  'getOrganizationDashboardSnapshot',
  'getOrganizationSettingsSnapshot',
  'getDueCount',
  'saveSRSHistory',
  'recordQuizAttempt',
  'getStudiedWordIdsByBook',
  'getBookProgress',
  'getAllStudentsProgress',
  'getStudentWorksheetSnapshot',
  'sendInstructorNotification',
  'resetAllData',
  'saveLearningPlan',
  'getLearningPlan',
  'saveLearningPreference',
  'getLearningPreference',
  'assignStudentInstructor',
  'createWeeklyMission',
  'assignWeeklyMission',
  'getWeeklyMissionBoard',
  'updateMissionProgress',
  'updateOrganizationProfile',
  'upsertOrganizationCohort',
  'setStudentCohort',
  'setInstructorCohorts',
  'getLeaderboard',
  'getMasteryDistribution',
  'getActivityLogs',
  'getCommercialRequestStatus',
  'submitCommercialRequest',
  'listProductAnnouncements',
  'markAnnouncementSeen',
  'acknowledgeAnnouncement',
  'listCommercialRequests',
  'updateCommercialRequest',
  'listProductAnnouncementsAdmin',
  'upsertProductAnnouncement',
] as const satisfies readonly StorageAction[];

export type StoragePayload<TAction extends StorageAction> = StorageActionMap[TAction]['payload'];

export type StorageResponse<TAction extends StorageAction> = StorageActionMap[TAction]['response'];

export type StorageActionRequest<TAction extends StorageAction = StorageAction> =
  StoragePayload<TAction> extends undefined
    ? { action: TAction }
    : { action: TAction; payload: StoragePayload<TAction> };

export interface DemoLoginRequest {
  action: 'demo-login';
  role?: UserRole;
  organizationRole?: OrganizationRole;
  demoPassword?: string;
}

export interface EmailAuthRequest {
  action: 'email-auth';
  role?: UserRole;
  email?: string;
  password?: string;
  isSignUp?: boolean;
  displayName?: string;
}

export type AuthRequest = DemoLoginRequest | EmailAuthRequest;

export interface AssignmentEventSummary {
  events: AssignmentEvent[];
}
