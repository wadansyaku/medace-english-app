import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEmptyPayload, expectNumber, expectObject, expectOptionalObject, expectString, expectTrimmedString } from '../request-validation';
import { normalizeStudyWordRange } from '../../../shared/studyScope';
import { HttpError } from '../http';
import { UserRole } from '../../../types';
import {
  handleBatchImportWords,
  handleDeleteBook,
  handleGetBookSession,
  handleGetBookStudyOverview,
  handleGetBooks,
  handleGetDailySessionWords,
  handleGetWordsByBook,
  handlePrepareBookExamples,
  handleReportWord,
  handleUpdateWord,
} from '../storage-book-actions';
import { handleGenerateWordHintAsset } from '../word-hint-assets';

export const catalogStorageActionDefinitions = {
  batchImportWords: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      expectTrimmedString(record, 'defaultBookName');
      expectObject(record.source, 'source');
      return record as never;
    },
    execute: ({ env, user, runtimeFlags }, payload) => handleBatchImportWords(env, user, payload, runtimeFlags),
  }),
  getBooks: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetBooks(env, user),
  }),
  deleteBook: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { bookId: expectString(record, 'bookId') };
    },
    execute: async ({ env, user }, payload) => {
      await handleDeleteBook(env, user, payload.bookId);
      return null;
    },
  }),
  getWordsByBook: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { bookId: expectString(record, 'bookId') };
    },
    execute: ({ env, user }, payload) => handleGetWordsByBook(env, user, payload.bookId),
  }),
  updateWord: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      expectObject(record.word, 'word');
      return { word: record.word } as never;
    },
    execute: async ({ env, user }, payload) => {
      await handleUpdateWord(env, user, payload.word);
      return null;
    },
  }),
  reportWord: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        wordId: expectString(record, 'wordId'),
        reason: expectTrimmedString(record, 'reason'),
      };
    },
    execute: async ({ env, user }, payload) => {
      await handleReportWord(env, user, payload.wordId, payload.reason);
      return null;
    },
  }),
  generateWordHintAsset: defineStorageAction({
    parse: () => {
      throw new HttpError(410, '学習中の例文・画像生成は終了しました。保存済みの内容をご利用ください。');
    },
    execute: ({ env, user }, payload) => handleGenerateWordHintAsset(env, user, payload),
  }),
  prepareBookExamples: defineStorageAction({
    roles: [UserRole.ADMIN],
    parse: (payload) => {
      const record = expectObject(payload);
      return { bookId: expectString(record, 'bookId') };
    },
    execute: ({ env, user }, payload) => handlePrepareBookExamples(env, user, payload.bookId),
  }),
  getDailySessionWords: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      if (record.wordRange !== undefined) throw new HttpError(400, 'デイリー学習には単語範囲を指定できません。');
      return {
        limit: expectNumber(record, 'limit'),
        taskIntent: expectOptionalObject(record.taskIntent, 'taskIntent') as never,
      };
    },
    execute: ({ env, user }, payload) => handleGetDailySessionWords(env, user, payload.limit, payload.taskIntent),
  }),
  getBookSession: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      if (record.wordRange !== undefined) throw new HttpError(400, '学習範囲はtaskIntentに指定してください。');
      return {
        bookId: expectString(record, 'bookId'),
        limit: expectNumber(record, 'limit'),
        taskIntent: expectOptionalObject(record.taskIntent, 'taskIntent') as never,
      };
    },
    execute: ({ env, user }, payload) => handleGetBookSession(env, user, payload.bookId, payload.limit, payload.taskIntent),
  }),
  getBookStudyOverview: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      let wordRange;
      try { wordRange = normalizeStudyWordRange(record.wordRange); }
      catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '単語範囲が不正です。'); }
      return { bookId: expectString(record, 'bookId'), wordRange };
    },
    execute: ({ env, user }, payload) => handleGetBookStudyOverview(env, user, payload.bookId, payload.wordRange),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  | 'batchImportWords'
  | 'getBooks'
  | 'deleteBook'
  | 'getWordsByBook'
  | 'updateWord'
  | 'reportWord'
  | 'generateWordHintAsset'
  | 'prepareBookExamples'
  | 'getDailySessionWords'
  | 'getBookSession'
  | 'getBookStudyOverview'
>;
