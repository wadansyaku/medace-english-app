export type AiGeneratedContentKind = 'EXAMPLE_SENTENCE' | 'GRAMMAR_PROBLEM';

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
