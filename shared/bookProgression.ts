import {
  EnglishLevel,
  UserGrade,
  type BookMetadata,
} from '../types';

const clampBand = (value: number): number => Math.min(6, Math.max(1, value));

export const GRADE_PROGRESS_INDEX: Record<UserGrade, number> = {
  [UserGrade.JHS1]: 1,
  [UserGrade.JHS2]: 2,
  [UserGrade.JHS3]: 3,
  [UserGrade.SHS1]: 4,
  [UserGrade.SHS2]: 5,
  [UserGrade.SHS3]: 6,
  [UserGrade.UNIVERSITY]: 6,
  [UserGrade.ADULT]: 4,
};

export const LEVEL_PROGRESS_INDEX: Record<EnglishLevel, number> = {
  [EnglishLevel.A1]: 1,
  [EnglishLevel.A2]: 2,
  [EnglishLevel.B1]: 3,
  [EnglishLevel.B2]: 4,
  [EnglishLevel.C1]: 5,
  [EnglishLevel.C2]: 6,
};

export const getGradeProgressionIndex = (grade?: UserGrade): number => (
  GRADE_PROGRESS_INDEX[grade || UserGrade.ADULT] || GRADE_PROGRESS_INDEX[UserGrade.ADULT]
);

export const getLevelProgressionIndex = (level?: EnglishLevel): number => (
  LEVEL_PROGRESS_INDEX[level || EnglishLevel.B1] || LEVEL_PROGRESS_INDEX[EnglishLevel.B1]
);

export const getTargetBookProgressionIndex = ({
  grade,
  level,
}: {
  grade?: UserGrade;
  level?: EnglishLevel;
}): number => {
  const gradeProgress = getGradeProgressionIndex(grade);
  const levelProgress = getLevelProgressionIndex(level);
  return clampBand(Math.round(gradeProgress * 0.45 + levelProgress * 0.55));
};

export const getBookProgressionIndex = (
  book: Pick<BookMetadata, 'title' | 'description' | 'sourceContext'>,
): number | null => {
  const haystack = `${book.title} ${book.description || ''} ${book.sourceContext || ''}`;
  const normalized = haystack.replace(/\s+/g, '');
  const levelMatch = normalized.match(/レベル([1-6])/);
  if (levelMatch) return Number.parseInt(levelMatch[1], 10);
  if (normalized.includes('中1')) return 1;
  if (normalized.includes('中2')) return 2;
  if (normalized.includes('中3')) return 3;
  if (normalized.includes('高1')) return 4;
  if (normalized.includes('高2')) return 5;
  if (normalized.includes('高3')) return 6;
  return null;
};
