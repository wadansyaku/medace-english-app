
export enum UserRole {
  STUDENT = 'STUDENT',
  INSTRUCTOR = 'INSTRUCTOR',
  ADMIN = 'ADMIN'
}

export enum OrganizationRole {
  GROUP_ADMIN = 'GROUP_ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  STUDENT = 'STUDENT'
}

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  [OrganizationRole.GROUP_ADMIN]: 'グループ管理者',
  [OrganizationRole.INSTRUCTOR]: 'グループ講師',
  [OrganizationRole.STUDENT]: 'グループ生徒',
};

export enum UserGrade {
  JHS1 = 'JHS1',
  JHS2 = 'JHS2',
  JHS3 = 'JHS3',
  SHS1 = 'SHS1',
  SHS2 = 'SHS2',
  SHS3 = 'SHS3',
  UNIVERSITY = 'UNIV',
  ADULT = 'ADULT'
}

// 日本語表記用マッピング（より自然な表現に統一）
export const GRADE_LABELS: Record<UserGrade, string> = {
  [UserGrade.JHS1]: '中学1年生',
  [UserGrade.JHS2]: '中学2年生',
  [UserGrade.JHS3]: '中学3年生',
  [UserGrade.SHS1]: '高校1年生',
  [UserGrade.SHS2]: '高校2年生',
  [UserGrade.SHS3]: '高校3年生',
  [UserGrade.UNIVERSITY]: '大学生',
  [UserGrade.ADULT]: '社会人',
};

// ステータスラベルの日本語化
export const STATUS_LABELS: Record<string, string> = {
  new: '未学習',
  learning: '習得中', // "学習中" よりプロセス感がある表現へ
  review: '復習期',
  graduated: '定着済' // "習得済" より完了感が強い表現へ
};

export enum EnglishLevel {
  A1 = 'A1', // Beginner
  A2 = 'A2', // Elementary
  B1 = 'B1', // Intermediate
  B2 = 'B2', // Upper Intermediate
  C1 = 'C1', // Advanced
  C2 = 'C2'  // Proficient
}

export enum SubscriptionPlan {
  TOC_FREE = 'TOC_FREE',
  TOC_PAID = 'TOC_PAID',
  TOB_FREE = 'TOB_FREE',
  TOB_PAID = 'TOB_PAID'
}

export enum BookCatalogSource {
  STEADY_STUDY_ORIGINAL = 'STEADY_STUDY_ORIGINAL',
  LICENSED_PARTNER = 'LICENSED_PARTNER',
  USER_GENERATED = 'USER_GENERATED',
}

export enum BookAccessScope {
  ALL_PLANS = 'ALL_PLANS',
  BUSINESS_ONLY = 'BUSINESS_ONLY',
}

export const BOOK_CATALOG_SOURCE_LABELS: Record<BookCatalogSource, string> = {
  [BookCatalogSource.STEADY_STUDY_ORIGINAL]: 'オリジナル単語データベース',
  [BookCatalogSource.LICENSED_PARTNER]: '公式教材',
  [BookCatalogSource.USER_GENERATED]: 'My単語帳',
};

export const BOOK_ACCESS_SCOPE_LABELS: Record<BookAccessScope, string> = {
  [BookAccessScope.ALL_PLANS]: '全プラン',
  [BookAccessScope.BUSINESS_ONLY]: 'ビジネス版',
};

export enum UserStudyMode {
  FOCUS = 'FOCUS',
  GAME = 'GAME',
}

export const USER_STUDY_MODE_LABELS: Record<UserStudyMode, string> = {
  [UserStudyMode.FOCUS]: '集中モード',
  [UserStudyMode.GAME]: 'ゲームモード',
};

export const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.TOC_FREE]: 'フリープラン',
  [SubscriptionPlan.TOC_PAID]: 'パーソナルプラン',
  [SubscriptionPlan.TOB_FREE]: 'ビジネスフリープラン',
  [SubscriptionPlan.TOB_PAID]: 'ビジネスプラン',
};

