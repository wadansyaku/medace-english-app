import {
  InterventionKind,
  LearningInteractionSource,
  type LearningTaskIntentType,
  RecommendedActionType,
  type LearningHistory,
  type StudentWeaknessProfile,
  type WeaknessDimension,
  type WeaknessSignalLevel,
  type WeaknessSignalSummary,
  type WorksheetQuestionMode,
  type WordData,
} from '../types';
import {
  WeaknessDimension as WeaknessDimensionEnum,
  WeaknessSignalLevel as WeaknessSignalLevelEnum,
} from '../types';
import { getTargetBookProgressionIndex } from './bookProgression';

export interface WeaknessInteractionEvent {
  userId: string;
  wordId: string;
  bookId: string;
  createdAt: number;
  interactionSource: LearningInteractionSource;
  questionMode?: WorksheetQuestionMode;
  correct?: boolean;
  rating?: number;
  responseTimeMs: number;
  intervalDaysBefore?: number;
  bookProgressionBand?: number | null;
  missionAssignmentId?: string;
  taskIntentType?: LearningTaskIntentType;
}

export const WEAKNESS_WINDOW_MS = 30 * 86400000;
export const WEAKNESS_MAX_EVENTS = 120;
export const WEAKNESS_MIN_SAMPLE = 6;

const DIMENSION_PRIORITY: Record<WeaknessSignalLevel, number> = {
  [WeaknessSignalLevelEnum.HIGH]: 3,
  [WeaknessSignalLevelEnum.MEDIUM]: 2,
  [WeaknessSignalLevelEnum.LOW]: 1,
  [WeaknessSignalLevelEnum.INSUFFICIENT_DATA]: 0,
};

const DIMENSION_ORDER: WeaknessDimension[] = [
  WeaknessDimensionEnum.RETENTION_STABILITY,
  WeaknessDimensionEnum.MEANING_RECALL,
  WeaknessDimensionEnum.GRAMMAR_APPLICATION,
  WeaknessDimensionEnum.WORD_ORDER,
  WeaknessDimensionEnum.TRANSLATION_ORDER,
  WeaknessDimensionEnum.SPELLING_RECALL,
  WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE,
  WeaknessDimensionEnum.MEANING_RECOGNITION,
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: string): number => hashString(seed) / 4294967295;

const classifyWeaknessLevel = (sampleSize: number, weightedErrorRate: number): WeaknessSignalLevel => {
  if (sampleSize < WEAKNESS_MIN_SAMPLE) return WeaknessSignalLevelEnum.INSUFFICIENT_DATA;
  if (weightedErrorRate >= 0.42) return WeaknessSignalLevelEnum.HIGH;
  if (weightedErrorRate >= 0.24) return WeaknessSignalLevelEnum.MEDIUM;
  return WeaknessSignalLevelEnum.LOW;
};

const buildReason = (dimension: WeaknessDimension, level: WeaknessSignalLevel): string => {
  if (level === WeaknessSignalLevelEnum.INSUFFICIENT_DATA) {
    return 'まだ十分な学習データがありません。';
  }

  switch (dimension) {
    case WeaknessDimensionEnum.MEANING_RECALL:
      return '日本語から英語を思い出す問題で取りこぼしが出ています。';
    case WeaknessDimensionEnum.MEANING_RECOGNITION:
      return '英単語を見て意味を選ぶ場面で迷いが残っています。';
    case WeaknessDimensionEnum.SPELLING_RECALL:
      return 'スペリング問題で綴りの取りこぼしが続いています。';
    case WeaknessDimensionEnum.GRAMMAR_APPLICATION:
      return '登場済み単語を英文の中で使う問題に取りこぼしが出ています。';
    case WeaknessDimensionEnum.WORD_ORDER:
      return '英語の語順を組み立てる問題で迷いが残っています。';
    case WeaknessDimensionEnum.TRANSLATION_ORDER:
      return '英文をもとに日本語の意味を組み立てる問題で迷いが残っています。';
    case WeaknessDimensionEnum.RETENTION_STABILITY:
      return '復習間隔が空いた単語で忘れやすさが出ています。';
    case WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE:
      return '今の難度帯で正答が安定しきっていません。';
    default:
      return '学習データから重点調整ポイントが見つかりました。';
  }
};

