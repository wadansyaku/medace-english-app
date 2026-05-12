import {
  EnglishLevel,
  type GrammarCurriculumScopeId,
  type JapaneseTranslationFeedback,
  type WorksheetQuestionMode,
} from '../types';
import { getReadingQuestionKindLabel, type ReadingQuestionKind } from './readingPractice';

export const ENGLISH_PRACTICE_LANE_IDS = ['grammar', 'translation', 'reading', 'writing'] as const;
export type EnglishPracticeLaneId = typeof ENGLISH_PRACTICE_LANE_IDS[number];
export type EnglishPracticeRouteLaneId = 'overview' | EnglishPracticeLaneId;

export type EnglishPracticeAttemptMode =
  | 'GRAMMAR_CLOZE'
  | 'EN_WORD_ORDER'
  | 'JA_TRANSLATION_INPUT'
  | 'JA_TRANSLATION_ORDER'
  | 'READING'
  | 'WRITING';
type EnglishPracticeCloudQuizQuestionMode = Extract<EnglishPracticeAttemptMode, WorksheetQuestionMode>;

export interface EnglishPracticeAttemptInput {
  lane: EnglishPracticeLaneId;
  mode: EnglishPracticeAttemptMode;
  correct: boolean;
  score?: number;
  maxScore?: number;
  occurredAt?: number;
  wordId?: string;
  bookId?: string;
  word?: string;
  scopeId?: GrammarCurriculumScopeId;
  scopeLabelJa?: string;
  level?: EnglishLevel;
  readingQuestionKind?: ReadingQuestionKind;
  responseTimeMs?: number;
}

export interface EnglishPracticeAttemptRecord extends EnglishPracticeAttemptInput {
  id: string;
  occurredAt: number;
}

export interface EnglishPracticeProgress {
  version: 1;
  userUid: string;
  updatedAt: number;
  attempts: EnglishPracticeAttemptRecord[];
}

export interface EnglishPracticeMetricSummary {
  total: number;
  correct: number;
  accuracy: number;
  scoreTotal: number;
  scoreMaxTotal: number;
  scoreRate: number;
  lastPracticedAt: number | null;
}

export interface EnglishPracticeWeakGrammarScope extends EnglishPracticeMetricSummary {
  scopeId: GrammarCurriculumScopeId;
  labelJa: string;
}

export interface EnglishPracticeWeakReadingKind extends EnglishPracticeMetricSummary {
  kind: ReadingQuestionKind;
  labelJa: string;
}

export interface EnglishPracticeRecommendation {
  lane: EnglishPracticeLaneId;
  labelJa: string;
  reasonJa: string;
  actionJa: string;
  scopeIds: GrammarCurriculumScopeId[];
  readingQuestionKinds: ReadingQuestionKind[];
}

export interface EnglishPracticeProgressSummary extends EnglishPracticeMetricSummary {
  laneSummaries: Record<EnglishPracticeLaneId, EnglishPracticeMetricSummary>;
  weakGrammarScopes: EnglishPracticeWeakGrammarScope[];
  weakReadingKinds: EnglishPracticeWeakReadingKind[];
  recentAttempts: EnglishPracticeAttemptRecord[];
  recommendation: EnglishPracticeRecommendation;
}

export interface EnglishPracticeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface EnglishPracticeCloudQuizAttempt {
  uid: string;
  wordId: string;
  bookId: string;
  correct: boolean;
  questionMode: WorksheetQuestionMode;
  responseTimeMs: number;
  grammarScopeId?: GrammarCurriculumScopeId;
  translationFeedback?: JapaneseTranslationFeedback;
}

const VERSION = 1 as const;
const MAX_ATTEMPTS = 160;
const STORAGE_PREFIX = 'medace:english-practice-progress:';
export const ENGLISH_PRACTICE_SAMPLE_BOOK_ID = 'english-practice';

const LANE_LABELS: Record<EnglishPracticeLaneId, string> = {
  grammar: '文法',
  translation: '和訳',
  reading: '長文',
  writing: '英検英作文',
};

const CLOUD_QUIZ_QUESTION_MODES = [
  'GRAMMAR_CLOZE',
  'EN_WORD_ORDER',
  'JA_TRANSLATION_INPUT',
  'JA_TRANSLATION_ORDER',
] as const satisfies readonly EnglishPracticeCloudQuizQuestionMode[];

