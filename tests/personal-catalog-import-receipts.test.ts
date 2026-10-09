import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleBatchImportWords } from '../functions/_shared/storage-book-actions';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import type { CatalogImportRequest } from '../contracts/storage';
import { BookAccessScope, BookCatalogSource, UserRole } from '../types';
import { catalogStorageActionDefinitions } from '../functions/_shared/storage-action-registry/catalog';
import { createSqliteD1 } from './helpers/sqlite-d1';
const schema = fs.readdirSync('migrations').filter(name => name.endsWith('.sql')).sort().map(name => fs.readFileSync(path.join('migrations', name), 'utf8')).join('\n');
const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { vi.restoreAllMocks(); databases.splice(0).forEach(({ sqlite }) => sqlite.close()); });
const user = { id: 'personal-owner', role: UserRole.STUDENT } as DbUserRow;
const setup = () => {
  const database = createSqliteD1(); databases.push(database); database.sqlite.exec(schema);
  database.sqlite.exec("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES ('personal-owner','synthetic@example.invalid','Synthetic','STUDENT',1,1)");
  return { ...database, env: { DB: database.DB } as AppEnv };
};
const request = (count = 2): CatalogImportRequest => ({ defaultBookName: 'Synthetic personal book', createdByUid: user.id,
  source: { kind: 'rows', rows: Array.from({ length: count }, (_, index) => ({ word: `word${index}`, definition: `意味${index}` })) } });
const count = (fixture: ReturnType<typeof setup>, table: string) => Number(fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count);

describe('legacy personal import failure reproduction', () => {
  it('creates another book when a committed response is lost and retried later without an import ID', async () => {
    const fixture = setup(); const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const committedButLost = await handleBatchImportWords(fixture.env, user, request());
    clock.mockReturnValue(2000);
    const retry = await handleBatchImportWords(fixture.env, user, request());
    expect(retry.importedBookIds).not.toEqual(committedButLost.importedBookIds);
    expect(count(fixture, 'books')).toBe(2);
    expect(count(fixture, 'words')).toBe(4);
  });
  it('leaves the book and first 200 words saved when the later chunk fails', async () => {
    const fixture = setup(); let inserts = 0;
    fixture.beforeRun(sql => { if (sql.includes('INSERT INTO words') && ++inserts === 201) throw new Error('synthetic later chunk failure'); });
    await expect(handleBatchImportWords(fixture.env, user, request(201))).rejects.toThrow('synthetic later chunk failure');
    expect(count(fixture, 'books')).toBe(1);
    expect(count(fixture, 'words')).toBe(200);
  });
});

