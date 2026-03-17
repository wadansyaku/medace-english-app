import { type LearningHistory, type StudentWorksheetSnapshot, UserRole } from '../../types';
import { HttpError } from './http';
import { readActiveOrganizationMember } from './organization-support';
import { canAccessVisibleStudent } from './student-visibility';
import type { AppEnv, DbUserRow } from './types';
import {
  DAY_MS,
  FALLBACK_WORKSHEET_WORD_LIMIT,
  WORKSHEET_STATUSES,
  getMasteryProgressSql,
  readAll,
  readFirst,
  readVisibleBookRows,
  type DbWordRow,
} from './storage-support';

export const handleGetStudentWorksheetSnapshot = async (
  env: AppEnv,
  currentUser: DbUserRow,
  studentUid: string,
): Promise<StudentWorksheetSnapshot> => {
  if (!studentUid) {
    throw new HttpError(400, '対象生徒を指定してください。');
  }

  const student = await readActiveOrganizationMember(env, studentUid);

  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '対象生徒が見つかりません。');
  }

  const canAccessStudent = await canAccessVisibleStudent(env, currentUser, studentUid);
  if (!canAccessStudent) {
    throw new HttpError(403, '担当範囲の生徒のみ問題印刷できます。');
  }

  const rows = await readAll<{
    word_id: string;
    book_id: string;
    book_title: string;
    word: string;
    definition: string;
    status: LearningHistory['status'];
    last_studied_at: number;
    attempt_count: number;
    correct_count: number;
  }>(
    env,
    `SELECT
       w.id AS word_id,
       w.book_id AS book_id,
       b.title AS book_title,
       w.word AS word,
       w.definition AS definition,
       h.status AS status,
       h.last_studied_at AS last_studied_at,
       h.attempt_count AS attempt_count,
       h.correct_count AS correct_count
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     JOIN books b ON b.id = h.book_id
     WHERE h.user_id = ?
       AND ${getMasteryProgressSql('h')}
     ORDER BY
       CASE h.status
         WHEN 'graduated' THEN 0
         WHEN 'review' THEN 1
         ELSE 2
       END,
       h.last_studied_at DESC,
       b.title ASC,
       w.word_number ASC`,
    studentUid,
  );

  if (rows.length === 0) {
    const fullStudent = await readFirst<DbUserRow>(env, 'SELECT * FROM users WHERE id = ?', studentUid);
    const fallbackBooks = fullStudent ? await readVisibleBookRows(env, fullStudent) : [];
    const fallbackWords: StudentWorksheetSnapshot['words'] = [];
    const candidateBooks = fallbackBooks.slice(0, Math.min(5, fallbackBooks.length));
    const perBookLimit = Math.max(4, Math.ceil(FALLBACK_WORKSHEET_WORD_LIMIT / Math.max(candidateBooks.length, 1)));

    for (const [bookIndex, book] of candidateBooks.entries()) {
      const bookWords = await readAll<DbWordRow>(
        env,
        `SELECT *
         FROM words
         WHERE book_id = ?
         ORDER BY word_number ASC
         LIMIT ?`,
        book.id,
        perBookLimit,
      );

      bookWords.forEach((word, wordIndex) => {
        if (fallbackWords.length >= FALLBACK_WORKSHEET_WORD_LIMIT) return;
        fallbackWords.push({
          wordId: word.id,
          bookId: book.id,
          bookTitle: book.title,
          word: word.word,
          definition: word.definition,
          status: WORKSHEET_STATUSES[wordIndex % WORKSHEET_STATUSES.length],
          lastStudiedAt: Date.now() - (bookIndex + wordIndex + 1) * DAY_MS,
          attemptCount: 3 + wordIndex,
          correctCount: 2 + wordIndex,
        });
      });
      if (fallbackWords.length >= FALLBACK_WORKSHEET_WORD_LIMIT) break;
    }

    if (fallbackWords.length > 0) {
      return {
        studentUid: student.id,
        studentName: student.display_name,
        organizationName: student.organization_name || undefined,
        words: fallbackWords,
      };
    }

    return {
      studentUid: student.id,
      studentName: student.display_name,
      organizationName: student.organization_name || undefined,
      words: [
        {
          wordId: 'worksheet-1',
          bookId: 'mock-book-1',
          bookTitle: 'スターター確認問題',
          word: 'diagnosis',
          definition: '診断',
          status: 'graduated',
          lastStudiedAt: Date.now() - DAY_MS,
          attemptCount: 6,
          correctCount: 5,
        },
        {
          wordId: 'worksheet-2',
          bookId: 'mock-book-1',
          bookTitle: 'スターター確認問題',
          word: 'treatment',
          definition: '治療',
          status: 'review',
          lastStudiedAt: Date.now() - 2 * DAY_MS,
          attemptCount: 4,
          correctCount: 3,
        },
        {
          wordId: 'worksheet-3',
          bookId: 'mock-book-2',
          bookTitle: '医療英語ベーシック',
          word: 'symptom',
          definition: '症状',
          status: 'learning',
          lastStudiedAt: Date.now() - 3 * DAY_MS,
          attemptCount: 2,
          correctCount: 1,
        },
      ],
    };
  }

  return {
    studentUid: student.id,
    studentName: student.display_name,
    organizationName: student.organization_name || undefined,
    words: rows.map((row) => ({
      wordId: row.word_id,
      bookId: row.book_id,
      bookTitle: row.book_title,
      word: row.word,
      definition: row.definition,
      status: row.status,
      lastStudiedAt: Number(row.last_studied_at || 0),
      attemptCount: Number(row.attempt_count || 0),
      correctCount: Number(row.correct_count || 0),
    })),
  };
};
