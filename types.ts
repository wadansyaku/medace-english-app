
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

export enum CommercialWorkspaceRole {
  STUDENT = 'STUDENT',
  INSTRUCTOR = 'INSTRUCTOR',
  GROUP_ADMIN = 'GROUP_ADMIN',
}

export const COMMERCIAL_WORKSPACE_ROLE_LABELS: Record<CommercialWorkspaceRole, string> = {
  [CommercialWorkspaceRole.STUDENT]: '生徒',
  [CommercialWorkspaceRole.INSTRUCTOR]: '講師',
  [CommercialWorkspaceRole.GROUP_ADMIN]: '学校管理者',
};

export enum TeachingFormat {
  ONLINE = 'ONLINE',
  HYBRID = 'HYBRID',
  IN_PERSON = 'IN_PERSON',
}

export const TEACHING_FORMAT_LABELS: Record<TeachingFormat, string> = {
  [TeachingFormat.ONLINE]: 'オンライン中心',
  [TeachingFormat.HYBRID]: 'オンライン+対面',
  [TeachingFormat.IN_PERSON]: '対面中心',
};

export enum CommercialRequestKind {
  PERSONAL_UPGRADE = 'PERSONAL_UPGRADE',
  BUSINESS_TRIAL = 'BUSINESS_TRIAL',
  BUSINESS_ROLE_CONVERSION = 'BUSINESS_ROLE_CONVERSION',
}

export const COMMERCIAL_REQUEST_KIND_LABELS: Record<CommercialRequestKind, string> = {
  [CommercialRequestKind.PERSONAL_UPGRADE]: 'パーソナルプラン相談',
  [CommercialRequestKind.BUSINESS_TRIAL]: '学校・教室向け導入相談',
  [CommercialRequestKind.BUSINESS_ROLE_CONVERSION]: 'ビジネスアカウント切替相談',
};

export enum CommercialRequestStatus {
  OPEN = 'OPEN',
  CONTACTED = 'CONTACTED',
  APPROVED = 'APPROVED',
  PROVISIONED = 'PROVISIONED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}

export const COMMERCIAL_REQUEST_STATUS_LABELS: Record<CommercialRequestStatus, string> = {
  [CommercialRequestStatus.OPEN]: '受付済み',
  [CommercialRequestStatus.CONTACTED]: '連絡済み',
  [CommercialRequestStatus.APPROVED]: '承認済み',
  [CommercialRequestStatus.PROVISIONED]: '反映済み',
  [CommercialRequestStatus.DECLINED]: '見送り',
  [CommercialRequestStatus.CANCELLED]: '取消',
};

export enum AnnouncementSeverity {
  INFO = 'INFO',
  UPDATE = 'UPDATE',
  MAJOR = 'MAJOR',
  CRITICAL = 'CRITICAL',
}

export const ANNOUNCEMENT_SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
  [AnnouncementSeverity.INFO]: 'お知らせ',
  [AnnouncementSeverity.UPDATE]: 'アップデート',
  [AnnouncementSeverity.MAJOR]: '重要アップデート',
  [AnnouncementSeverity.CRITICAL]: '重要なお知らせ',
};

export enum AnnouncementAudienceRole {
  STUDENT = 'STUDENT',
  INSTRUCTOR = 'INSTRUCTOR',
  GROUP_ADMIN = 'GROUP_ADMIN',
  ADMIN = 'ADMIN',
}

export const ANNOUNCEMENT_AUDIENCE_ROLE_LABELS: Record<AnnouncementAudienceRole, string> = {
  [AnnouncementAudienceRole.STUDENT]: '生徒',
  [AnnouncementAudienceRole.INSTRUCTOR]: '講師',
  [AnnouncementAudienceRole.GROUP_ADMIN]: '学校管理者',
  [AnnouncementAudienceRole.ADMIN]: 'サービス管理者',
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

export enum WordHintAssetType {
  EXAMPLE = 'EXAMPLE',
  IMAGE = 'IMAGE',
}

export enum GeneratedAssetAuditStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  FAILED = 'FAILED',
}

export type AiGeneratedContentQualityStatus = 'READY' | 'NEEDS_REVIEW' | 'REJECTED';

export type AiGeneratedProblemReviewStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED';

export type AiGeneratedProblemReviewDecision = 'APPROVE' | 'REJECT' | 'NEEDS_REVIEW';

export type AiGeneratedProblemReviewQueueStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

