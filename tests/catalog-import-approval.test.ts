import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { handleBatchImportWords, handleGetWordsByBook } from '../functions/_shared/storage-book-actions';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import type { CatalogImportRequest } from '../contracts/storage';
import type { RuntimeFlags } from '../shared/runtimeFlags';
import { BookAccessScope, BookCatalogSource, SubscriptionPlan, UserRole } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const migrations = fs.readdirSync(path.join(process.cwd(), 'migrations')).filter(name => name.endsWith('.sql')).sort();
const schema = migrations.map(name => fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf8')).join('\n');
const openDatabases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { while (openDatabases.length) openDatabases.pop()!.sqlite.close(); });
const admin = { id: 'synthetic-admin', role: UserRole.ADMIN, subscription_plan: SubscriptionPlan.TOB_PAID } as DbUserRow;
const learner = { id: 'synthetic-student', role: UserRole.STUDENT, subscription_plan: SubscriptionPlan.TOB_PAID } as DbUserRow;
const localImportFlags = { enableDestructiveAdminActions: true } as RuntimeFlags;
const createFixture = () => {
  const fixture = createSqliteD1();
  openDatabases.push(fixture);
  fixture.sqlite.exec(schema);
  fixture.sqlite.exec(`INSERT INTO users (id,email,display_name,role,subscription_plan,created_at,updated_at)
    VALUES ('synthetic-admin','admin@example.invalid','Synthetic admin','ADMIN','TOB_PAID',1,1),
    ('synthetic-student','student@example.invalid','Synthetic student','STUDENT','TOB_PAID',1,1);`);
  return { ...fixture, env: { DB: fixture.DB } as AppEnv };
};
const request = (overrides: Partial<CatalogImportRequest> = {}): CatalogImportRequest => ({
  defaultBookName: 'Synthetic original approval',
  contextSummary: 'Synthetic source version 1',
  source: { kind: 'rows', rows: [{ word: 'care', definition: '注意' }] },
  options: { catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL, accessScope: BookAccessScope.ALL_PLANS },
  ...overrides,
});
const approveSyntheticLedger = (fixture: ReturnType<typeof createFixture>, bookId: string) => {
  fixture.sqlite.prepare("UPDATE material_source_ledger SET rights_status='approved', review_status='approved' WHERE book_id=?").run(bookId);
};
const ledger = (fixture: ReturnType<typeof createFixture>, bookId: string) => fixture.sqlite.prepare('SELECT * FROM material_source_ledger WHERE book_id=?').get(bookId);
const snapshot = (fixture: ReturnType<typeof createFixture>) => Object.fromEntries(
  ['books', 'words', 'material_source_ledger', 'learning_histories', 'users'].map(table => [table, fixture.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
);

describe('official import approval boundary with the complete local schema', () => {
  it('keeps a new original-classified book pending until its ledger is explicitly approved', async () => {
    const fixture = createFixture();
    const result = await handleBatchImportWords(fixture.env, admin, request(), localImportFlags);
    const bookId = result.importedBookIds[0];
    expect(migrations).toHaveLength(56);
    expect(migrations).toContain('0056_naru_aichi_exam_annotations.sql');
    expect(migrations).toContain('0049_word_example_drafts.sql');
    expect(migrations).toContain('0050_ai_provider_budget.sql');
    expect(migrations).toContain('0051_writing_unassessed_drafts.sql');
    expect(migrations).toContain('0052_writing_draft_attachment_retirement.sql');
    expect(migrations).toContain('0053_writing_draft_actor_retention.sql');
    expect(migrations).toContain('0054_writing_ai_draft_recovery.sql');
    expect(migrations).toContain('0048_guest_learning.sql');
    expect(migrations).toContain('0047_product_feedback.sql');
    expect(migrations).toContain('0045_guest_trial_and_optional_diagnostic.sql');
    expect(ledger(fixture, bookId)).toMatchObject({ rights_status: 'pending', review_status: 'needs_review', qa_word_count: 1, qa_required_blank_rows: 0, qa_rows_with_sentinel: 0, qa_sentinel_value_count: 0 });
    await expect(handleGetWordsByBook(fixture.env, learner, bookId)).rejects.toMatchObject({ status: 403 });
    await expect(handleGetWordsByBook(fixture.env, admin, bookId)).resolves.toHaveLength(1);
    approveSyntheticLedger(fixture, bookId);
    await expect(handleGetWordsByBook(fixture.env, learner, bookId)).resolves.toEqual([expect.objectContaining({ word: 'care', definition: '注意' })]);
  });

  it.each(['未抽出', '［未抽出］', '[要確認]', 'N/A'])('rejects definition %s before any existing material or history is changed', async (definition) => {
    const fixture = createFixture();
    const result = await handleBatchImportWords(fixture.env, admin, request(), localImportFlags);
    const bookId = result.importedBookIds[0];
    approveSyntheticLedger(fixture, bookId);
    const word = fixture.sqlite.prepare('SELECT id FROM words WHERE book_id=?').get(bookId)!;
    fixture.sqlite.prepare("INSERT INTO learning_histories (user_id,word_id,book_id,status,last_studied_at,next_review_date) VALUES (?,?,?,'LEARNING',1,2)").run(learner.id, word.id, bookId);
    const before = snapshot(fixture);
    await expect(handleBatchImportWords(fixture.env, admin, request({ source: { kind: 'rows', rows: [{ word: 'care', definition }, { word: 'heal', definition: '治す' }] } }), localImportFlags)).rejects.toMatchObject({ status: 400 });
    expect(snapshot(fixture)).toEqual(before);
    await expect(handleGetWordsByBook(fixture.env, learner, bookId)).resolves.toEqual([expect.objectContaining({ definition: '注意' })]);
  });

  it.each(['3oops', '3.8'])('rejects source ID %s before starting official replacement', async (sourceEntryId) => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    await expect(handleBatchImportWords(fixture.env, admin, request({ source: { kind: 'rows', rows: [{ word: 'care', definition: '注意', sourceSheet: 'Synthetic sheet', sourceEntryId }, { word: 'heal', definition: '治す' }] } }), localImportFlags)).rejects.toMatchObject({ status: 400 });
    expect(snapshot(fixture)).toEqual(before);
  });

  it('retains an existing rights decision for the same source but resets review after a valid content import', async () => {
    const fixture = createFixture();
    const result = await handleBatchImportWords(fixture.env, admin, request(), localImportFlags);
    const bookId = result.importedBookIds[0];
    approveSyntheticLedger(fixture, bookId);
    await handleBatchImportWords(fixture.env, admin, request({ source: { kind: 'rows', rows: [{ word: 'care', definition: '配慮' }] } }), localImportFlags);
    expect(ledger(fixture, bookId)).toMatchObject({ rights_status: 'approved', review_status: 'needs_review' });
    await expect(handleGetWordsByBook(fixture.env, learner, bookId)).rejects.toMatchObject({ status: 403 });
  });

  it('invalidates old source approval when source context, source file, or catalog identity changes', async () => {
    const fixture = createFixture();
    const result = await handleBatchImportWords(fixture.env, admin, request(), localImportFlags);
    const bookId = result.importedBookIds[0];
    approveSyntheticLedger(fixture, bookId);
    await handleBatchImportWords(fixture.env, admin, request({ contextSummary: 'Different synthetic source' }), localImportFlags);
    expect(ledger(fixture, bookId)).toMatchObject({ rights_status: 'pending', review_status: 'needs_review' });
    approveSyntheticLedger(fixture, bookId);
    await handleBatchImportWords(fixture.env, admin, request({ source: { kind: 'csv', fileName: 'synthetic-new-source.csv', csvText: 'Word,Meaning\ncare,注意' } }), localImportFlags);
    expect(ledger(fixture, bookId)).toMatchObject({ rights_status: 'pending', review_status: 'needs_review', source_file: 'api-import/csv/synthetic-new-source.csv' });
    approveSyntheticLedger(fixture, bookId);
    await handleBatchImportWords(fixture.env, admin, request({ options: { catalogSource: BookCatalogSource.LICENSED_PARTNER, accessScope: BookAccessScope.ALL_PLANS } }), localImportFlags);
    expect(ledger(fixture, bookId)).toMatchObject({ rights_status: 'pending', review_status: 'needs_review' });
  });

  it('does not lift a previously blocked rights decision when a source is imported again', async () => {
    const fixture = createFixture();
    const result = await handleBatchImportWords(fixture.env, admin, request(), localImportFlags);
    const bookId = result.importedBookIds[0];
    fixture.sqlite.prepare("UPDATE material_source_ledger SET rights_status='blocked' WHERE book_id=?").run(bookId);
    await handleBatchImportWords(fixture.env, admin, request({ contextSummary: 'Another source' }), localImportFlags);
    expect(ledger(fixture, bookId)).toMatchObject({ rights_status: 'blocked', review_status: 'needs_review' });
  });

  it('measures source, example and duplicate counts from the accepted content', async () => {
    const fixture = createFixture();
    const result = await handleBatchImportWords(fixture.env, admin, request({ source: { kind: 'rows', rows: [
      { word: 'plant', definition: '植物', sourceSheet: 'Synthetic noun', sourceEntryId: 1, exampleSentence: 'A green plant.', exampleMeaning: '緑の植物。' },
      { word: 'plant', definition: '植える', sourceSheet: 'Synthetic verb', sourceEntryId: 2 },
      { word: 'trip', definition: '旅行' },
    ] } }), localImportFlags);
    expect(ledger(fixture, result.importedBookIds[0])).toMatchObject({ qa_word_count: 3, qa_required_blank_rows: 0, qa_rows_with_sentinel: 0, qa_sentinel_value_count: 0, qa_duplicate_headword_count: 1, qa_source_coverage_rate: 0.6667, qa_example_pair_coverage_rate: 0.3333 });
  });

  it('keeps the production destructive-import flag enforced before storage', async () => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    await expect(handleBatchImportWords(fixture.env, admin, request(), { enableDestructiveAdminActions: false } as RuntimeFlags)).rejects.toMatchObject({ status: 403 });
    expect(snapshot(fixture)).toEqual(before);
  });

  it('rejects an ownerless official import labeled USER_GENERATED before it can bypass the ledger', async () => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    await expect(handleBatchImportWords(fixture.env, admin, request({ options: { catalogSource: BookCatalogSource.USER_GENERATED, accessScope: BookAccessScope.ALL_PLANS } }), localImportFlags)).rejects.toMatchObject({ status: 400 });
    expect(snapshot(fixture)).toEqual(before);
  });
});
