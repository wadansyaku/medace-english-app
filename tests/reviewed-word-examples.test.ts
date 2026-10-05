import { readFileSync, readdirSync } from 'node:fs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { buildReviewedWordExamplesSql } from '../scripts/_shared/reviewed-word-examples.mjs';
import { createSqliteD1 } from './helpers/sqlite-d1';
import { toWordData, type DbWordRow } from '../functions/_shared/storage-support';

const databases: ReturnType<typeof createSqliteD1>[] = [];
const temporaryDirectories: string[] = [];
afterEach(() => {
  databases.splice(0).forEach(({ sqlite }) => sqlite.close());
  temporaryDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }));
});
const pair = () => ({
  wordId: 'word-missing', bookId: 'book-1', patchKind: 'EXAMPLE_PAIR',
  expectedWord: "teacher's", expectedDefinition: '先生の', expectedUpdatedAt: 100,
  exampleSentence: "The teacher's book is on the table.", exampleMeaning: '先生の本は机の上にあります。',
});
const translation = () => ({
  wordId: 'word-translation', bookId: 'book-1', patchKind: 'TRANSLATION_ONLY',
  expectedWord: 'source', expectedDefinition: '原本', expectedUpdatedAt: 100,
  expectedExampleSentence: 'Source-authored example.', exampleMeaning: '原本に書かれた例文。',
});
const prepared = (rows: unknown[] = [pair(), translation()]) => ({
  version: 1, sourceFile: 'synthetic-reviewed.json', preparedWith: 'GPT_WORK',
  reviewReference: 'synthetic-proofreading-reference', rows,
});
const setup = () => {
  const fixture = createSqliteD1(); databases.push(fixture);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES('synthetic-owner','owner@example.test','Synthetic','STUDENT',1,1);
    INSERT INTO books(id,title,word_count,catalog_source,access_scope,created_at,updated_at) VALUES('book-1','Synthetic original',3,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1);
    INSERT INTO books(id,title,word_count,catalog_source,access_scope,created_at,updated_at) VALUES('other-book','Other',0,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1);
    INSERT INTO words(id,book_id,word_number,word,definition,search_key,example_sentence,example_meaning,source_sheet,source_entry_id,source_note,created_at,updated_at) VALUES
      ('word-missing','book-1',1,'teacher''s','先生の','teacher''s',NULL,NULL,'原本シート',1,'原本注記',1,100),
      ('word-translation','book-1',2,'source','原本','source','Source-authored example.',NULL,'原本シート',2,'原本注記',1,100),
      ('word-complete','book-1',3,'complete','完全な','complete','Saved original example.','原本の和訳。','原本シート',3,'原本注記',1,100);
    INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,source_file,extracted_at,transform_log,content_qa_report,notes,created_at,updated_at) VALUES
      ('synthetic-ledger','book-1','STEADY_STUDY_ORIGINAL','Synthetic original','fixture','approved','approved','source.xlsx','2026-10-05T00:00:00Z','fixture only','fixture only','rights fixture only',1,1);
    INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,interval_days) VALUES('synthetic-owner','word-missing','book-1','learning',10,20,1);
    INSERT INTO study_attempt_receipts(user_id,client_attempt_id,request_fingerprint,commit_token,word_id,book_id,existing_was_study,created_at) VALUES('synthetic-owner','stable-attempt','stable-fingerprint','stable-commit','word-missing','book-1',0,10);
    INSERT INTO word_example_generation_claims(word_id,claim_id,started_at) VALUES('word-missing','existing-uncertain-claim',50);
    INSERT INTO catalog_workbook_sources(id,series_key,source_file,sha256,archive_json,created_at) VALUES('workbook-1','synthetic','source.xlsx','stable-source-hash','{"original":"unchanged"}',1);
    INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready) VALUES('entry-1','workbook-1','1','stable-content-hash','{"original":"unchanged"}',1);
    INSERT INTO catalog_word_source_links(source_entry_id,word_id,match_kind) VALUES('entry-1','word-missing','snapshot_import');
    INSERT INTO catalog_workbook_sheet_rows(source_id,sheet_name,row_number,payload_json) VALUES('workbook-1','Original',1,'{"original":"unchanged"}');
  `);
  const snapshot = () => Object.fromEntries([
    'users', 'books', 'words', 'material_source_ledger', 'learning_histories', 'study_attempt_receipts',
    'word_example_generation_claims', 'catalog_workbook_sources', 'catalog_source_entries',
    'catalog_word_source_links', 'catalog_workbook_sheet_rows',
  ].map(table => [table, fixture.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const wordsForLearner = () => fixture.sqlite.prepare('SELECT * FROM words ORDER BY id').all()
    .map(row => toWordData(row as unknown as DbWordRow));
  return { ...fixture, snapshot, wordsForLearner, drafts: () => fixture.sqlite.prepare('SELECT * FROM word_example_drafts ORDER BY word_id').all() };
};

describe('offline word example drafts', () => {
  it('stores pending drafts without changing original columns, IDs, learner reads, source tables, claims or SRS', () => {
    const fixture = setup();
    const before = fixture.snapshot();
    const publicBefore = fixture.wordsForLearner();
    const result = buildReviewedWordExamplesSql(prepared(), 200);
    fixture.sqlite.exec(result.sql);
    expect(fixture.snapshot()).toEqual(before);
    expect(fixture.wordsForLearner()).toEqual(publicBefore);
    expect(fixture.drafts()).toHaveLength(2);
    expect(fixture.drafts()[0]).toMatchObject({ review_status: 'PENDING', proposed_example_sentence: pair().exampleSentence });
    expect(fixture.drafts()[1]).toMatchObject({ review_status: 'PENDING', proposed_example_sentence: translation().expectedExampleSentence });
    expect(fixture.drafts()[0].preparation_evidence_json).toContain('"publicationApproval":"NOT_GRANTED"');
    expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(result.manifest).toMatchObject({ rowCount: 2, reviewStatus: 'PENDING', publicationApproval: 'NOT_GRANTED', execution: 'NOT_EXECUTED' });
  });

  it('does not create another draft or modify its stored evidence on repeated preparation', () => {
    const fixture = setup();
    const first = buildReviewedWordExamplesSql(prepared(), 200);
    fixture.sqlite.exec(first.sql);
    const before = fixture.drafts();
    const repeated = buildReviewedWordExamplesSql(prepared(), 300);
    expect(repeated.manifest.draftIds).toEqual(first.manifest.draftIds);
    fixture.sqlite.exec(repeated.sql);
    expect(fixture.drafts()).toEqual(before);
  });

  it.each([
    { wordId: 'not-found' }, { bookId: 'other-book' }, { expectedWord: 'changed' },
    { expectedDefinition: '異なる語義' }, { expectedUpdatedAt: 99 },
  ])('skips stale or wrong targets without any original mutation: %s', change => {
    const fixture = setup(); const before = fixture.snapshot();
    fixture.sqlite.exec(buildReviewedWordExamplesSql(prepared([{ ...pair(), ...change }]), 200).sql);
    expect(fixture.drafts()).toHaveLength(0);
    expect(fixture.snapshot()).toEqual(before);
  });

  it.each(['example_sentence', 'example_meaning'])('does not stage a pair over an existing %s', field => {
    const fixture = setup();
    fixture.sqlite.prepare(`UPDATE words SET ${field}=? WHERE id='word-missing'`).run('Original content');
    const before = fixture.snapshot();
    fixture.sqlite.exec(buildReviewedWordExamplesSql(prepared([pair()]), 200).sql);
    expect(fixture.drafts()).toHaveLength(0);
    expect(fixture.snapshot()).toEqual(before);
  });

  it.each(['example_sentence', 'example_meaning'])('does not stage a translation after original %s changes', field => {
    const fixture = setup();
    fixture.sqlite.prepare(`UPDATE words SET ${field}=? WHERE id='word-translation'`).run('Original changed');
    const before = fixture.snapshot();
    fixture.sqlite.exec(buildReviewedWordExamplesSql(prepared([translation()]), 200).sql);
    expect(fixture.drafts()).toHaveLength(0);
    expect(fixture.snapshot()).toEqual(before);
  });

  it('retains an unapproved material ledger rather than treating input proofreading as approval', () => {
    const fixture = setup();
    fixture.sqlite.exec("UPDATE material_source_ledger SET rights_status='pending',review_status='needs_review'");
    const before = fixture.snapshot();
    fixture.sqlite.exec(buildReviewedWordExamplesSql(prepared(), 200).sql);
    expect(fixture.drafts()).toHaveLength(2);
    expect(fixture.snapshot()).toEqual(before);
    expect(fixture.sqlite.prepare('SELECT rights_status,review_status FROM material_source_ledger').get()).toMatchObject({ rights_status: 'pending', review_status: 'needs_review' });
  });

  it('prevents publication through the staging schema', () => {
    const fixture = setup(); fixture.sqlite.exec(buildReviewedWordExamplesSql(prepared(), 200).sql);
    expect(() => fixture.sqlite.exec("UPDATE word_example_drafts SET review_status='APPROVED'")).toThrow();
    expect(fixture.drafts().every(row => row.review_status === 'PENDING')).toBe(true);
  });

  it.each([
    { ...prepared(), reviewStatus: 'APPROVED' },
    { ...prepared(), reviewReference: '' },
    { ...prepared(), version: 2 },
    prepared([{ ...pair(), expectedUpdatedAt: '100' }]),
    prepared([{ ...pair(), exampleMeaning: '[要確認]' }]),
    prepared([{ ...pair(), exampleSentence: '' }]),
    prepared([{ ...pair(), publicationApproval: true }]),
    prepared([{ ...pair(), expectedExampleSentence: 'Original' }]),
    prepared([{ ...translation(), exampleSentence: 'Replace original' }]),
    prepared([pair(), pair()]),
  ])('rejects malformed, incomplete or approval-requesting packages', input => {
    expect(() => buildReviewedWordExamplesSql(input, 200)).toThrow();
  });

  it('quotes draft text as data rather than allowing SQL statements', () => {
    const fixture = setup(); const before = fixture.snapshot();
    const sentence = "A quotation: '); DELETE FROM words; --\nStill just text.";
    fixture.sqlite.exec(buildReviewedWordExamplesSql(prepared([{ ...pair(), exampleSentence: sentence }]), 200).sql);
    expect(fixture.snapshot()).toEqual(before);
    expect(fixture.drafts()[0].proposed_example_sentence).toBe(sentence);
  });

  it('builds offline SQL and a not-executed manifest, refuses remote flags and does not overwrite artifacts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'medace-reviewed-examples-'));
    temporaryDirectories.push(directory);
    const input = join(directory, 'input.json');
    const output = join(directory, 'pending.sql');
    writeFileSync(input, JSON.stringify(prepared()));
    const script = new URL('../scripts/build-reviewed-word-examples-sql.mjs', import.meta.url).pathname;
    const build = () => spawnSync(process.execPath, [script, '--input', input, '--output', output], { encoding: 'utf8' });
    expect(build().status).toBe(0);
    expect(readFileSync(output, 'utf8')).toContain('INSERT INTO word_example_drafts');
    expect(readFileSync(`${output}.manifest.json`, 'utf8')).toContain('"execution": "NOT_EXECUTED"');
    expect(build().status).not.toBe(0);
    expect(spawnSync(process.execPath, [script, '--input', input, '--output', output, '--remote', 'true']).status).not.toBe(0);
  });
});
