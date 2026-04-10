import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readAllMock,
  readFirstMock,
} = vi.hoisted(() => ({
  readAllMock: vi.fn(),
  readFirstMock: vi.fn(),
}));

vi.mock('../functions/_shared/storage-support', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/storage-support')>('../functions/_shared/storage-support');
  return {
    ...actual,
    readAll: readAllMock,
    readFirst: readFirstMock,
  };
});

import { handleGetLearningPlan } from '../functions/_shared/storage-learning-actions';

describe('learning plan storage', () => {
  beforeEach(() => {
    readAllMock.mockReset();
    readFirstMock.mockReset();
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
});
