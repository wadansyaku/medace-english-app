import type { QuizSessionConfig } from '../types';

export const NARU_BOOK_ID = 'naru-shisto-original-v1';

export const NARU_RANGE_PRESETS = [
  { id: 'all', label: 'すべて', start: 1, end: 1530 },
  { id: 'verb', label: '動詞', start: 1, end: 353 },
  { id: 'noun', label: '名詞', start: 354, end: 1285 },
  { id: 'adverb', label: '副詞', start: 1286, end: 1371 },
  { id: 'adjective', label: '形容詞', start: 1372, end: 1530 },
] as const;

export type NaruRangePreset = typeof NARU_RANGE_PRESETS[number];

export const getNaruRangeSelection = (
  preset: NaruRangePreset,
): Pick<QuizSessionConfig, 'selectionMode' | 'rangeStart' | 'rangeEnd'> => ({
  selectionMode: preset.id === 'all' ? 'FULL_RANDOM' : 'RANGE_RANDOM',
  rangeStart: preset.start,
  rangeEnd: preset.end,
});

export const isNaruRangeSelected = (
  config: QuizSessionConfig,
  preset: NaruRangePreset,
): boolean => preset.id === 'all'
  ? config.selectionMode === 'FULL_RANDOM'
  : config.selectionMode === 'RANGE_RANDOM'
    && config.rangeStart === preset.start
    && config.rangeEnd === preset.end;
