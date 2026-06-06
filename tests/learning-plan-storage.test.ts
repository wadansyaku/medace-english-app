import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readAllMock,
  readFirstMock,
  readVisibleBookRowsMock,
} = vi.hoisted(() => ({
  readAllMock: vi.fn(),
  readFirstMock: vi.fn(),
  readVisibleBookRowsMock: vi.fn(),
}));

vi.mock('../functions/_shared/storage-support', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/storage-support')>('../functions/_shared/storage-support');
  return {
    ...actual,
    readAll: readAllMock,
    readFirst: readFirstMock,
    readVisibleBookRows: readVisibleBookRowsMock,
  };
});

import { handleGetLearningPlan, handleSaveLearningPlan } from '../functions/_shared/storage-learning-actions';
import { BookAccessScope, BookCatalogSource, SubscriptionPlan, UserRole } from '../types';

describe('learning plan storage', () => {
  beforeEach(() => {
    readAllMock.mockReset();
    readFirstMock.mockReset();
    readVisibleBookRowsMock.mockReset();
  });

  it('prefers learning_plan_books over legacy selected_book_ids when both exist', async () => {
    readFirstMock.mockResolvedValueOnce({
      user_id: 'student-1',
      created_at: 100,
      target_date: '2026-04-30',
      goal_description: 'goal',
      daily_word_goal: 12,
      selected_book_ids: '["legacy-book"]',
      status: 'ACTIVE',
    });
    readAllMock.mockResolvedValueOnce([
      { book_id: 'join-book-2' },
      { book_id: 'join-book-1' },
    ]);

    const plan = await handleGetLearningPlan(
      { DB: { prepare: vi.fn() } } as any,
      { id: 'student-1' } as any,
    );

    expect(plan?.selectedBookIds).toEqual(['join-book-2', 'join-book-1']);
  });

  it('rejects inaccessible books before writing a learning plan', async () => {
    readVisibleBookRowsMock.mockResolvedValueOnce([
      {
        id: 'visible-book',
        title: 'Visible Book',
        word_count: 120,
        is_priority: 0,
        description: null,
        source_context: null,
        created_by: null,
        catalog_source: BookCatalogSource.LICENSED_PARTNER,
        access_scope: BookAccessScope.BUSINESS_ONLY,
      },
    ]);
    const prepare = vi.fn();
    const env = { DB: { prepare, batch: vi.fn() } } as any;

    await expect(handleSaveLearningPlan(env, {
      id: 'student-1',
      subscription_plan: SubscriptionPlan.TOB_PAID,
      role: UserRole.STUDENT,
    } as any, {
      uid: 'student-1',
      createdAt: 100,
      targetDate: '2026-04-30',
      goalDescription: 'goal',
      dailyWordGoal: 12,
      selectedBookIds: ['missing-book'],
      status: 'ACTIVE',
    })).rejects.toMatchObject({
      status: 400,
      message: 'このプランに含まれる教材を利用できません。',
    });

    expect(prepare).not.toHaveBeenCalled();
  });

  it('deduplicates selected books and mirrors them to the join table', async () => {
    readVisibleBookRowsMock.mockResolvedValueOnce([
      {
        id: 'visible-book',
        title: 'Visible Book',
        word_count: 120,
        is_priority: 0,
        description: null,
        source_context: null,
        created_by: null,
        catalog_source: BookCatalogSource.LICENSED_PARTNER,
        access_scope: BookAccessScope.BUSINESS_ONLY,
      },
    ]);
    const run = vi.fn().mockResolvedValue({});
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));
    const batch = vi.fn().mockResolvedValue([]);
    const env = { DB: { prepare, batch } } as any;

    await handleSaveLearningPlan(env, {
      id: 'student-1',
      subscription_plan: SubscriptionPlan.TOB_PAID,
      role: UserRole.STUDENT,
    } as any, {
      uid: 'client-spoofed',
      createdAt: 100,
      targetDate: '2026-04-30',
      goalDescription: 'goal',
      dailyWordGoal: 12.4,
      selectedBookIds: ['visible-book', 'visible-book'],
      status: 'ACTIVE',
    });

    expect(bind).toHaveBeenCalledWith(
      'student-1',
      100,
      '2026-04-30',
      'goal',
      12,
      JSON.stringify(['visible-book']),
      'ACTIVE',
      expect.any(Number),
    );
    expect(batch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ run }),
    ]));
  });
});
