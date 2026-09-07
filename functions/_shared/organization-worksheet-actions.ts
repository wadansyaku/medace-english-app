import {
  GeneratedAssetAuditStatus,
  type LearningHistory,
  type StudentWorksheetSnapshot,
  UserRole,
} from '../../types';
import { projectWordHintAssetsForLearner } from '../../shared/wordHintAssets';
import { HttpError } from './http';
import { readActiveOrganizationMember } from './organization-support';
import { canAccessVisibleStudent } from './student-visibility';
import type { AppEnv, DbUserRow } from './types';
import {
  DAY_MS,
  FALLBACK_WORKSHEET_WORD_LIMIT,
  WORKSHEET_STATUSES,
  buildInClause,
  getMasteryProgressSql,
  readAll,
  readFirst,
  readVisibleLearningBookRows,
  type DbWordRow,
} from './storage-support';

interface WorksheetExampleProjectionInput {
  id: string;
  bookId: string;
  word: string;
  definition: string;
  exampleSentence: string | null;
  exampleMeaning: string | null;
  exampleGeneratedAt: number | null;
  exampleAuditStatus: string | null;
  exampleAuditedAt: number | null;
}

const projectWorksheetExample = (input: WorksheetExampleProjectionInput): {
  exampleSentence: string | null;
  exampleMeaning: string | null;
} => {
  const projected = projectWordHintAssetsForLearner({
    id: input.id,
    bookId: input.bookId,
    number: 0,
    word: input.word,
    definition: input.definition,
    exampleSentence: input.exampleSentence,
    exampleMeaning: input.exampleMeaning,
    exampleGeneratedAt: input.exampleGeneratedAt,
    exampleAuditStatus: (input.exampleAuditStatus as GeneratedAssetAuditStatus | null) || null,
  }, {
    exampleAuditedAt: input.exampleAuditedAt,
  });

  return {
    exampleSentence: projected.exampleSentence,
    exampleMeaning: projected.exampleMeaning,
  };
};

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

  const fullStudent = await readFirst<DbUserRow>(env, 'SELECT * FROM users WHERE id = ?', studentUid);
  const selectableBooks = fullStudent ? await readVisibleLearningBookRows(env, fullStudent) : [];
  const selectableBookIds = selectableBooks.map((book) => book.id);

  const rows = selectableBookIds.length > 0 ? await readAll<{
    word_id: string;
    book_id: string;
    book_title: string;
    word: string;
    definition: string;
    status: LearningHistory['status'];
    last_studied_at: number;
    attempt_count: number;
    correct_count: number;
    example_sentence: string | null;
    example_meaning: string | null;
    example_generated_at: number | null;
    example_audit_status: string | null;
    example_audited_at: number | null;
  }>(
    env,
    `SELECT
       w.id AS word_id,
       w.book_id AS book_id,
       b.title AS book_title,
       w.word AS word,
       w.definition AS definition,
       w.example_sentence AS example_sentence,
       w.example_meaning AS example_meaning,
       w.example_generated_at AS example_generated_at,
       w.example_audit_status AS example_audit_status,
       w.example_audited_at AS example_audited_at,
       h.status AS status,
       h.last_studied_at AS last_studied_at,
       h.attempt_count AS attempt_count,
       h.correct_count AS correct_count
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     JOIN books b ON b.id = h.book_id
     WHERE h.user_id = ?
       AND h.book_id IN (${buildInClause(selectableBookIds.length)})
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
    ...selectableBookIds,
  ) : [];

  if (rows.length === 0) {
    const fallbackWords: StudentWorksheetSnapshot['words'] = [];
    const candidateBooks = selectableBooks.slice(0, Math.min(5, selectableBooks.length));
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
        const projectedExample = projectWorksheetExample({
          id: word.id,
          bookId: word.book_id,
          word: word.word,
          definition: word.definition,
          exampleSentence: word.example_sentence,
          exampleMeaning: word.example_meaning,
          exampleGeneratedAt: word.example_generated_at,
          exampleAuditStatus: word.example_audit_status,
          exampleAuditedAt: word.example_audited_at,
        });
        fallbackWords.push({
          wordId: word.id,
          bookId: book.id,
          bookTitle: book.title,
          word: word.word,
          definition: word.definition,
          ...projectedExample,
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
        source: 'catalog_fallback',
        sourceLabel: '教材カタログ fallback（学習履歴なし）',
        words: fallbackWords,
      };
    }

    return {
      studentUid: student.id,
      studentName: student.display_name,
      organizationName: student.organization_name || undefined,
      source: 'starter_fallback',
      sourceLabel: 'スターター fallback（学習履歴なし）',
      words: [
        {
          wordId: 'worksheet-1',
          bookId: 'mock-book-1',
          bookTitle: 'スターター確認問題',
          word: 'diagnosis',
          definition: '診断',
          exampleSentence: 'Doctors confirm the diagnosis before treatment.',
          exampleMeaning: '医師は 治療前に 診断を 確認する。',
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
          exampleSentence: 'The patient received treatment at the clinic.',
          exampleMeaning: '患者は クリニックで 治療を 受けた。',
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
          exampleSentence: 'A fever can be a symptom of infection.',
          exampleMeaning: '発熱は 感染の 症状に なり得る。',
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
    source: 'history',
    sourceLabel: '学習履歴ベース',
    words: rows.map((row) => {
      const projectedExample = projectWorksheetExample({
        id: row.word_id,
        bookId: row.book_id,
        word: row.word,
        definition: row.definition,
        exampleSentence: row.example_sentence,
        exampleMeaning: row.example_meaning,
        exampleGeneratedAt: row.example_generated_at,
        exampleAuditStatus: row.example_audit_status,
        exampleAuditedAt: row.example_audited_at,
      });

      return {
        wordId: row.word_id,
        bookId: row.book_id,
        bookTitle: row.book_title,
        word: row.word,
        definition: row.definition,
        ...projectedExample,
        status: row.status,
        lastStudiedAt: Number(row.last_studied_at || 0),
        attemptCount: Number(row.attempt_count || 0),
        correctCount: Number(row.correct_count || 0),
      };
    }),
  };
};