const isCloudQuizQuestionMode = (mode: EnglishPracticeAttemptMode): mode is EnglishPracticeCloudQuizQuestionMode => (
  (CLOUD_QUIZ_QUESTION_MODES as readonly string[]).includes(mode)
);

const normalizeResponseTimeMs = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const createAttemptId = (attempt: EnglishPracticeAttemptInput, occurredAt: number, index: number): string => [
  'ep',
  occurredAt,
  index,
  attempt.lane,
  attempt.mode,
  attempt.scopeId || attempt.readingQuestionKind || attempt.wordId || 'general',
].join(':');

const getStorage = (): EnglishPracticeStorage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

const getStorageKey = (userUid: string): string => `${STORAGE_PREFIX}${userUid}`;

const emptyMetric = (): EnglishPracticeMetricSummary => ({
  total: 0,
  correct: 0,
  accuracy: 0,
  scoreTotal: 0,
  scoreMaxTotal: 0,
  scoreRate: 0,
  lastPracticedAt: null,
});

const updateMetric = (
  metric: EnglishPracticeMetricSummary,
  attempt: EnglishPracticeAttemptRecord,
): EnglishPracticeMetricSummary => {
  const score = typeof attempt.score === 'number' ? attempt.score : attempt.correct ? 1 : 0;
  const maxScore = typeof attempt.maxScore === 'number' && attempt.maxScore > 0 ? attempt.maxScore : 1;
  const total = metric.total + 1;
  const correct = metric.correct + (attempt.correct ? 1 : 0);
  const scoreTotal = metric.scoreTotal + score;
  const scoreMaxTotal = metric.scoreMaxTotal + maxScore;

  return {
    total,
    correct,
    accuracy: Math.round((correct / total) * 100),
    scoreTotal,
    scoreMaxTotal,
    scoreRate: Math.round((scoreTotal / Math.max(scoreMaxTotal, 1)) * 100),
    lastPracticedAt: Math.max(metric.lastPracticedAt ?? 0, attempt.occurredAt),
  };
};

const buildMetric = (attempts: EnglishPracticeAttemptRecord[]): EnglishPracticeMetricSummary => (
  attempts.reduce(updateMetric, emptyMetric())
);

const isAttemptRecord = (value: unknown): value is EnglishPracticeAttemptRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<EnglishPracticeAttemptRecord>;
  return typeof record.id === 'string'
    && typeof record.occurredAt === 'number'
    && (ENGLISH_PRACTICE_LANE_IDS as readonly string[]).includes(record.lane || '')
    && typeof record.mode === 'string'
    && typeof record.correct === 'boolean';
};

const normalizeProgress = (
  userUid: string,
  value: Partial<EnglishPracticeProgress> | null | undefined,
): EnglishPracticeProgress => {
  const attempts = Array.isArray(value?.attempts)
    ? value.attempts.filter(isAttemptRecord).slice(-MAX_ATTEMPTS)
    : [];
  const updatedAt = typeof value?.updatedAt === 'number'
    ? value.updatedAt
    : attempts.at(-1)?.occurredAt ?? Date.now();

  return {
    version: VERSION,
    userUid,
    updatedAt,
    attempts,
  };
};

const getWeaknessScore = (metric: EnglishPracticeMetricSummary): number => (
  (100 - metric.accuracy) + Math.min(30, metric.total * 4)
);

const defaultRecommendation = (): EnglishPracticeRecommendation => ({
  lane: 'grammar',
  labelJa: '文法から再開',
  reasonJa: 'まだ英語演習の履歴が少ないため、型を確認できる文法から始めます。',
  actionJa: '文法で5問解く',
  scopeIds: [],
  readingQuestionKinds: [],
});

