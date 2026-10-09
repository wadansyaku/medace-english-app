import type { CatalogImportRequest, CatalogImportResult } from '../../contracts/storage';
import { PersonalCatalogImportError, preparePersonalCatalogImport, validatePersonalClientImportId as validateImportId } from '../../shared/personalCatalogImport';
import { BookAccessScope, BookCatalogSource } from '../../types';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';
import { readFirst } from './storage-support';

export const validatePersonalClientImportId = (value: unknown): string => {
  try { return validateImportId(value); }
  catch (error) { if (error instanceof PersonalCatalogImportError) throw new HttpError(error.status, error.message); throw error; }
};

interface ImportReceipt { request_fingerprint: string; book_id: string; result_json: string; }

export const handlePersonalCatalogImport = async (
  env: AppEnv, user: DbUserRow, payload: CatalogImportRequest,
): Promise<CatalogImportResult> => {
  let prepared: Awaited<ReturnType<typeof preparePersonalCatalogImport>>;
  try { prepared = await preparePersonalCatalogImport(payload, user.id); }
  catch (error) { if (error instanceof PersonalCatalogImportError) throw new HttpError(error.status, error.message); throw error; }
  const { clientImportId, fingerprint, bookId, title, words, result } = prepared;
  const readReceipt = () => readFirst<ImportReceipt>(env,
    'SELECT request_fingerprint, book_id, result_json FROM personal_catalog_import_receipts WHERE user_id = ? AND client_import_id = ?',
    user.id, clientImportId);
  const replay = async (receipt: ImportReceipt): Promise<CatalogImportResult> => {
    if (receipt.request_fingerprint !== fingerprint) throw new HttpError(409, 'この作成IDは別の内容で使用済みです。同じ内容で再送してください。');
    const book = await readFirst<{ created_by: string | null }>(env, 'SELECT created_by FROM books WHERE id = ?', receipt.book_id);
    if (!book || book.created_by !== user.id) throw new HttpError(409, '保存した単語帳は削除済み、または所有者を確認できません。新しく作成してください。');
    return JSON.parse(receipt.result_json) as CatalogImportResult;
  };
  const existing = await readReceipt();
  if (existing) return replay(existing);

  const now = Date.now();
  const wordJson = JSON.stringify(words);
  try {
    // Three SQL statements regardless of word count. JSON_each avoids 500
    // per-word queries and keeps each statement far below D1's 100 bindings.
    const committedResults = await env.DB.batch([
      env.DB.prepare(`INSERT INTO books
        (id, title, word_count, is_priority, description, source_context, created_by, catalog_source, access_scope, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(bookId, title, words.length, JSON.stringify({ createdBy: user.id, type: 'USER_GENERATED' }), payload.contextSummary || null,
          user.id, BookCatalogSource.USER_GENERATED, BookAccessScope.ALL_PLANS, now, now),
      env.DB.prepare(`INSERT INTO words
        (id, book_id, word_number, word, definition, search_key, category, subcategory, section, source_sheet, source_entry_id,
         example_sentence, example_meaning, part_of_speech, inflections, pronunciation, source_note, is_reported, created_at, updated_at)
        SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.number'), json_extract(value, '$.word'),
          json_extract(value, '$.definition'), json_extract(value, '$.searchKey'), json_extract(value, '$.category'),
          json_extract(value, '$.subcategory'), json_extract(value, '$.section'), json_extract(value, '$.sourceSheet'),
          json_extract(value, '$.sourceEntryId'), json_extract(value, '$.exampleSentence'), json_extract(value, '$.exampleMeaning'),
          json_extract(value, '$.partOfSpeech'), json_extract(value, '$.inflections'), json_extract(value, '$.pronunciation'),
          json_extract(value, '$.sourceNote'), 0, ?, ? FROM json_each(?)`)
        .bind(bookId, now, now, wordJson),
      env.DB.prepare(`INSERT INTO personal_catalog_import_receipts
        (user_id, client_import_id, request_fingerprint, book_id, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(user.id, clientImportId, fingerprint, bookId, JSON.stringify(result), now),
    ]);
    if (committedResults.length !== 3 || committedResults.some(statement => statement.success !== true)) {
      throw new HttpError(500, '単語帳の保存完了を確認できませんでした。同じ内容で再送してください。');
    }
  } catch (error) {
    // A concurrent winner or a lost committed response is resolved from the
    // immutable receipt. If no transaction committed, preserve the failure.
    const committed = await readReceipt();
    if (committed) return replay(committed);
    throw error;
  }
  return result;
};
