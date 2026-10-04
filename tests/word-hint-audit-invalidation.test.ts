import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleBatchImportWords, handleUpdateWord } from '../functions/_shared/storage-book-actions';
import { toWordData, type DbWordRow } from '../functions/_shared/storage-support';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import type { CatalogImportRequest, CatalogImportRow } from '../contracts/storage';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { databases.splice(0).forEach(({ sqlite }) => sqlite.close()); vi.restoreAllMocks(); });
const original = { word: 'care', definition: '注意', exampleSentence: 'Take care.', exampleMeaning: '気をつけて。' };
const setup = async (generated = true, metadataOverrides: Record<string, unknown> = {}) => {
  const fixture = createSqliteD1(); databases.push(fixture);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) fixture.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  fixture.sqlite.exec("INSERT INTO users(id,email,display_name,role,subscription_plan,created_at,updated_at) VALUES ('owner-1','owner@example.test','Owner','STUDENT','TOB_PAID',1,1)");
  const user = fixture.sqlite.prepare('SELECT * FROM users WHERE id=?').get('owner-1') as unknown as DbUserRow;
  const env = { DB: fixture.DB } as AppEnv;
  // Repeated requests can share the same imported book identity within a millisecond.
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const request = (row: Partial<CatalogImportRow> = {}): CatalogImportRequest => ({
    defaultBookName: 'Owner saved examples', createdByUid: user.id,
    source: { kind: 'rows', rows: [{ ...original, ...row }] },
  });
  const result = await handleBatchImportWords(env, user, request());
  const bookId = result.importedBookIds[0];
  const wordId = fixture.sqlite.prepare('SELECT id FROM words WHERE book_id=?').get(bookId)!.id as string;
  const metadata = {
    example_generated_at: generated ? 100 : null,
    example_audit_status: generated ? 'APPROVED' : null,
    example_audited_at: generated ? 200 : null,
    example_image_key: generated ? 'word-hints/saved.jpg' : null,
    example_image_content_type: generated ? 'image/jpeg' : null,
    example_image_generated_at: generated ? 100 : null,
    example_image_audit_status: generated ? 'APPROVED' : null,
    example_image_audited_at: generated ? 200 : null,
    ...metadataOverrides,
  };
  fixture.sqlite.prepare(`UPDATE words SET ${Object.keys(metadata).map(key => `${key}=?`).join(',')} WHERE id=?`).run(...Object.values(metadata) as any[], wordId);
  fixture.sqlite.prepare('INSERT INTO word_example_generation_claims(word_id,claim_id,started_at,completed_at) VALUES (?,\'saved-claim\',100,200)').run(wordId);
  const row = () => fixture.sqlite.prepare('SELECT * FROM words WHERE id=?').get(wordId)!;
  const claim = () => fixture.sqlite.prepare('SELECT * FROM word_example_generation_claims WHERE word_id=?').get(wordId);
  return { ...fixture, env, user, bookId, wordId, request, row, claim };
};
const expectExampleHeld = (row: Record<string, unknown>) => {
  expect(row).toMatchObject({ example_generated_at: 100, example_audit_status: 'REVIEW_REQUIRED', example_audited_at: null });
  const publicWord = toWordData(row as unknown as DbWordRow);
  expect(publicWord.exampleSentence).toBeNull();
  expect(publicWord.exampleMeaning).toBeNull();
};
const expectImageHeld = (row: Record<string, unknown>) => {
  expect(row).toMatchObject({ example_image_key: 'word-hints/saved.jpg', example_image_generated_at: 100, example_image_audit_status: 'REVIEW_REQUIRED', example_image_audited_at: null });
  expect(toWordData(row as unknown as DbWordRow).exampleImageUrl).toBeNull();
};

