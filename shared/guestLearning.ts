import type { StudyWordRange, WordData } from '../types';
import { NARU_BOOK_ID } from './naruBook';

export const GUEST_LEARNING_VERSION = 'naru-guest-v1';
export const GUEST_LEARNING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GUEST_LEARNING_MAX_ATTEMPTS = 5000;
export const GUEST_LEARNING_MAX_RESPONSE_TIME_MS = 60 * 60 * 1000;
export const GUEST_LEARNING_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface GuestLearningAttempt {
  attemptId: string;
  wordId: string;
  rating: 0 | 1 | 2 | 3;
  responseTimeMs: number;
  answeredAt: number;
}

export interface GuestLearningProgress {
  sessionId: string;
  version: typeof GUEST_LEARNING_VERSION;
  startedAt: number;
  attempts: GuestLearningAttempt[];
  boundUserId?: string;
  importedAttemptIds: string[];
  recordingLimitReached?: boolean;
}

export const isGuestLearningWordId = (value: unknown): value is string => (
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)
);

// The server verifies that each word belongs to the public approved Naru book.
// Device parsing is intentionally independent of the remote catalogue cache.
export const parseGuestLearningProgress = (value: unknown, now: number): GuestLearningProgress | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as GuestLearningProgress;
  if (typeof v.sessionId !== 'string' || !GUEST_LEARNING_UUID_PATTERN.test(v.sessionId)
    || v.version !== GUEST_LEARNING_VERSION || !Number.isSafeInteger(v.startedAt)
    || v.startedAt <= 0 || v.startedAt > now + 60_000 || v.startedAt < now - GUEST_LEARNING_TTL_MS
    || !Array.isArray(v.attempts) || v.attempts.length > GUEST_LEARNING_MAX_ATTEMPTS
    || !Array.isArray(v.importedAttemptIds) || v.importedAttemptIds.length > v.attempts.length
    || (v.recordingLimitReached !== undefined && (typeof v.recordingLimitReached !== 'boolean'
      || (v.recordingLimitReached && v.attempts.length !== GUEST_LEARNING_MAX_ATTEMPTS)))
    || (v.boundUserId !== undefined && (typeof v.boundUserId !== 'string' || !v.boundUserId.trim() || v.boundUserId.length > 200))) return null;
  const ids = new Set<string>();
  const attempts: GuestLearningAttempt[] = [];
  for (const a of v.attempts) {
    if (!a || typeof a.attemptId !== 'string' || !GUEST_LEARNING_UUID_PATTERN.test(a.attemptId)
      || ids.has(a.attemptId) || !isGuestLearningWordId(a.wordId)
      || !Number.isInteger(a.rating) || a.rating < 0 || a.rating > 3
      || !Number.isSafeInteger(a.responseTimeMs) || a.responseTimeMs < 0 || a.responseTimeMs > GUEST_LEARNING_MAX_RESPONSE_TIME_MS
      || !Number.isSafeInteger(a.answeredAt) || a.answeredAt < v.startedAt || a.answeredAt > now + 60_000) return null;
    ids.add(a.attemptId);
    attempts.push({ attemptId: a.attemptId, wordId: a.wordId, rating: a.rating, responseTimeMs: a.responseTimeMs, answeredAt: a.answeredAt });
  }
  if (v.importedAttemptIds.some(id => typeof id !== 'string' || !ids.has(id))
    || new Set(v.importedAttemptIds).size !== v.importedAttemptIds.length
    || (v.importedAttemptIds.length > 0 && !v.boundUserId)) return null;
  return { sessionId: v.sessionId, version: GUEST_LEARNING_VERSION, startedAt: v.startedAt, attempts,
    ...(v.boundUserId ? { boundUserId: v.boundUserId } : {}), importedAttemptIds: [...v.importedAttemptIds],
    ...(v.recordingLimitReached ? { recordingLimitReached: true } : {}) };
};

export const selectGuestLearningWords = (
  words: readonly WordData[],
  range?: StudyWordRange,
  order: 'number' | 'random' = 'number',
  random: () => number = Math.random,
): WordData[] => {
  const selected = words.filter(word => word.bookId === NARU_BOOK_ID
    && (!range || (word.number >= range.start && word.number <= range.end)))
    .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
  if (order === 'random') {
    for (let index = selected.length - 1; index > 0; index--) {
      const other = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
      [selected[index], selected[other]] = [selected[other], selected[index]];
    }
  }
  return selected;
};
