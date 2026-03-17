import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEmptyPayload, expectNumber, expectObject, expectString, expectTrimmedString } from '../request-validation';
import {
  handleBatchImportWords,
  handleDeleteBook,
  handleGetBookSession,
  handleGetBooks,
  handleGetDailySessionWords,
  handleGetWordsByBook,
  handleReportWord,
  handleUpdateWord,
  handleUpdateWordCache,
} from '../storage-book-actions';

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
  updateWordCache: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        wordId: expectString(record, 'wordId'),
        sentence: expectString(record, 'sentence'),
        translation: expectString(record, 'translation'),
      };
    },
    execute: async ({ env, user }, payload) => {
      await handleUpdateWordCache(env, user, payload.wordId, payload.sentence, payload.translation);
      return null;
    },
  }),
  getDailySessionWords: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        limit: expectNumber(record, 'limit'),
        taskIntent: typeof record.taskIntent === 'object' ? record.taskIntent as never : undefined,
      };
    },
    execute: ({ env, user }, payload) => handleGetDailySessionWords(env, user, payload.limit, payload.taskIntent),
  }),
  getBookSession: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        bookId: expectString(record, 'bookId'),
        limit: expectNumber(record, 'limit'),
        taskIntent: typeof record.taskIntent === 'object' ? record.taskIntent as never : undefined,
      };
    },
    execute: ({ env, user }, payload) => handleGetBookSession(env, user, payload.bookId, payload.limit, payload.taskIntent),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  | 'batchImportWords'
  | 'getBooks'
  | 'deleteBook'
  | 'getWordsByBook'
  | 'updateWord'
  | 'reportWord'
  | 'updateWordCache'
  | 'getDailySessionWords'
  | 'getBookSession'
>;