describe('saved generated hint approval after content changes', () => {
  it.each([{ word: 'heal' }, { definition: '配慮' }])('invalidates generated example and image approval after owner editing: %s', async (change) => {
    const fixture = await setup(); const claimBefore = fixture.claim();
    await handleUpdateWord(fixture.env, fixture.user, { id: fixture.wordId, bookId: fixture.bookId, number: 1, ...original, ...change });
    expectExampleHeld(fixture.row()); expectImageHeld(fixture.row());
    expect(fixture.row()).toMatchObject({ example_sentence: original.exampleSentence, example_meaning: original.exampleMeaning });
    expect(fixture.claim()).toEqual(claimBefore);
  });

  it('keeps both approvals when an unchanged word is saved', async () => {
    const fixture = await setup(); const before = fixture.row();
    await handleUpdateWord(fixture.env, fixture.user, { id: fixture.wordId, bookId: fixture.bookId, number: 1, ...original });
    expect(fixture.row()).toEqual(before);
    expect(toWordData(fixture.row() as unknown as DbWordRow)).toMatchObject({ exampleSentence: original.exampleSentence, exampleImageUrl: expect.stringContaining('/api/word-hints/') });
  });

  it.each([{ word: 'heal' }, { definition: '配慮' }])('invalidates both generated approvals on a colliding import update: %s', async (change) => {
    const fixture = await setup(); const claimBefore = fixture.claim();
    await handleBatchImportWords(fixture.env, fixture.user, fixture.request(change));
    expectExampleHeld(fixture.row()); expectImageHeld(fixture.row());
    expect(fixture.claim()).toEqual(claimBefore);
  });

  it.each([{ exampleSentence: 'Please take care.' }, { exampleMeaning: 'どうぞ気をつけて。' }])('invalidates only the generated example when its saved sentence or translation changes: %s', async (change) => {
    const fixture = await setup(); const claimBefore = fixture.claim();
    await handleBatchImportWords(fixture.env, fixture.user, fixture.request(change));
    expectExampleHeld(fixture.row());
    expect(fixture.row()).toMatchObject({ example_image_audit_status: 'APPROVED', example_image_audited_at: 200, example_image_key: 'word-hints/saved.jpg' });
    expect(fixture.claim()).toEqual(claimBefore);
  });

  it.each([{}, { exampleSentence: undefined, exampleMeaning: undefined }])('preserves approvals and saved content for an unchanged or omitted-example import: %s', async (change) => {
    const fixture = await setup(); const before = fixture.row();
    await handleBatchImportWords(fixture.env, fixture.user, fixture.request(change));
    expect(fixture.row()).toEqual(before);
  });

  it('keeps source-authored examples without adding generated provenance or review status when the owner edits', async () => {
    const fixture = await setup(false);
    await handleUpdateWord(fixture.env, fixture.user, { id: fixture.wordId, bookId: fixture.bookId, number: 1, ...original, definition: '配慮' });
    expect(fixture.row()).toMatchObject({ example_generated_at: null, example_audit_status: null, example_audited_at: null, example_sentence: original.exampleSentence });
    expect(toWordData(fixture.row() as unknown as DbWordRow).exampleSentence).toBe(original.exampleSentence);
  });

  it('keeps updated source-authored examples visible without manufacturing generated metadata', async () => {
    const fixture = await setup(false);
    await handleBatchImportWords(fixture.env, fixture.user, fixture.request({ exampleSentence: 'Please take care.' }));
    expect(fixture.row()).toMatchObject({ example_generated_at: null, example_audit_status: null, example_audited_at: null, example_sentence: 'Please take care.' });
    expect(toWordData(fixture.row() as unknown as DbWordRow).exampleSentence).toBe('Please take care.');
  });

  it('retains the missing-provenance hold when an audited legacy example changes', async () => {
    const fixture = await setup(false, { example_audit_status: 'APPROVED', example_audited_at: 200 });
    await handleBatchImportWords(fixture.env, fixture.user, fixture.request({ exampleSentence: 'Please take care.' }));
    expect(fixture.row()).toMatchObject({ example_generated_at: null, example_audit_status: 'REVIEW_REQUIRED', example_audited_at: null });
    expect(toWordData(fixture.row() as unknown as DbWordRow).exampleSentence).toBeNull();
  });

  it('retains write authorization before any approval or content mutation', async () => {
    const fixture = await setup(); const before = fixture.row();
    await expect(handleUpdateWord(fixture.env, { ...fixture.user, id: 'other-owner' }, { id: fixture.wordId, bookId: fixture.bookId, number: 1, ...original, definition: '配慮' })).rejects.toMatchObject({ status: 403 });
    expect(fixture.row()).toEqual(before);
  });
});