export enum LearningPreferenceIntensity {
  BALANCED = 'BALANCED',
  REVIEW_HEAVY = 'REVIEW_HEAVY',
  INTENSIVE = 'INTENSIVE',
}

export const LEARNING_PREFERENCE_INTENSITY_LABELS: Record<LearningPreferenceIntensity, string> = {
  [LearningPreferenceIntensity.BALANCED]: '標準',
  [LearningPreferenceIntensity.REVIEW_HEAVY]: '復習重視',
  [LearningPreferenceIntensity.INTENSIVE]: '短期集中',
};

export interface UserStats {
  xp: number;
  level: number;
  currentStreak: number;
  lastLoginDate: string; // YYYY-MM-DD
}

export interface UserProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  organizationRole?: OrganizationRole;
  email: string;
  stats?: UserStats;
  grade?: UserGrade;
  englishLevel?: EnglishLevel;
  needsOnboarding?: boolean;
  subscriptionPlan?: SubscriptionPlan;
  organizationName?: string;
  studyMode?: UserStudyMode;
}

export interface WordData {
  id: string;
  bookId: string;
  number: number;
  word: string;
  definition: string;
  searchKey?: string;
  exampleSentence?: string | null;
  exampleMeaning?: string | null;
  isReported?: boolean;
}

export interface BookMetadata {
  id: string;
  title: string;
  wordCount: number;
  isPriority: boolean;
  description?: string;
  sourceContext?: string;
  catalogSource?: BookCatalogSource;
  accessScope?: BookAccessScope;
}

export interface LearningHistory {
  wordId: string;
  bookId: string;
  status: 'new' | 'learning' | 'review' | 'graduated';
  lastStudiedAt: number;
  nextReviewDate: number;
  interval: number;
  easeFactor: number;
  correctCount: number;
  attemptCount: number;
  totalResponseTimeMs: number;
}

export interface BookProgress {
  bookId: string;
  learnedCount: number;
  totalCount: number;
  percentage: number;
}

export interface CsvRow {
  [key: string]: string;
}

export enum StudentRiskLevel {
  SAFE = 'SAFE',
  WARNING = 'WARNING',
  DANGER = 'DANGER'
}

export interface StudentSummary {
  uid: string;
  name: string;
  email: string;
  totalLearned: number;
  totalAttempts: number;
  lastActive: number;
  riskLevel: StudentRiskLevel;
  accuracy?: number;
  lastLoginDate?: number;
  subscriptionPlan?: SubscriptionPlan;
  organizationName?: string;
  lastNotificationAt?: number;
  lastNotificationMessage?: string;
  assignedInstructorUid?: string;
  assignedInstructorName?: string;
  assignmentUpdatedAt?: number;
  hasLearningPlan?: boolean;
  riskReasons?: string[];
  recommendedAction?: string;
}

export interface AssignmentEvent {
  id: number;
  studentUid: string;
  studentName: string;
  previousInstructorUid?: string;
  previousInstructorName?: string;
  nextInstructorUid?: string;
  nextInstructorName?: string;
  changedByUid: string;
  changedByName: string;
  createdAt: number;
}

export interface LearningPreference {
  userUid: string;
  targetExam: string;
  targetScore: string;
  examDate?: string;
  weeklyStudyDays: number;
  dailyStudyMinutes: number;
  weakSkillFocus: string;
  motivationNote: string;
  intensity: LearningPreferenceIntensity;
  updatedAt: number;
}

export interface LearningPlan {
  uid: string;
  createdAt: number;
  targetDate: string; // YYYY-MM-DD
  goalDescription: string;
  dailyWordGoal: number;
  selectedBookIds: string[]; // The curriculum subset
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  xp: number;
  level: number;
  rank: number;
  isCurrentUser: boolean;
}

export interface MasteryDistribution {
  new: number;       // Not started
  learning: number;  // Interval <= 3
  review: number;    // Interval > 3 and <= 20
  graduated: number; // Interval > 20
  total: number;
}

