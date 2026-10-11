import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningTaskIntentType, type LearningTaskIntent } from '../types';
import { normalizeStudySessionStartId, studySessionStartFingerprint } from '../shared/studySessionStart';
import { getStudySessionStartId } from '../utils/studySessionStart';

const task: LearningTaskIntent = {
  mode: 'study', intentType: LearningTaskIntentType.BOOK_STUDY,
  label: '教材学習', selectionPolicy: 'BOOK_DUE_ONLY', limit: 10,
  bookId: 'book-a', wordRange: { start: 1, end: 10 },
};
const request = { action: 'book' as const, bookId: 'book-a', limit: 10, taskIntent: task };

afterEach(() => vi.unstubAllGlobals());

describe('study start identity', () => {
  it('retains optional legacy calls and accepts opaque keys', () => {
    expect(normalizeStudySessionStartId(undefined)).toBeUndefined();
    expect(normalizeStudySessionStartId(null)).toBeUndefined();
    expect(normalizeStudySessionStartId('start_2026-01')).toBe('start_2026-01');
  });
  it.each(['', ' start', 'a b', 'a/b', 'a'.repeat(129), 42, {}, []])('rejects malformed key %j', input => {
    expect(() => normalizeStudySessionStartId(input)).toThrow();
  });
  it('canonicalizes task key order', () => {
    const reordered = { ...task, wordRange: { end: 10, start: 1 } };
    expect(studySessionStartFingerprint({ ...request, taskIntent: reordered })).toBe(studySessionStartFingerprint(request));
  });
  it.each([
    { ...request, bookId: 'book-b' },
    { ...request, limit: 20 },
    { ...request, taskIntent: { ...task, wordRange: { start: 11, end: 20 } } },
    { ...request, taskIntent: { ...task, selectionPolicy: 'BOOK_NEW_ONLY' as const } },
    { ...request, taskIntent: { ...task, missionAssignmentId: 'mission-b' } },
    { ...request, taskIntent: { ...task, mode: 'quiz' as const } },
    { ...request, taskIntent: { ...task, label: '別の表示名' } },
  ])('binds materially different request %j', other => {
    expect(studySessionStartFingerprint(other)).not.toBe(studySessionStartFingerprint(request));
  });
  it('normalizes the requested limit', () => {
    expect(studySessionStartFingerprint({ ...request, limit: 10.9 })).toBe(studySessionStartFingerprint(request));
  });
  it('keeps the same history entry across retry, refresh, and midnight', () => {
    const history = { state: { anotherFeature: 7 }, replaceState: vi.fn(function (next: unknown) { this.state = next as typeof this.state; }) };
    vi.stubGlobal('window', { history, location: { pathname: '/study/book-a', search: '' } });
    const id = getStudySessionStartId('user-a', request);
    expect(getStudySessionStartId('user-a', request)).toBe(id);
    expect(history.state.anotherFeature).toBe(7);
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    // No date is used in the browser identity: the persisted server receipt owns it.
    vi.setSystemTime(new Date('2026-10-11T15:00:01Z'));
    expect(getStudySessionStartId('user-a', request)).toBe(id);
    vi.useRealTimers();
  });
  it('separates new history entries, users, and scopes', () => {
    const history = { state: null as unknown, replaceState(next: unknown) { this.state = next; } };
    vi.stubGlobal('window', { history, location: { pathname: '/study/book-a', search: '' } });
    const first = getStudySessionStartId('user-a', request);
    history.state = null; // The navigation router pushed an explicit new start.
    const second = getStudySessionStartId('user-a', request);
    expect(second).not.toBe(first);
    expect(getStudySessionStartId('user-b', request)).not.toBe(second);
    expect(getStudySessionStartId('user-b', { ...request, limit: 20 })).not.toBe(second);
  });
});
