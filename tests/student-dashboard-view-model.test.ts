import { describe, expect, it } from 'vitest';

import { useStudentDashboardViewModel } from '../hooks/useStudentDashboardViewModel';
import {
  BookCatalogSource,
  EnglishLevel,
  SubscriptionPlan,
  type BookMetadata,
  type DashboardSnapshot,
  type UserProfile,
  UserGrade,
  UserRole,
} from '../types';

const makeBook = (id: string, title: string): BookMetadata => ({
  id,
  title,
  wordCount: 120,
  isPriority: false,
  catalogSource: BookCatalogSource.LICENSED_PARTNER,
});

const baseUser: UserProfile = {
  uid: 'student-1',
  displayName: 'Learner',
  email: 'learner@example.com',
  role: UserRole.STUDENT,
  grade: UserGrade.JHS3,
  englishLevel: EnglishLevel.B1,
  subscriptionPlan: SubscriptionPlan.TOC_FREE,
  stats: { xp: 0, level: 1, currentStreak: 0, lastLoginDate: '2026-03-28' },
};

const buildSnapshot = (overrides: Partial<DashboardSnapshot>): DashboardSnapshot => ({
  dueCount: 0,
  officialBooks: [],
  myBooks: [],
  progressMap: {},
  learningPlan: null,
  learningPreference: null,
  primaryMission: null,
  weaknessProfile: null,
  leaderboard: [],
  masteryDist: { new: 0, learning: 0, review: 0, graduated: 0, total: 0 },
  activityLogs: [],
  motivationSnapshot: {
    scopes: [],
    insight: {
      title: 'sample',
      body: 'sample',
    },
  },
  coachNotifications: [],
  accountOverview: {
    subscriptionPlan: SubscriptionPlan.TOC_FREE,
    priceLabel: 'free',
    pricingNote: 'note',
    audienceLabel: 'student',
    featureSummary: [],
    aiUsage: {
      monthKey: '2026-03',
      estimatedCostMilliYen: 0,
      budgetMilliYen: 1000,
      remainingMilliYen: 1000,
      generationCount: 0,
      cacheHitCount: 0,
      cacheHitRatio: 0,
      avoidedCostMilliYen: 0,
      actionCounts: {},
    },
  },
  commercialRequests: [],
  ...overrides,
});

describe('useStudentDashboardViewModel', () => {
  it('surfaces a single primary recommended book and keeps the rest secondary', () => {
    const books = [
      makeBook('book-1', 'Core 1'),
      makeBook('book-2', 'Core 2'),
      makeBook('book-3', 'Core 3'),
    ];
    const snapshot = buildSnapshot({
      officialBooks: books,
      learningPlan: {
        uid: 'student-1',
        createdAt: Date.now(),
        targetDate: '2026-04-30',
        goalDescription: 'goal',
        dailyWordGoal: 12,
        selectedBookIds: ['book-2', 'book-1', 'book-3'],
        status: 'ACTIVE',
      },
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });

    expect(viewModel.primaryRecommendedBook?.id).toBe('book-2');
    expect(viewModel.secondaryRecommendedBooks.map((book) => book.id)).toEqual(['book-1', 'book-3']);
  });
});
