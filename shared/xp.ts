import { MAX_STUDY_SESSION_WORDS } from './studySession';

const XP_PER_STUDY_WORD = 10;
const MAX_STREAK_BONUS_DAYS = 10;
const STREAK_BONUS_PER_DAY = 0.1;
const MAX_BASE_XP = MAX_STUDY_SESSION_WORDS * XP_PER_STUDY_WORD;
export const MAX_STUDY_SESSION_XP = MAX_BASE_XP
  + Math.round(MAX_BASE_XP * MAX_STREAK_BONUS_DAYS * STREAK_BONUS_PER_DAY);

export const calculateStudySessionXp = (wordCount: number, currentStreak: number) => {
  if (!Number.isSafeInteger(wordCount) || wordCount < 1 || wordCount > MAX_STUDY_SESSION_WORDS) {
    throw new RangeError('学習セッションの語数が不正です。');
  }
  const streak = Number.isSafeInteger(currentStreak) && currentStreak > 0
    ? Math.min(currentStreak, MAX_STREAK_BONUS_DAYS)
    : 0;
  const baseXP = wordCount * XP_PER_STUDY_WORD;
  const bonusXP = Math.round(baseXP * streak * STREAK_BONUS_PER_DAY);
  return { baseXP, bonusXP, totalXP: baseXP + bonusXP };
};

export const isValidStudySessionXp = (amount: number): boolean => (
  Number.isSafeInteger(amount)
  && amount >= 1
  && amount <= MAX_STUDY_SESSION_XP
);

export interface XpProgress {
  level: number;
  xp: number;
}

export const resolveXpProgress = (
  currentLevel: number,
  currentXp: number,
  awardedXp: number,
): XpProgress | null => {
  const currentLevelThreshold = currentLevel * 100;
  if (
    !Number.isSafeInteger(currentLevel)
    || currentLevel < 1
    || !Number.isSafeInteger(currentXp)
    || currentXp < 0
    || !Number.isSafeInteger(currentLevelThreshold)
    || currentXp >= currentLevelThreshold
    || !isValidStudySessionXp(awardedXp)
  ) {
    return null;
  }

  const cumulativeXp = (currentLevel * (currentLevel - 1) * 100) / 2;
  const nextTotalXp = cumulativeXp + currentXp + awardedXp;
  if (!Number.isSafeInteger(cumulativeXp) || !Number.isSafeInteger(nextTotalXp)) {
    return null;
  }

  const level = Math.max(
    currentLevel,
    Math.floor((1 + Math.sqrt(1 + (8 * nextTotalXp) / 100)) / 2),
  );
  const levelFloorXp = (level * (level - 1) * 100) / 2;
  const xp = nextTotalXp - levelFloorXp;
  if (!Number.isSafeInteger(levelFloorXp) || !Number.isSafeInteger(xp) || xp < 0) {
    return null;
  }
  return { level, xp };
};
