import { describe, expect, it } from 'vitest';
import { selectGuestLearningWords } from '../shared/guestLearning';
import { NARU_BOOK_ID } from '../shared/naruBook';
import type { WordData } from '../types';

const words: WordData[] = Array.from({ length: 12 }, (_, index) => ({
  id: `word-${index + 1}`, number: index + 1, word: `word${index + 1}`, definition: '語', bookId: NARU_BOOK_ID,
}));

describe('guest Naru selection', () => {
  it('selects full catalogue or chapter boundaries without imposing a five-word limit or mutating inputs', () => {
    const input = [...words].reverse(); const snapshot = structuredClone(input);
    expect(selectGuestLearningWords(input)).toEqual(words);
    expect(selectGuestLearningWords(input, { start: 3, end: 9 }).map(w => w.number)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(input).toEqual(snapshot);
    expect(selectGuestLearningWords([...input, { ...words[0], id: 'private', bookId: 'private-book' }])).toEqual(words);
  });
  it('shuffles a complete selected chapter while preserving exact membership', () => {
    const shuffled = selectGuestLearningWords(words, { start: 4, end: 10 }, 'random', () => 0);
    expect(shuffled.map(w => w.number)).not.toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(shuffled.map(w => w.number).sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(selectGuestLearningWords(words, { start: 50, end: 60 }, 'random')).toEqual([]);
  });
});
