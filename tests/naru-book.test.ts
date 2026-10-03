import { describe, expect, it } from 'vitest';
import { getNaruRangeSelection, isNaruRangeSelected, NARU_RANGE_PRESETS } from '../shared/naruBook';
import { getQuizCandidateWords } from '../utils/quiz';
import type { QuizSessionConfig, WordData } from '../types';

const baseConfig: QuizSessionConfig = {
  selectionMode: 'LEARNED_ONLY', questionMode: 'EN_TO_JA', questionCount: 10,
  rangeStart: 20, rangeEnd: 50,
};

describe('Naru book range presets', () => {
  it('selects all 1530 words or the exact part-of-speech boundaries through the existing range filter', () => {
    const words: WordData[] = Array.from({ length: 1530 }, (_, index) => ({
      id: `synthetic-${index + 1}`, bookId: 'naru-shisto-original-v1', number: index + 1,
      word: `word${index + 1}`, definition: '合成テスト用',
    }));
    const selections = NARU_RANGE_PRESETS.map((preset) => {
      const config = { ...baseConfig, ...getNaruRangeSelection(preset) };
      expect(config.questionCount).toBe(10);
      expect(config.questionMode).toBe('EN_TO_JA');
      const candidates = getQuizCandidateWords({
        words, ...config, minWordNumber: 1, maxWordNumber: 1530, learnedWordIds: new Set(),
      });
      expect(candidates).toHaveLength(preset.end - preset.start + 1);
      expect(candidates[0].number).toBe(preset.start);
      expect(candidates.at(-1)?.number).toBe(preset.end);
      return candidates;
    });
    const allParts = selections.slice(1).flat();
    expect(new Set(allParts.map((word) => word.id)).size).toBe(1530);
    expect(allParts).toHaveLength(1530);
  });

  it('keeps custom and learned-only selections distinct from a preset', () => {
    const noun = NARU_RANGE_PRESETS[2];
    expect(isNaruRangeSelected({ ...baseConfig, ...getNaruRangeSelection(noun) }, noun)).toBe(true);
    expect(isNaruRangeSelected({ ...baseConfig, selectionMode: 'RANGE_RANDOM', rangeStart: 354, rangeEnd: 400 }, noun)).toBe(false);
    expect(isNaruRangeSelected({ ...baseConfig, rangeStart: 354, rangeEnd: 1285 }, noun)).toBe(false);
    expect(isNaruRangeSelected(baseConfig, NARU_RANGE_PRESETS[0])).toBe(false);
    expect(isNaruRangeSelected({ ...baseConfig, selectionMode: 'FULL_RANDOM' }, NARU_RANGE_PRESETS[0])).toBe(true);
  });
});
