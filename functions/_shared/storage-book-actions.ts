import type { CatalogImportRequest, CatalogImportResult } from '../../contracts/storage';
import { BookAccessScope, BookCatalogSource, BookMetadata, type EnglishLevel, type UserGrade, UserRole, WordData } from '../../types';
import { getBookProgressionIndex } from '../../shared/bookProgression';
import { selectColdStartSessionWords } from '../../shared/coldStartSession';
import { rankWeaknessFocusedWords } from '../../shared/weakness';
import type { RuntimeFlags } from '../../shared/runtimeFlags';
import { formatDateKey } from '../../utils/date';
import { normalizeCatalogImport } from './catalog-import';
import { HttpError } from './http';
import { readWeaknessProfile } from './weakness-actions';
import {
  AppEnv,
  DbUserRow,
} from './types';
import {
  assertBookReadAccess,
  assertBookWriteAccess,
  buildInClause,
  createBookId,
  ensurePositiveLimit,
  getMasterySourceSql,
  readAll,
  readFirst,
  readVisibleBookRows,
  toBookMetadata,
  toWordData,
  type DbWordRow,
} from './storage-support';

export const handleGetBooks = async (env: AppEnv, user: DbUserRow): Promise<BookMetadata[]> => {
  const rows = await readVisibleBookRows(env, user);
  return rows.map(toBookMetadata);
};

export const handleBatchImportWords = async (
  env: AppEnv,
  user: DbUserRow,
  payload: CatalogImportRequest,
  runtimeFlags?: RuntimeFlags,
): Promise<CatalogImportResult> => {
  const defaultBookName = String(payload?.defaultBookName || '').trim();
  const contextSummary = typeof payload?.contextSummary === 'string' ? payload.contextSummary : undefined;
  const createdByUid = typeof payload?.createdByUid === 'string' ? payload.createdByUid : undefined;
  const optionCatalogSource = payload?.options?.catalogSource as BookCatalogSource | undefined;
  const optionAccessScope = payload?.options?.accessScope as BookAccessScope | undefined;
  const normalized = normalizeCatalogImport(payload);

  if (!defaultBookName || normalized.rows.length === 0) {
    const firstWarning = normalized.warnings[0];
    throw new HttpError(400, firstWarning?.message || 'インポート対象のデータが空です。');
  }

  const isOfficialImport = user.role === UserRole.ADMIN && !createdByUid;
  if (isOfficialImport && runtimeFlags && !runtimeFlags.enableDestructiveAdminActions) {
    throw new HttpError(403, '本番環境では公式教材の更新を API から実行できません。バックアップ付き CLI runbook を使用してください。');
  }

  const ownerId = isOfficialImport ? null : user.id;
  const grouped = new Map<string, { meta: BookMetadata & { createdBy: string | null; }; words: WordData[]; }>();
  const warnings = [...normalized.warnings];
  let skippedRowCount = 0;

  normalized.rows.forEach((row, index) => {
    const bookName = row.bookName || defaultBookName;
    const key = `${ownerId || 'official'}:${bookName}`;

    if (!grouped.has(key)) {
      const bookId = createBookId(bookName, ownerId || undefined, ownerId ? Date.now().toString(36) : undefined);
      const description = ownerId
        ? JSON.stringify({ createdBy: ownerId, type: 'USER_GENERATED' })
        : 'Imported';

      grouped.set(key, {
        meta: {
          id: bookId,
          title: bookName,
          wordCount: 0,
          isPriority: !ownerId && /duo/i.test(bookName),
          description,
          sourceContext: contextSummary,
          catalogSource: ownerId
            ? BookCatalogSource.USER_GENERATED
            : (optionCatalogSource || BookCatalogSource.LICENSED_PARTNER),
          accessScope: ownerId
            ? BookAccessScope.ALL_PLANS
            : (optionAccessScope || BookAccessScope.BUSINESS_ONLY),
          createdBy: ownerId,
        },
        words: [],
      });
    }

    const group = grouped.get(key)!;
    const word = row.word.trim();
    const definition = row.definition.trim();
    const number = row.number || group.words.length + 1;

    if (group.words.some((candidate) => candidate.word === word && candidate.definition === definition)) {
      skippedRowCount += 1;
      warnings.push({
        code: 'DUPLICATE_ROW',
        message: '同じ単語と意味の重複行をスキップしました。',
        rowNumber: index + 1,
      });
      return;
    }

    group.words.push({
      id: `${group.meta.id}_${number}_${index}`,
      bookId: group.meta.id,
      number,
      word,
      definition,
      searchKey: word.toLowerCase(),
    });
  });

  for (const { meta, words } of grouped.values()) {
    meta.wordCount = words.length;

    if (!meta.createdBy) {
      await env.DB.prepare('DELETE FROM words WHERE book_id = ?').bind(meta.id).run();
    }

    await env.DB.prepare(`
      INSERT INTO books (id, title, word_count, is_priority, description, source_context, created_by, catalog_source, access_scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        word_count = excluded.word_count,
        is_priority = excluded.is_priority,
        description = excluded.description,
        source_context = excluded.source_context,
        created_by = excluded.created_by,
        catalog_source = excluded.catalog_source,
        access_scope = excluded.access_scope,
        updated_at = excluded.updated_at
    `).bind(
      meta.id,
      meta.title,
      meta.wordCount,
      meta.isPriority ? 1 : 0,
      meta.description || null,
      meta.sourceContext || null,
      meta.createdBy,
      meta.catalogSource || (meta.createdBy ? BookCatalogSource.USER_GENERATED : BookCatalogSource.LICENSED_PARTNER),
      meta.accessScope || (meta.createdBy ? BookAccessScope.ALL_PLANS : BookAccessScope.BUSINESS_ONLY),
      Date.now(),
      Date.now(),
    ).run();

    const statements = words.map((word) => env.DB.prepare(`
      INSERT INTO words (
        id, book_id, word_number, word, definition, search_key, example_sentence, example_meaning, is_reported, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        word = excluded.word,
        definition = excluded.definition,
        search_key = excluded.search_key,
        updated_at = excluded.updated_at
    `).bind(
      word.id,
      word.bookId,
      word.number,
      word.word,
      word.definition,
      word.searchKey || word.word.toLowerCase(),
      word.exampleSentence || null,
      word.exampleMeaning || null,
      Date.now(),
      Date.now(),
    ));

    for (let index = 0; index < statements.length; index += 200) {
      await env.DB.batch(statements.slice(index, index + 200));
    }
  }

  const importedBookIds: string[] = [];
  let importedWordCount = 0;

  for (const { meta, words } of grouped.values()) {
    if (words.length === 0) continue;
    importedBookIds.push(meta.id);
    importedWordCount += words.length;
  }

  return {
    importedBookIds,
    importedBookCount: importedBookIds.length,
    importedWordCount,
    skippedRowCount,
    warnings,
  };
};

