import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { archiveWorkbook, buildOriginalWorkbookSql, ORIGINAL_WORKBOOKS, parseOriginalWorkbook } from '../scripts/_shared/original-workbook-import.mjs';
import { buildNaruAccessScopeRepairSql, buildNaruApprovalSql, buildNaruStageSql, createNaruWorkbookImport, naruAccessScopeRepairQueries, naruImportQueries, verifyNaruAccessScopeRepairRows, verifyNaruImportRows } from '../scripts/_shared/naru-workbook-import.mjs';
import { BookAccessScope, SubscriptionPlan, UserRole } from '../types';
import { canAccessOfficialBook } from '../utils/bookAccess';
import { canAccessOfficialBook as canUserAccessOfficialBook, toBookMetadata, type DbBookRow } from '../functions/_shared/storage-support';

const workbooks = () => ORIGINAL_WORKBOOKS.map(spec => {
  const sheets = spec.key === 'verb' ? [['文法分類', [['grow', 'grew-grown', '成長する', 'He grew.', '活用の注記']]], ['動詞一覧', [['grow']]], ['メモ', [['grow']]]]
    : spec.key === 'noun' ? [['名詞一覧', [['grow']]], ['生活', [[null, '生活'], [1, 'grow', '成長', 'Growth matters.', '別品詞']]]]
    : spec.key === 'adverb' ? [['副詞一覧', [['well', null, null, null, null, 'well', '上手に', 'She sings well.'], ['actually', null, null, null, null, 'actually', null, 'Actually, yes.']]]]
    : [['形容詞', [['kind', '親切な', 'She is kind.']]], ['形容詞一覧', [['kind']]]];
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows as unknown[][]), String(name));
  return parseOriginalWorkbook({ spec, sha256: String(ORIGINAL_WORKBOOKS.indexOf(spec) + 1).repeat(64), sheets: archiveWorkbook(workbook, XLSX) });
});
const migrations = fs.readdirSync('migrations').filter(n => n.endsWith('.sql')).sort().map(n => fs.readFileSync(`migrations/${n}`, 'utf8')).join('\n');
const database = () => { const db = new DatabaseSync(':memory:'); db.exec(migrations); return db; };
const read = (db, model) => Object.fromEntries(naruImportQueries(model).map(q => [q.table, db.prepare(q.sql).all()]));
const repairRead = (db, model) => Object.fromEntries(naruAccessScopeRepairQueries(model).map(q => [q.table, db.prepare(q.sql).all()]));
const approvedRepairFixture = () => {
  const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 }); const db = database();
  db.exec(buildNaruStageSql(model)); db.exec(buildNaruApprovalSql(model, 'Reviewed synthetic originals', 2));
  db.prepare("UPDATE books SET access_scope='PUBLIC',updated_at=7 WHERE id=?").run(model.bookId);
  db.exec('UPDATE words SET is_reported=1,updated_at=9');
  return { model, db };
};
const allRows = db => Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all().map(({ name }) => [String(name), db.prepare(`SELECT * FROM ${name}`).all()]));

