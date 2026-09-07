import { describe, expect, it, vi } from 'vitest';

import { handleAddXP } from '../functions/_shared/storage-learning-actions';
import { calculateStudySessionXp, isValidStudySessionXp, MAX_STUDY_SESSION_XP, resolveXpProgress } from '../shared/xp';
import { UserRole } from '../types';

const createUser = () => ({
  id: 'student-1',
  email: 'student@example.com',
  password_hash: null,
  display_name: 'Student',
  role: UserRole.STUDENT,
  grade: null,
  english_level: null,
  subscription_plan: null,
  organization_id: null,
  organization_name: null,
  organization_role: null,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 0,
  updated_at: 0,
});

describe('XP storage security boundaries', () => {
  it('awards a 25-word session with a ten-day streak instead of losing its 500 XP', () => {
    const award = calculateStudySessionXp(25, 10);
    expect(award).toEqual({ baseXP: 250, bonusXP: 250, totalXP: 500 });
    expect(isValidStudySessionXp(award.totalXP)).toBe(true);
    expect(resolveXpProgress(1, 0, award.totalXP)).toEqual({ level: 3, xp: 200 });
  });

  it('accepts every supported session award and keeps the maximum bounded', () => {
    for (let words = 1; words <= 100; words += 1) {
      for (const streak of [0, 1, 9, 10, 100]) {
        expect(isValidStudySessionXp(calculateStudySessionXp(words, streak).totalXP)).toBe(true);
      }
    }
    expect(calculateStudySessionXp(100, 100).totalXP).toBe(2000);
    expect(isValidStudySessionXp(2001)).toBe(false);
    expect(() => calculateStudySessionXp(101, 10)).toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])('does not turn an invalid streak into an invalid award: %s', (streak) => {
    expect(calculateStudySessionXp(25, streak)).toEqual({ baseXP: 250, bonusXP: 0, totalXP: 250 });
  });
  it('resolves multiple level transitions without an unbounded loop', () => {
    expect(resolveXpProgress(1, 0, 400)).toEqual({ level: 3, xp: 100 });
  });

  it('rejects a corrupted remainder that already exceeds the current level threshold', () => {
    expect(resolveXpProgress(2, 200, 1)).toBeNull();
  });

  it('preserves cumulative XP and a canonical remainder across representative levels', () => {
    for (const currentLevel of [1, 2, 3, 10, 100, 10_000]) {
      for (const currentXp of [0, Math.floor(currentLevel * 50), currentLevel * 100 - 1]) {
        for (const awardedXp of [1, 10, 399, 400, 500, MAX_STUDY_SESSION_XP]) {
          const result = resolveXpProgress(currentLevel, currentXp, awardedXp);
          expect(result).not.toBeNull();
          if (!result) continue;

          expect(result.level).toBeGreaterThanOrEqual(currentLevel);
          expect(result.xp).toBeGreaterThanOrEqual(0);
          expect(result.xp).toBeLessThan(result.level * 100);
          const before = (currentLevel * (currentLevel - 1) * 100) / 2 + currentXp;
          const after = (result.level * (result.level - 1) * 100) / 2 + result.xp;
          expect(after).toBe(before + awardedXp);
        }
      }
    }
  });

  it.each([
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    0,
    MAX_STUDY_SESSION_XP + 1,
    1.5,
  ])('rejects an unsafe award without touching D1: %s', async (amount) => {
    const prepare = vi.fn(() => {
      throw new Error('D1 must not be touched');
    });

    await expect(handleAddXP(
      { DB: { prepare } } as never,
      createUser(),
      amount,
    )).rejects.toMatchObject({ status: 400 });
    expect(prepare).not.toHaveBeenCalled();
  });
});