export type AiGeneratedProblemReusableBucket = 'APPROVED' | 'LEGACY_READY' | 'BLOCKED';

export interface AiGeneratedProblemReviewQueueItem {
  problemId: string;
  contentId: string;
  wordId: string;
  bookId: string;
  bookTitle: string;
  word: string;
  definition: string;
  questionMode: WorksheetQuestionMode;
  grammarScopeId: GrammarCurriculumScopeId | null;
  promptText: string;
  answerText: string;
  options: string[];
  orderedTokens: string[];
  sourceSentence: string | null;
  sourceTranslation: string | null;
  grammarFocus: string | null;
  difficultyLevel: number;
  contentQualityStatus: AiGeneratedContentQualityStatus;
  reviewStatus: AiGeneratedProblemReviewStatus;
  calibrationStatus: string;
  constructId: string;
  skillArea: string;
  itemFormat: string;
  cefrTarget: string | null;
  usageCount: number;
  lastUsedAt: number | null;
  sampleSize: number;
  exposureRate: number;
  version: number;
  isActive: boolean;
  hasAssessmentMetadata: boolean;
  isLegacyReady: boolean;
  reusableBucket: AiGeneratedProblemReusableBucket;
  isReusable: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AiGeneratedProblemReviewQueueResponse {
  items: AiGeneratedProblemReviewQueueItem[];
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

export type GrammarCurriculumScopeId =
  | 'basic-svo'
  | 'be-verb'
  | 'basic-tense'
  | 'progressive-aspect'
  | 'modal-base-verb'
  | 'time-preposition-phrase'
  | 'to-infinitive'
  | 'gerund'
  | 'participle-modifier'
  | 'comparative'
  | 'pronoun-reference'
  | 'when-while-clause'
  | 'passive-voice'
  | 'present-perfect'
  | 'relative-clause'
  | 'first-conditional'
  | 'subjunctive-mood'
  | 'subject-verb-agreement'
  | 'interrogative-word-order'
  | 'negation-emphasis'
  | 'reported-speech'
  | 'verb-patterns'
  | 'adjective-adverb-usage'
  | 'noun-usage'
  | 'idiomatic-expression'
  | 'conversation-expression';

export type GrammarCurriculumCategory =
  | 'sentence-pattern'
  | 'verb-form'
  | 'phrase'
  | 'clause'
  | 'comparison';

export type GrammarCurriculumGroupId =
  | 'sentence-basics'
  | 'verb-system'
  | 'verbals-and-modifiers'
  | 'clauses-and-connectors'
  | 'nominals-and-function-words'
  | 'syntax-control'
  | 'usage-and-expression';

export type GrammarCurriculumCategoryId =
  | 'sentence-patterns'
  | 'tense'
  | 'voice'
  | 'modals'
  | 'subjunctive'
  | 'infinitive'
  | 'gerund'
  | 'participle'
  | 'comparison'
  | 'pronouns'
  | 'relatives'
  | 'conjunctions'
  | 'prepositions'
  | 'agreement'
  | 'questions-and-word-order'
  | 'negation-ellipsis-emphasis'
  | 'sequence-and-speech'
  | 'verb-usage'
  | 'adjective-adverb-usage'
  | 'noun-usage'
  | 'idioms'
  | 'conversation';

export type GrammarScopeSelectionSource = 'EXPLICIT' | 'INFERRED' | 'FALLBACK';

export interface GrammarCurriculumScope {
  id: GrammarCurriculumScopeId;
  category: GrammarCurriculumCategory;
  groupId: GrammarCurriculumGroupId;
  groupLabelJa: string;
  curriculumCategoryId: GrammarCurriculumCategoryId;
  curriculumCategoryLabelJa: string;
  cefrLevel: EnglishLevel;
  levelMin: EnglishLevel;
  levelMax: EnglishLevel;
  labelJa: string;
  labelEn: string;
  descriptionJa: string;
  patternJa: string;
  examFocusJa: string;
  commonMistakeJa: string;
  automationDrillJa: string;
  threeSlotFrameJa?: string;
  targetQuestionModes: WorksheetQuestionMode[];
}

export interface GrammarScopeSelection {
  scopeId: GrammarCurriculumScopeId;
  cefrLevel: EnglishLevel;
  levelMin?: EnglishLevel;
  levelMax?: EnglishLevel;
  groupId?: GrammarCurriculumGroupId;
  groupLabelJa?: string;
  curriculumCategoryId?: GrammarCurriculumCategoryId;
  curriculumCategoryLabelJa?: string;
  labelJa: string;
  isExplicitScope: boolean;
  isScopeLocked?: boolean;
  source: GrammarScopeSelectionSource;
}

export interface GrammarScopeExplanation {
  scopeId: GrammarCurriculumScopeId;
  labelJa: string;
  cefrLevel: EnglishLevel;
  levelMin?: EnglishLevel;
  levelMax?: EnglishLevel;
  groupLabelJa?: string;
  curriculumCategoryLabelJa?: string;
  patternJa: string;
  examFocusJa: string;
  commonMistakeJa: string;
  automationDrillJa: string;
  threeSlotFrameJa?: string;
}

export type TranslationExamTarget =
  | 'HIGH_SCHOOL_ENTRANCE'
  | 'UNIVERSITY_ENTRANCE'
  | 'GENERAL';

export interface TranslationFeedbackCriterion {
  label: string;
  score: number;
  maxScore: number;
  comment: string;
}

export interface JapaneseTranslationFeedback {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  verdictLabel: string;
  examTarget: TranslationExamTarget;
  sourceSentence?: string;
  expectedTranslation?: string;
  userTranslation?: string;
  summaryJa: string;
  strengths: string[];
  issues: string[];
  improvedTranslation: string;
  grammarAdviceJa: string;
  nextDrillJa: string;
  criteria: TranslationFeedbackCriterion[];
  usedAi?: boolean;
}

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
  organizationId?: string;
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
  category?: string;
  subcategory?: string;
  section?: string;
  sourceSheet?: string;
  sourceEntryId?: number;
  exampleSentence?: string | null;
  exampleMeaning?: string | null;
  exampleGeneratedAt?: number | null;
  exampleImageUrl?: string | null;
  exampleImageGeneratedAt?: number | null;
  exampleAuditStatus?: GeneratedAssetAuditStatus | null;
  exampleImageAuditStatus?: GeneratedAssetAuditStatus | null;
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
  // `STUDY` drives mastery-facing features. `QUIZ` contributes only to engagement analytics.
  interactionSource?: LearningInteractionSource;
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

export enum RetentionContinuityBand {
  LOW = 'LOW',
  BUILDING = 'BUILDING',
  STEADY = 'STEADY',
}

export const RETENTION_CONTINUITY_BAND_LABELS: Record<RetentionContinuityBand, string> = {
  [RetentionContinuityBand.LOW]: '0-1日',
  [RetentionContinuityBand.BUILDING]: '2-3日',
  [RetentionContinuityBand.STEADY]: '4日以上',
};

export enum InterventionKind {
  REVIEW_RESTART = 'REVIEW_RESTART',
  PLAN_NUDGE = 'PLAN_NUDGE',
  PRAISE = 'PRAISE',
  MANUAL_OTHER = 'MANUAL_OTHER',
}

export const INTERVENTION_KIND_LABELS: Record<InterventionKind, string> = {
  [InterventionKind.REVIEW_RESTART]: '復習再開',
  [InterventionKind.PLAN_NUDGE]: 'プラン確認',
  [InterventionKind.PRAISE]: '称賛',
  [InterventionKind.MANUAL_OTHER]: 'その他',
};

export enum InterventionOutcome {
  PENDING = 'PENDING',
  REACTIVATED = 'REACTIVATED',
  EXPIRED = 'EXPIRED',
}

export const INTERVENTION_OUTCOME_LABELS: Record<InterventionOutcome, string> = {
  [InterventionOutcome.PENDING]: '再開待ち',
  [InterventionOutcome.REACTIVATED]: '再開済み',
  [InterventionOutcome.EXPIRED]: '失効',
};

export enum RecommendedActionType {
  START_REVIEW = 'START_REVIEW',
  OPEN_PLAN = 'OPEN_PLAN',
}

export const RECOMMENDED_ACTION_TYPE_LABELS: Record<RecommendedActionType, string> = {
  [RecommendedActionType.START_REVIEW]: '復習を10語始める',
  [RecommendedActionType.OPEN_PLAN]: '今日のプランに戻る',
};

export enum WeaknessDimension {
  MEANING_RECALL = 'MEANING_RECALL',
  MEANING_RECOGNITION = 'MEANING_RECOGNITION',
  SPELLING_RECALL = 'SPELLING_RECALL',
  GRAMMAR_APPLICATION = 'GRAMMAR_APPLICATION',
  WORD_ORDER = 'WORD_ORDER',
  TRANSLATION_ORDER = 'TRANSLATION_ORDER',
  RETENTION_STABILITY = 'RETENTION_STABILITY',
  ADVANCED_BAND_CONFIDENCE = 'ADVANCED_BAND_CONFIDENCE',
}

export const WEAKNESS_DIMENSION_LABELS: Record<WeaknessDimension, string> = {
  [WeaknessDimension.MEANING_RECALL]: '意味から英語を思い出す力',
  [WeaknessDimension.MEANING_RECOGNITION]: '英語を見て意味を取る力',
  [WeaknessDimension.SPELLING_RECALL]: 'スペリング想起',
  [WeaknessDimension.GRAMMAR_APPLICATION]: '単語を文法の中で使う力',
  [WeaknessDimension.WORD_ORDER]: '英文の語順を組み立てる力',
  [WeaknessDimension.TRANSLATION_ORDER]: '英文から日本語を組み立てる力',
  [WeaknessDimension.RETENTION_STABILITY]: '復習の定着安定度',
  [WeaknessDimension.ADVANCED_BAND_CONFIDENCE]: '今の難度帯への自信',
};

export enum WeaknessSignalLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}

export const WEAKNESS_SIGNAL_LEVEL_LABELS: Record<WeaknessSignalLevel, string> = {
  [WeaknessSignalLevel.HIGH]: '要対策',
  [WeaknessSignalLevel.MEDIUM]: '調整中',
  [WeaknessSignalLevel.LOW]: '安定',
  [WeaknessSignalLevel.INSUFFICIENT_DATA]: 'データ不足',
};

export interface WeaknessSignalSummary {
  dimension: WeaknessDimension;
  level: WeaknessSignalLevel;
  score: number;
  sampleSize: number;
  reason: string;
  nextActionLabel: string;
  recommendedActionType: RecommendedActionType;
  targetQuestionModes: WorksheetQuestionMode[];
  targetBandIndex?: number;
  updatedAt: number;
}

export type TaskSelectionPolicy =
  | 'DUE_FIRST'
  | 'WEAKNESS_FOCUS'
  | 'BOOK_DEFAULT'
  | 'BOOK_REVIEW_ONLY'
  | 'BOOK_NEW_ONLY';

export type LearningTaskMode = 'study' | 'quiz';

export enum LearningTaskIntentType {
  TODAY_FOCUS = 'TODAY_FOCUS',
  WEAKNESS_STUDY = 'WEAKNESS_STUDY',
  WEAKNESS_QUIZ = 'WEAKNESS_QUIZ',
  MISSION_REVIEW = 'MISSION_REVIEW',
  MISSION_NEW = 'MISSION_NEW',
  MISSION_QUIZ = 'MISSION_QUIZ',
  COACH_REVIEW = 'COACH_REVIEW',
  BOOK_STUDY = 'BOOK_STUDY',
  BOOK_QUIZ = 'BOOK_QUIZ',
}

export interface LearningTaskIntent {
  mode: LearningTaskMode;
  intentType: LearningTaskIntentType;
  label: string;
  selectionPolicy: TaskSelectionPolicy;
  limit: number;
  bookId?: string;
  missionAssignmentId?: string;
  targetQuestionModes?: WorksheetQuestionMode[];
  targetBandIndex?: number;
  autoStart?: boolean;
}

export interface StudentWeaknessProfile {
  signals: WeaknessSignalSummary[];
  topWeaknesses: WeaknessSignalSummary[];
  updatedAt: number;
  hasSufficientData: boolean;
}

export enum LearningTrack {
  EIKEN_PRE2 = 'EIKEN_PRE2',
  EIKEN_2 = 'EIKEN_2',
  COMMON_TEST = 'COMMON_TEST',
  SCHOOL_TERM = 'SCHOOL_TERM',
}

export const LEARNING_TRACK_LABELS: Record<LearningTrack, string> = {
  [LearningTrack.EIKEN_PRE2]: '英検準2級',
  [LearningTrack.EIKEN_2]: '英検2級',
  [LearningTrack.COMMON_TEST]: '共通テスト',
  [LearningTrack.SCHOOL_TERM]: '学校定期対策',
};

export enum WeeklyMissionStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  OVERDUE = 'OVERDUE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export const WEEKLY_MISSION_STATUS_LABELS: Record<WeeklyMissionStatus, string> = {
  [WeeklyMissionStatus.ASSIGNED]: '未着手',
  [WeeklyMissionStatus.IN_PROGRESS]: '進行中',
  [WeeklyMissionStatus.OVERDUE]: '期限超過',
  [WeeklyMissionStatus.COMPLETED]: '完了',
  [WeeklyMissionStatus.ARCHIVED]: '終了',
};

