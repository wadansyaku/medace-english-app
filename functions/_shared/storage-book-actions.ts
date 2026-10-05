import type {
  CatalogImportRequest,
  CatalogImportResult,
  PrepareBookExamplesResult,
} from '../../contracts/storage';
import { BookAccessScope, BookCatalogSource, BookMetadata, GeneratedAssetAuditStatus, LearningTaskIntentType, type EnglishLevel, type LearningTaskIntent, type UserGrade, UserRole, WordData } from '../../types';
import { getBookProgressionIndex } from '../../shared/bookProgression';
import { selectColdStartSessionWords } from '../../shared/coldStartSession';
import { normalizeStudySessionLimit } from '../../shared/studySession';
import { NARU_BOOK_ID } from '../../shared/naruBook';
import type { BookStudyOverview, StudyWordRange } from '../../types';
import { assertNoDailyStudyWordRange, getBookTaskWordRange, normalizeStudyWordRange } from '../../shared/studyScope';
import { normalizeTaskPreferredBookIds } from '../../shared/learningTask';
import { isBookSelectableForToday } from '../../shared/materialQuality';
import { inspectCatalogImportContent } from '../../shared/catalogImport';
import { rankWeaknessFocusedWords } from '../../shared/weakness';
import type { RuntimeFlags } from '../../shared/runtimeFlags';
import { formatDateKey } from '../../utils/date';
import { generateMeteredGeminiSentence } from './ai-actions';
import { assertBudgetAvailable } from './ai-metering';
import { catalogRowsAreEquivalent, normalizeCatalogImport, type NormalizedCatalogImportRow } from './catalog-import';
import { HttpError } from './http';
import { requireRole } from './auth';
import { readLearningPlanBookIds } from './learning-plan-books';
import { readWeaknessProfile } from './weakness-actions';
import {
  AppEnv,
  DbUserRow,
} from './types';
import {
  assertBookLearningAccess,
  assertBookReadAccess,
  assertBookWriteAccess,
  buildInClause,
  createBookId,
  getMasterySourceSql,
  getMasteryProgressSql,
  readAll,
  readFirst,
  readVisibleBookRows,
  toBookMetadata,
  toWordData,
  type DbWordRow,
} from './storage-support';

const validateStudyScope = <T>(validate: () => T): T => {
  try { return validate(); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '単語範囲が不正です。'); }
};

const resolvePreferredDailyBookIds = async (
  env: AppEnv,
  userId: string,
  taskIntent?: LearningTaskIntent,
): Promise<string[]> => {
  const taskBookIds = normalizeTaskPreferredBookIds(taskIntent?.preferredBookIds);
  if (taskBookIds.length > 0) return taskBookIds;
  return normalizeTaskPreferredBookIds(await readLearningPlanBookIds(env, userId));
};

const filterBookRowsByPreferredIds = <T extends { id: string }>(
  rows: T[],
  preferredBookIds: string[],
): T[] => {
  if (preferredBookIds.length === 0) return rows;
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return preferredBookIds
    .map((bookId) => rowsById.get(bookId))
    .filter((row): row is T => Boolean(row));
};

