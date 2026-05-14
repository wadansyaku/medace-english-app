import {
  WeaknessDimension,
  type WeaknessSignalSummary,
} from '../types';

export const ENGLISH_PRACTICE_LANE_IDS = ['grammar', 'translation', 'reading', 'writing'] as const;
export type EnglishPracticeLaneId = typeof ENGLISH_PRACTICE_LANE_IDS[number];
export type EnglishPracticeRouteLaneId = 'overview' | EnglishPracticeLaneId;

export const ENGLISH_PRACTICE_LANE_LABELS: Record<EnglishPracticeLaneId, string> = {
  grammar: '文法',
  translation: '和訳',
  reading: '長文',
  writing: '英検英作文',
};

export const ENGLISH_PRACTICE_ATTEMPT_MODES = [
  'GRAMMAR_CLOZE',
  'EN_WORD_ORDER',
  'JA_TRANSLATION_INPUT',
  'JA_TRANSLATION_ORDER',
  'READING',
  'WRITING',
] as const;
export type EnglishPracticeAttemptMode = typeof ENGLISH_PRACTICE_ATTEMPT_MODES[number];

export const ENGLISH_PRACTICE_WEAKNESS_LANES: Partial<Record<WeaknessDimension, EnglishPracticeLaneId>> = {
  [WeaknessDimension.GRAMMAR_APPLICATION]: 'grammar',
  [WeaknessDimension.WORD_ORDER]: 'grammar',
  [WeaknessDimension.TRANSLATION_ORDER]: 'translation',
  [WeaknessDimension.ADVANCED_BAND_CONFIDENCE]: 'reading',
};

export const getEnglishPracticeLaneLabel = (lane: EnglishPracticeLaneId): string => (
  ENGLISH_PRACTICE_LANE_LABELS[lane]
);

export const getEnglishPracticeLaneForWeakness = (
  weakness: Pick<WeaknessSignalSummary, 'dimension'> | null | undefined,
): EnglishPracticeLaneId | null => (
  weakness ? ENGLISH_PRACTICE_WEAKNESS_LANES[weakness.dimension] ?? null : null
);

export const getEnglishPracticeNextActionLabel = (lane: EnglishPracticeLaneId): string => {
  switch (lane) {
    case 'translation':
      return '全文和訳を2問指定';
    case 'reading':
      return '短い長文を1本文指定';
    case 'writing':
      return '英検英作文を1テーマ指定';
    default:
      return '文法演習を5問指定';
  }
};
