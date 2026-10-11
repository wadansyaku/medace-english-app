import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectBoundedLongTermReviewCandidates as select, type LongTermReviewHistory } from '../shared/studySession';

const now = 10_000;
const word = (id: string, bookId = 'approved') => ({ id, bookId });
const history = (wordId: string, patch: Partial<LongTermReviewHistory> = {}): LongTermReviewHistory => ({
  wordId, bookId: 'approved', status: 'graduated', interactionSource: 'STUDY',
  nextReviewDate: now, lastStudiedAt: 1, ...patch,
});
const ids = (result: ReturnType<typeof select>) => result.words.map(w => w.id);

describe('unwired bounded long-term review selection', () => {
  it('defaults to zero quota while exposing the eligible backlog', () => {
    expect(select({ scopedWords: [word('a')], histories: [history('a')], now })).toEqual({
      words: [], eligibleCount: 1, remainingCount: 1, quota: 0, limit: 20,
    });
  });
  it('includes exact deadline and past graduated STUDY only', () => {
    const histories = [history('past', { nextReviewDate: now - 1 }), history('exact'),
      history('future', { nextReviewDate: now + 1 }), history('quiz', { interactionSource: 'QUIZ' }),
      history('unsourced', { interactionSource: undefined }), history('regular', { status: 'review' }),
      history('new', { status: 'new' }), history('invalid', { nextReviewDate: NaN }),
      history('invalid-time', { lastStudiedAt: Infinity })];
    const result = select({ scopedWords: histories.map(h => word(h.wordId)), histories, now, quota: 100 });
    expect(ids(result)).toEqual(['past', 'exact']);
  });
  it('does not restore excluded unauthorized/unapproved/range-out/missing words from history', () => {
    // This list is the caller's authoritative approved + authorized + range
    // projection, not an authorization decision made by the selector.
    const scopedWords = [word('allowed')];
    const histories = ['allowed', 'unapproved', 'private', 'outside-range', 'missing'].map(id => history(id));
    expect(ids(select({ scopedWords, histories, now, quota: 100 }))).toEqual(['allowed']);
  });
  it('requires the matching word and history book', () => {
    expect(ids(select({ scopedWords: [word('same')], histories: [history('same', { bookId: 'other' })], now, quota: 3 }))).toEqual([]);
  });
  it('deduplicates exact rows and rejects conflicting current snapshots', () => {
    const h = history('a');
    expect(ids(select({ scopedWords: [word('a'), word('a')], histories: [h, { ...h }], now, quota: 5 }))).toEqual(['a']);
    expect(ids(select({ scopedWords: [word('a'), word('a', 'other')], histories: [h], now, quota: 5 }))).toEqual([]);
    expect(ids(select({ scopedWords: [word('a')], histories: [h, history('a', { status: 'review' })], now, quota: 5 }))).toEqual([]);
  });
  it('orders by deadline then studied-at then word ID, independent of input order', () => {
    const histories = [history('z'), history('a'), history('earliest', { nextReviewDate: 0 }), history('older', { lastStudiedAt: 0 })];
    const scopedWords = histories.map(h => word(h.wordId));
    const input = { scopedWords, histories, now, quota: 100 };
    expect(ids(select(input))).toEqual(['earliest', 'older', 'a', 'z']);
    expect(ids(select({ ...input, histories: [...histories].reverse(), scopedWords: [...scopedWords].reverse() }))).toEqual(ids(select(input)));
  });
  it.each([undefined, 0, -1, NaN, Infinity])('does not activate an absent/invalid quota %s', quota => {
    expect(select({ scopedWords: [word('a')], histories: [history('a')], now, quota }).words).toEqual([]);
  });
  it('floors the quota, bounds it by normalized session limit and preserves all inputs', () => {
    const scopedWords = Object.freeze(['a', 'b', 'c'].map(id => Object.freeze(word(id))));
    const histories = Object.freeze(scopedWords.map(w => Object.freeze(history(w.id))));
    const before = JSON.stringify({ scopedWords, histories });
    const result = select({ scopedWords, histories, now, quota: 2.9, limit: 1 });
    expect(result.quota).toBe(1); expect(ids(result)).toEqual(['a']); expect(result.remainingCount).toBe(2);
    expect(JSON.stringify({ scopedWords, histories })).toBe(before);
    expect(select({ scopedWords, histories, now, quota: 200, limit: 500 }).limit).toBe(100);
  });
  it('rejects an invalid clock instead of quietly reporting zero due', () => {
    expect(() => select({ scopedWords: [], histories: [], now: NaN })).toThrow('判定時刻');
  });
  it('does not move deadlines merely by selecting or reopening a session', () => {
    const input = { scopedWords: [word('a')], histories: [history('a')], now, quota: 1 };
    expect(select(input)).toEqual(select(input)); expect(input.histories[0].nextReviewDate).toBe(now);
  });
});