const sortWordRowsByPreferredBookOrder = <T extends { book_id: string; word_number: number; id: string }>(
  rows: T[],
  preferredBookIds: string[],
): T[] => {
  const bookOrder = new Map(preferredBookIds.map((bookId, index) => [bookId, index]));
  return [...rows].sort((left, right) => {
    const leftOrder = bookOrder.get(left.book_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = bookOrder.get(right.book_id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (left.book_id !== right.book_id) return left.book_id.localeCompare(right.book_id);
    if (left.word_number !== right.word_number) return left.word_number - right.word_number;
    return left.id.localeCompare(right.id);
  });
};

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

const toCoverageRate = (coveredCount: number, totalCount: number): number => (
  totalCount > 0 ? Math.round((coveredCount / totalCount) * 10000) / 10000 : 0
);

const countDuplicateHeadwords = (words: WordData[]): number => {
  const counts = new Map<string, number>();
  words.forEach((word) => {
    const key = (word.searchKey || word.word || '').trim().toLowerCase();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
};

const upsertOfficialMaterialSourceLedger = async (
  env: AppEnv,
  meta: BookMetadata & { createdBy: string | null; },
  words: WordData[],
  payload: CatalogImportRequest,
  sourceContextChanged: boolean,
): Promise<void> => {
  if (meta.createdBy) return;

  const catalogSource = meta.catalogSource || BookCatalogSource.LICENSED_PARTNER;
  const now = Date.now();
  const contentQa = inspectCatalogImportContent(words);
  const sourceKind = typeof payload.source?.kind === 'string' ? payload.source.kind : 'unknown';
  const sourceFileName = payload.source.kind === 'csv' ? payload.source.fileName?.trim().split(/[\\/]/).pop() : undefined;
  const sourceFile = `api-import/${sourceKind}${sourceFileName ? `/${sourceFileName}` : ''}`;
  const sourceCoverageRate = toCoverageRate(
    words.filter((word) => Boolean(word.sourceSheet?.trim()) && Number.isSafeInteger(word.sourceEntryId) && word.sourceEntryId! > 0).length,
    words.length,
  );
  const examplePairCoverageRate = toCoverageRate(
    words.filter((word) => Boolean(word.exampleSentence) && Boolean(word.exampleMeaning)).length,
    words.length,
  );

  await env.DB.prepare(`
    INSERT INTO material_source_ledger (
      source_id,
      book_id,
      catalog_source,
      book_title,
      edition,
      rights_status,
      review_status,
      source_file,
      extracted_at,
      transform_log,
      content_qa_report,
      qa_word_count,
      qa_required_blank_rows,
      qa_rows_with_sentinel,
      qa_sentinel_value_count,
      qa_duplicate_headword_count,
      qa_source_coverage_rate,
      qa_example_pair_coverage_rate,
      notes,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(book_id) DO UPDATE SET
      source_id = excluded.source_id,
      catalog_source = excluded.catalog_source,
      book_title = excluded.book_title,
      edition = excluded.edition,
      rights_status = CASE
        WHEN material_source_ledger.rights_status = 'blocked' THEN 'blocked'
        WHEN material_source_ledger.catalog_source = excluded.catalog_source
          AND material_source_ledger.source_file = excluded.source_file
          AND ${sourceContextChanged ? 0 : 1} = 1
          THEN material_source_ledger.rights_status
        ELSE 'pending'
      END,
      review_status = excluded.review_status,
      source_file = excluded.source_file,
      extracted_at = excluded.extracted_at,
      transform_log = excluded.transform_log,
      content_qa_report = excluded.content_qa_report,
      qa_word_count = excluded.qa_word_count,
      qa_required_blank_rows = excluded.qa_required_blank_rows,
      qa_rows_with_sentinel = excluded.qa_rows_with_sentinel,
      qa_sentinel_value_count = excluded.qa_sentinel_value_count,
      qa_duplicate_headword_count = excluded.qa_duplicate_headword_count,
      qa_source_coverage_rate = excluded.qa_source_coverage_rate,
      qa_example_pair_coverage_rate = excluded.qa_example_pair_coverage_rate,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).bind(
    `ledger-${meta.id}`,
    meta.id,
    catalogSource,
    meta.title,
    'api-import',
    'pending',
    'needs_review',
    sourceFile,
    new Date(now).toISOString(),
    'normalizeCatalogImport + handleBatchImportWords',
    'api-import-inline-content-qa',
    words.length,
    contentQa.requiredBlankRows,
    contentQa.rowsWithSentinel,
    contentQa.sentinelValueCount,
    countDuplicateHeadwords(words),
    sourceCoverageRate,
    examplePairCoverageRate,
    'Content QA measured accepted rows. New official imports require rights approval; every content import resets review to needs_review. Existing rights decisions are retained only for an unchanged catalog/source identity, and never granted by catalogSource.',
    now,
    now,
  ).run();
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
    throw new HttpError(403, '本番環境では公式教材の更新を API から実行できません。バックアップ付き運用手順を使用してください。');
  }
  if (isOfficialImport && optionCatalogSource === BookCatalogSource.USER_GENERATED) {
    throw new HttpError(400, '所有者のない公式教材に個人作成の分類は指定できません。');
  }
  if (isOfficialImport && normalized.warnings.length > 0) {
    const issue = normalized.warnings[0];
    throw new HttpError(400, `公式教材の取り込みを保存前に停止しました。${issue.rowNumber ? `${issue.rowNumber}行目: ` : ''}${issue.message}`);
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

    if (group.words.some((candidate) => catalogRowsAreEquivalent(candidate, row))) {
      skippedRowCount += 1;
      warnings.push({
        code: 'DUPLICATE_ROW',
        message: '単語・意味・用例・品詞・出典がすべて同じ重複行をスキップしました。',
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
      ...(row.partOfSpeech ? { partOfSpeech: row.partOfSpeech } : {}),
      ...(row.inflections ? { inflections: row.inflections } : {}),
      ...(row.pronunciation ? { pronunciation: row.pronunciation } : {}),
      ...(row.sourceNote ? { sourceNote: row.sourceNote } : {}),
      ...(row.category?.trim() ? { category: row.category.trim() } : {}),
      ...(row.subcategory?.trim() ? { subcategory: row.subcategory.trim() } : {}),
      ...(row.section?.trim() ? { section: row.section.trim() } : {}),
      ...(row.sourceSheet?.trim() ? { sourceSheet: row.sourceSheet.trim() } : {}),
      ...(typeof row.sourceEntryId === 'number' && Number.isFinite(row.sourceEntryId) ? { sourceEntryId: row.sourceEntryId } : {}),
      ...(row.exampleSentence?.trim() ? { exampleSentence: row.exampleSentence.trim() } : {}),
      ...(row.exampleMeaning?.trim() ? { exampleMeaning: row.exampleMeaning.trim() } : {}),
    });
  });

  // Check every book before the first DELETE/INSERT so a rejected request
  // cannot remove previously reviewed material or its learning histories.
  const changedSourceContextBookIds = new Set<string>();
  for (const { meta, words } of grouped.values()) {
    const qa = inspectCatalogImportContent(words);
    if (qa.requiredBlankRows > 0 || qa.rowsWithSentinel > 0) {
      throw new HttpError(400, '不完全な教材を含むため、取り込みを保存前に停止しました。');
    }
    if (!meta.createdBy) {
      const existing = await readFirst<{ source_context: string | null }>(env, 'SELECT source_context FROM books WHERE id = ?', meta.id);
      if (existing && (existing.source_context || '') !== (meta.sourceContext || '')) changedSourceContextBookIds.add(meta.id);
    }
  }

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

    await upsertOfficialMaterialSourceLedger(env, meta, words, payload, changedSourceContextBookIds.has(meta.id));

    const statements = words.map((word) => env.DB.prepare(`
      INSERT INTO words (
        id, book_id, word_number, word, definition, search_key, category, subcategory, section, source_sheet, source_entry_id, example_sentence, example_meaning, part_of_speech, inflections, pronunciation, source_note, is_reported, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        word = excluded.word,
        definition = excluded.definition,
        search_key = excluded.search_key,
        category = excluded.category,
        subcategory = excluded.subcategory,
        section = excluded.section,
        source_sheet = excluded.source_sheet,
        source_entry_id = excluded.source_entry_id,
        part_of_speech = excluded.part_of_speech,
        inflections = excluded.inflections,
        pronunciation = excluded.pronunciation,
        source_note = excluded.source_note,
        example_sentence = COALESCE(excluded.example_sentence, example_sentence),
        example_meaning = COALESCE(excluded.example_meaning, example_meaning),
        example_audit_status = CASE WHEN (words.example_generated_at IS NOT NULL OR NULLIF(TRIM(words.example_audit_status), '') IS NOT NULL)
          AND ((words.word IS NOT excluded.word OR words.definition IS NOT excluded.definition)
          OR (excluded.example_sentence IS NOT NULL AND words.example_sentence IS NOT excluded.example_sentence)
          OR (excluded.example_meaning IS NOT NULL AND words.example_meaning IS NOT excluded.example_meaning))
          THEN 'REVIEW_REQUIRED' ELSE words.example_audit_status END,
        example_audited_at = CASE WHEN (words.example_generated_at IS NOT NULL OR NULLIF(TRIM(words.example_audit_status), '') IS NOT NULL)
          AND ((words.word IS NOT excluded.word OR words.definition IS NOT excluded.definition)
          OR (excluded.example_sentence IS NOT NULL AND words.example_sentence IS NOT excluded.example_sentence)
          OR (excluded.example_meaning IS NOT NULL AND words.example_meaning IS NOT excluded.example_meaning))
          THEN NULL ELSE words.example_audited_at END,
        example_image_audit_status = CASE WHEN (words.example_image_generated_at IS NOT NULL OR NULLIF(TRIM(words.example_image_audit_status), '') IS NOT NULL)
          AND (words.word IS NOT excluded.word OR words.definition IS NOT excluded.definition)
          THEN 'REVIEW_REQUIRED' ELSE words.example_image_audit_status END,
        example_image_audited_at = CASE WHEN (words.example_image_generated_at IS NOT NULL OR NULLIF(TRIM(words.example_image_audit_status), '') IS NOT NULL)
          AND (words.word IS NOT excluded.word OR words.definition IS NOT excluded.definition)
          THEN NULL ELSE words.example_image_audited_at END,
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
      word.partOfSpeech || null,
      word.inflections || null,
      word.pronunciation || null,
      word.sourceNote || null,
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
  await assertBookLearningAccess(env, user, bookId);
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
    SET word = ?, definition = ?, search_key = ?, updated_at = ?,
        example_audit_status = CASE WHEN
          (example_generated_at IS NOT NULL OR NULLIF(TRIM(example_audit_status), '') IS NOT NULL)
          AND (word IS NOT ? OR definition IS NOT ?)
          THEN 'REVIEW_REQUIRED' ELSE example_audit_status END,
        example_audited_at = CASE WHEN
          (example_generated_at IS NOT NULL OR NULLIF(TRIM(example_audit_status), '') IS NOT NULL)
          AND (word IS NOT ? OR definition IS NOT ?)
          THEN NULL ELSE example_audited_at END,
        example_image_audit_status = CASE WHEN
          (example_image_generated_at IS NOT NULL OR NULLIF(TRIM(example_image_audit_status), '') IS NOT NULL)
          AND (word IS NOT ? OR definition IS NOT ?)
          THEN 'REVIEW_REQUIRED' ELSE example_image_audit_status END,
        example_image_audited_at = CASE WHEN
          (example_image_generated_at IS NOT NULL OR NULLIF(TRIM(example_image_audit_status), '') IS NOT NULL)
          AND (word IS NOT ? OR definition IS NOT ?)
          THEN NULL ELSE example_image_audited_at END
    WHERE id = ?
  `).bind(
    word.word, word.definition, word.word.toLowerCase(), Date.now(),
    word.word, word.definition, word.word, word.definition,
    word.word, word.definition, word.word, word.definition, word.id,
  ).run();
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

export const handlePrepareBookExamples = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
): Promise<PrepareBookExamplesResult> => {
  requireRole(user, [UserRole.ADMIN]);
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
        AND NOT EXISTS (
          SELECT 1 FROM word_example_generation_claims c WHERE c.word_id = words.id
        )
      ORDER BY word_number ASC
      LIMIT 10`,
    bookId,
  );

  let preparedCount = 0;
  for (const word of words) {
    // Known configuration and budget failures must not consume a durable claim.
    if (!env.GEMINI_API_KEY) throw new HttpError(503, 'GEMINI_API_KEY が未設定です。');
    await assertBudgetAvailable(env, user, 'generateGeminiSentence');
    const claimId = crypto.randomUUID();
    const claim = await env.DB.prepare(`
      INSERT INTO word_example_generation_claims (word_id, claim_id, started_at)
      SELECT id, ?, ? FROM words
      WHERE id = ? AND book_id = ?
        AND word IS ? AND definition IS ?
        AND (example_sentence IS NULL OR TRIM(example_sentence) = '')
      ON CONFLICT(word_id) DO NOTHING
    `).bind(claimId, Date.now(), word.id, bookId, word.word, word.definition).run();
    if ((claim.meta.changes ?? 0) !== 1) continue;

    // Retain the claim after any failure, including uncertain provider responses or
    // database write failures. Automatically retrying could incur a second charge.
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

    if (typeof context?.english !== 'string' || !context.english.trim()
      || typeof context?.japanese !== 'string' || !context.japanese.trim()) {
      throw new HttpError(502, '例文準備の結果を確認できませんでした。再課金を防ぐため自動再試行は停止しています。');
    }
    const generatedAt = Date.now();
    const saved = await env.DB.prepare(`
      UPDATE words
         SET example_sentence = ?,
             example_meaning = ?,
             example_generated_at = ?,
             example_audit_status = ?,
             example_audit_note = NULL,
             example_audited_at = NULL,
             updated_at = ?
       WHERE id = ? AND book_id = ?
         AND word IS ? AND definition IS ?
         AND (example_sentence IS NULL OR TRIM(example_sentence) = '')
         AND EXISTS (
           SELECT 1 FROM word_example_generation_claims c
           WHERE c.word_id = words.id AND c.claim_id = ? AND c.completed_at IS NULL
         )
    `).bind(
      context.english.trim(),
      context.japanese.trim(),
      generatedAt,
      GeneratedAssetAuditStatus.PENDING,
      generatedAt,
      word.id,
      bookId,
      word.word,
      word.definition,
      claimId,
    ).run();
    if ((saved.meta.changes ?? 0) !== 1) {
      throw new HttpError(409, '単語が別の操作で更新されたため、既存の例文を保持しました。再課金を防ぐため自動再試行は停止しています。');
    }
    await env.DB.prepare(`
      UPDATE word_example_generation_claims SET completed_at = ?
      WHERE word_id = ? AND claim_id = ? AND completed_at IS NULL
    `).bind(Date.now(), word.id, claimId).run();
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
  validateStudyScope(() => assertNoDailyStudyWordRange(taskIntent));
  const limit = normalizeStudySessionLimit(limitInput);
  const allVisibleBookRows = (await readVisibleBookRows(env, user))
    .filter((row) => isBookSelectableForToday(toBookMetadata(row)));
  const requestedBookIds = await resolvePreferredDailyBookIds(env, user.id, taskIntent);
  const preferredBookIds = requestedBookIds.length === 0 && allVisibleBookRows.some(row => row.id === NARU_BOOK_ID)
    ? [NARU_BOOK_ID]
    : requestedBookIds;
  const preferredVisibleBookRows = filterBookRowsByPreferredIds(allVisibleBookRows, preferredBookIds);
  const shouldFallbackToAllVisibleBooks = preferredBookIds.length > 0
    && preferredVisibleBookRows.length === 0
    && allVisibleBookRows.length > 0;
  const effectivePreferredBookIds = shouldFallbackToAllVisibleBooks ? [] : preferredBookIds;
  const visibleBookRows = shouldFallbackToAllVisibleBooks ? allVisibleBookRows : preferredVisibleBookRows;
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
    const sortedVisibleRows = sortWordRowsByPreferredBookOrder(allVisibleRows, effectivePreferredBookIds);

    if (effectivePreferredBookIds.length > 0) {
      return sortedVisibleRows.map(toWordData).slice(0, limit);
    }

    const selection = selectColdStartSessionWords({
      uid: user.id,
      limit,
      grade: (user.grade as UserGrade | null) || undefined,
      level: (user.english_level as EnglishLevel | null) || undefined,
      books: visibleBookRows.map(toBookMetadata),
      words: sortedVisibleRows.map(toWordData),
    });

    if (selection.selectedWords.length >= limit) {
      return selection.selectedWords;
    }

    const selectedIds = new Set(selection.selectedWords.map((word) => word.id));
    const fallbackWords = sortedVisibleRows
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
  const sortedNewRows = sortWordRowsByPreferredBookOrder(newRows, effectivePreferredBookIds);
  const targetedNewWords = typeof taskIntent?.targetBandIndex === 'number'
    ? sortedNewRows
      .filter((row) => {
        const band = bookBandsById[row.book_id];
        return band === null || band === undefined || band >= taskIntent.targetBandIndex! - 1;
      })
      .map(toWordData)
    : sortedNewRows.map(toWordData);
  const shouldUseSequentialNewWords = taskIntent?.intentType === LearningTaskIntentType.TODAY_FOCUS
    || effectivePreferredBookIds.length > 0;
  const rankedNewWords = shouldUseSequentialNewWords
    ? targetedNewWords
    : rankWeaknessFocusedWords({
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
  const range = validateStudyScope(() => getBookTaskWordRange(taskIntent, bookId));
  const rangeSql = range ? 'AND w.word_number BETWEEN ? AND ?' : '';
  const rangeParams = range ? [range.start, range.end] : [];
  const now = Date.now();
  const limit = normalizeStudySessionLimit(limitInput);
  await assertBookLearningAccess(env, user, bookId);
  const selectionPolicy = taskIntent?.selectionPolicy || 'BOOK_DEFAULT';
  const historyCondition = range !== undefined || selectionPolicy === 'BOOK_DUE_ONLY'
    ? getMasteryProgressSql('h') : getMasterySourceSql('h');

  if (selectionPolicy === 'BOOK_NEW_ONLY') {
    const newRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM words w
       WHERE w.book_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM learning_histories h
           WHERE h.user_id = ? AND h.word_id = w.id AND h.book_id = w.book_id
             AND ${historyCondition}
         )
         ${rangeSql}
       ORDER BY w.word_number ASC
       LIMIT ?`,
      bookId,
      user.id,
      ...rangeParams,
      limit,
    );
    return newRows.map(toWordData);
  }

  const dueRows = await readAll<DbWordRow>(
    env,
    `SELECT w.*
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id AND w.book_id = h.book_id
     WHERE h.user_id = ? AND h.book_id = ? AND h.status != 'graduated' AND h.next_review_date <= ?
       AND ${historyCondition}
       ${rangeSql}
     ORDER BY h.next_review_date ASC
     LIMIT ?`,
    user.id,
    bookId,
    now,
    ...rangeParams,
    limit,
  );

  const result = [...dueRows];
  if (selectionPolicy === 'BOOK_DUE_ONLY') return result.map(toWordData);
  if (selectionPolicy === 'BOOK_REVIEW_ONLY' && result.length < limit) {
    const aheadRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM learning_histories h
       JOIN words w ON w.id = h.word_id AND w.book_id = h.book_id
       WHERE h.user_id = ? AND h.book_id = ? AND h.status != 'graduated' AND h.next_review_date > ?
         AND ${historyCondition}
         ${rangeSql}
       ORDER BY h.next_review_date ASC
       LIMIT ?`,
      user.id,
      bookId,
      now,
      ...rangeParams,
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
           WHERE h.user_id = ? AND h.word_id = w.id AND h.book_id = w.book_id
             AND ${historyCondition}
         )
         ${rangeSql}
       ORDER BY w.word_number ASC
       LIMIT ?`,
      bookId,
      user.id,
      ...rangeParams,
      limit - result.length,
    );
    result.push(...newRows);
  }

  if (result.length < limit) {
    const aheadRows = await readAll<DbWordRow>(
      env,
      `SELECT w.*
       FROM learning_histories h
       JOIN words w ON w.id = h.word_id AND w.book_id = h.book_id
       WHERE h.user_id = ? AND h.book_id = ? AND h.status != 'graduated' AND h.next_review_date > ?
         AND ${historyCondition}
         ${rangeSql}
       ORDER BY h.next_review_date ASC
       LIMIT ?`,
      user.id,
      bookId,
      now,
      ...rangeParams,
      limit - result.length,
    );
    result.push(...aheadRows);
  }

  return result.map(toWordData);
};

export const handleGetBookStudyOverview = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
  wordRange?: StudyWordRange,
): Promise<BookStudyOverview> => {
  const range = validateStudyScope(() => normalizeStudyWordRange(wordRange));
  await assertBookLearningAccess(env, user, bookId);
  const row = await readFirst<{ total_count: number; studied_count: number; due_count: number }>(env,
    `SELECT COUNT(*) AS total_count,
       COALESCE(SUM(CASE WHEN h.word_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS studied_count,
       COALESCE(SUM(CASE WHEN h.word_id IS NOT NULL AND h.status != 'graduated' AND h.next_review_date <= ? THEN 1 ELSE 0 END), 0) AS due_count
     FROM words w
     LEFT JOIN learning_histories h ON h.word_id = w.id AND h.book_id = w.book_id
       AND h.user_id = ? AND ${getMasteryProgressSql('h')}
     WHERE w.book_id = ? ${range ? 'AND w.word_number BETWEEN ? AND ?' : ''}`,
    Date.now(), user.id, bookId, ...(range ? [range.start, range.end] : []));
  if (!row) throw new Error('教材の学習状況を取得できませんでした。');
  const totalCount = Number(row.total_count);
  const studiedCount = Number(row.studied_count);
  return { bookId, totalCount, studiedCount, newCount: totalCount - studiedCount, dueCount: Number(row.due_count) };
};