export interface ActivityLog {
  date: string; // YYYY-MM-DD
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export type MotivationScope = 'PERSONAL' | 'GROUP' | 'GLOBAL';

export interface MotivationScopeStats {
  scope: MotivationScope;
  label: string;
  description: string;
  totalAnswers: number;
  totalCorrect: number;
  accuracyRate: number;
  totalStudyTimeMs: number;
  averageResponseTimeMs: number | null;
  registeredUsers: number;
}

export interface MotivationInsight {
  title: string;
  body: string;
}

export interface MotivationSnapshot {
  scopes: MotivationScopeStats[];
  insight: MotivationInsight;
}

export interface PublicMotivationSnapshot {
  snapshot: MotivationSnapshot;
  activeLearners15m: number;
  activeLearners24h: number;
  wordsTouched24h: number;
  updatedAt: number;
}

export interface InstructorNotification {
  id: number;
  studentUid: string;
  studentName: string;
  instructorUid: string;
  instructorName: string;
  message: string;
  triggerReason: string;
  deliveryChannel: 'IN_APP';
  usedAi: boolean;
  createdAt: number;
}

export interface AiUsageSummary {
  monthKey: string;
  estimatedCostMilliYen: number;
  budgetMilliYen: number;
  remainingMilliYen: number;
  actionCounts: Record<string, number>;
}

export interface AccountOverview {
  subscriptionPlan: SubscriptionPlan;
  organizationRole?: OrganizationRole;
  organizationName?: string;
  priceLabel: string;
  pricingNote: string;
  audienceLabel: string;
  featureSummary: string[];
  aiUsage: AiUsageSummary;
}

export interface DashboardSnapshot {
  dueCount: number;
  officialBooks: BookMetadata[];
  myBooks: BookMetadata[];
  progressMap: Record<string, BookProgress>;
  learningPlan: LearningPlan | null;
  learningPreference: LearningPreference | null;
  leaderboard: LeaderboardEntry[];
  masteryDist: MasteryDistribution;
  activityLogs: ActivityLog[];
  motivationSnapshot: MotivationSnapshot;
  coachNotifications: InstructorNotification[];
  accountOverview: AccountOverview;
}

export interface AdminOverviewStats {
  totalStudents: number;
  activeToday: number;
  active7d: number;
  atRiskCount: number;
  studentsWithPlan: number;
  averageLearnedWords: number;
  averageAccuracyRate: number;
  officialBookCount: number;
  customBookCount: number;
  totalWordCount: number;
  reportedWordCount: number;
  notifications7d: number;
  aiRequestsThisMonth: number;
  aiCostThisMonthMilliYen: number;
}

export interface AdminPlanBreakdownItem {
  plan: SubscriptionPlan;
  count: number;
}

export interface AdminRiskBreakdownItem {
  riskLevel: StudentRiskLevel;
  count: number;
}

export interface AdminTrendPoint {
  date: string;
  activeStudents: number;
  studiedWords: number;
  notifications: number;
  newStudents: number;
}

export interface AdminBookInsight {
  bookId: string;
  title: string;
  wordCount: number;
  learnerCount: number;
  learnedEntries: number;
  averageProgress: number;
  isOfficial: boolean;
}

export interface AdminAiActionSummary {
  action: string;
  label: string;
  requestCount: number;
  estimatedCostMilliYen: number;
}

export interface AdminWordReportSummary {
  id: number;
  wordId: string;
  word: string;
  bookTitle: string;
  reporterName: string;
  reason: string;
  createdAt: number;
}

export interface AdminOrganizationInsight {
  organizationName: string;
  studentCount: number;
  active7dCount: number;
  paidCount: number;
  averageLearnedWords: number;
}

export interface OrganizationInstructorSummary {
  uid: string;
  displayName: string;
  email: string;
  organizationRole?: OrganizationRole;
  notifiedStudentCount: number;
  notifications7d: number;
  assignedStudentCount: number;
}

export interface OrganizationDashboardSnapshot {
  organizationName: string;
  subscriptionPlan: SubscriptionPlan;
  totalMembers: number;
  totalStudents: number;
  totalInstructors: number;
  activeStudents7d: number;
  atRiskStudents: number;
  learningPlanCount: number;
  notifications7d: number;
  reactivatedStudents7d: number;
  reactivationRate7d: number;
  assignmentCoverageRate: number;
  unassignedStudents: number;
  instructors: OrganizationInstructorSummary[];
  atRiskStudentList: StudentSummary[];
  studentAssignments: StudentSummary[];
  assignmentEvents: AssignmentEvent[];
}

export enum InstructorWorkspaceView {
  OVERVIEW = 'OVERVIEW',
  STUDENTS = 'STUDENTS',
  WRITING = 'WRITING',
  WORKSHEETS = 'WORKSHEETS',
  CATALOG = 'CATALOG',
}

export enum BusinessAdminWorkspaceView {
  OVERVIEW = 'OVERVIEW',
  ASSIGNMENTS = 'ASSIGNMENTS',
  INSTRUCTORS = 'INSTRUCTORS',
  WRITING = 'WRITING',
  WORKSHEETS = 'WORKSHEETS',
  CATALOG = 'CATALOG',
}

export interface WorkspaceSectionDefinition<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  description?: string;
}

