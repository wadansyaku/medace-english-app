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

export interface WritingAiExecutionProvenance {
  mode: 'fixture' | 'live' | 'hybrid-fallback';
  provider: WritingAiProvider;
  requestedProvider?: WritingAiProvider;
  fallbackReason?: string;
  model?: string;
  notes?: string;
}

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
  provenance?: WritingAiExecutionProvenance;
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
  ocrMeta?: WritingAiExecutionProvenance;
  processingState: 'UPLOADED' | 'OCR_DONE' | 'EVALUATED';
  submittedAt: number;
  assets: WritingSubmissionAsset[];
  evaluations: WritingEvaluation[];
  selectedEvaluationId?: string;
  teacherReview?: WritingTeacherReview;
}

export interface WritingAssignment {
  id: string;
  organizationId: string;
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
