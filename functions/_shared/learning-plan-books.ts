import { readAll } from './storage-support';
import type { AppEnv } from './types';

export const readLearningPlanBookIds = async (
  env: AppEnv,
  userId: string,
): Promise<string[]> => {
  const rows = await readAll<{ book_id: string }>(
    env,
    `SELECT book_id
     FROM learning_plan_books
     WHERE user_id = ?
     ORDER BY sort_order ASC, updated_at DESC, book_id ASC`,
    userId,
  );
  return rows.map((row) => row.book_id).filter(Boolean);
};

export const syncLearningPlanBooks = async (
  env: AppEnv,
  userId: string,
  bookIds: string[],
  now = Date.now(),
  createdAt = now,
): Promise<void> => {
  const uniqueBookIds = [...new Set(bookIds.filter(Boolean))];
  const statements = [
    env.DB.prepare('DELETE FROM learning_plan_books WHERE user_id = ?').bind(userId),
    ...uniqueBookIds.map((bookId, index) => env.DB.prepare(`
      INSERT INTO learning_plan_books (
        user_id,
        book_id,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      userId,
      bookId,
      index,
      createdAt,
      now,
    )),
  ];
  await env.DB.batch(statements);
};