export const handleDeleteBook = async (env: AppEnv, user: DbUserRow, bookId: string): Promise<void> => {
  await assertBookWriteAccess(env, user, bookId);
  await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId).run();
};

export const handleGetWordsByBook = async (env: AppEnv, user: DbUserRow, bookId: string): Promise<WordData[]> => {
  await assertBookReadAccess(env, user, bookId);
  const words = await readAll<DbWordRow>(env, 'SELECT * FROM words WHERE book_id = ? ORDER BY word_number ASC', bookId);
  return words.map(toWordData);
};

export const handleUpdateWord = async (env: AppEnv, user: DbUserRow, word: WordData): Promise<void> => {
  if (!word?.id) throw new HttpError(400, '単語IDが必要です。');

  const row = await readFirst<{ book_id: string }>(env, 'SELECT book_id FROM words WHERE id = ?', word.id);
  if (!row) throw new HttpError(404, '対象の単語が見つかりません。');

  await assertBookWriteAccess(env, user, row.book_id);
  await env.DB.prepare(`
    UPDATE words
    SET word = ?, definition = ?, search_key = ?, updated_at = ?
    WHERE id = ?
  `).bind(word.word, word.definition, word.word.toLowerCase(), Date.now(), word.id).run();
};

export const handleReportWord = async (env: AppEnv, user: DbUserRow, wordId: string, reason: string): Promise<void> => {
  if (!reason.trim()) throw new HttpError(400, '報告理由を入力してください。');

  const word = await readFirst<{ id: string; book_id: string }>(env, 'SELECT id, book_id FROM words WHERE id = ?', wordId);
  if (!word) throw new HttpError(404, '対象の単語が見つかりません。');
  await assertBookReadAccess(env, user, word.book_id);

  await env.DB.prepare(`
    INSERT INTO word_reports (word_id, reporter_user_id, reason, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(wordId, user.id, reason.trim(), Date.now()).run();

  await env.DB.prepare('UPDATE words SET is_reported = 1, updated_at = ? WHERE id = ?').bind(Date.now(), wordId).run();
};

export const handleUpdateWordCache = async (
  env: AppEnv,
  user: DbUserRow,
  wordId: string,
  sentence: string,
  translation: string,
): Promise<void> => {
  const word = await readFirst<{ book_id: string }>(env, 'SELECT book_id FROM words WHERE id = ?', wordId);
  if (!word) throw new HttpError(404, '対象の単語が見つかりません。');
  await assertBookReadAccess(env, user, word.book_id);

  await env.DB.prepare(`
    UPDATE words
    SET example_sentence = ?, example_meaning = ?, updated_at = ?
    WHERE id = ?
  `).bind(sentence, translation, Date.now(), wordId).run();
};

export const handleGetDailySessionWords = async (env: AppEnv, user: DbUserRow, limitInput: unknown): Promise<WordData[]> => {
  const limit = ensurePositiveLimit(limitInput, 20);
  const visibleBookRows = await readVisibleBookRows(env, user);
  const visibleBookIds = visibleBookRows.map((row) => row.id);
  if (visibleBookIds.length === 0) return [];

  const coldStartMasteryCount = await readFirst<{ count: number }>(
    env,
    `SELECT COUNT(*) AS count
     FROM learning_histories
     WHERE user_id = ? AND ${getMasterySourceSql()}`,
    user.id,
  );

  if (Number(coldStartMasteryCount?.count || 0) === 0) {
    const allVisibleRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM words w
       WHERE w.book_id IN (${buildInClause(visibleBookIds.length)})
       ORDER BY w.book_id ASC, w.word_number ASC`,
      ...visibleBookIds,
    );

    const selection = selectColdStartSessionWords({
      uid: user.id,
      limit,
      grade: (user.grade as UserGrade | null) || undefined,
      level: (user.english_level as EnglishLevel | null) || undefined,
      books: visibleBookRows.map(toBookMetadata),
      words: allVisibleRows.map(toWordData),
    });

    if (selection.selectedWords.length >= limit) {
      return selection.selectedWords;
    }

    const selectedIds = new Set(selection.selectedWords.map((word) => word.id));
    const fallbackWords = allVisibleRows
      .map(toWordData)
      .filter((word) => !selectedIds.has(word.id))
      .slice(0, Math.max(0, limit - selection.selectedWords.length));

    return [...selection.selectedWords, ...fallbackWords];
  }

  const dueRows = await readAll<DbWordRow>(
    env,
    `SELECT w.*
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     WHERE h.user_id = ? AND h.status != 'graduated' AND h.next_review_date <= ?
       AND ${getMasterySourceSql('h')}
       AND w.book_id IN (${buildInClause(visibleBookIds.length)})
     ORDER BY h.next_review_date ASC
     LIMIT ?`,
    user.id,
    Date.now(),
    ...visibleBookIds,
    limit,
  );

  if (dueRows.length >= limit) {
    return dueRows.map(toWordData);
  }

  const newRows = await readAll<DbWordRow>(
    env,
    `SELECT w.*
     FROM words w
     WHERE NOT EXISTS (
       SELECT 1 FROM learning_histories h
       WHERE h.user_id = ? AND h.word_id = w.id
         AND ${getMasterySourceSql('h')}
     )
       AND w.book_id IN (${buildInClause(visibleBookIds.length)})
     ORDER BY w.book_id ASC, w.word_number ASC
     LIMIT ?`,
    user.id,
    ...visibleBookIds,
    Math.max(limit - dueRows.length, 20) * 6,
  );
  const weaknessProfile = await readWeaknessProfile(env, user.id);
  const rankedNewWords = rankWeaknessFocusedWords({
    uid: user.id,
    words: newRows.map(toWordData),
    weaknessProfile,
    grade: (user.grade as UserGrade | null) || undefined,
    level: (user.english_level as EnglishLevel | null) || undefined,
    dateKey: formatDateKey(Date.now()),
    bookBandsById: Object.fromEntries(visibleBookRows.map((row) => [row.id, getBookProgressionIndex(toBookMetadata(row))])),
  });

  return [...dueRows.map(toWordData), ...rankedNewWords.slice(0, limit - dueRows.length)];
};

