export type AiGeneratedContentKind = 'EXAMPLE_SENTENCE' | 'GRAMMAR_PROBLEM';

export type AiGeneratedContentQualityStatus = 'READY' | 'NEEDS_REVIEW' | 'REJECTED';

export type AssessmentItemReviewStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED';

export type ReusableAiProblemReviewBucket = 'APPROVED' | 'LEGACY_READY' | 'BLOCKED';

export type LearnerAiQuestionQualityStatus =
  | 'APPROVED_REUSE'
  | 'LIVE_DRAFT_REVIEW_REQUIRED'
  | 'CURATED_STATIC';

export type ReusableAiProblemReviewReason =
  | 'APPROVED_FOR_REUSE'
  | 'LEGACY_READY_REQUIRES_REVIEW'
  | 'CONTENT_NEEDS_REVIEW'
  | 'CONTENT_REJECTED'
  | 'ASSESSMENT_PENDING'
  | 'ASSESSMENT_NEEDS_REVIEW'
  | 'ASSESSMENT_REJECTED';

export const DEFAULT_AI_GENERATED_PROBLEM_QUALITY_STATUS: AiGeneratedContentQualityStatus = 'NEEDS_REVIEW';

export const DEFAULT_ASSESSMENT_ITEM_REVIEW_STATUS: AssessmentItemReviewStatus = 'PENDING';

export interface LearnerAiQuestionQualityState {
  status: LearnerAiQuestionQualityStatus;
  labelJa: string;
  messageJa: string;
  tone: 'approved' | 'pending' | 'curated';
  isLearnerApproved: boolean;
  isReusable: boolean;
}

export const LEARNER_AI_QUESTION_QUALITY_STATES: Record<LearnerAiQuestionQualityStatus, LearnerAiQuestionQualityState> = {
  APPROVED_REUSE: {
    status: 'APPROVED_REUSE',
    labelJa: 'レビュー済み問題',
    messageJa: '内容確認済みの生成問題です。',
    tone: 'approved',
    isLearnerApproved: true,
    isReusable: true,
  },
  LIVE_DRAFT_REVIEW_REQUIRED: {
    status: 'LIVE_DRAFT_REVIEW_REQUIRED',
    labelJa: '確認待ち',
    messageJa: 'この生成問題は再利用前に確認されます。',
    tone: 'pending',
    isLearnerApproved: false,
    isReusable: false,
  },
  CURATED_STATIC: {
    status: 'CURATED_STATIC',
    labelJa: '教材問題',
    messageJa: '教材データから作成した問題です。',
    tone: 'curated',
    isLearnerApproved: true,
    isReusable: true,
  },
};

export const getLearnerAiQuestionQualityState = (
  status: LearnerAiQuestionQualityStatus,
): LearnerAiQuestionQualityState => ({
  ...LEARNER_AI_QUESTION_QUALITY_STATES[status],
});

export interface AiProblemReviewStateInput {
  contentQualityStatus: AiGeneratedContentQualityStatus | null;
  assessmentReviewStatus?: AssessmentItemReviewStatus | null;
  hasAssessmentMetadata: boolean;
}

export interface ReusableAiProblemReviewDecision {
  bucket: ReusableAiProblemReviewBucket;
  isReusable: boolean;
  reason: ReusableAiProblemReviewReason;
  labelJa: string;
  operatorMessageJa: string;
}

export interface AiCacheKeyInput {
  contentKind: AiGeneratedContentKind;
  model: string;
  promptVersion: string;
  wordId?: string | null;
  questionMode?: string | null;
  grammarScopeId?: string | null;
  sourceText: string;
}

export interface CbtState {
  level: number;
  confidence: number;
  attemptCount: number;
  correctCount: number;
}

export interface CbtObservation {
  correct: boolean;
  difficultyLevel?: number | null;
}

export interface CbtDifficultyBand {
  minDifficultyLevel: number;
  maxDifficultyLevel: number;
}

export const classifyReusableAiProblemReviewState = (
  input: AiProblemReviewStateInput,
): ReusableAiProblemReviewBucket => {
  return describeReusableAiProblemReviewState(input).bucket;
};

export const isReusableAiProblemReviewState = (input: AiProblemReviewStateInput): boolean => (
  describeReusableAiProblemReviewState(input).isReusable
);

