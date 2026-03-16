import { getTodayDateKey } from '../utils/date';
import type { BookMetadata, EnglishLevel, UserGrade, WordData } from '../types';
import { getBookProgressionIndex, getTargetBookProgressionIndex } from './bookProgression';

const MIXED_BAND_WEIGHTS = [
  { offset: 0, weight: 0.7 },
  { offset: -1, weight: 0.2 },
  { offset: 1, weight: 0.1 },
] as const;

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const sortBySeed = <T,>(
  items: T[],
  seedPrefix: string,
  getStableKey: (item: T) => string,
): T[] => {
  return [...items].sort((left, right) => {
    const leftKey = getStableKey(left);
    const rightKey = getStableKey(right);
    const leftHash = hashString(`${seedPrefix}:${leftKey}`);
    const rightHash = hashString(`${seedPrefix}:${rightKey}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return leftKey.localeCompare(rightKey);
  });
};

const interleaveWordsByBook = (
  words: WordData[],
  booksById: Map<string, BookMetadata>,
  seedPrefix: string,
): WordData[] => {
  const grouped = new Map<string, WordData[]>();
  sortBySeed(words, `${seedPrefix}:word`, (word) => word.id).forEach((word) => {
    const current = grouped.get(word.bookId) || [];
    current.push(word);
    grouped.set(word.bookId, current);
  });

  const orderedBookIds = [...grouped.keys()].sort((left, right) => {
    const leftBook = booksById.get(left);
    const rightBook = booksById.get(right);
    if (Boolean(leftBook?.isPriority) !== Boolean(rightBook?.isPriority)) {
      return leftBook?.isPriority ? -1 : 1;
    }
    const leftHash = hashString(`${seedPrefix}:book:${left}`);
    const rightHash = hashString(`${seedPrefix}:book:${right}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return left.localeCompare(right);
  });

  const ordered: WordData[] = [];
  let hasPending = true;
  while (hasPending) {
    hasPending = false;
    orderedBookIds.forEach((bookId) => {
      const queue = grouped.get(bookId);
      if (!queue || queue.length === 0) return;
      hasPending = true;
      ordered.push(queue.shift()!);
    });
  }

  return ordered;
};

const buildWeightedCounts = (limit: number): Map<number, number> => {
  const counts = new Map<number, number>();
  const bases = MIXED_BAND_WEIGHTS.map((entry) => ({
    offset: entry.offset,
    raw: limit * entry.weight,
    count: Math.floor(limit * entry.weight),
  }));

  let used = bases.reduce((sum, entry) => sum + entry.count, 0);
  bases.forEach((entry) => {
    counts.set(entry.offset, entry.count);
  });

  while (used < limit) {
    for (const entry of bases) {
      if (used >= limit) break;
      counts.set(entry.offset, (counts.get(entry.offset) || 0) + 1);
      used += 1;
    }
  }

  return counts;
};

export interface ColdStartSessionSelection {
  selectedWords: WordData[];
  targetBand: number;
  usedIndexedBooks: boolean;
}

export const selectColdStartSessionWords = ({
  uid,
  limit,
  grade,
  level,
  books,
  words,
  todayKey = getTodayDateKey(),
}: {
  uid: string;
  limit: number;
  grade?: UserGrade;
  level?: EnglishLevel;
  books: BookMetadata[];
  words: WordData[];
  todayKey?: string;
}): ColdStartSessionSelection => {
  if (limit <= 0 || books.length === 0 || words.length === 0) {
    return {
      selectedWords: [],
      targetBand: getTargetBookProgressionIndex({ grade, level }),
      usedIndexedBooks: false,
    };
  }

  const booksById = new Map(books.map((book) => [book.id, book]));
  const indexedBookBandById = new Map<string, number>();
  books.forEach((book) => {
    const band = getBookProgressionIndex(book);
    if (band !== null) {
      indexedBookBandById.set(book.id, band);
    }
  });

  const indexedWords = words.filter((word) => indexedBookBandById.has(word.bookId));
  const targetBand = getTargetBookProgressionIndex({ grade, level });
  if (indexedWords.length === 0) {
    return {
      selectedWords: [],
      targetBand,
      usedIndexedBooks: false,
    };
  }

  const wordsByBand = new Map<number, WordData[]>();
  indexedWords.forEach((word) => {
    const band = indexedBookBandById.get(word.bookId);
    if (!band) return;
    const current = wordsByBand.get(band) || [];
    current.push(word);
    wordsByBand.set(band, current);
  });

  const seedPrefix = `${todayKey}:${uid}:cold-start`;
  const selected: WordData[] = [];
  const selectedIds = new Set<string>();
  const desiredCounts = buildWeightedCounts(limit);

  MIXED_BAND_WEIGHTS.forEach(({ offset }) => {
    const desiredBand = targetBand + offset;
    const bandWords = wordsByBand.get(desiredBand) || [];
    if (bandWords.length === 0) return;
    interleaveWordsByBook(bandWords, booksById, `${seedPrefix}:band:${desiredBand}`)
      .slice(0, desiredCounts.get(offset) || 0)
      .forEach((word) => {
        if (selectedIds.has(word.id) || selected.length >= limit) return;
        selected.push(word);
        selectedIds.add(word.id);
      });
  });

  if (selected.length < limit) {
    const fallbackBands = [...wordsByBand.keys()].sort((left, right) => {
      const leftDistance = Math.abs(left - targetBand);
      const rightDistance = Math.abs(right - targetBand);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      if ((left <= targetBand) !== (right <= targetBand)) return left <= targetBand ? -1 : 1;
      return left - right;
    });

    fallbackBands.forEach((band) => {
      if (selected.length >= limit) return;
      interleaveWordsByBook(wordsByBand.get(band) || [], booksById, `${seedPrefix}:fallback:${band}`)
        .forEach((word) => {
          if (selected.length >= limit || selectedIds.has(word.id)) return;
          selected.push(word);
          selectedIds.add(word.id);
        });
    });
  }

  return {
    selectedWords: selected.slice(0, limit),
    targetBand,
    usedIndexedBooks: true,
  };
};