export const handleGetBookSession = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
  limitInput: unknown,
): Promise<WordData[]> => {
  const limit = ensurePositiveLimit(limitInput, 20);
  await assertBookReadAccess(env, user, bookId);

  const dueRows = await readAll<DbWordRow>(
    env,
    `SELECT w.*
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     WHERE h.user_id = ? AND h.book_id = ? AND h.status != 'graduated' AND h.next_review_date <= ?
       AND ${getMasterySourceSql('h')}
     ORDER BY h.next_review_date ASC
     LIMIT ?`,
    user.id,
    bookId,
    Date.now(),
    limit,
  );

  const result = [...dueRows];
  if (result.length < limit) {
    const newRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM words w
       WHERE w.book_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM learning_histories h
           WHERE h.user_id = ? AND h.word_id = w.id
             AND ${getMasterySourceSql('h')}
         )
       ORDER BY w.word_number ASC
       LIMIT ?`,
      bookId,
      user.id,
      limit - result.length,
    );
    result.push(...newRows);
  }

  if (result.length < limit) {
    const aheadRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM learning_histories h
       JOIN words w ON w.id = h.word_id
       WHERE h.user_id = ? AND h.book_id = ? AND h.status != 'graduated' AND h.next_review_date > ?
         AND ${getMasterySourceSql('h')}
       ORDER BY h.next_review_date ASC
       LIMIT ?`,
      user.id,
      bookId,
      Date.now(),
      limit - result.length,
    );
    result.push(...aheadRows);
  }

  return result.map(toWordData);
};