export const getWeaknessRecommendedActionType = (dimension: WeaknessDimension): RecommendedActionType => (
  dimension === WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE
    ? RecommendedActionType.OPEN_PLAN
    : RecommendedActionType.START_REVIEW
);

export const getWeaknessNextActionLabel = (dimension: WeaknessDimension): string => (
  dimension === WeaknessDimensionEnum.MEANING_RECALL
    ? '意味から英語を10語確認する'
    : dimension === WeaknessDimensionEnum.MEANING_RECOGNITION
      ? '英語から意味を10語確認する'
      : dimension === WeaknessDimensionEnum.SPELLING_RECALL
        ? 'スペリングを10語確認する'
        : dimension === WeaknessDimensionEnum.GRAMMAR_APPLICATION
          ? '文法穴埋めを10問確認する'
          : dimension === WeaknessDimensionEnum.WORD_ORDER
            ? '英語語順を10問確認する'
            : dimension === WeaknessDimensionEnum.TRANSLATION_ORDER
              ? '日本語訳を10問確認する'
              : getWeaknessRecommendedActionType(dimension) === RecommendedActionType.OPEN_PLAN
                ? '今日のプランに戻る'
                : '復習を10語始める'
);

export const getWeaknessTargetQuestionModes = (dimension: WeaknessDimension): WorksheetQuestionMode[] => {
  switch (dimension) {
    case WeaknessDimensionEnum.MEANING_RECALL:
      return ['JA_TO_EN'];
    case WeaknessDimensionEnum.MEANING_RECOGNITION:
      return ['EN_TO_JA'];
    case WeaknessDimensionEnum.SPELLING_RECALL:
      return ['SPELLING_HINT'];
    case WeaknessDimensionEnum.GRAMMAR_APPLICATION:
      return ['GRAMMAR_CLOZE'];
    case WeaknessDimensionEnum.WORD_ORDER:
      return ['EN_WORD_ORDER'];
    case WeaknessDimensionEnum.TRANSLATION_ORDER:
      return ['JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'];
    default:
      return ['JA_TO_EN', 'EN_TO_JA'];
  }
};

const buildSignal = ({
  dimension,
  sampleSize,
  weightedErrorRate,
  updatedAt,
  targetBandIndex,
}: {
  dimension: WeaknessDimension;
  sampleSize: number;
  weightedErrorRate: number;
  updatedAt: number;
  targetBandIndex?: number;
}): WeaknessSignalSummary => {
  const clampedRate = clamp(weightedErrorRate, 0, 1);
  const level = classifyWeaknessLevel(sampleSize, clampedRate);
  return {
    dimension,
    level,
    score: Math.round(clampedRate * 100),
    sampleSize,
    reason: buildReason(dimension, level),
    nextActionLabel: getWeaknessNextActionLabel(dimension),
    recommendedActionType: getWeaknessRecommendedActionType(dimension),
    targetQuestionModes: getWeaknessTargetQuestionModes(dimension),
    targetBandIndex,
    updatedAt,
  };
};

const filterRecentEvents = (events: WeaknessInteractionEvent[], now: number): WeaknessInteractionEvent[] => (
  [...events]
    .filter((event) => now - event.createdAt <= WEAKNESS_WINDOW_MS)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, WEAKNESS_MAX_EVENTS)
);

const averageFailureRate = (weights: Array<{ attempt: number; failure: number }>): number => {
  const totals = weights.reduce((sum, item) => ({
    attempt: sum.attempt + item.attempt,
    failure: sum.failure + item.failure,
  }), { attempt: 0, failure: 0 });
  if (totals.attempt <= 0) return 0;
  return totals.failure / totals.attempt;
};

