import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GRADUATED_REVIEW_DAILY_LIMIT,
  GRADUATED_REVIEW_MAX_SESSION_WORDS,
  composeGraduatedReviewSession,
  getGraduatedReviewDayKey,
  getGraduatedReviewSessionQuota,
  isDueGraduatedHistory,
} from '../shared/graduatedReview';
import {
  selectBoundedLongTermReviewCandidates,
  type LongTermReviewHistory,
} from '../shared/studySession';

const now = Date.parse('2026-10-11T14:59:59.999Z');
const word = (id: string, bookId = 'approved') => ({ id, bookId });
const history = (wordId: string, patch: Partial<LongTermReviewHistory> = {}): LongTermReviewHistory => ({
  wordId, bookId: 'approved', status: 'graduated', interactionSource: 'STUDY',
  nextReviewDate: now, lastStudiedAt: now - 1, ...patch,
});

describe('graduated review shared session policy', () => {
  it('exposes the distinct daily allocation and session ceilings', () => {
    expect(GRADUATED_REVIEW_DAILY_LIMIT).toBe(5);
    expect(GRADUATED_REVIEW_MAX_SESSION_WORDS).toBe(3);
  });

  it.each([[5, 1], [9, 1], [10, 2], [14, 2], [15, 3], [20, 3], [100, 3]])(
    'reserves bounded long-term capacity for a %s-word request', (limit, quota) => {
      expect(getGraduatedReviewSessionQuota(limit, 1000)).toBe(quota);
      expect(quota).toBeLessThanOrEqual(limit * 0.2);
      expect(limit - quota).toBeGreaterThan(0);
    },
  );

  it.each([2, 3, 4])('uses the documented one-word short-session exception at %s', (limit) => {
    const quota = getGraduatedReviewSessionQuota(limit, 1000);
    expect(quota).toBe(1);
    expect(limit - quota).toBeGreaterThanOrEqual(1);
  });

  it('gives both due lanes a turn across single-word starts without restarting the sequence', () => {
    const ordinals = Array.from({ length: 10 }, (_, index) => index + 1);
    expect(ordinals.map(ordinal => getGraduatedReviewSessionQuota(1, 1000, ordinal)))
      .toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(getGraduatedReviewSessionQuota(1, 1000, 5)).toBe(1);
    expect(getGraduatedReviewSessionQuota(1, 1000, 5)).toBe(1);
    expect(getGraduatedReviewSessionQuota(1, 0, 1)).toBe(1);
  });

  it.each([0, -5, 5.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'does not claim a normal-due short slot from an invalid ordinal %s', (ordinal) => {
      expect(getGraduatedReviewSessionQuota(1, 1, ordinal)).toBe(0);
    },
  );

  it('fails closed for an unknown ordinary-due count in a single-word request', () => {
    expect(getGraduatedReviewSessionQuota(1, NaN, 1)).toBe(0);
    expect(getGraduatedReviewSessionQuota(1, Infinity, 1)).toBe(0);
    expect(getGraduatedReviewSessionQuota(1, NaN, 5)).toBe(1);
  });

  it('uses the existing limit normalization before calculating capacity', () => {
    expect(getGraduatedReviewSessionQuota(undefined)).toBe(3);
    expect(getGraduatedReviewSessionQuota(NaN)).toBe(3);
    expect(getGraduatedReviewSessionQuota('1')).toBe(3);
    expect(getGraduatedReviewSessionQuota(0.5, 1, 1)).toBe(0);
    expect(getGraduatedReviewSessionQuota(500)).toBe(3);
  });

  it('changes the daily key at midnight JST and rejects invalid clocks', () => {
    expect(getGraduatedReviewDayKey(now)).toBe('2026-10-11');
    expect(getGraduatedReviewDayKey(now + 1)).toBe('2026-10-12');
    expect(() => getGraduatedReviewDayKey(NaN)).toThrow('判定時刻');
  });

  it('requires a due, finite graduated STUDY history and leaves the record intact', () => {
    const due = Object.freeze(history('a'));
    expect(isDueGraduatedHistory(due, now)).toBe(true);
    const excluded = [
      history('a', { nextReviewDate: now + 1 }), history('a', { status: 'review' }),
      history('a', { interactionSource: 'QUIZ' }), history('a', { interactionSource: undefined }),
      history('a', { nextReviewDate: NaN }), history('a', { lastStudiedAt: Infinity }),
    ];
    expect(excluded.map(row => isDueGraduatedHistory(row, now))).toEqual(Array(6).fill(false));
    expect(isDueGraduatedHistory(due, NaN)).toBe(false);
    expect(due.nextReviewDate).toBe(now);
  });

  it('reserves long-term slots even when the ordinary-due queue is full', () => {
    const normal = Array.from({ length: 30 }, (_, index) => word(`normal-${index}`));
    const graduates = [word('long-1'), word('long-2'), word('long-3')];
    const output = composeGraduatedReviewSession(normal, graduates, 20);
    expect(output).toEqual([...normal.slice(0, 17), ...graduates]);
  });

  it('does not pad a short output or interpret its actual size as the quota denominator', () => {
    const graduates = [word('long-1'), word('long-2'), word('long-3')];
    expect(composeGraduatedReviewSession([], graduates, 20)).toEqual(graduates);
    expect(composeGraduatedReviewSession([], graduates, 10)).toEqual(graduates.slice(0, 2));
  });

  it('deduplicates selections, bounds defensive over-allocation and preserves objects and flags', () => {
    const normal: readonly (ReturnType<typeof word> & { longTermReview?: boolean })[] = Object.freeze([
      Object.freeze({ ...word('same'), longTermReview: false }), word('normal'),
    ]);
    const graduate = Object.freeze({ ...word('same'), longTermReview: true });
    const graduates = Object.freeze([graduate, graduate, word('long-2'), word('long-3'), word('long-4')]);
    const output = composeGraduatedReviewSession(normal, graduates, 4);
    expect(output.map(row => row.id)).toEqual(['normal', 'same']);
    expect(output[1]).toBe(graduate);
    expect(graduate.longTermReview).toBe(true);
    expect(normal[0].longTermReview).toBe(false);
    expect(composeGraduatedReviewSession([], graduates, 100).map(row => row.id))
      .toEqual(['same', 'long-2', 'long-3']);
  });

  it('excludes contradictory membership rather than composing a duplicate ID across books', () => {
    expect(composeGraduatedReviewSession([word('same', 'other'), word('normal')], [word('same')], 20))
      .toEqual([word('normal')]);
  });
});

const results: unknown[] = [];
const limits = [1, 2, 3, 4, 5, 10, 20, 100];
const ordinaryBacklogs = [0, 2, 1000];
const matrix = limits.flatMap(limit => ordinaryBacklogs.map(ordinaryDue => ({ limit, ordinaryDue })));

describe('synthetic bounded-session policy with one-day distinct allocation model', () => {
  it.each(matrix)('capacity $limit / ordinary due $ordinaryDue', ({ limit, ordinaryDue }) => {
    const words = Array.from({ length: 1000 }, (_, i) => word(`long-${String(i).padStart(4, '0')}`));
    const histories = words.map((row, i) => history(row.id, { nextReviewDate: i }));
    const allocated = new Set<string>();
    let ordinaryRemaining = ordinaryDue;
    let ordinaryServed = 0;
    let longTermServed = 0;
    let newServed = 0;
    const sessions: { ordinal: number; quota: number; longTerm: number; ordinary: number; new: number }[] = [];
    for (let ordinal = 1; ordinal <= 30; ordinal += 1) {
      const quota = getGraduatedReviewSessionQuota(limit, ordinaryRemaining, ordinal);
      const remainingDailySlots = GRADUATED_REVIEW_DAILY_LIMIT - allocated.size;
      const selection = selectBoundedLongTermReviewCandidates({
        scopedWords: words, histories, now, limit,
        quota: Math.min(quota, remainingDailySlots),
      });
      const normalDueCount = Math.min(ordinaryRemaining, limit - selection.words.length);
      const newCount = limit - selection.words.length - normalDueCount;
      const normalWords = Array.from({ length: normalDueCount + newCount }, (_, i) => word(`normal-${ordinal}-${i}`));
      const session = composeGraduatedReviewSession(normalWords, selection.words, limit);
      expect(session.length).toBe(limit);
      expect(new Set(session.map(row => row.id)).size).toBe(limit);
      expect(selection.words.length).toBeLessThanOrEqual(quota);
      if (limit >= 2 && ordinaryRemaining > 0) expect(normalDueCount).toBeGreaterThan(0);
      for (const selected of selection.words) {
        expect(allocated.has(selected.id)).toBe(false);
        allocated.add(selected.id);
        histories.find(row => row.wordId === selected.id)!.nextReviewDate = now + 1;
      }
      expect(allocated.size).toBeLessThanOrEqual(GRADUATED_REVIEW_DAILY_LIMIT);
      ordinaryServed += normalDueCount;
      ordinaryRemaining -= normalDueCount;
      longTermServed += selection.words.length;
      newServed += newCount;
      sessions.push({ ordinal, quota, longTerm: selection.words.length, ordinary: normalDueCount, new: newCount });
    }
    expect(longTermServed).toBe(5);
    if (ordinaryDue > 0) expect(ordinaryServed).toBeGreaterThan(0);
    results.push({ limit, ordinaryDue, longTermServed, ordinaryServed, ordinaryRemaining, newServed,
      newlyAllocatedDistinct: allocated.size, sessions });
  });

  it('records the explicit policy model without claiming atomic persistence or retention', () => {
    expect(results).toHaveLength(24);
    if (process.env.GRADUATED_REVIEW_POLICY_SIMULATION_OUTPUT) {
      writeFileSync(process.env.GRADUATED_REVIEW_POLICY_SIMULATION_OUTPUT, JSON.stringify({
        kind: 'SYNTHETIC_SESSION_POLICY_ONE_DAY_MODEL',
        baseMain: 'b53a1c46b39a59cf2b006bdd534e0955ad3694cd',
        assumptions: ['1000 due graduated STUDY words', '30 distinct starts within one fixed JST day',
          'single-threaded local allocation Set; not a database transaction test',
          'successfully saved long-term deadlines move to now+1; not the SRS formula',
          'no SRS retention model, production data, or explicit learner-start restriction'],
        results,
      }, null, 2) + '\n');
    }
  });
});
