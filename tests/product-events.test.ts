import { describe, expect, it, vi } from 'vitest';

import {
  buildDashboardStartTaskEventInput,
  recordDashboardStartTaskEvent,
} from '../services/productEvents';
import { LearningTaskIntentType, type LearningTaskIntent } from '../types';

const makeTask = (overrides: Partial<LearningTaskIntent> = {}): LearningTaskIntent => ({
  mode: 'quiz',
  intentType: LearningTaskIntentType.MISSION_QUIZ,
  label: '今日の確認テスト',
  selectionPolicy: 'BOOK_DEFAULT',
  limit: 10,
  bookId: 'book-grammar-1',
  targetQuestionModes: ['EN_TO_JA'],
  ...overrides,
});

describe('dashboard start task product event helpers', () => {
  it('builds the PMF CTA event payload from a learning task intent', () => {
    expect(buildDashboardStartTaskEventInput(makeTask())).toEqual({
      eventName: 'student_dashboard_start_task',
      subjectType: 'learning_task',
      subjectId: LearningTaskIntentType.MISSION_QUIZ,
      status: 'STARTED',
      metadata: {
        mode: 'quiz',
        bookId: 'book-grammar-1',
        intentType: LearningTaskIntentType.MISSION_QUIZ,
        targetQuestionModes: ['EN_TO_JA'],
      },
    });
  });

  it('does not surface recorder failures to the learning navigation path', async () => {
    const recorder = vi.fn(async () => {
      throw new Error('analytics unavailable');
    });

    expect(recordDashboardStartTaskEvent(makeTask(), recorder)).toBeUndefined();
    await Promise.resolve();

    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'student_dashboard_start_task',
      status: 'STARTED',
    }));
  });
});