const summarizeQuestionModeDimension = (
  events: WeaknessInteractionEvent[],
  dimension: WeaknessDimension,
  questionModes: WorksheetQuestionMode | WorksheetQuestionMode[],
  targetBandIndex: number,
): WeaknessSignalSummary => {
  const modes = Array.isArray(questionModes) ? questionModes : [questionModes];
  const relevant = events.filter((event) => (
    event.interactionSource === 'QUIZ'
    && Boolean(event.questionMode && modes.includes(event.questionMode))
  ));
  const weighted = relevant.map((event) => {
    const bandWeight = event.bookProgressionBand && event.bookProgressionBand >= targetBandIndex ? 1.15 : 1;
    const responseWeight = event.responseTimeMs >= 9000 ? 1.12 : event.responseTimeMs >= 6000 ? 1.05 : 1;
    const attempt = bandWeight * responseWeight;
    const failure = (event.correct ? 0 : 1) * attempt;
    return { attempt, failure };
  });

  return buildSignal({
    dimension,
    sampleSize: relevant.length,
    weightedErrorRate: averageFailureRate(weighted),
    updatedAt: relevant[0]?.createdAt || 0,
    targetBandIndex,
  });
};

const summarizeRetentionFromEvents = (
  events: WeaknessInteractionEvent[],
  targetBandIndex: number,
): WeaknessSignalSummary => {
  const relevant = events.filter((event) => event.interactionSource === 'STUDY');
  const weighted = relevant.map((event) => {
    const interval = Math.max(0, Number(event.intervalDaysBefore || 0));
    const intervalWeight = 1 + Math.min(interval / 7, 1);
    const bandWeight = event.bookProgressionBand && event.bookProgressionBand >= targetBandIndex ? 1.1 : 1;
    const attempt = intervalWeight * bandWeight;
    let failureRatio = 0;
    if ((event.rating ?? 2) <= 0) failureRatio = 1;
    else if ((event.rating ?? 2) === 1) failureRatio = 0.7;
    else if ((event.rating ?? 2) === 2 && interval >= 3) failureRatio = 0.18;
    return {
      attempt,
      failure: attempt * failureRatio,
    };
  });

  return buildSignal({
    dimension: WeaknessDimensionEnum.RETENTION_STABILITY,
    sampleSize: relevant.length,
    weightedErrorRate: averageFailureRate(weighted),
    updatedAt: relevant[0]?.createdAt || 0,
    targetBandIndex,
  });
};

const summarizeAdvancedBandFromEvents = (
  events: WeaknessInteractionEvent[],
  targetBandIndex: number,
): WeaknessSignalSummary => {
  const relevant = events.filter((event) => (
    Number(event.bookProgressionBand || 0) >= targetBandIndex
  ));
  const weighted = relevant.map((event) => {
    const bandDistance = Math.max(0, Number(event.bookProgressionBand || targetBandIndex) - targetBandIndex);
    const bandWeight = 1 + Math.min(bandDistance * 0.25, 0.5);
    const attempt = bandWeight;
    let failureRatio = 0;
    if (event.interactionSource === 'QUIZ') {
      failureRatio = event.correct ? 0 : 1;
    } else if ((event.rating ?? 2) <= 0) {
      failureRatio = 1;
    } else if ((event.rating ?? 2) === 1) {
      failureRatio = 0.7;
    } else if ((event.rating ?? 2) === 2) {
      failureRatio = 0.2;
    }
    return {
      attempt,
      failure: attempt * failureRatio,
    };
  });

  return buildSignal({
    dimension: WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE,
    sampleSize: relevant.length,
    weightedErrorRate: averageFailureRate(weighted),
    updatedAt: relevant[0]?.createdAt || 0,
    targetBandIndex,
  });
};

const summarizeSeededHistory = ({
  histories,
  targetBandIndex,
  mode,
}: {
  histories: LearningHistory[];
  targetBandIndex: number;
  mode: 'RETENTION' | 'ADVANCED';
}): WeaknessSignalSummary => {
  const relevant = histories.filter((history) => history.interactionSource === 'STUDY');
  const weighted = relevant.map((history) => {
    const accuracy = history.attemptCount > 0 ? history.correctCount / Math.max(history.attemptCount, 1) : 1;
    const failureRatio = 1 - accuracy;
    const retentionWeight = mode === 'RETENTION'
      ? 1 + Math.min(Math.max(history.interval, 0) / 7, 1)
      : 1;
    return {
      attempt: retentionWeight,
      failure: retentionWeight * failureRatio,
    };
  });

  return buildSignal({
    dimension: mode === 'RETENTION'
      ? WeaknessDimensionEnum.RETENTION_STABILITY
      : WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE,
    sampleSize: relevant.length,
    weightedErrorRate: averageFailureRate(weighted),
    updatedAt: relevant[0]?.lastStudiedAt || 0,
    targetBandIndex,
  });
};