const buildRecommendation = (
  laneSummaries: EnglishPracticeProgressSummary['laneSummaries'],
  weakGrammarScopes: EnglishPracticeWeakGrammarScope[],
  weakReadingKinds: EnglishPracticeWeakReadingKind[],
): EnglishPracticeRecommendation => {
  if (laneSummaries.grammar.total < 3) return defaultRecommendation();
  if (laneSummaries.translation.total < 2) {
    return {
      lane: 'translation',
      labelJa: '和訳を1セット',
      reasonJa: '文法の型を、受験答案として日本語に戻す練習がまだ少なめです。',
      actionJa: '全文和訳を2問書く',
      scopeIds: weakGrammarScopes.slice(0, 2).map((scope) => scope.scopeId),
      readingQuestionKinds: [],
    };
  }
  if (laneSummaries.reading.total < 2) {
    return {
      lane: 'reading',
      labelJa: '長文で根拠確認',
      reasonJa: '単文練習を読解の根拠探しへつなげる履歴がまだ少なめです。',
      actionJa: '短い長文を1本文解く',
      scopeIds: [],
      readingQuestionKinds: weakReadingKinds.slice(0, 2).map((kind) => kind.kind),
    };
  }
  if (laneSummaries.writing.total < 1) {
    return {
      lane: 'writing',
      labelJa: '英検英作文を1テーマ',
      reasonJa: '文法・和訳・読解の練習を、自分で書く答案へつなげる履歴がまだありません。',
      actionJa: '英検英作文を1テーマ書く',
      scopeIds: [],
      readingQuestionKinds: [],
    };
  }

  const weakestLane = (Object.entries(laneSummaries) as Array<[EnglishPracticeLaneId, EnglishPracticeMetricSummary]>)
    .sort((left, right) => left[1].accuracy - right[1].accuracy || right[1].total - left[1].total)[0]?.[0] ?? 'grammar';

  if (weakestLane === 'translation') {
    return {
      lane: 'translation',
      labelJa: '和訳の弱点補強',
      reasonJa: '全文和訳の得点率が相対的に低いため、意味と構文の取り違えを優先します。',
      actionJa: '全文和訳を2問書き直す',
      scopeIds: weakGrammarScopes.slice(0, 2).map((scope) => scope.scopeId),
      readingQuestionKinds: [],
    };
  }
  if (weakestLane === 'reading') {
    return {
      lane: 'reading',
      labelJa: '読解の根拠補強',
      reasonJa: '読解の正答率が相対的に低いため、設問種別ごとの根拠確認を優先します。',
      actionJa: '弱い設問種別を1本文解く',
      scopeIds: [],
      readingQuestionKinds: weakReadingKinds.slice(0, 2).map((kind) => kind.kind),
    };
  }
  if (weakestLane === 'writing') {
    return {
      lane: 'writing',
      labelJa: '英検英作文の型を確認',
      reasonJa: '英検英作文の達成率が相対的に低いため、短いテーマで構成を確認します。',
      actionJa: '英検英作文を1テーマ書き直す',
      scopeIds: [],
      readingQuestionKinds: [],
    };
  }

  return {
    lane: 'grammar',
    labelJa: '文法範囲を復習',
    reasonJa: weakGrammarScopes.length > 0
      ? `${weakGrammarScopes[0].labelJa} の正答率が低いため、同じ型を短く反復します。`
      : '文法演習を続けて、型の自動化を進めます。',
    actionJa: '弱点範囲を5問解く',
    scopeIds: weakGrammarScopes.slice(0, 3).map((scope) => scope.scopeId),
    readingQuestionKinds: [],
  };
};

export const createEmptyEnglishPracticeProgress = (userUid: string): EnglishPracticeProgress => ({
  version: VERSION,
  userUid,
  updatedAt: Date.now(),
  attempts: [],
});

export const recordEnglishPracticeAttempt = (
  progress: EnglishPracticeProgress,
  attempt: EnglishPracticeAttemptInput,
): EnglishPracticeProgress => {
  const occurredAt = attempt.occurredAt ?? Date.now();
  const record: EnglishPracticeAttemptRecord = {
    ...attempt,
    id: createAttemptId(attempt, occurredAt, progress.attempts.length),
    occurredAt,
  };

  return normalizeProgress(progress.userUid, {
    version: VERSION,
    userUid: progress.userUid,
    updatedAt: occurredAt,
    attempts: [...progress.attempts, record],
  });
};

export const toEnglishPracticeCloudQuizAttempt = (
  uid: string,
  attempt: EnglishPracticeAttemptInput,
  translationFeedback?: JapaneseTranslationFeedback,
): EnglishPracticeCloudQuizAttempt | null => {
  if (
    !isCloudQuizQuestionMode(attempt.mode)
    || !attempt.wordId
    || !attempt.bookId
    || attempt.bookId === ENGLISH_PRACTICE_SAMPLE_BOOK_ID
  ) {
    return null;
  }

  return {
    uid,
    wordId: attempt.wordId,
    bookId: attempt.bookId,
    correct: attempt.correct,
    questionMode: attempt.mode,
    responseTimeMs: normalizeResponseTimeMs(attempt.responseTimeMs),
    grammarScopeId: attempt.scopeId,
    translationFeedback: attempt.mode === 'JA_TRANSLATION_INPUT' ? translationFeedback : undefined,
  };
};