const stableRequest = (count = 2): CatalogImportRequest => ({ ...request(count), clientImportId: 'synthetic-import-0001' });
describe('atomic personal import receipts', () => {
  it('returns the exact receipt and IDs after a committed response is lost, without another book or word', async () => {
    const fixture = setup(); const payload = stableRequest();
    const lost = await handleBatchImportWords(fixture.env, user, payload);
    const originalWords = fixture.sqlite.prepare('SELECT * FROM words ORDER BY id').all();
    const originalBook = fixture.sqlite.prepare('SELECT * FROM books').all();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10000);
    expect(await handleBatchImportWords(fixture.env, user, payload)).toEqual(lost);
    expect(fixture.sqlite.prepare('SELECT * FROM words ORDER BY id').all()).toEqual(originalWords);
    expect(fixture.sqlite.prepare('SELECT * FROM books').all()).toEqual(originalBook);
    expect(count(fixture, 'personal_catalog_import_receipts')).toBe(1);
  });
  it('recovers a committed batch whose database response is lost from its immutable receipt', async () => {
    const fixture = setup(); const originalBatch = fixture.env.DB.batch.bind(fixture.env.DB);
    fixture.env.DB.batch = async statements => { await originalBatch(statements); throw new Error('synthetic batch response lost'); };
    const result = await handleBatchImportWords(fixture.env, user, stableRequest());
    expect(result.importedWordCount).toBe(2);
    expect(count(fixture, 'books')).toBe(1); expect(count(fixture, 'words')).toBe(2); expect(count(fixture, 'personal_catalog_import_receipts')).toBe(1);
  });
  it('does not treat a missing database transaction result as successful saving', async () => {
    const fixture = setup(); fixture.env.DB.batch = async () => [];
    await expect(handleBatchImportWords(fixture.env, user, stableRequest())).rejects.toMatchObject({ status: 500 });
    expect(count(fixture, 'books')).toBe(0); expect(count(fixture, 'words')).toBe(0); expect(count(fixture, 'personal_catalog_import_receipts')).toBe(0);
  });
  it('resolves a same-ID concurrent submission to one transaction/result', async () => {
    const fixture = setup();
    const results = await Promise.all(Array.from({ length: 3 }, () => handleBatchImportWords(fixture.env, user, stableRequest(500))));
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(count(fixture, 'books')).toBe(1); expect(count(fixture, 'words')).toBe(500); expect(count(fixture, 'personal_catalog_import_receipts')).toBe(1);
  });
  it.each(['books', 'words', 'personal_catalog_import_receipts'])('rolls back every resource when the %s statement fails, and safely retries', async (table) => {
    const fixture = setup();
    fixture.beforeRun(sql => { if (sql.includes(`INSERT INTO ${table}`)) throw new Error('synthetic transaction failure'); });
    await expect(handleBatchImportWords(fixture.env, user, stableRequest(201))).rejects.toThrow('synthetic transaction failure');
    expect(count(fixture, 'books')).toBe(0); expect(count(fixture, 'words')).toBe(0); expect(count(fixture, 'personal_catalog_import_receipts')).toBe(0);
    fixture.beforeRun(undefined);
    expect((await handleBatchImportWords(fixture.env, user, stableRequest(201))).importedWordCount).toBe(201);
  });
  it('rolls back a real SQL failure at word 201 rather than leaving the first 200 words', async () => {
    const fixture = setup();
    fixture.sqlite.exec("CREATE TRIGGER reject_synthetic_word BEFORE INSERT ON words WHEN NEW.word = 'word200' BEGIN SELECT RAISE(ABORT, 'synthetic word 201 failure'); END");
    await expect(handleBatchImportWords(fixture.env, user, stableRequest(500))).rejects.toThrow('synthetic word 201 failure');
    expect(count(fixture, 'books')).toBe(0); expect(count(fixture, 'words')).toBe(0); expect(count(fixture, 'personal_catalog_import_receipts')).toBe(0);
    fixture.sqlite.exec('DROP TRIGGER reject_synthetic_word');
    expect((await handleBatchImportWords(fixture.env, user, stableRequest(500))).importedWordCount).toBe(500);
  });
  it('rejects altered content under a used ID, while property ordering does not change the fingerprint', async () => {
    const fixture = setup(); const payload = stableRequest();
    const saved = await handleBatchImportWords(fixture.env, user, payload);
    await expect(handleBatchImportWords(fixture.env, user, { ...payload, defaultBookName: 'Edited title' })).rejects.toMatchObject({ status: 409 });
    const { clientImportId, source, createdByUid, defaultBookName } = payload;
    expect(await handleBatchImportWords(fixture.env, user, { source, createdByUid, defaultBookName, clientImportId })).toEqual(saved);
    expect(count(fixture, 'books')).toBe(1);
  });
  it('arbitrates concurrent different content under the same ID without appending either losing content', async () => {
    const fixture = setup(); const payload = stableRequest();
    const results = await Promise.allSettled([handleBatchImportWords(fixture.env, user, payload), handleBatchImportWords(fixture.env, user, { ...payload, contextSummary: 'different content' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409 });
    expect(count(fixture, 'books')).toBe(1); expect(count(fixture, 'words')).toBe(2);
  });
  it('preserves same-word different senses and skips only fully equivalent rows with stable metadata', async () => {
    const fixture = setup(); const payload = { ...stableRequest(), source: { kind: 'rows' as const, rows: [
      { word: 'plant', definition: '植物', number: 7, exampleSentence: 'A plant.', exampleMeaning: '植物。', partOfSpeech: 'noun' as const },
      { word: 'plant', definition: '植える', number: 7, pronunciation: 'plænt', sourceNote: 'synthetic' },
      { word: 'plant', definition: '植物', number: 7, exampleSentence: 'A plant.', exampleMeaning: '植物。', partOfSpeech: 'noun' as const },
    ] } };
    const result = await handleBatchImportWords(fixture.env, user, payload);
    expect(result).toMatchObject({ importedBookCount: 1, importedWordCount: 2, skippedRowCount: 1, warnings: [{ code: 'DUPLICATE_ROW', rowNumber: 3 }] });
    const words = fixture.sqlite.prepare('SELECT id,word_number,word,definition,example_sentence,pronunciation,source_note FROM words ORDER BY definition').all();
    expect(words).toHaveLength(2);
    expect(new Set(words.map(word => word.id)).size).toBe(2);
    expect(words.every(word => word.word_number === 7)).toBe(true);
    expect(await handleBatchImportWords(fixture.env, user, payload)).toEqual(result);
    expect(count(fixture, 'material_source_ledger')).toBe(0);
  });
  it('uses one three-statement transaction and bounded bindings for the full 500-word request', async () => {
    const fixture = setup(); const originalPrepare = fixture.env.DB.prepare.bind(fixture.env.DB);
    const originalBatch = fixture.env.DB.batch.bind(fixture.env.DB); const batchSizes: number[] = [];
    fixture.env.DB.prepare = sql => {
      expect(new TextEncoder().encode(sql).length).toBeLessThan(100000);
      const statement = originalPrepare(sql);
      return { ...statement, bind(...values) { expect(values.length).toBeLessThanOrEqual(100); return statement.bind(...values); } };
    };
    fixture.env.DB.batch = async statements => { batchSizes.push(statements.length); return originalBatch(statements); };
    await handleBatchImportWords(fixture.env, user, stableRequest(500));
    expect(batchSizes).toEqual([3]);
    expect(count(fixture, 'words')).toBe(500);
  });
  it('scopes the same client ID to its authenticated owner and forces personal metadata even for an admin', async () => {
    const fixture = setup();
    fixture.sqlite.exec("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES ('second-owner','synthetic2@example.invalid','Synthetic2','ADMIN',1,1)");
    const first = await handleBatchImportWords(fixture.env, user, stableRequest());
    const secondUser = { id: 'second-owner', role: UserRole.ADMIN } as DbUserRow;
    const second = await handleBatchImportWords(fixture.env, secondUser, { ...stableRequest(), createdByUid: secondUser.id,
      options: { catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL, accessScope: BookAccessScope.BUSINESS_ONLY } });
    expect(second.importedBookIds).not.toEqual(first.importedBookIds);
    expect(fixture.sqlite.prepare('SELECT created_by,catalog_source,access_scope FROM books WHERE id=?').get(second.importedBookIds[0]))
      .toMatchObject({ created_by: secondUser.id, catalog_source: BookCatalogSource.USER_GENERATED, access_scope: BookAccessScope.ALL_PLANS });
    expect(count(fixture, 'material_source_ledger')).toBe(0);
    expect(count(fixture, 'personal_catalog_import_receipts')).toBe(2);
    await expect(handleBatchImportWords(fixture.env, secondUser, stableRequest())).rejects.toMatchObject({ status: 403 });
  });
  it('never recreates an explicitly deleted personal book using an old receipt', async () => {
    const fixture = setup(); const payload = stableRequest();
    const result = await handleBatchImportWords(fixture.env, user, payload);
    fixture.sqlite.prepare('DELETE FROM books WHERE id = ?').run(result.importedBookIds[0]);
    await expect(handleBatchImportWords(fixture.env, user, payload)).rejects.toMatchObject({ status: 409 });
    expect(count(fixture, 'books')).toBe(0); expect(count(fixture, 'words')).toBe(0); expect(count(fixture, 'personal_catalog_import_receipts')).toBe(1);
  });
  it.each([
    { contextSummary: 123 }, { bookDescription: {} }, { options: { accessScope: 'PUBLIC_UNKNOWN' } },
    { source: { kind: 'rows', rows: [{ word: 'care', definition: '注意', number: '1oops' }] } },
    { clientImportId: '' }, { clientImportId: 'invalid id with spaces' }, { clientImportId: null },
    { createdByUid: 'another-owner' }, { createdByUid: undefined },
    { source: { kind: 'csv', csvText: 'Word,Meaning\ncare,注意' } },
    { source: { kind: 'rows', rows: [] } },
    { source: { kind: 'rows', rows: Array.from({ length: 501 }, () => ({ word: 'care', definition: '注意' })) } },
    { source: { kind: 'rows', rows: [{ word: 'care', definition: '' }] } },
    { source: { kind: 'rows', rows: [{ word: 'care', definition: '注意', bookName: 'Other book' }] } },
    { source: { kind: 'rows', rows: [{ word: 'care', definition: 'N/A' }] } },
  ])('rejects unsupported or unauthorized input before any writes: %j', async overrides => {
    const fixture = setup();
    await expect(handleBatchImportWords(fixture.env, user, { ...stableRequest(), ...overrides } as CatalogImportRequest)).rejects.toBeDefined();
    expect(count(fixture, 'books')).toBe(0); expect(count(fixture, 'words')).toBe(0); expect(count(fixture, 'personal_catalog_import_receipts')).toBe(0);
  });
});


describe('personal import storage-action parse contract', () => {
  it('preserves an optional valid creation ID and the existing no-ID request', () => {
    expect(catalogStorageActionDefinitions.batchImportWords.parse(stableRequest())).toEqual(stableRequest());
    expect(catalogStorageActionDefinitions.batchImportWords.parse(request())).toEqual(request());
  });
  it.each([null, '', 123, 'bad spaces invalid', 'x'.repeat(129)])('rejects malformed creation IDs at the action boundary: %j', clientImportId => {
    expect(() => catalogStorageActionDefinitions.batchImportWords.parse({ ...request(), clientImportId })).toThrow();
  });
});