export const deriveWeaknessSignals = ({
  events,
  histories,
  grade,
  level,
  now = Date.now(),
}: {
  events: WeaknessInteractionEvent[];
  histories: LearningHistory[];
  grade?: import('../types').UserGrade;
  level?: import('../types').EnglishLevel;
  now?: number;
}): WeaknessSignalSummary[] => {
  const targetBandIndex = getTargetBookProgressionIndex({ grade, level });
  const recentEvents = filterRecentEvents(events, now);
  const meaningRecall = summarizeQuestionModeDimension(
    recentEvents,
    WeaknessDimensionEnum.MEANING_RECALL,
    'JA_TO_EN',
    targetBandIndex,
  );
  const meaningRecognition = summarizeQuestionModeDimension(
    recentEvents,
    WeaknessDimensionEnum.MEANING_RECOGNITION,
    'EN_TO_JA',
    targetBandIndex,
  );
  const spellingRecall = summarizeQuestionModeDimension(
    recentEvents,
    WeaknessDimensionEnum.SPELLING_RECALL,
    'SPELLING_HINT',
    targetBandIndex,
  );
  const grammarApplication = summarizeQuestionModeDimension(
    recentEvents,
    WeaknessDimensionEnum.GRAMMAR_APPLICATION,
    'GRAMMAR_CLOZE',
    targetBandIndex,
  );
  const wordOrder = summarizeQuestionModeDimension(
    recentEvents,
    WeaknessDimensionEnum.WORD_ORDER,
    'EN_WORD_ORDER',
    targetBandIndex,
  );
  const translationOrder = summarizeQuestionModeDimension(
    recentEvents,
    WeaknessDimensionEnum.TRANSLATION_ORDER,
    ['JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
    targetBandIndex,
  );

  let retention = summarizeRetentionFromEvents(recentEvents, targetBandIndex);
  if (retention.level === WeaknessSignalLevelEnum.INSUFFICIENT_DATA) {
    retention = summarizeSeededHistory({ histories, targetBandIndex, mode: 'RETENTION' });
  }

  let advanced = summarizeAdvancedBandFromEvents(recentEvents, targetBandIndex);
  if (advanced.level === WeaknessSignalLevelEnum.INSUFFICIENT_DATA) {
    advanced = summarizeSeededHistory({ histories, targetBandIndex, mode: 'ADVANCED' });
  }

  const allSignals = [
    retention,
    meaningRecall,
    grammarApplication,
    wordOrder,
    translationOrder,
    spellingRecall,
    advanced,
    meaningRecognition,
  ];

  return allSignals.sort((left, right) => {
    const leftPriority = DIMENSION_PRIORITY[left.level];
    const rightPriority = DIMENSION_PRIORITY[right.level];
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    if (left.score !== right.score) return right.score - left.score;
    if (left.sampleSize !== right.sampleSize) return right.sampleSize - left.sampleSize;
    return DIMENSION_ORDER.indexOf(left.dimension) - DIMENSION_ORDER.indexOf(right.dimension);
  });
};

export const buildWeaknessProfile = (
  signals: WeaknessSignalSummary[],
): StudentWeaknessProfile | null => {
  if (signals.length === 0) return null;
  const sortedSignals = [...signals].sort((left, right) => {
    const leftPriority = DIMENSION_PRIORITY[left.level];
    const rightPriority = DIMENSION_PRIORITY[right.level];
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    if (left.score !== right.score) return right.score - left.score;
    if (left.sampleSize !== right.sampleSize) return right.sampleSize - left.sampleSize;
    return DIMENSION_ORDER.indexOf(left.dimension) - DIMENSION_ORDER.indexOf(right.dimension);
  });
  const topWeaknesses = sortedSignals
    .filter((signal) => signal.level !== WeaknessSignalLevelEnum.INSUFFICIENT_DATA)
    .slice(0, 3);
  return {
    signals: sortedSignals,
    topWeaknesses,
    updatedAt: sortedSignals.reduce((max, signal) => Math.max(max, signal.updatedAt), 0),
    hasSufficientData: topWeaknesses.length > 0,
  };
};

const scoreWordForWeakness = ({
  word,
  topWeakness,
  grade,
  level,
  uid,
  dateKey,
  bandOverride,
}: {
  word: WordData;
  topWeakness?: WeaknessSignalSummary;
  grade?: import('../types').UserGrade;
  level?: import('../types').EnglishLevel;
  uid: string;
  dateKey: string;
  bandOverride?: number | null;
}): number => {
  const targetBandIndex = getTargetBookProgressionIndex({ grade, level });
  const band = bandOverride ?? topWeakness?.targetBandIndex ?? targetBandIndex;
  const effectiveTarget = topWeakness?.targetBandIndex || targetBandIndex;
  const bandDistance = Math.abs(band - effectiveTarget);
  const baseBandScore = Math.max(0, 40 - bandDistance * 12);
  const adaptiveBandBoost = topWeakness?.dimension === WeaknessDimensionEnum.RETENTION_STABILITY
    ? Math.max(0, 18 - Math.abs(band - Math.max(1, effectiveTarget - 1)) * 10)
    : topWeakness?.dimension === WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE
      ? Math.max(0, 24 - bandDistance * 14)
      : baseBandScore;
  const deterministicTieBreaker = seededRandom(`${uid}:${dateKey}:${word.id}`);
  return adaptiveBandBoost + deterministicTieBreaker;
};

export const rankWeaknessFocusedWords = ({
  uid,
  words,
  weaknessProfile,
  grade,
  level,
  dateKey,
  bookBandsById = {},
}: {
  uid: string;
  words: WordData[];
  weaknessProfile: StudentWeaknessProfile | null;
  grade?: import('../types').UserGrade;
  level?: import('../types').EnglishLevel;
  dateKey: string;
  bookBandsById?: Record<string, number | null | undefined>;
}): WordData[] => {
  const topWeakness = weaknessProfile?.topWeaknesses[0];
  return [...words].sort((left, right) => (
    scoreWordForWeakness({
      word: right,
      topWeakness,
      grade,
      level,
      uid,
      dateKey,
      bandOverride: bookBandsById[right.bookId],
    }) - scoreWordForWeakness({
      word: left,
      topWeakness,
      grade,
      level,
      uid,
      dateKey,
      bandOverride: bookBandsById[left.bookId],
    })
    || left.bookId.localeCompare(right.bookId)
    || left.number - right.number
  ));
};

export const getDefaultInterventionKindFromWeakness = (
  topWeakness?: WeaknessSignalSummary | null,
  fallback?: InterventionKind,
): InterventionKind | undefined => {
  if (!topWeakness) return fallback;
  if (topWeakness.dimension === WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE) {
    return InterventionKind.PLAN_NUDGE;
  }
  if (topWeakness.dimension === WeaknessDimensionEnum.MEANING_RECALL
    || topWeakness.dimension === WeaknessDimensionEnum.SPELLING_RECALL
    || topWeakness.dimension === WeaknessDimensionEnum.GRAMMAR_APPLICATION
    || topWeakness.dimension === WeaknessDimensionEnum.WORD_ORDER
    || topWeakness.dimension === WeaknessDimensionEnum.TRANSLATION_ORDER
    || topWeakness.dimension === WeaknessDimensionEnum.RETENTION_STABILITY) {
    return InterventionKind.REVIEW_RESTART;
  }
  return fallback;
};

export const getWeaknessMissionDefaults = ({
  topWeakness,
  track,
  current,
}: {
  topWeakness?: WeaknessSignalSummary | null;
  track: import('../types').LearningTrack;
  current: { newWordsTarget: number; reviewWordsTarget: number; quizTargetCount: number };
}): { newWordsTarget: number; reviewWordsTarget: number; quizTargetCount: number } => {
  if (!topWeakness) return current;
  if (topWeakness.dimension === WeaknessDimensionEnum.RETENTION_STABILITY) {
    return {
      ...current,
      reviewWordsTarget: current.reviewWordsTarget + 6,
    };
  }
  if (
    topWeakness.dimension === WeaknessDimensionEnum.SPELLING_RECALL
    || topWeakness.dimension === WeaknessDimensionEnum.GRAMMAR_APPLICATION
    || topWeakness.dimension === WeaknessDimensionEnum.WORD_ORDER
    || topWeakness.dimension === WeaknessDimensionEnum.TRANSLATION_ORDER
  ) {
    return {
      ...current,
      quizTargetCount: current.quizTargetCount + 1,
    };
  }
  if (topWeakness.dimension === WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE) {
    return {
      ...current,
      newWordsTarget: Math.max(8, current.newWordsTarget - (track === 'COMMON_TEST' ? 8 : 6)),
      reviewWordsTarget: current.reviewWordsTarget + 2,
    };
  }
  return current;
};

export const buildWeaknessMissionRationale = ({
  studentName,
  topWeakness,
}: {
  studentName: string;
  topWeakness?: WeaknessSignalSummary | null;
}): string => {
  if (!topWeakness) {
    return `${studentName}さんの継続を戻すため、今週の主課題を1本に絞ります。`;
  }
  switch (topWeakness.dimension) {
    case WeaknessDimensionEnum.RETENTION_STABILITY:
      return `${studentName}さんは復習間隔が空くと定着が崩れやすいため、今週は復習量を厚めにして流れを戻します。`;
    case WeaknessDimensionEnum.SPELLING_RECALL:
      return `${studentName}さんはスペリング想起で取りこぼしがあるため、確認クイズを増やして定着を固めます。`;
    case WeaknessDimensionEnum.GRAMMAR_APPLICATION:
      return `${studentName}さんは単語を文の中で使う場面に取りこぼしがあるため、文法穴埋めで語彙と文型を同時に戻します。`;
    case WeaknessDimensionEnum.WORD_ORDER:
      return `${studentName}さんは英文の語順で迷いやすいため、登場済み単語を使った並び替えで文の型を固めます。`;
    case WeaknessDimensionEnum.TRANSLATION_ORDER:
      return `${studentName}さんは英文の意味を日本語に組み立てる場面で迷いがあるため、日本語並び替えで意味のまとまりを確認します。`;
    case WeaknessDimensionEnum.ADVANCED_BAND_CONFIDENCE:
      return `${studentName}さんは今の難度帯で正答が揺れているため、新出を少し絞って同じ帯で安定化します。`;
    case WeaknessDimensionEnum.MEANING_RECALL:
      return `${studentName}さんは意味から英語を思い出す場面が弱いため、今週は復習を先に戻して想起負荷を整えます。`;
    case WeaknessDimensionEnum.MEANING_RECOGNITION:
      return `${studentName}さんは英語を見て意味を取る場面で迷いがあるため、今週は確認量を増やして基礎認識を固めます。`;
    default:
      return `${studentName}さんの継続を戻すため、今週の主課題を1本に絞ります。`;
  }
};

export const buildWeaknessSessionSummary = (weaknessProfile: StudentWeaknessProfile | null): string => {
  const topWeakness = weaknessProfile?.topWeaknesses[0];
  if (!topWeakness) {
    return '最初の10語がたまると、次回から苦手フォーカスが表示されます。';
  }
  return `${topWeakness.reason} 次は「${topWeakness.nextActionLabel}」から入るとつながりやすいです。`;
};

export const buildWeaknessEmptyStateLabel = (): string => '最初の10語で苦手を診断する';

export const readTopWeakness = (
  weaknessProfile: StudentWeaknessProfile | null | undefined,
): WeaknessSignalSummary | null => weaknessProfile?.topWeaknesses[0] || null;

export const inferWeaknessProfileFromSignals = (
  signals: WeaknessSignalSummary[],
): StudentWeaknessProfile | null => buildWeaknessProfile(signals);

export const toWeaknessSignalRecordId = (uid: string, dimension: WeaknessDimension): string => `${uid}:${dimension}`;

export const toInteractionEventId = (event: Pick<WeaknessInteractionEvent, 'userId' | 'wordId' | 'createdAt' | 'interactionSource'>): string => (
  `${event.userId}:${event.wordId}:${event.createdAt}:${event.interactionSource}`
);
