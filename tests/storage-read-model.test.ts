import { describe, expect, it } from 'vitest';

import type { WordData } from '../types';
import { type StoredLearningHistoryRecord } from '../services/storage/idb-support';
import {
  getBookProgressFromHistoryRecords,
  getDueCountFromHistoryRecords,
  getMasteryDistributionFromHistoryRecords,
  getStudiedWordIdsByBookFromHistoryRecords,
} from '../services/storage/learning-history';
import { buildWorksheetWordsFromHistoryRecords } from '../services/storage/organization-read-model';

const uid = 'student-1';
const now = 1_000;

const records: StoredLearningHistoryRecord[] = [
  {
    id: `${uid}_w1`,
    data: {
      wordId: 'w1',
      bookId: 'book-1',
      status: 'learning',
      lastStudiedAt: 900,
      nextReviewDate: 900,
      interval: 4,
      easeFactor: 2.5,
      correctCount: 2,
      attemptCount: 2,
      totalResponseTimeMs: 1400,
      interactionSource: 'STUDY',
    },
  },
  {
    id: `${uid}_w2`,
    data: {
      wordId: 'w2',
      bookId: 'book-1',
      status: 'learning',
      lastStudiedAt: 950,
      nextReviewDate: 700,
      interval: 7,
      easeFactor: 2.5,
      correctCount: 1,
      attemptCount: 1,
      totalResponseTimeMs: 1200,
      interactionSource: 'QUIZ',
    },
  },
  {
    id: `${uid}_w3`,
    data: {
      wordId: 'w3',
      bookId: 'book-1',
      status: 'graduated',
      lastStudiedAt: 980,
      nextReviewDate: 4_000,
      interval: 30,
      easeFactor: 2.7,
      correctCount: 5,
      attemptCount: 5,
      totalResponseTimeMs: 4200,
      interactionSource: 'STUDY',
    },
  },
  {
    id: `${uid}_w4`,
    data: {
      wordId: 'w4',
      bookId: 'book-1',
      status: 'new',
      lastStudiedAt: 990,
      nextReviewDate: 5_000,
      interval: 0,
      easeFactor: 2.5,
      correctCount: 0,
      attemptCount: 0,
      totalResponseTimeMs: 0,
      interactionSource: 'STUDY',
    },
  },
  {
    id: `other-user_w5`,
    data: {
      wordId: 'w5',
      bookId: 'book-1',
      status: 'learning',
      lastStudiedAt: 990,
      nextReviewDate: 500,
      interval: 3,
      easeFactor: 2.5,
      correctCount: 1,
      attemptCount: 1,
      totalResponseTimeMs: 900,
      interactionSource: 'STUDY',
    },
  },
];

const wordsById = new Map<string, WordData>([
  ['w1', { id: 'w1', bookId: 'book-1', number: 1, word: 'triage', definition: 'トリアージ' }],
  ['w2', { id: 'w2', bookId: 'book-1', number: 2, word: 'monitor', definition: '観察する' }],
  ['w3', { id: 'w3', bookId: 'book-1', number: 3, word: 'diagnosis', definition: '診断' }],
  ['w4', { id: 'w4', bookId: 'book-1', number: 4, word: 'stabilize', definition: '安定させる' }],
]);

describe('storage read model helpers', () => {
  it('applies the same study-only filter across due, studied ids, progress, and distribution', () => {
    expect(getDueCountFromHistoryRecords(records, uid, now)).toBe(1);
    expect(getStudiedWordIdsByBookFromHistoryRecords(records, uid, 'book-1')).toEqual(['w1', 'w3', 'w4']);
    expect(getBookProgressFromHistoryRecords(records, uid, 'book-1', 4)).toEqual({
      bookId: 'book-1',
      learnedCount: 2,
      totalCount: 4,
      percentage: 50,
    });
    expect(getMasteryDistributionFromHistoryRecords(records, uid)).toEqual({
      new: 0,
      learning: 1,
      review: 1,
      graduated: 1,
      total: 3,
    });
  });

  it('builds worksheet rows from mastery-progress histories only', () => {
    const worksheetWords = buildWorksheetWordsFromHistoryRecords({
      records,
      studentUid: uid,
      booksById: new Map([['book-1', { id: 'book-1', title: 'Medical Core' }]]),
      wordsById,
    });

    expect(worksheetWords.map((word) => word.wordId)).toEqual(['w3', 'w1']);
    expect(worksheetWords.map((word) => word.status)).toEqual(['graduated', 'review']);
  });
});
