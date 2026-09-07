export const MAX_STUDY_SESSION_XP = 400;

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
