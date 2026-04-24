import type {
  CatalogImportRequest,
  CatalogImportResult,
  PrepareBookExamplesResult,
} from '../../contracts/storage';
import { BookAccessScope, BookCatalogSource, BookMetadata, GeneratedAssetAuditStatus, type EnglishLevel, type LearningTaskIntent, type UserGrade, UserRole, WordData } from '../../types';
import { getBookProgressionIndex } from '../../shared/bookProgression';
import { selectColdStartSessionWords } from '../../shared/coldStartSession';
import { rankWeaknessFocusedWords } from '../../shared/weakness';
import type { RuntimeFlags } from '../../shared/runtimeFlags';
import { formatDateKey } from '../../utils/date';
import { generateMeteredGeminiSentence } from './ai-actions';
import { normalizeCatalogImport, type NormalizedCatalogImportRow } from './catalog-import';
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

const validateNounWorkbookImportProfile = (
  payload: CatalogImportRequest,
  normalizedRows: NormalizedCatalogImportRow[],
): void => {
  const profile = payload.importProfile;
  const contextSummary = typeof payload.contextSummary === 'string' ? payload.contextSummary : '';
  const bookDescription = typeof payload.bookDescription === 'string' ? payload.bookDescription : '';
  const hasNounWorkbookBookRows = normalizedRows.some((row) => row.bookName.trim() === 'ナルシスト');
  const looksLikeNounWorkbook = payload.defaultBookName === 'ナルシスト'
    || contextSummary.includes('中学生用名詞教材')
    || bookDescription.includes('名詞単語帳')
    || hasNounWorkbookBookRows;

  if (!looksLikeNounWorkbook && profile?.kind !== 'NOUN_WORKBOOK') return;

  if (profile?.kind !== 'NOUN_WORKBOOK') {
    throw new HttpError(400, '名詞 workbook 由来の取り込みには解析 profile が必要です。');
  }

  const summary = profile.summary;
  const guardrail = profile.guardrail;
  const blockingReasons = [
    ...(guardrail?.shouldBlockImport ? guardrail.blockingReasons || ['guardrail が import 停止を要求しています。'] : []),
  ];
  const resolveUnreviewedCount = (
    rawValue: unknown,
    reviewedValue: unknown,
    unreviewedValue: unknown,
    label: string,
  ): number => {
    const raw = typeof rawValue === 'number' && Number.isFinite(rawValue) ? Math.trunc(rawValue) : 0;
    const reviewed = typeof reviewedValue === 'number' && Number.isFinite(reviewedValue) ? Math.trunc(reviewedValue) : undefined;
    const unreviewed = typeof unreviewedValue === 'number' && Number.isFinite(unreviewedValue) ? Math.trunc(unreviewedValue) : undefined;

    if (reviewed !== undefined && unreviewed !== undefined && reviewed + unreviewed !== raw) {
      blockingReasons.push(`${label} の reviewed/unreviewed 件数が raw 件数と一致しません。`);
      return raw;
    }

    return unreviewed ?? raw;
  };
  const unreviewedIndexOnlyWordCount = resolveUnreviewedCount(
    summary?.unmatchedIndexWordCount,
    summary?.reviewedIndexOnlyWordCount,
    summary?.unreviewedIndexOnlyWordCount,
    '索引 mismatch',
  );
  const unreviewedImportedOnlyWordCount = resolveUnreviewedCount(
    summary?.unmatchedImportedWordCount,
    summary?.reviewedImportedOnlyWordCount,
    summary?.unreviewedImportedOnlyWordCount,
    '取り込み mismatch',
  );
  const unreviewedDuplicateHeadwordCount = resolveUnreviewedCount(
    summary?.duplicateHeadwordCount,
    summary?.reviewedDuplicateHeadwordCount,
    summary?.unreviewedDuplicateHeadwordCount,
    '重複 headword',
  );

  if (summary?.hasIndexSheet !== true) {
    blockingReasons.push('必須シート `名詞一覧` が確認できません。');
  }
  if (summary?.importWordCount !== normalizedRows.length) {
    blockingReasons.push(`解析語数 ${summary?.importWordCount ?? 'unknown'} と正規化後語数 ${normalizedRows.length} が一致しません。`);
  }
  if ((summary?.warningIssueCount || 0) > 0) {
    blockingReasons.push(`要確認 issue が ${summary.warningIssueCount} 件残っています。`);
  }
  if (unreviewedIndexOnlyWordCount > 0) {
    blockingReasons.push(`未確認の索引だけに存在する単語が ${unreviewedIndexOnlyWordCount} 件残っています。`);
  }
  if (unreviewedImportedOnlyWordCount > 0) {
    blockingReasons.push(`未確認の取り込み結果だけに存在する単語が ${unreviewedImportedOnlyWordCount} 件残っています。`);
  }
  if (unreviewedDuplicateHeadwordCount > 0) {
    blockingReasons.push(`未確認の重複 headword が ${unreviewedDuplicateHeadwordCount} 件残っています。`);
  }

  if (blockingReasons.length > 0) {
    throw new HttpError(400, `名詞 workbook の解析結果が安全条件を満たしていません: ${blockingReasons.join(' / ')}`);
  }
};

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
  const bookDescription = typeof payload?.bookDescription === 'string' ? payload.bookDescription.trim() : undefined;
  const createdByUid = typeof payload?.createdByUid === 'string' ? payload.createdByUid : undefined;
  const optionCatalogSource = payload?.options?.catalogSource as BookCatalogSource | undefined;
  const optionAccessScope = payload?.options?.accessScope as BookAccessScope | undefined;
  const normalized = normalizeCatalogImport(payload);

  if (!defaultBookName || normalized.rows.length === 0) {
    const firstWarning = normalized.warnings[0];
    throw new HttpError(400, firstWarning?.message || 'インポート対象のデータが空です。');
  }
  validateNounWorkbookImportProfile(payload, normalized.rows);

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
        : (bookDescription || 'Imported');

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
      ...(row.category?.trim() ? { category: row.category.trim() } : {}),
      ...(row.subcategory?.trim() ? { subcategory: row.subcategory.trim() } : {}),
      ...(row.section?.trim() ? { section: row.section.trim() } : {}),
      ...(row.sourceSheet?.trim() ? { sourceSheet: row.sourceSheet.trim() } : {}),
      ...(typeof row.sourceEntryId === 'number' && Number.isFinite(row.sourceEntryId) ? { sourceEntryId: row.sourceEntryId } : {}),
      ...(row.exampleSentence?.trim() ? { exampleSentence: row.exampleSentence.trim() } : {}),
      ...(row.exampleMeaning?.trim() ? { exampleMeaning: row.exampleMeaning.trim() } : {}),
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
        id, book_id, word_number, word, definition, search_key, category, subcategory, section, source_sheet, source_entry_id, example_sentence, example_meaning, is_reported, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        word = excluded.word,
        definition = excluded.definition,
        search_key = excluded.search_key,
        category = excluded.category,
        subcategory = excluded.subcategory,
        section = excluded.section,
        source_sheet = excluded.source_sheet,
        source_entry_id = excluded.source_entry_id,
        example_sentence = COALESCE(excluded.example_sentence, example_sentence),
        example_meaning = COALESCE(excluded.example_meaning, example_meaning),
        updated_at = excluded.updated_at
    `).bind(
      word.id,
      word.bookId,
      word.number,
      word.word,
      word.definition,
      word.searchKey || word.word.toLowerCase(),
      word.category || null,
      word.subcategory || null,
      word.section || null,
      word.sourceSheet || null,
      word.sourceEntryId || null,
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
    SET example_sentence = ?,
        example_meaning = ?,
        example_generated_at = ?,
        example_audit_status = ?,
        example_audit_note = NULL,
        example_audited_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).bind(
    sentence,
    translation,
    Date.now(),
    GeneratedAssetAuditStatus.PENDING,
    Date.now(),
    wordId,
  ).run();
};

export const handlePrepareBookExamples = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
): Promise<PrepareBookExamplesResult> => {
  await assertBookWriteAccess(env, user, bookId);

  const book = await readFirst<{ source_context: string | null }>(
    env,
    'SELECT source_context FROM books WHERE id = ?',
    bookId,
  );
  if (!book) {
    throw new HttpError(404, '対象の教材が見つかりません。');
  }

  const words = await readAll<DbWordRow>(
    env,
    `SELECT *
       FROM words
      WHERE book_id = ?
        AND (
          example_sentence IS NULL OR TRIM(example_sentence) = ''
        )
      ORDER BY word_number ASC`,
    bookId,
  );

  let preparedCount = 0;
  for (const word of words) {
    const context = await generateMeteredGeminiSentence(
      env,
      user,
      {
        word: word.word,
        definition: word.definition,
        userLevel: (user.english_level as EnglishLevel | null) || undefined,
        sourceContext: book.source_context || undefined,
      },
    );

    await env.DB.prepare(`
      UPDATE words
         SET example_sentence = ?,
             example_meaning = ?,
             example_generated_at = ?,
             example_audit_status = ?,
             example_audit_note = NULL,
             example_audited_at = NULL,
             updated_at = ?
       WHERE id = ?
    `).bind(
      context.english,
      context.japanese,
      Date.now(),
      GeneratedAssetAuditStatus.PENDING,
      Date.now(),
      word.id,
    ).run();
    preparedCount += 1;
  }

  const remainingRow = await readFirst<{ count: number }>(
    env,
    `SELECT COUNT(*) AS count
       FROM words
      WHERE book_id = ?
        AND (
          example_sentence IS NULL OR TRIM(example_sentence) = ''
        )`,
    bookId,
  );

  return {
    bookId,
    preparedCount,
    remainingCount: Number(remainingRow?.count || 0),
  };
};

export const handleGetDailySessionWords = async (
  env: AppEnv,
  user: DbUserRow,
  limitInput: unknown,
  taskIntent?: LearningTaskIntent,
): Promise<WordData[]> => {
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
  const bookBandsById = Object.fromEntries(visibleBookRows.map((row) => [row.id, getBookProgressionIndex(toBookMetadata(row))]));
  const targetedNewWords = typeof taskIntent?.targetBandIndex === 'number'
    ? newRows
      .filter((row) => {
        const band = bookBandsById[row.book_id];
        return band === null || band === undefined || band >= taskIntent.targetBandIndex! - 1;
      })
      .map(toWordData)
    : newRows.map(toWordData);
  const rankedNewWords = rankWeaknessFocusedWords({
    uid: user.id,
    words: targetedNewWords,
    weaknessProfile,
    grade: (user.grade as UserGrade | null) || undefined,
    level: (user.english_level as EnglishLevel | null) || undefined,
    dateKey: formatDateKey(Date.now()),
    bookBandsById,
  });

  return [...dueRows.map(toWordData), ...rankedNewWords.slice(0, limit - dueRows.length)];
};

export const handleGetBookSession = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
  limitInput: unknown,
  taskIntent?: LearningTaskIntent,
): Promise<WordData[]> => {
  const limit = ensurePositiveLimit(limitInput, 20);
  await assertBookReadAccess(env, user, bookId);
  const selectionPolicy = taskIntent?.selectionPolicy || 'BOOK_DEFAULT';

  if (selectionPolicy === 'BOOK_NEW_ONLY') {
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
      limit,
    );
    return newRows.map(toWordData);
  }

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
  if (selectionPolicy === 'BOOK_REVIEW_ONLY' && result.length < limit) {
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
    return result.map(toWordData);
  }

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