export const summarizeEnglishPracticeProgress = (
  progress: EnglishPracticeProgress,
): EnglishPracticeProgressSummary => {
  const laneSummaries = {
    grammar: emptyMetric(),
    translation: emptyMetric(),
    reading: emptyMetric(),
    writing: emptyMetric(),
  };
  const grammarScopeAttempts = new Map<GrammarCurriculumScopeId, EnglishPracticeAttemptRecord[]>();
  const grammarScopeLabels = new Map<GrammarCurriculumScopeId, string>();
  const readingKindAttempts = new Map<ReadingQuestionKind, EnglishPracticeAttemptRecord[]>();

  progress.attempts.forEach((attempt) => {
    laneSummaries[attempt.lane] = updateMetric(laneSummaries[attempt.lane], attempt);
    if (attempt.scopeId) {
      grammarScopeAttempts.set(attempt.scopeId, [...(grammarScopeAttempts.get(attempt.scopeId) || []), attempt]);
      if (attempt.scopeLabelJa) grammarScopeLabels.set(attempt.scopeId, attempt.scopeLabelJa);
    }
    if (attempt.readingQuestionKind) {
      readingKindAttempts.set(attempt.readingQuestionKind, [
        ...(readingKindAttempts.get(attempt.readingQuestionKind) || []),
        attempt,
      ]);
    }
  });

  const weakGrammarScopes = [...grammarScopeAttempts.entries()]
    .map(([scopeId, attempts]) => ({
      scopeId,
      labelJa: grammarScopeLabels.get(scopeId) || scopeId,
      ...buildMetric(attempts),
    }))
    .filter((scope) => scope.total > 0 && scope.accuracy < 85)
    .sort((left, right) => getWeaknessScore(right) - getWeaknessScore(left))
    .slice(0, 4);

  const weakReadingKinds = [...readingKindAttempts.entries()]
    .map(([kind, attempts]) => ({
      kind,
      labelJa: getReadingQuestionKindLabel(kind),
      ...buildMetric(attempts),
    }))
    .filter((kind) => kind.total > 0 && kind.accuracy < 85)
    .sort((left, right) => getWeaknessScore(right) - getWeaknessScore(left))
    .slice(0, 4);

  const overall = buildMetric(progress.attempts);

  return {
    ...overall,
    laneSummaries,
    weakGrammarScopes,
    weakReadingKinds,
    recentAttempts: [...progress.attempts].sort((left, right) => right.occurredAt - left.occurredAt).slice(0, 6),
    recommendation: buildRecommendation(laneSummaries, weakGrammarScopes, weakReadingKinds),
  };
};

export const loadEnglishPracticeProgress = (
  userUid: string,
  storage: EnglishPracticeStorage | null = getStorage(),
): EnglishPracticeProgress => {
  if (!storage) return createEmptyEnglishPracticeProgress(userUid);
  let raw: string | null = null;
  try {
    raw = storage.getItem(getStorageKey(userUid));
  } catch {
    return createEmptyEnglishPracticeProgress(userUid);
  }
  if (!raw) return createEmptyEnglishPracticeProgress(userUid);

  try {
    return normalizeProgress(userUid, JSON.parse(raw) as Partial<EnglishPracticeProgress>);
  } catch {
    return createEmptyEnglishPracticeProgress(userUid);
  }
};

export const saveEnglishPracticeProgress = (
  progress: EnglishPracticeProgress,
  storage: EnglishPracticeStorage | null = getStorage(),
): EnglishPracticeProgress => {
  const normalized = normalizeProgress(progress.userUid, progress);
  if (storage) {
    try {
      storage.setItem(getStorageKey(normalized.userUid), JSON.stringify(normalized));
    } catch {
      return normalized;
    }
  }
  return normalized;
};

export const clearEnglishPracticeProgress = (
  userUid: string,
  storage: EnglishPracticeStorage | null = getStorage(),
): EnglishPracticeProgress => {
  if (storage) {
    try {
      storage.removeItem(getStorageKey(userUid));
    } catch {
      return createEmptyEnglishPracticeProgress(userUid);
    }
  }
  return createEmptyEnglishPracticeProgress(userUid);
};

export const getEnglishPracticeLaneLabel = (lane: EnglishPracticeLaneId): string => LANE_LABELS[lane];