export const describeReusableAiProblemReviewState = (
  input: AiProblemReviewStateInput,
): ReusableAiProblemReviewDecision => {
  if (input.contentQualityStatus === 'REJECTED') {
    return {
      bucket: 'BLOCKED',
      isReusable: false,
      reason: 'CONTENT_REJECTED',
      labelJa: '再利用停止',
      operatorMessageJa: 'AI生成内容が却下済みです。学習者には再利用しません。',
    };
  }

  if (input.contentQualityStatus !== 'READY') {
    return {
      bucket: 'BLOCKED',
      isReusable: false,
      reason: 'CONTENT_NEEDS_REVIEW',
      labelJa: '内容レビュー待ち',
      operatorMessageJa: 'AI生成内容の品質レビューが未完了です。承認まで再利用しません。',
    };
  }

  if (input.assessmentReviewStatus === 'APPROVED') {
    return {
      bucket: 'APPROVED',
      isReusable: true,
      reason: 'APPROVED_FOR_REUSE',
      labelJa: '再利用可',
      operatorMessageJa: '内容レビューと assessment item metadata の承認が完了しています。',
    };
  }

  if (!input.hasAssessmentMetadata) {
    return {
      bucket: 'LEGACY_READY',
      isReusable: false,
      reason: 'LEGACY_READY_REQUIRES_REVIEW',
      labelJa: '旧READY確認待ち',
      operatorMessageJa: '旧形式のREADY問題です。metadata 承認を作るまで新規出題には再利用しません。',
    };
  }

  if (input.assessmentReviewStatus === 'REJECTED') {
    return {
      bucket: 'BLOCKED',
      isReusable: false,
      reason: 'ASSESSMENT_REJECTED',
      labelJa: '問題レビュー却下',
      operatorMessageJa: 'assessment item metadata が却下済みです。学習者には再利用しません。',
    };
  }

  if (input.assessmentReviewStatus === 'NEEDS_REVIEW') {
    return {
      bucket: 'BLOCKED',
      isReusable: false,
      reason: 'ASSESSMENT_NEEDS_REVIEW',
      labelJa: '問題レビュー要確認',
      operatorMessageJa: 'assessment item metadata が要確認です。承認まで再利用しません。',
    };
  }

  return {
    bucket: 'BLOCKED',
    isReusable: false,
    reason: 'ASSESSMENT_PENDING',
    labelJa: '問題レビュー待ち',
    operatorMessageJa: 'assessment item metadata のレビューが未完了です。承認まで再利用しません。',
  };
};

export const clampCbtLevel = (value: number): number => {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
};

export const normalizeAiCacheText = (value: string): string => (
  value
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
);

export const stableContentHash = (value: string): string => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

export const createAiCacheKey = (input: AiCacheKeyInput): { cacheKey: string; sourceHash: string } => {
  const sourceHash = stableContentHash(normalizeAiCacheText(input.sourceText));
  const segments = [
    input.contentKind,
    input.model.trim() || 'unknown-model',
    input.promptVersion.trim() || 'v0',
    input.wordId || 'any-word',
    input.questionMode || 'any-mode',
    input.grammarScopeId || 'any-scope',
    sourceHash,
  ];
  return {
    cacheKey: segments.map((segment) => encodeURIComponent(segment)).join(':'),
    sourceHash,
  };
};

export const getInitialCbtState = (level = 0.5): CbtState => ({
  level: clampCbtLevel(level),
  confidence: 0,
  attemptCount: 0,
  correctCount: 0,
});

export const advanceCbtState = (
  previous: CbtState | null | undefined,
  observation: CbtObservation,
): CbtState => {
  const current = previous || getInitialCbtState();
  const difficulty = clampCbtLevel(observation.difficultyLevel ?? 0.5);
  const expectedCorrect = 1 / (1 + (10 ** ((difficulty - current.level) * 2)));
  const learningRate = Math.max(0.05, 0.2 * (1 - Math.min(0.75, current.confidence * 0.5)));
  const outcome = observation.correct ? 1 : 0;
  const nextAttempts = current.attemptCount + 1;
  const nextCorrect = current.correctCount + outcome;
  const nextLevel = clampCbtLevel(current.level + ((outcome - expectedCorrect) * learningRate));

  return {
    level: nextLevel,
    confidence: clampCbtLevel(1 - (1 / Math.sqrt(nextAttempts + 1))),
    attemptCount: nextAttempts,
    correctCount: nextCorrect,
  };
};

export const inferProblemDifficultyFromStats = (exposureCount: number, correctCount: number): number => {
  if (exposureCount <= 0) return 0.5;
  const correctRate = correctCount / exposureCount;
  return clampCbtLevel(1 - correctRate);
};

export const selectCbtDifficultyBand = (
  state: CbtState | null | undefined,
  width = 0.22,
): CbtDifficultyBand => {
  const level = clampCbtLevel(state?.level ?? 0.5);
  const confidence = clampCbtLevel(state?.confidence ?? 0);
  const adaptiveWidth = Math.max(0.14, width - (confidence * 0.08));
  return {
    minDifficultyLevel: clampCbtLevel(level - adaptiveWidth),
    maxDifficultyLevel: clampCbtLevel(level + adaptiveWidth),
  };
};