describe('explicit Naru access-scope repair preflight and single write', () => {
  it.each(['PUBLIC', 'ALL_PLANS'])('changes only the approved book scope and is idempotent from %s', accessScope => {
    const { model, db } = approvedRepairFixture();
    try {
      db.prepare('UPDATE books SET access_scope=? WHERE id=?').run(accessScope, model.bookId);
      db.exec(`INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES('synthetic-repair','repair@example.test','Repair','STUDENT',1,1);
        INSERT INTO books(id,title,word_count,catalog_source,access_scope,created_at,updated_at) VALUES('unrelated','Unrelated',1,'USER_GENERATED','PUBLIC',1,1);
        INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES('unrelated-word','unrelated',1,'goal','目標','goal',1,1);
        INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,attempt_count) VALUES('synthetic-repair','unrelated-word','unrelated','review',1,2,1);`);
      const before = allRows(db); const actual = repairRead(db, model); const savedActual = JSON.stringify(actual);
      expect(canAccessOfficialBook(SubscriptionPlan.TOC_FREE, toBookMetadata(actual.books[0] as unknown as DbBookRow))).toBe(accessScope === 'ALL_PLANS');
      const countBefore = Number(db.prepare('SELECT total_changes() AS count').get()?.count);
      expect(verifyNaruAccessScopeRepairRows(model, actual)).toMatchObject({ verified: true, previousAccessScope: accessScope, repairNeeded: accessScope === 'PUBLIC' });
      const sql = buildNaruAccessScopeRepairSql(model, actual);
      expect(sql.match(/UPDATE /g)).toHaveLength(1);
      expect(new TextEncoder().encode(sql).length).toBeLessThanOrEqual(100000);
      expect(db.prepare(sql).all()).toHaveLength(accessScope === 'PUBLIC' ? 1 : 0);
      db.exec(sql);
      expect(Number(db.prepare('SELECT total_changes() AS count').get()?.count) - countBefore).toBe(accessScope === 'PUBLIC' ? 1 : 0);
      expect(JSON.stringify(actual)).toBe(savedActual);
      const expected = { ...before, books: before.books.map(book => book.id === model.bookId ? { ...book, access_scope: 'ALL_PLANS' } : book) };
      expect(allRows(db)).toEqual(expected);
      const repairedBook = toBookMetadata(db.prepare('SELECT * FROM books WHERE id=?').get(model.bookId) as unknown as DbBookRow);
      expect(canAccessOfficialBook(SubscriptionPlan.TOC_FREE, repairedBook)).toBe(true);
      expect(canUserAccessOfficialBook({ role: UserRole.STUDENT, subscription_plan: SubscriptionPlan.TOC_FREE } as any, repairedBook)).toBe(true);
      const countAfter = Number(db.prepare('SELECT total_changes() AS count').get()?.count);
      expect(db.prepare(buildNaruAccessScopeRepairSql(model, repairRead(db, model))).all()).toEqual([]);
      expect(Number(db.prepare('SELECT total_changes() AS count').get()?.count)).toBe(countAfter);
      expect(allRows(db)).toEqual(expected);
      expect(verifyNaruImportRows(model, read(db, model)).verified).toBe(true);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });

  it.each([
    ['unsupported scope', "UPDATE books SET access_scope='BUSINESS_ONLY'"],
    ['unknown scope', "UPDATE books SET access_scope='OTHER'"],
    ['title', "UPDATE books SET title='Other title'"],
    ['book revision', "UPDATE books SET source_context='other revision'"],
    ['word count', 'UPDATE books SET word_count=99'],
    ['rights hold', "UPDATE material_source_ledger SET rights_status='blocked'"],
    ['review hold', "UPDATE material_source_ledger SET review_status='blocked'"],
    ['pending rights', "UPDATE material_source_ledger SET rights_status='pending'"],
    ['pending review', "UPDATE material_source_ledger SET review_status='needs_review'"],
    ['ledger revision', "UPDATE material_source_ledger SET edition='other revision'"],
    ['word meaning', "UPDATE words SET definition='changed meaning' WHERE word_number=1"],
    ['word original note', "UPDATE words SET source_note='changed note' WHERE word_number=1"],
    ['source archive', "UPDATE catalog_workbook_sources SET archive_json='{}'"],
    ['archive row', "UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE row_number=1"],
    ['archive coordinate', 'UPDATE catalog_workbook_sheet_rows SET row_number=999 WHERE row_number=1'],
    ['entry payload', "UPDATE catalog_source_entries SET payload_json='{}' WHERE ready=1"],
    ['held entry', 'UPDATE catalog_source_entries SET ready=1 WHERE ready=0'],
    ['word link', "UPDATE catalog_word_source_links SET match_kind='verified_existing'"],
    ['partial link import', 'DELETE FROM catalog_word_source_links WHERE word_id=(SELECT id FROM words WHERE word_number=1)'],
    ['extra entry', "INSERT INTO catalog_source_entries SELECT 'extra',source_id,'extra','hash','{}',0 FROM catalog_source_entries LIMIT 1"],
  ])('produces no write SQL for %s and preserves all tables', (_change, sql) => {
    const { model, db } = approvedRepairFixture();
    try {
      db.exec(sql); const before = allRows(db);
      const countBefore = Number(db.prepare('SELECT total_changes() AS count').get()?.count);
      const actual = repairRead(db, model);
      expect(() => verifyNaruAccessScopeRepairRows(model, actual)).toThrow();
      expect(() => buildNaruAccessScopeRepairSql(model, actual)).toThrow();
      expect(allRows(db)).toEqual(before);
      expect(Number(db.prepare('SELECT total_changes() AS count').get()?.count)).toBe(countBefore);
    } finally { db.close(); }
  });

  it.each(['same title', 'legacy book'])('rejects a conflicting %s during read-only preflight', conflict => {
    const { model, db } = approvedRepairFixture();
    try {
      db.prepare('INSERT INTO books(id,title,word_count,created_at,updated_at) VALUES(?,?,0,1,1)')
        .run(conflict === 'legacy book' ? model.legacyBookIds[0] : 'same-title', conflict === 'same title' ? model.title : 'Legacy');
      const before = allRows(db);
      expect(() => buildNaruAccessScopeRepairSql(model, repairRead(db, model))).toThrow('conflict-free');
      expect(allRows(db)).toEqual(before);
    } finally { db.close(); }
  });

  it('requires complete preflight evidence and rejects non-ALL_PLANS repair models', () => {
    const { model, db } = approvedRepairFixture();
    try {
      expect(() => buildNaruAccessScopeRepairSql(model)).toThrow('preflight required');
      const actual = repairRead(db, model);
      for (const table of Object.keys(model.tables)) {
        expect(() => buildNaruAccessScopeRepairSql(model, { ...actual, [table]: [] })).toThrow();
      }
      for (const repair_conflicts of [undefined, [], [{ conflict_count: null }], [{ conflict_count: '0' }]]) {
        expect(() => buildNaruAccessScopeRepairSql(model, { ...actual, repair_conflicts })).toThrow('preflight required');
      }
      const business = createNaruWorkbookImport(workbooks(), { timestamp: 1, accessScope: 'BUSINESS_ONLY' });
      expect(() => naruAccessScopeRepairQueries(business)).toThrow('Complete ALL_PLANS');
      const partial = { ...model, tables: { ...model.tables, words: [] } };
      expect(() => naruAccessScopeRepairQueries(partial)).toThrow('Complete ALL_PLANS');
      const changedId = { ...model, bookId: 'other-book' };
      expect(() => naruAccessScopeRepairQueries(changedId)).toThrow('Complete ALL_PLANS');
    } finally { db.close(); }
  });

  it.each(['scope', 'approval', 'title', 'partial'])('guards the single UPDATE if %s changes after successful preflight', change => {
    const { model, db } = approvedRepairFixture();
    try {
      const sql = buildNaruAccessScopeRepairSql(model, repairRead(db, model));
      if (change === 'scope') db.exec("UPDATE books SET access_scope='BUSINESS_ONLY'");
      if (change === 'approval') db.exec("UPDATE material_source_ledger SET review_status='blocked'");
      if (change === 'title') db.exec("UPDATE books SET title='Other title'");
      if (change === 'partial') db.exec('DELETE FROM catalog_word_source_links');
      const before = allRows(db); const countBefore = Number(db.prepare('SELECT total_changes() AS count').get()?.count);
      expect(db.prepare(sql).all()).toEqual([]);
      expect(allRows(db)).toEqual(before);
      expect(Number(db.prepare('SELECT total_changes() AS count').get()?.count)).toBe(countBefore);
    } finally { db.close(); }
  });
});

describe('one-book original workbook import', () => {
  it('imports ALL_PLANS so the real client and server access checks admit a free student', () => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 }); const db = database();
    try {
      db.exec(buildNaruStageSql(model)); db.exec(buildNaruApprovalSql(model, 'Reviewed synthetic originals'));
      const row = db.prepare('SELECT * FROM books WHERE id=?').get(model.bookId) as unknown as DbBookRow;
      expect(row.access_scope).toBe(BookAccessScope.ALL_PLANS);
      const book = toBookMetadata(row);
      expect(canAccessOfficialBook(SubscriptionPlan.TOC_FREE, book)).toBe(true);
      expect(canUserAccessOfficialBook({ role: UserRole.STUDENT, subscription_plan: SubscriptionPlan.TOC_FREE } as any, book)).toBe(true);
      expect(verifyNaruImportRows(model, read(db, model)).verified).toBe(true);
    } finally { db.close(); }
  });

  it('keeps explicit BUSINESS_ONLY imports inaccessible to free students', () => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1, accessScope: BookAccessScope.BUSINESS_ONLY }); const db = database();
    try {
      db.exec(buildNaruStageSql(model)); db.exec(buildNaruApprovalSql(model, 'Reviewed synthetic business originals'));
      const row = db.prepare('SELECT * FROM books WHERE id=?').get(model.bookId) as unknown as DbBookRow;
      const book = toBookMetadata(row);
      expect(row.access_scope).toBe(BookAccessScope.BUSINESS_ONLY);
      expect(canAccessOfficialBook(SubscriptionPlan.TOC_FREE, book)).toBe(false);
      expect(canUserAccessOfficialBook({ role: UserRole.STUDENT, subscription_plan: SubscriptionPlan.TOC_FREE } as any, book)).toBe(false);
      expect(canAccessOfficialBook(SubscriptionPlan.TOB_PAID, book)).toBe(true);
      expect(canUserAccessOfficialBook({ role: UserRole.STUDENT, subscription_plan: SubscriptionPlan.TOB_PAID } as any, book)).toBe(true);
      expect(verifyNaruImportRows(model, read(db, model)).verified).toBe(true);
    } finally { db.close(); }
  });

  it('rejects PUBLIC as new input and never repairs an existing PUBLIC record through import or approval', () => {
    const input = workbooks();
    expect(() => createNaruWorkbookImport(input, { accessScope: 'PUBLIC' })).toThrow('Invalid access scope');
    const model = createNaruWorkbookImport(input, { timestamp: 1 }); const db = database();
    try {
      db.exec(buildNaruStageSql(model));
      db.prepare("UPDATE books SET access_scope='PUBLIC' WHERE id=?").run(model.bookId);
      const before = JSON.stringify(read(db, model));
      expect(() => db.exec(buildNaruStageSql(model))).toThrow();
      expect(() => db.exec(buildNaruApprovalSql(model, 'Reviewed'))).toThrow();
      expect(() => verifyNaruImportRows(model, read(db, model))).toThrow('immutable content mismatch');
      expect(JSON.stringify(read(db, model))).toBe(before);
    } finally { db.close(); }
  });

  it('keeps separate senses/POS, original IDs, raw sources and held content in one pending book', () => {
    const input = workbooks(); const model = createNaruWorkbookImport(input, { timestamp: 1 }); const db = database();
    try {
      db.exec(buildNaruStageSql(model));
      expect(db.prepare('SELECT title,word_count FROM books WHERE id=?').get(model.bookId)).toMatchObject({ title: 'Naruシスト', word_count: 4 });
      expect(db.prepare('SELECT word_number,word,part_of_speech FROM words WHERE book_id=? ORDER BY word_number').all(model.bookId)).toEqual([
        expect.objectContaining({ word_number: 1, word: 'grow', part_of_speech: 'verb' }), expect.objectContaining({ word_number: 2, word: 'grow', part_of_speech: 'noun' }), expect.objectContaining({ word_number: 3, part_of_speech: 'adverb' }), expect.objectContaining({ word_number: 4, part_of_speech: 'adjective' }),
      ]);
      expect(db.prepare('SELECT rights_status,review_status FROM material_source_ledger WHERE book_id=?').get(model.bookId)).toMatchObject({ rights_status: 'pending', review_status: 'needs_review' });
      expect(model.held).toEqual([expect.objectContaining({ word: 'actually' })]);
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_source_entries WHERE ready=0').get()?.count).toBe(1);
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_word_source_links').get()?.count).toBe(4);
      expect(verifyNaruImportRows(model, read(db, model))).toMatchObject({ verified: true, wordCount: 4, heldCount: 1 });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      const snapshot = database();
      try { snapshot.exec(buildOriginalWorkbookSql(input)); expect(db.prepare('SELECT id FROM words ORDER BY id').all()).toEqual(snapshot.prepare('SELECT id FROM words ORDER BY id').all()); } finally { snapshot.close(); }
    } finally { db.close(); }
  });

  it('resumes exact imports without changing timestamps, approvals or reports', () => {
    const input = workbooks(); const model = createNaruWorkbookImport(input, { timestamp: 1 }); const db = database();
    try {
      db.exec(buildNaruStageSql(model));
      db.exec(buildNaruApprovalSql(model, 'Explicit publication of reviewed originals', 2));
      db.exec('UPDATE words SET is_reported=1,updated_at=7');
      const before = JSON.stringify(read(db, model));
      db.exec(buildNaruStageSql(createNaruWorkbookImport(input, { timestamp: 999 })));
      expect(JSON.stringify(read(db, model))).toBe(before);
      expect(verifyNaruImportRows(model, read(db, model)).verified).toBe(true);
    } finally { db.close(); }
  });

  it('preserves existing level books, history, receipts, missions and plans across import and approval', () => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 }); const db = database();
    try {
      db.exec(`INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES('synthetic','synthetic@example.test','Synthetic','STUDENT',1,1);
        INSERT INTO books(id,title,word_count,catalog_source,access_scope,created_at,updated_at) VALUES('existing-level','Existing level',1,'USER_GENERATED','PUBLIC',1,1);
        INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES('existing-word','existing-level',1,'goal','目標','goal',1,1);
        INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,correct_count,attempt_count) VALUES('synthetic','existing-word','existing-level','LEARNING',1,2,3,4);
        INSERT INTO study_attempt_receipts(user_id,client_attempt_id,request_fingerprint,commit_token,word_id,book_id,existing_was_study,created_at) VALUES('synthetic','attempt','fingerprint','commit','existing-word','existing-level',1,1);
        INSERT INTO learning_plans(user_id,created_at,target_date,goal_description,daily_word_goal,selected_book_ids,status,updated_at) VALUES('synthetic',1,'2027-01-01','Synthetic',10,'["existing-level"]','ACTIVE',1);
        INSERT INTO learning_plan_books(user_id,book_id,sort_order,created_at,updated_at) VALUES('synthetic','existing-level',0,1,1);
        INSERT INTO weekly_missions(id,created_by_user_id,learning_track,title,rationale,book_id,book_title,due_at,created_at,updated_at) VALUES('mission','synthetic','GENERAL','Synthetic','Synthetic','existing-level','Existing level',99,1,1);
        INSERT INTO weekly_mission_assignments(id,mission_id,student_user_id,assigned_by_user_id,assigned_at,updated_at) VALUES('assignment','mission','synthetic','synthetic',1,1);`);
      const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => String(r.name));
      const before = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify(row))]));
      db.exec(buildNaruStageSql(model)); db.exec(buildNaruStageSql(model)); db.exec(buildNaruApprovalSql(model, 'Reviewed synthetic originals'));
      for (const table of tables) {
        const after = db.prepare(`SELECT * FROM ${table}`).all().map(row => JSON.stringify(row));
        if (!(table in model.tables)) expect(after).toEqual(before[table]);
        else for (const row of before[table]) expect(after).toContain(row);
      }
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });

  it('resumes a partial pending import while preserving already inserted timestamps', () => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 }); const db = database();
    try {
      const statements = buildNaruStageSql(model).split('\n');
      db.exec(statements.slice(0, 7).join('\n'));
      const source = db.prepare('SELECT * FROM catalog_workbook_sources LIMIT 1').get();
      expect(() => verifyNaruImportRows(model, read(db, model))).toThrow();
      db.exec(buildNaruStageSql(createNaruWorkbookImport(workbooks(), { timestamp: 999 })));
      expect(db.prepare('SELECT * FROM catalog_workbook_sources WHERE id=?').get(String(source?.id))).toEqual(source);
      expect(verifyNaruImportRows(model, read(db, model)).verified).toBe(true);
    } finally { db.close(); }
  });

  it.each(['legacy', 'title', 'word', 'source', 'blocked'])('fails closed for conflicting %s data', conflict => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 }); const db = database();
    try {
      db.exec(buildNaruStageSql(model));
      if (conflict === 'legacy') db.prepare('INSERT INTO books (id,title,word_count,created_at,updated_at) VALUES (?, ?, 1,1,1)').run(model.legacyBookIds[0], 'Old original');
      if (conflict === 'title') db.prepare('INSERT INTO books (id,title,word_count,created_at,updated_at) VALUES (?, ?, 1,1,1)').run('different-book', model.title);
      if (conflict === 'word') db.exec("UPDATE words SET definition='変更された意味' WHERE word_number=1");
      if (conflict === 'source') db.exec("UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE row_number=1");
      if (conflict === 'blocked') db.exec("UPDATE material_source_ledger SET review_status='blocked'");
      expect(() => db.exec(buildNaruStageSql(model))).toThrow();
    } finally { db.close(); }
  });

  it('does not approve incomplete content, and full read-back rejects changed metadata', () => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 }); const db = database();
    try {
      db.exec(buildNaruStageSql(model));
      db.exec('DELETE FROM catalog_word_source_links WHERE word_id=(SELECT id FROM words WHERE word_number=1)');
      expect(() => db.exec(buildNaruApprovalSql(model, 'Reviewed'))).toThrow();
      expect(() => verifyNaruImportRows(model, read(db, model))).toThrow();
      db.exec(buildNaruStageSql(model));
      db.exec("UPDATE words SET source_note='Lost original note' WHERE word_number=1");
      expect(() => verifyNaruImportRows(model, read(db, model))).toThrow('immutable content mismatch');
    } finally { db.close(); }
  });

  it.each(['definition', 'archive', 'archive-coordinate', 'ledger', 'extra'])('rejects %s changes after successful read-back in the approval SQL itself', change => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 }); const db = database();
    try {
      db.exec(buildNaruStageSql(model)); expect(verifyNaruImportRows(model, read(db, model)).verified).toBe(true);
      if (change === 'definition') db.exec("UPDATE words SET definition='変更された意味' WHERE word_number=1");
      if (change === 'archive') db.exec("UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE row_number=1");
      if (change === 'archive-coordinate') db.exec("UPDATE catalog_workbook_sheet_rows SET row_number=999 WHERE row_number=1");
      if (change === 'ledger') db.exec('DELETE FROM material_source_ledger');
      if (change === 'extra') db.exec("INSERT INTO catalog_source_entries SELECT 'extra',source_id,'extra','hash','{}',0 FROM catalog_source_entries LIMIT 1");
      expect(() => db.exec(buildNaruApprovalSql(model, 'Reviewed'))).toThrow();
      expect(db.prepare('SELECT review_status FROM material_source_ledger').get()?.review_status).not.toBe('approved');
    } finally { db.close(); }
  });

  it('rejects an oversized archive statement before producing an import', () => {
    const model = createNaruWorkbookImport(workbooks(), { timestamp: 1 });
    model.tables.catalog_workbook_sheet_rows[0].payload_json = 'x'.repeat(100000);
    expect(() => buildNaruStageSql(model)).toThrow('SQL statement exceeds D1 limit');
  });

  it('invalidates stale proof and approval files before a failed verification without replacing the reviewed stage', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'naru-failed-readback-'));
    try {
      fs.writeFileSync(path.join(output, 'naru-workbooks.approval.sql'), 'stale approval');
      fs.writeFileSync(path.join(output, 'naru-readback-proof.json'), '{}');
      fs.writeFileSync(path.join(output, 'naru-workbooks.pending.sql'), 'reviewed stage');
      fs.writeFileSync(path.join(output, 'naru-workbook-manifest.json'), '{}');
      const result = spawnSync(process.execPath, ['scripts/import-naru-workbooks.mjs', '--input-dir', path.join(output, 'missing-originals'), '--output-dir', output, '--database', 'not-a-real-database', '--local'], { stdio: 'ignore' });
      expect(result.status).not.toBe(0);
      expect(fs.existsSync(path.join(output, 'naru-workbooks.approval.sql'))).toBe(false);
      expect(fs.existsSync(path.join(output, 'naru-readback-proof.json'))).toBe(false);
      expect(fs.readFileSync(path.join(output, 'naru-workbooks.pending.sql'), 'utf8')).toBe('reviewed stage');
    } finally { fs.rmSync(output, { recursive: true, force: true }); }
  });
});
