import { describe, expect, it } from 'vitest';

import { BookCatalogSource, EnglishLevel, UserGrade, type BookMetadata, type WordData } from '../types';
import { selectColdStartSessionWords } from '../shared/coldStartSession';

const buildBook = (id: string, title: string, isPriority = false): BookMetadata => ({
  id,
  title,
  wordCount: 12,
  isPriority,
  catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
});

const buildWords = (bookId: string, count: number): WordData[] => Array.from({ length: count }, (_, index) => ({
  id: `${bookId}-word-${index + 1}`,
  bookId,
  number: index + 1,
  word: `${bookId}-word-${index + 1}`,
  definition: `${bookId}-definition-${index + 1}`,
}));

describe('selectColdStartSessionWords', () => {
  it('builds a target-band-majority session with deterministic mixing and no single-book clump', () => {
    const books = [
      buildBook('level2-a', 'レベル2'),
      buildBook('level3-a', 'レベル3', true),
      buildBook('level3-b', 'レベル3'),
      buildBook('level4-a', 'レベル4'),
    ];
    const words = [
      ...buildWords('level2-a', 12),
      ...buildWords('level3-a', 12),
      ...buildWords('level3-b', 12),
      ...buildWords('level4-a', 12),
    ];

    const first = selectColdStartSessionWords({
      uid: 'student-1',
      limit: 10,
      grade: UserGrade.JHS2,
      level: EnglishLevel.B2,
      books,
      words,
      todayKey: '2026-03-15',
    });
    const second = selectColdStartSessionWords({
      uid: 'student-1',
      limit: 10,
      grade: UserGrade.JHS2,
      level: EnglishLevel.B2,
      books,
      words,
      todayKey: '2026-03-15',
    });

    expect(first.targetBand).toBe(3);
    expect(first.selectedWords.map((word) => word.id)).toEqual(second.selectedWords.map((word) => word.id));

    const band2Count = first.selectedWords.filter((word) => word.bookId === 'level2-a').length;
    const band4Count = first.selectedWords.filter((word) => word.bookId === 'level4-a').length;
    const band3Count = first.selectedWords.length - band2Count - band4Count;
    expect(band3Count).toBe(7);
    expect(band2Count).toBe(2);
    expect(band4Count).toBe(1);

    const firstFourBooks = first.selectedWords.slice(0, 4).map((word) => word.bookId);
    expect(new Set(firstFourBooks).size).toBeGreaterThan(1);

    const targetBandNumbers = first.selectedWords
      .filter((word) => word.bookId === 'level3-a' || word.bookId === 'level3-b')
      .map((word) => word.number);
    expect(targetBandNumbers).not.toEqual([...targetBandNumbers].sort((left, right) => left - right));
  });

  it('returns an empty calibrated selection when no indexed books are available', () => {
    const selection = selectColdStartSessionWords({
      uid: 'student-2',
      limit: 8,
      grade: UserGrade.JHS1,
      level: EnglishLevel.A2,
      books: [
        buildBook('custom-a', 'Follow-up Drill'),
      ],
      words: buildWords('custom-a', 8),
      todayKey: '2026-03-15',
    });

    expect(selection.usedIndexedBooks).toBe(false);
    expect(selection.selectedWords).toHaveLength(0);
  });
});