export type WorksheetQuestionMode = 'EN_TO_JA' | 'JA_TO_EN' | 'SPELLING_HINT';

export interface StudentWorksheetWord {
  wordId: string;
  bookId: string;
  bookTitle: string;
  word: string;
  definition: string;
  status: LearningHistory['status'];
  lastStudiedAt: number;
  attemptCount: number;
  correctCount: number;
}

export interface StudentWorksheetSnapshot {
  studentUid: string;
  studentName: string;
  organizationName?: string;
  words: StudentWorksheetWord[];
}

export enum WritingExamCategory {
  EIKEN = 'EIKEN',
  UNIV = 'UNIV',
}

export const WRITING_EXAM_CATEGORY_LABELS: Record<WritingExamCategory, string> = {
  [WritingExamCategory.EIKEN]: '英検',
  [WritingExamCategory.UNIV]: '大学入試',
};

export enum WritingAssignmentStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  SUBMITTED = 'SUBMITTED',
  REVIEW_READY = 'REVIEW_READY',
  RETURNED = 'RETURNED',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  COMPLETED = 'COMPLETED',
}

export const WRITING_ASSIGNMENT_STATUS_LABELS: Record<WritingAssignmentStatus, string> = {
  [WritingAssignmentStatus.DRAFT]: '下書き',
  [WritingAssignmentStatus.ISSUED]: '配布済み',
  [WritingAssignmentStatus.SUBMITTED]: '提出済み',
  [WritingAssignmentStatus.REVIEW_READY]: '添削待ち',
  [WritingAssignmentStatus.RETURNED]: '返却済み',
  [WritingAssignmentStatus.REVISION_REQUESTED]: '再提出待ち',
  [WritingAssignmentStatus.COMPLETED]: '完了',
};

export enum WritingSubmissionSource {
  STUDENT_MOBILE = 'STUDENT_MOBILE',
  STAFF_SCANNER = 'STAFF_SCANNER',
}

export const WRITING_SUBMISSION_SOURCE_LABELS: Record<WritingSubmissionSource, string> = {
  [WritingSubmissionSource.STUDENT_MOBILE]: '生徒スマホ',
  [WritingSubmissionSource.STAFF_SCANNER]: '校舎スキャナー',
};

export type WritingAiProvider = 'CLOUDFLARE' | 'GEMINI' | 'OPENAI';

export const WRITING_AI_PROVIDER_LABELS: Record<WritingAiProvider, string> = {
  CLOUDFLARE: 'Cloudflare',
  GEMINI: 'Gemini',
  OPENAI: 'OpenAI',
};

export type WritingRubricKey = 'task' | 'organization' | 'vocabulary' | 'grammar';

export const WRITING_RUBRIC_LABELS: Record<WritingRubricKey, string> = {
  task: '課題達成',
  organization: '構成',
  vocabulary: '語彙',
  grammar: '文法',
};