export enum MissionNextActionType {
  OPEN_STUDY = 'OPEN_STUDY',
  OPEN_QUIZ = 'OPEN_QUIZ',
  OPEN_WRITING = 'OPEN_WRITING',
  OPEN_PLAN = 'OPEN_PLAN',
}

export enum MissionProgressEventType {
  OPENED = 'OPENED',
  MANUAL_COMPLETE = 'MANUAL_COMPLETE',
}

export interface MissionProgressSummary {
  startedAt?: number;
  restartedAt?: number;
  lastActivityAt?: number;
  completedAt?: number;
  newWordsCompleted: number;
  newWordsTarget: number;
  reviewWordsCompleted: number;
  reviewWordsTarget: number;
  quizCompletedCount: number;
  quizTargetCount: number;
  writingCompleted: boolean;
  writingRequired: boolean;
  completionRate: number;
  overdue: boolean;
  status: WeeklyMissionStatus;
  nextActionType: MissionNextActionType;
  nextActionLabel: string;
  blockers: string[];
}

export interface WeeklyMission {
  id: string;
  organizationId?: string;
  createdByUid: string;
  learningTrack: LearningTrack;
  title: string;
  rationale: string;
  bookId?: string;
  bookTitle?: string;
  newWordsTarget: number;
  reviewWordsTarget: number;
  quizTargetCount: number;
  writingAssignmentId?: string;
  writingPromptTitle?: string;
  dueAt: number;
  status: WeeklyMissionStatus;
  isSuggested?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MissionAssignment {
  id: string;
  missionId: string;
  studentUid: string;
  studentName: string;
  assignedByUid: string;
  assignedByName?: string;
  assignedAt: number;
  progress: MissionProgressSummary;
  mission: WeeklyMission;
}

export interface WeeklyMissionBoard {
  assignments: MissionAssignment[];
}

export interface PrimaryMissionSnapshot extends MissionProgressSummary {
  assignmentId?: string;
  missionId?: string;
  track: LearningTrack;
  title: string;
  rationale: string;
  dueAt: number;
  dueDate: string;
  sourceBookId?: string;
  sourceBookTitle?: string;
  writingAssignmentId?: string;
  writingPromptTitle?: string;
  isSuggested: boolean;
  nextTaskIntent?: LearningTaskIntent;
}

export interface MissionTrackCompletionSummary {
  track: LearningTrack;
  assignedCount: number;
  completedCount: number;
  overdueCount: number;
  completionRate: number;
}

export interface MissionTrackWritingReturnSummary {
  track: LearningTrack;
  assignedCount: number;
  returnedCount: number;
  returnRate: number;
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
  cohortId?: string;
  cohortName?: string;
  lastNotificationAt?: number;
  lastNotificationMessage?: string;
  assignedInstructorUid?: string;
  assignedInstructorName?: string;
  assignmentUpdatedAt?: number;
  hasLearningPlan?: boolean;
  hasReactivatedSinceNotification?: boolean;
  lastReactivatedAt?: number;
  activeStudyDays7d?: number;
  continuityBand?: RetentionContinuityBand;
  latestInterventionAt?: number;
  latestInterventionKind?: InterventionKind;
  latestInterventionOutcome?: InterventionOutcome;
  latestRecommendedActionType?: RecommendedActionType;
  needsFollowUpNow?: boolean;
  primaryMissionStatus?: WeeklyMissionStatus;
  primaryMissionTrack?: LearningTrack;
  primaryMissionTitle?: string;
  primaryMissionCompletionRate?: number;
  missionDueAt?: number;
  missionOverdue?: boolean;
  missionLastActivityAt?: number;
  topWeaknesses?: WeaknessSignalSummary[];
  weaknessProfileUpdatedAt?: number;
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

export interface LearningPlanBook {
  userId: string;
  bookId: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
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
  interventionKind: InterventionKind;
  recommendedActionType?: RecommendedActionType;
  interventionOutcome?: InterventionOutcome;
  createdAt: number;
}

export type ProductEventName =
  | 'student_dashboard_start_task'
  | 'study_session_started'
  | 'study_session_finished'
  | 'quiz_session_started'
  | 'spelling_check_started'
  | 'word_hint_example_cache_hit'
  | 'word_hint_example_generated'
  | 'word_hint_example_failed'
  | 'word_hint_image_cache_hit'
  | 'word_hint_image_generated'
  | 'word_hint_image_failed'
  | 'commercial_form_opened'
  | 'commercial_request_submitted'
  | 'group_admin_created_cohort'
  | 'group_admin_assigned_student'
  | 'group_admin_created_first_mission'
  | 'instructor_notification_sent'
  | 'writing_assignment_created'
  | 'writing_submission_received'
  | 'writing_review_completed';

export interface ProductEvent {
  id: number;
  eventName: ProductEventName;
  featureArea: string;
  userId?: string;
  organizationId?: string;
  subscriptionPlan?: SubscriptionPlan;
  userRole?: UserRole;
  subjectType?: string;
  subjectId?: string;
  status?: string;
  usedAi: boolean;
  estimatedCostMilliYen: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface ProductKpiDailySnapshot {
  dateKey: string;
  totalUsers: number;
  activeStudents1d: number;
  activeStudents7d: number;
  activeStudents30d: number;
  totalOrganizations: number;
  activeOrganizations30d: number;
  studySessionsStarted30d: number;
  studySessionsFinished30d: number;
  quizSessionsStarted30d: number;
  spellingChecksStarted30d: number;
  commercialFormOpenCount30d: number;
  commercialRequestCount30d: number;
  organizationsWithCohortCount: number;
  organizationsWithAssignmentCount: number;
  organizationsWithMissionCount: number;
  organizationsWithNotificationCount: number;
  writingAssignmentsCreated30d: number;
  writingSubmissionsReceived30d: number;
  writingReviewsCompleted30d: number;
  generationCount30d: number;
  cacheHitCount30d: number;
  exampleGenerationCount30d: number;
  exampleCacheHitCount30d: number;
  imageGenerationCount30d: number;
  imageCacheHitCount30d: number;
  estimatedAiCostMilliYen30d: number;
  estimatedProviderAiCostMilliYen30d: number;
  estimatedAvoidedCostMilliYen30d: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiUsageSummary {
  monthKey: string;
  estimatedCostMilliYen: number;
  budgetMilliYen: number;
  remainingMilliYen: number;
  generationCount: number;
  cacheHitCount: number;
  cacheHitRatio: number;
  avoidedCostMilliYen: number;
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

export interface CommercialRequest {
  id: number;
  kind: CommercialRequestKind;
  status: CommercialRequestStatus;
  contactName: string;
  contactEmail: string;
  organizationName?: string;
  teachingFormat?: TeachingFormat;
  desiredStartTiming?: string;
  requestedWorkspaceRole?: CommercialWorkspaceRole;
  seatEstimate?: string;
  message: string;
  source: string;
  requestedByUid?: string;
  linkedUserUid?: string;
  targetSubscriptionPlan?: SubscriptionPlan;
  targetOrganizationId?: string;
  targetOrganizationName?: string;
  targetOrganizationRole?: OrganizationRole;
  resolutionNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AnnouncementReceipt {
  announcementId: string;
  userUid: string;
  seenAt?: number;
  acknowledgedAt?: number;
  updatedAt: number;
}

export interface ProductAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  subscriptionPlans: SubscriptionPlan[];
  audienceRoles: AnnouncementAudienceRole[];
  startsAt?: number;
  endsAt?: number;
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProductAnnouncementWithReceipt extends ProductAnnouncement {
  receipt?: AnnouncementReceipt;
}

export interface ProductAnnouncementFeed {
  announcements: ProductAnnouncementWithReceipt[];
  highestPriorityModal: ProductAnnouncementWithReceipt | null;
  stickyBanner: ProductAnnouncementWithReceipt | null;
  unreadCount: number;
}

export interface DashboardSnapshot {
  dueCount: number;
  officialBooks: BookMetadata[];
  myBooks: BookMetadata[];
  progressMap: Record<string, BookProgress>;
  learningPlan: LearningPlan | null;
  learningPreference: LearningPreference | null;
  primaryMission: PrimaryMissionSnapshot | null;
  weaknessProfile: StudentWeaknessProfile | null;
  leaderboard: LeaderboardEntry[];
  masteryDist: MasteryDistribution;
  activityLogs: ActivityLog[];
  motivationSnapshot: MotivationSnapshot;
  coachNotifications: InstructorNotification[];
  accountOverview: AccountOverview;
  commercialRequests: CommercialRequest[];
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

export interface OrganizationCohort {
  id: string;
  organizationId: string;
  name: string;
  studentCount: number;
  instructorCount: number;
  updatedAt: number;
}

export interface OrganizationInstructorCohortSummary {
  instructorUid: string;
  cohortIds: string[];
}

export interface OrganizationInstructorBacklogSummary {
  uid: string;
  displayName: string;
  email: string;
  organizationRole?: OrganizationRole;
  assignedStudentCount: number;
  immediateCount: number;
  waitingCount: number;
  reactivatedCount: number;
  backlogCount: number;
}

export interface OrganizationKpiTrendPoint {
  date: string;
  totalStudents: number;
  assignedStudents: number;
  planStudents: number;
  activeStudents: number;
  notifications: number;
  notifiedStudents: number;
  reactivatedStudents: number;
  students4PlusDaysActive: number;
  atRiskStudents: number;
  followedUpAtRiskStudents: number;
  assignmentCoverageRate: number;
  planCoverageRate: number;
  reactivationRate: number;
  weeklyContinuityRate: number;
  followUpCoverageRate48h: number;
}

export interface OrganizationMemberSummary {
  userUid: string;
  displayName: string;
  email: string;
  userRole: UserRole;
  organizationRole: OrganizationRole;
  subscriptionPlan: SubscriptionPlan;
  joinedAt: number;
  updatedAt: number;
}

export interface OrganizationAuditEvent {
  id: number;
  organizationId: string;
  actorUserId: string;
  actorDisplayName: string;
  actionType: string;
  targetType: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  createdAt: number;
}

export interface OrganizationSettingsSnapshot {
  organizationId: string;
  displayName: string;
  nameKey: string;
  subscriptionPlan: SubscriptionPlan;
  members: OrganizationMemberSummary[];
  cohorts: OrganizationCohort[];
  instructorCohorts: Record<string, string[]>;
  auditEvents: OrganizationAuditEvent[];
  updatedAt: number;
}

export type OrganizationActivationState =
  | 'CREATE_COHORT'
  | 'ASSIGN_STUDENTS'
  | 'CREATE_FIRST_MISSION'
  | 'SEND_FIRST_NOTIFICATION'
  | 'ISSUE_FIRST_WRITING_ASSIGNMENT'
  | 'ACTIVE';

export type OrganizationActivationStepId = Exclude<OrganizationActivationState, 'ACTIVE'>;

export type OrganizationActivationActionTargetKind =
  | 'ORGANIZATION_SETTINGS'
  | 'STUDENT_ASSIGNMENT'
  | 'MISSION_ASSIGNMENT'
  | 'INSTRUCTOR_NOTIFICATION'
  | 'WRITING_ASSIGNMENT'
  | 'WORKSHEET';

export interface OrganizationActivationActionTarget {
  kind: OrganizationActivationActionTargetKind;
  targetView: BusinessAdminWorkspaceView;
  organizationId: string;
  studentUid?: string;
  studentName?: string;
  instructorUid?: string;
  instructorName?: string;
  missionAssignmentId?: string;
  missionId?: string;
  missionTitle?: string;
  writingAssignmentId?: string;
}

export interface OrganizationActivationStep {
  id: OrganizationActivationStepId;
  label: string;
  description: string;
  done: boolean;
  target: OrganizationActivationActionTarget | null;
}

export type OrganizationActivationRunbookStageId =
  | 'cohort'
  | 'assignment'
  | 'mission'
  | 'notification'
  | 'worksheet'
  | 'writing'
  | 'review';

export type OrganizationActivationRunbookStageStatus = 'complete' | 'stalled' | 'pending';

export interface OrganizationActivationRunbookStage {
  id: OrganizationActivationRunbookStageId;
  label: string;
  detail: string;
  done: boolean;
  status: OrganizationActivationRunbookStageStatus;
  stalledReason: string | null;
  actionLabel: string;
  target: OrganizationActivationActionTarget | null;
  evidenceLabel: string;
}

export interface OrganizationActivationRunbookWorksheetSummary {
  historyBasedStudentCount: number;
  fallbackStudentCount: number;
  sourceLabel: string;
  hasOnlyFallback: boolean;
}

export interface OrganizationActivationRunbookSummary {
  stages: OrganizationActivationRunbookStage[];
  currentStage: OrganizationActivationRunbookStage | null;
  stalledStage: OrganizationActivationRunbookStage | null;
  completedStageCount: number;
  totalStageCount: number;
  progressPercent: number;
  worksheet: OrganizationActivationRunbookWorksheetSummary;
}

export type ClassroomActivationLifecycleStage =
  | 'cohort'
  | 'student'
  | 'instructor'
  | 'mission'
  | 'notification'
  | 'worksheet'
  | 'writing'
  | 'review';

export type ClassroomWorksheetSource = 'history' | 'catalog_fallback' | 'starter_fallback';

export type ClassroomWorksheetLifecycleStatus = 'printed' | 'issued' | 'collected' | 'scored';

export interface ClassroomWorksheetLifecycleEventResult {
  runId: string;
  eventId: string;
  worksheetEventId: string;
  worksheetSource: ClassroomWorksheetSource;
  lifecycleStatus: ClassroomWorksheetLifecycleStatus;
  occurredAt: number;
}

export interface OrganizationDashboardSnapshot {
  organizationId: string;
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
  weeklyContinuityRate: number;
  followUpCoverageRate48h: number;
  interventionBacklogCount: number;
  overdueMissionCount: number;
  missionStartedRate: number;
  overdueMissionRecoveryRate: number;
  assignmentCoverageRate: number;
  planCoverageRate: number;
  unassignedStudents: number;
  unassignedAtRiskCount: number;
  trackCompletion: MissionTrackCompletionSummary[];
  writingReturnRateByTrack: MissionTrackWritingReturnSummary[];
  instructors: OrganizationInstructorSummary[];
  instructorBacklog: OrganizationInstructorBacklogSummary[];
  atRiskStudentList: StudentSummary[];
  studentAssignments: StudentSummary[];
  assignmentEvents: AssignmentEvent[];
  trend: OrganizationKpiTrendPoint[];
  activationState: OrganizationActivationState;
  nextRequiredAction: OrganizationActivationState;
  nextRequiredActionLabel: string;
  nextRequiredActionDescription: string;
  activationSteps: OrganizationActivationStep[];
  nextRequiredActionTarget: OrganizationActivationActionTarget | null;
  activationRunbook?: OrganizationActivationRunbookSummary;
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
  SETTINGS = 'SETTINGS',
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

export type WorksheetQuestionMode =
  | 'EN_TO_JA'
  | 'JA_TO_EN'
  | 'SPELLING_HINT'
  | 'GRAMMAR_CLOZE'
  | 'EN_WORD_ORDER'
  | 'JA_TRANSLATION_ORDER'
  | 'JA_TRANSLATION_INPUT';

export type LearningInteractionSource = 'STUDY' | 'QUIZ';

export type QuizSelectionMode = 'FULL_RANDOM' | 'RANGE_RANDOM' | 'LEARNED_ONLY';

export interface QuizSessionConfig {
  selectionMode: QuizSelectionMode;
  questionMode: WorksheetQuestionMode;
  questionCount: 5 | 10 | 20;
  rangeStart: number;
  rangeEnd: number;
  grammarScopeId?: GrammarCurriculumScopeId;
  showGrammarScopeHint?: boolean;
}

export interface StudentWorksheetWord {
  wordId: string;
  bookId: string;
  bookTitle: string;
  word: string;
  definition: string;
  exampleSentence?: string | null;
  exampleMeaning?: string | null;
  status: LearningHistory['status'];
  lastStudiedAt: number;
  attemptCount: number;
  correctCount: number;
}

export interface StudentWorksheetSnapshot {
  studentUid: string;
  studentName: string;
  organizationName?: string;
  source?: ClassroomWorksheetSource;
  sourceLabel?: string;
  words: StudentWorksheetWord[];
}

export * from './domains/writing/types';

export interface AdminActivationFunnel {
  totalOrganizations: number;
  organizationsWithCohortCount: number;
  organizationsWithAssignmentCount: number;
  organizationsWithMissionCount: number;
  organizationsWithNotificationCount: number;
  writingAssignmentsCreated30d: number;
  writingSubmissionsReceived30d: number;
  writingReviewsCompleted30d: number;
  commercialFormOpenCount30d: number;
  commercialRequestCount30d: number;
}

export interface AdminAiEconomicsSummary {
  monthKey: string;
  generationCount: number;
  cacheHitCount: number;
  cacheHitRatio: number;
  exampleCacheHitRatio: number;
  imageCacheHitRatio: number;
  estimatedCostMilliYen: number;
  estimatedProviderCostMilliYen: number;
  avoidedCostMilliYen: number;
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
  productKpis: ProductKpiDailySnapshot;
  activationFunnel: AdminActivationFunnel;
  aiEconomics: AdminAiEconomicsSummary;
}
