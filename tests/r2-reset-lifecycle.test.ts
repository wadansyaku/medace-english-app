import { describe, expect, it, vi } from 'vitest';

import { handleResetAllData } from '../functions/_shared/storage-learning-actions';
import type { AppEnv } from '../functions/_shared/types';

const createResetEnv = () => {
  const deletedKeys: string[] = [];
  const statements: string[] = [];

  const makeStatement = (sql: string) => {
    statements.push(sql);
    return {
      bind: vi.fn(() => makeStatement(sql)),
      all: vi.fn(async () => {
        if (sql.includes('FROM writing_submission_assets')) {
          return {
            results: [
              { r2_key: 'writing-submissions/org-1/assignment-1/attempt-1/a.pdf' },
              { r2_key: 'writing-submissions/org-1/assignment-1/attempt-1/a.pdf' },
            ],
          };
        }
        if (sql.includes('FROM words')) {
          return {
            results: [
              { example_image_key: 'word-hints/word-1/example-image.jpg' },
              { example_image_key: '' },
            ],
          };
        }
        return { results: [] };
      }),
      run: vi.fn(async () => ({ success: true })),
    };
  };

  const env = {
    DB: {
      prepare: vi.fn(makeStatement),
      batch: vi.fn(async () => []),
    },
    WRITING_ASSETS: {
      delete: vi.fn(async (key: string) => {
        deletedKeys.push(key);
      }),
    },
  } as unknown as AppEnv;

  return { env, deletedKeys, statements };
};

describe('R2 reset lifecycle', () => {
  it('deletes writing submission and word-hint asset keys before D1 rows are reset', async () => {
    const { env, deletedKeys } = createResetEnv();

    await handleResetAllData(env);

    expect(deletedKeys).toEqual([
      'writing-submissions/org-1/assignment-1/attempt-1/a.pdf',
      'word-hints/word-1/example-image.jpg',
    ]);
    expect(env.DB.prepare).toHaveBeenCalledWith('DELETE FROM english_practice_attempts');
    expect(env.DB.batch).toHaveBeenCalledTimes(1);
  });
});
