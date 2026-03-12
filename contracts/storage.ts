import {
  ActivityLog,
  AdminDashboardSnapshot,
  AssignmentEvent,
  BookAccessScope,
  BookCatalogSource,
  BookMetadata,
  BookProgress,
  DashboardSnapshot,
  LeaderboardEntry,
  LearningPlan,
  LearningPreference,
  MasteryDistribution,
  OrganizationDashboardSnapshot,
  OrganizationRole,
  StudentSummary,
  StudentWorksheetSnapshot,
  UserProfile,
  UserRole,
  WordData,
} from '../types';

export interface CatalogImportRow {
  bookName?: string;
  number?: number | string;
  word: string;
  definition: string;
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
  getDailySessionWords: {
    payload: { limit: number };
    response: WordData[];
  };
  getBookSession: {
    payload: { bookId: string; limit: number };
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
  getDueCount: {
    payload: undefined;
    response: number;
  };
  saveSRSHistory: {
    payload: { word: WordData; rating: number; responseTimeMs: number };
    response: null;
  };
  recordQuizAttempt: {
    payload: {
      wordId: string;
      bookId: string;
      correct: boolean;
      responseTimeMs: number;
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
    payload: { studentUid: string; message: string; triggerReason: string; usedAi: boolean };
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
}

export type StorageAction = keyof StorageActionMap;

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