const quotas = [0, 1, 2, 3, 5];
const limits = [1, 10, 20, 100];
const ordinaryBacklogs = [0, 2, 1000];
const matrix = quotas.flatMap(quota => limits.flatMap(limit => ordinaryBacklogs.map(ordinaryDue => ({ quota, limit, ordinaryDue }))));
const backlogWords = Array.from({ length: 1000 }, (_, i) => word(`long-${String(i).padStart(4, '0')}`));
const backlogHistories = backlogWords.map((w, i) => history(w.id, { nextReviewDate: i, lastStudiedAt: 0 }));
const simulationResults: unknown[] = [];

describe('synthetic 1000-word backlog quota comparison (not a production assembly policy)', () => {
  it.each(matrix)('quota $quota / session $limit / ordinary due $ordinaryDue', ({ quota, limit, ordinaryDue }) => {
    const inputSnapshot = JSON.stringify(backlogHistories);
    const result = select({ scopedWords: backlogWords, histories: backlogHistories, now, quota, limit });
    const longCount = Math.min(quota, limit);
    const regularCount = Math.min(ordinaryDue, limit - longCount);
    const newCount = limit - longCount - regularCount;
    // Simulation-only reserved slots: regular due -> new in the remainder.
    expect(result.words).toHaveLength(longCount);
    expect(result.remainingCount).toBe(1000 - longCount);
    expect(regularCount + newCount + result.words.length).toBe(limit);
    expect(new Set(ids(result)).size).toBe(longCount);
    expect(JSON.stringify(backlogHistories)).toBe(inputSnapshot);
    if (quota === 0) expect(regularCount + newCount).toBe(limit);
    if (limit > quota && ordinaryDue > 0) expect(regularCount).toBeGreaterThan(0);
    if (limit > quota + ordinaryDue) expect(newCount).toBeGreaterThan(0);

    // 30 synthetic saved sessions. Only this local copied fixture advances
    // selected deadlines; no production SRS/data or persistence is invoked.
    const simulatedHistory = backlogHistories.map(h => ({ ...h }));
    let regularRemaining = ordinaryDue;
    let ordinaryServed = 0;
    let newServed = 0;
    const seen = new Set<string>();
    for (let session = 0; session < 30; session += 1) {
      const selected = select({ scopedWords: backlogWords, histories: simulatedHistory, now, quota, limit });
      const sessionRegular = Math.min(regularRemaining, limit - selected.words.length);
      ordinaryServed += sessionRegular; regularRemaining -= sessionRegular;
      newServed += limit - selected.words.length - sessionRegular;
      for (const w of selected.words) {
        expect(seen.has(w.id)).toBe(false); seen.add(w.id);
        simulatedHistory.find(h => h.wordId === w.id)!.nextReviewDate = now + 1;
      }
    }
    expect(seen.size).toBe(Math.min(1000, 30 * longCount));
    simulationResults.push({ quota, limit, ordinaryDue, firstSession: { longTerm: longCount, ordinary: regularCount, new: newCount },
      sessions: 30, longTermServed: seen.size, longTermRemaining: 1000 - seen.size,
      ordinaryServed, ordinaryRemaining: regularRemaining, newServed,
      earliestUnservedLongTermDeadline: seen.size < 1000 ? seen.size : null,
      sessionsToClearLongTermIfAllSaved: longCount ? Math.ceil(1000 / longCount) : null,
      ordinaryStarvedInFirst30Sessions: ordinaryDue > 0 && ordinaryServed === 0 });
  });
  it('records the complete explicit-quota simulation matrix when requested', () => {
    expect(simulationResults).toHaveLength(60);
    if (process.env.LONG_TERM_REVIEW_SIMULATION_OUTPUT) writeFileSync(process.env.LONG_TERM_REVIEW_SIMULATION_OUTPUT,
      JSON.stringify({ kind: 'SYNTHETIC_UNWIRED_CONTRACT_COMPARISON', baseline: '2dbd754', productionPolicy: false,
        assumptions: ['1000 graduated STUDY words all due', '30 saved sessions at a fixed clock',
          'simulation-only reserved long-term slots; ordinary due then new', 'saved long-term deadline moved to now+1',
          'no daily cap, SRS, learning-effect or retention model'], results: simulationResults }, null, 2) + '\n');
  });
});
