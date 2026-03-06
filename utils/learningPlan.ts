import {
  BookMetadata,
  EnglishLevel,
  GRADE_LABELS,
  LearningPlan,
  LearningPreference,
  LearningPreferenceIntensity,
  UserGrade,
} from '../types';
import { DAY_MS, formatDateKey, parseDateKey } from './date';

interface BuildFallbackLearningPlanInput {
  uid: string;
  grade: UserGrade;
  level: EnglishLevel;
  availableBooks: BookMetadata[];
  learningPreference?: LearningPreference | null;
  now?: Date;
}

const BASE_DAILY_GOAL: Record<EnglishLevel, number> = {
  [EnglishLevel.A1]: 8,
  [EnglishLevel.A2]: 10,
  [EnglishLevel.B1]: 14,
  [EnglishLevel.B2]: 18,
  [EnglishLevel.C1]: 22,
  [EnglishLevel.C2]: 26,
};

const INTENSITY_MULTIPLIER: Record<LearningPreferenceIntensity, number> = {
  [LearningPreferenceIntensity.BALANCED]: 1,
  [LearningPreferenceIntensity.REVIEW_HEAVY]: 0.9,
  [LearningPreferenceIntensity.INTENSIVE]: 1.2,
};
const GRADE_PROGRESS_INDEX: Record<UserGrade, number> = {
  [UserGrade.JHS1]: 1,
  [UserGrade.JHS2]: 2,
  [UserGrade.JHS3]: 3,
  [UserGrade.SHS1]: 4,
  [UserGrade.SHS2]: 5,
  [UserGrade.SHS3]: 6,
  [UserGrade.UNIVERSITY]: 6,
  [UserGrade.ADULT]: 4,
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toIsoDate = (date: Date): string => formatDateKey(date);

const parseDate = (value?: string): Date | null => {
  if (!value) return null;
  const parsed = parseDateKey(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const tokenize = (...values: Array<string | undefined | null>): string[] => {
  return values
    .flatMap((value) => (value || '').split(/[\s/、,()・]+/))
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
};

const getDaysUntil = (targetDate: Date | null, now: Date): number | null => {
  if (!targetDate) return null;
  const normalizedNow = parseDateKey(toIsoDate(now));
  return Math.ceil((targetDate.getTime() - normalizedNow.getTime()) / DAY_MS);
};

const getUrgencyMultiplier = (daysUntilExam: number | null): number => {
  if (daysUntilExam === null) return 1;
  if (daysUntilExam <= 21) return 1.25;
  if (daysUntilExam <= 45) return 1.15;
  if (daysUntilExam <= 90) return 1.05;
  return 1;
};

const getDailyGoal = (
  level: EnglishLevel,
  dailyMinutes: number,
  intensity: LearningPreferenceIntensity,
  daysUntilExam: number | null,
): number => {
  const baseGoal = BASE_DAILY_GOAL[level] || BASE_DAILY_GOAL[EnglishLevel.B1];
  const timeDrivenGoal = Math.round(dailyMinutes * 0.75);
  const weighted = Math.round((baseGoal * 0.55 + timeDrivenGoal * 0.45) * INTENSITY_MULTIPLIER[intensity] * getUrgencyMultiplier(daysUntilExam));
  return clamp(weighted, 8, 36);
};

const getBookProgressionIndex = (book: BookMetadata): number | null => {
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

const scoreBook = (
  book: BookMetadata,
  grade: UserGrade,
  keywords: string[],
  prefersVolume: boolean,
): number => {
  const haystack = `${book.title} ${book.description || ''} ${book.sourceContext || ''}`.toLowerCase();
  const keywordScore = keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 18 : 0), 0);
  const normalizedWordCount = Math.max(book.wordCount || 0, 120);
  const targetProgress = GRADE_PROGRESS_INDEX[grade] || GRADE_PROGRESS_INDEX[UserGrade.ADULT];
  const bookProgress = getBookProgressionIndex(book);
  const progressionScore = bookProgress === null
    ? 0
    : Math.max(0, 28 - Math.abs(bookProgress - targetProgress) * 8);
  const sizeScore = prefersVolume
    ? Math.min(normalizedWordCount / 35, 16)
    : 16 - Math.min(normalizedWordCount / 55, 10);

  return keywordScore + progressionScore + sizeScore + (book.isPriority ? 40 : 0);
};

const selectBooks = (
  availableBooks: BookMetadata[],
  grade: UserGrade,
  keywords: string[],
  dailyMinutes: number,
  intensity: LearningPreferenceIntensity,
): BookMetadata[] => {
  if (availableBooks.length === 0) return [];

  const desiredCount = clamp(
    2
      + Math.round(dailyMinutes / 30)
      + (keywords.length > 0 ? 1 : 0)
      + (intensity === LearningPreferenceIntensity.INTENSIVE ? 1 : 0),
    2,
    5,
  );

  return [...availableBooks]
    .sort((left, right) => {
      const scoreGap = scoreBook(right, grade, keywords, intensity === LearningPreferenceIntensity.INTENSIVE)
        - scoreBook(left, grade, keywords, intensity === LearningPreferenceIntensity.INTENSIVE);
      if (scoreGap !== 0) return scoreGap;
      return (right.wordCount || 0) - (left.wordCount || 0);
    })
    .slice(0, desiredCount);
};

const buildGoalDescription = (input: {
  grade: UserGrade;
  targetExam?: string;
  targetScore?: string;
  weakSkillFocus?: string;
  dailyWordGoal: number;
  weeklyStudyDays: number;
  intensity: LearningPreferenceIntensity;
  selectedBooks: BookMetadata[];
}): string => {
  const examSegment = input.targetExam
    ? `${input.targetExam}${input.targetScore ? ` (${input.targetScore})` : ''}に向けて`
    : `${GRADE_LABELS[input.grade]}の学習に合わせて`;
  const focusSegment = input.weakSkillFocus
    ? `${input.weakSkillFocus}を優先し、`
    : '';
  const paceSegment = input.intensity === LearningPreferenceIntensity.INTENSIVE
    ? '短期集中で'
    : input.intensity === LearningPreferenceIntensity.REVIEW_HEAVY
      ? '復習を厚めに入れつつ'
      : '無理のないペースで';
  const bookSegment = input.selectedBooks.length > 0
    ? `${input.selectedBooks.length}冊を軸に、`
    : '';

  return `${examSegment}、${bookSegment}${focusSegment}${paceSegment}1日${input.dailyWordGoal}語を週${input.weeklyStudyDays}日積み上げます。`;
};

export const buildFallbackLearningPlan = ({
  uid,
  grade,
  level,
  availableBooks,
  learningPreference = null,
  now = new Date(),
}: BuildFallbackLearningPlanInput): LearningPlan => {
  const weeklyStudyDays = clamp(learningPreference?.weeklyStudyDays || 4, 1, 7);
  const dailyStudyMinutes = clamp(learningPreference?.dailyStudyMinutes || 20, 5, 180);
  const intensity = learningPreference?.intensity || LearningPreferenceIntensity.BALANCED;
  const examDate = parseDate(learningPreference?.examDate);
  const daysUntilExam = getDaysUntil(examDate, now);
  const dailyWordGoal = getDailyGoal(level, dailyStudyMinutes, intensity, daysUntilExam);
  const keywords = tokenize(learningPreference?.targetExam, learningPreference?.weakSkillFocus);
  const selectedBooks = selectBooks(availableBooks, grade, keywords, dailyStudyMinutes, intensity);
  const estimatedTotalWords = selectedBooks.reduce((total, book) => total + Math.max(book.wordCount || 0, 120), 0) || Math.max(dailyWordGoal * 14, 160);
  const studyDaysNeeded = Math.ceil(estimatedTotalWords / Math.max(dailyWordGoal, 1));
  let targetDays = clamp(Math.ceil((studyDaysNeeded * 7) / weeklyStudyDays), 14, 210);

  if (daysUntilExam !== null && daysUntilExam > 0) {
    targetDays = Math.max(7, Math.min(targetDays, daysUntilExam));
  }

  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + targetDays);

  return {
    uid,
    createdAt: now.getTime(),
    targetDate: toIsoDate(targetDate),
    goalDescription: buildGoalDescription({
      grade,
      targetExam: learningPreference?.targetExam?.trim(),
      targetScore: learningPreference?.targetScore?.trim(),
      weakSkillFocus: learningPreference?.weakSkillFocus?.trim(),
      dailyWordGoal,
      weeklyStudyDays,
      intensity,
      selectedBooks,
    }),
    dailyWordGoal,
    selectedBookIds: selectedBooks.map((book) => book.id),
    status: 'ACTIVE',
  };
};