export interface WritingPromptTemplate {
  id: string;
  examCategory: WritingExamCategory;
  templateType: string;
  title: string;
  promptBase: string;
  guidance: string;
  defaultWordCountMin: number;
  defaultWordCountMax: number;
  sampleTopic?: string;
  tags: string[];
}

export interface WritingPromptSnapshot {
  templateId?: string;
  examCategory: WritingExamCategory;
  templateType: string;
  title: string;
  promptText: string;
  guidance: string;
  wordCountMin: number;
  wordCountMax: number;
  submissionCode: string;
  markerValue: string;
}

export interface WritingRubricScore {
  key: WritingRubricKey;
  label: string;
  score: number;
  maxScore: number;
  comment: string;
}

export interface WritingSentenceCorrection {
  before: string;
  after: string;
  reason: string;
}

export interface WritingSubmissionAsset {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  assetOrder: number;
  assetUrl: string;
}

export interface WritingEvaluation {
  id: string;
  provider: WritingAiProvider;
  overallScore: number;
  rubric: WritingRubricScore[];
  strengths: string[];
  improvementPoints: string[];
  sentenceCorrections: WritingSentenceCorrection[];
  correctedDraft: string;
  modelAnswer: string;
  confidence: number;
  transcriptAlignment: number;
  rubricConsistency: number;
  structureScore: number;
  selectionScore: number;
  costMilliYen: number;
  latencyMs: number;
  isDefault: boolean;
}

export interface WritingTeacherReview {
  id: string;
  submissionId: string;
  reviewerUid: string;
  reviewerName: string;
  selectedEvaluationId: string;
  publicComment: string;
  privateMemo?: string;
  reviewDecision: 'APPROVED_RETURN' | 'REVISION_REQUESTED' | 'COMPLETED';
  createdAt: number;
  updatedAt: number;
  releasedAt?: number;
}

export interface WritingSubmission {
  id: string;
  assignmentId: string;
  attemptNo: number;
  submissionSource: WritingSubmissionSource;
  submittedByUid: string;
  transcript: string;
  transcriptConfidence: number;
  ocrProvider?: WritingAiProvider;
  processingState: 'UPLOADED' | 'OCR_DONE' | 'EVALUATED';
  submittedAt: number;
  assets: WritingSubmissionAsset[];
  evaluations: WritingEvaluation[];
  selectedEvaluationId?: string;
  teacherReview?: WritingTeacherReview;
}

export interface WritingAssignment {
  id: string;
  organizationName: string;
  instructorUid: string;
  instructorName: string;
  studentUid: string;
  studentName: string;
  examCategory: WritingExamCategory;
  templateId?: string;
  templateType: string;
  promptTitle: string;
  promptText: string;
  guidance: string;
  wordCountMin: number;
  wordCountMax: number;
  submissionCode: string;
  status: WritingAssignmentStatus;
  attemptCount: number;
  maxAttempts: number;
  createdAt: number;
  issuedAt?: number;
  updatedAt: number;
  lastSubmittedAt?: number;
  lastReturnedAt?: number;
  latestSubmissionId?: string;
  latestSubmission?: WritingSubmission;
}

export interface WritingQueueItem {
  assignmentId: string;
  submissionId: string;
  studentUid: string;
  studentName: string;
  examCategory: WritingExamCategory;
  promptTitle: string;
  status: WritingAssignmentStatus;
  attemptNo: number;
  submittedAt: number;
  transcriptConfidence: number;
  recommendedProvider?: WritingAiProvider;
  instructorName: string;
}

export interface AdminDashboardSnapshot {
  overview: AdminOverviewStats;
  planBreakdown: AdminPlanBreakdownItem[];
  riskBreakdown: AdminRiskBreakdownItem[];
  trend: AdminTrendPoint[];
  topBooks: AdminBookInsight[];
  aiActions: AdminAiActionSummary[];
  recentNotifications: InstructorNotification[];
  recentReports: AdminWordReportSummary[];
  organizations: AdminOrganizationInsight[];
  atRiskStudents: StudentSummary[];
}
