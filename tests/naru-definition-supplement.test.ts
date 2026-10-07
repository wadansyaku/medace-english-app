import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { createNaruSupplementFixtureModel } from './helpers/naru-definition-supplement-fixture';
import { buildNaruApprovalSql, buildNaruStageSql } from '../scripts/_shared/naru-workbook-import.mjs';
import { buildNaruDefinitionSupplementMigrationSql, buildNaruDefinitionSupplementSql, buildNaruDefinitionSupplementPreflightSql, NARU_DEFINITION_SUPPLEMENTS } from '../scripts/_shared/naru-definition-supplements.mjs';

const manifest = NARU_DEFINITION_SUPPLEMENTS;
const supplement = manifest.supplements[0];
const migration = fs.readFileSync('migrations/0057_naru_actually_definition_supplement.sql', 'utf8');
const sql = buildNaruDefinitionSupplementSql();
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
const modelFixture = createNaruSupplementFixtureModel;
const applySchema = (db:DatabaseSync, includeSupplement = false) => {
  for (const name of fs.readdirSync('migrations').filter(n => n.endsWith('.sql') && (includeSupplement || !n.startsWith('0057'))).sort()) db.exec(fs.readFileSync(`migrations/${name}`,'utf8'));
  db.exec('PRAGMA foreign_keys=ON');
};
const seedModel = (db:DatabaseSync, model:ReturnType<typeof modelFixture>) => {
  for (const [table, rows] of Object.entries(model.tables)) {
    if (!rows.length) continue;
    const fields = Object.keys(rows[0]);
    const insert = db.prepare(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`);
    for (const row of rows) insert.run(...fields.map(field => row[field]));
  }
  db.exec("UPDATE books SET word_count=1530; UPDATE material_source_ledger SET rights_status='approved',review_status='approved';");
};
const markOriginalWords = (db:DatabaseSync) => {
  db.exec("UPDATE words SET aichi_exam_appeared=1 WHERE word_number<=637; INSERT INTO catalog_word_exam_annotations SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',l.source_entry_id,'fixture','A1','FFFF00','word_cell' FROM words w JOIN catalog_word_source_links l ON l.word_id=w.id WHERE w.aichi_exam_appeared=1;");
};
const setup = () => {
  const db = new DatabaseSync(':memory:'); databases.push(db); applySchema(db); const model = modelFixture(); seedModel(db,model); markOriginalWords(db);
  return { db,model };
};
const all = (db:DatabaseSync, table:string) => db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all();
const counts = (db:DatabaseSync) => db.prepare('SELECT COUNT(*) AS words,SUM(aichi_exam_appeared) AS exam,SUM(definition_supplemented) AS supplemented FROM words').get();
const originalTables = ['catalog_workbook_sources','catalog_workbook_sheet_rows','catalog_source_entries'];
const snapshot = (db:DatabaseSync) => Object.fromEntries(originalTables.map(table => [table,all(db,table)]));

describe('application-only actually supplement, native SQLite', () => {
  it('keeps canonical reviewed evidence and one-line D1 triggers in sync', () => {
    expect(migration).toBe(buildNaruDefinitionSupplementMigrationSql());
    expect(migration.endsWith(sql+'\n')).toBe(true);
    expect(supplement.definition).toBe('実は、実際には（予想と違う事実・訂正）\n実際に、本当に（事実の強調）');
    expect(supplement.references).toHaveLength(2);
    expect(supplement.approval.userInstruction).toContain('本番に反映してください');
    expect(JSON.parse(supplement.originalPayloadJson)).toMatchObject({ ready:false,definition:'',contentHash:supplement.sourceContentHash });
    expect(migration.split('\n').filter(line => line.startsWith('CREATE TRIGGER')).every(line => line.endsWith('END;') && !line.includes('CASE '))).toBe(true);
    expect(new TextEncoder().encode(sql).length).toBeLessThan(100000);
    expect(() => buildNaruDefinitionSupplementSql({ ...manifest,supplements:[{ ...supplement,definition:'別の訳' }] })).toThrow('reviewed');
  });
  it('transports complete atomic triggers through the real Wrangler D1 SQL splitter', () => {
    const { db } = setup();
    const statements = unstable_splitSqlQuery(migration);
    const triggers = statements.filter(statement => statement.includes('CREATE TRIGGER'));
    expect(triggers).toHaveLength(5);
    for (const statement of triggers) {
      const trigger = statement.slice(statement.indexOf('CREATE TRIGGER'));
      expect(trigger).not.toContain('\n'); expect(trigger).toMatch(/\bBEGIN\b.*\bEND$/);
    }
    for (const statement of statements) db.exec(statement);
    expect(counts(db)).toEqual({ words:1531,exam:638,supplemented:1 });
    expect(db.prepare('SELECT definition FROM words WHERE id=?').get(supplement.wordId)?.definition).toBe(supplement.definition);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('rejects a direct ledger insert that bypasses the guarded generator', () => {
    const { db } = setup(); db.exec(migration.slice(0,migration.lastIndexOf('-- Explicit application-only')));
    db.exec("UPDATE material_source_ledger SET review_status='needs_review'");
    const before = all(db,'words');
    const unguarded = sql.slice(0,sql.indexOf(' WHERE NOT EXISTS'))+';';
    expect(() => db.exec(unguarded)).toThrow('Naru supplement source mismatch');
    expect(all(db,'words')).toEqual(before); expect(all(db,'catalog_word_definition_supplements')).toEqual([]);
  });
  it.each([
    ['approved','',1],
    ['pending',"UPDATE material_source_ledger SET review_status='needs_review'",0],
    ['source mismatch',"UPDATE catalog_workbook_sources SET sha256='changed' WHERE series_key='adverb'",0],
  ])('offers read-only pre-migration eligibility for %s', (_label,mutation,eligible) => {
    const { db } = setup(); if (mutation) db.exec(mutation);
    const query = buildNaruDefinitionSupplementPreflightSql({ hasDefinitionSupplementColumn:false });
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i);
    expect(query).not.toContain('definition_supplemented');
    const changes = Number(db.prepare('SELECT total_changes() AS n').get()?.n);
    expect(db.prepare(query).get()).toEqual({ eligible,currentWordCount:1530,currentHeldSourceCount:1,currentSupplementWordCount:0 });
    expect(Number(db.prepare('SELECT total_changes() AS n').get()?.n)).toBe(changes);
    db.exec(migration.slice(0,migration.lastIndexOf('-- Explicit application-only')));
    expect(db.prepare(buildNaruDefinitionSupplementPreflightSql()).get()?.eligible).toBe(eligible);
  });
  it('atomically inserts #1361, shifts 170 numbers, keeps original IDs/content/history and source evidence', () => {
    const { db } = setup();
    db.exec("INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES('synthetic-supplement','supplement@example.test','Synthetic','STUDENT',1,1)");
    const priorWord = db.prepare('SELECT id FROM words WHERE word_number=1361').get();
    db.prepare("INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,attempt_count) VALUES('synthetic-supplement',?,'naru-shisto-original-v1','review',1,2,3)").run(priorWord!.id);
    const sources = snapshot(db); const beforeWords = all(db,'words'); const beforeHistory = all(db,'learning_histories'); const beforeBooks = all(db,'books'); const beforeLedger = all(db,'material_source_ledger');
    db.exec(migration);
    expect(counts(db)).toEqual({ words:1531,exam:638,supplemented:1 });
    expect(snapshot(db)).toEqual(sources);
    expect(all(db,'learning_histories')).toEqual(beforeHistory);
    const words = all(db,'words');
    for (const old of beforeWords) {
      const found = words.find(row => row.id === old.id);
      expect(found).toEqual({ ...old,word_number:Number(old.word_number)+(Number(old.word_number)>=1361 ? 1 : 0),definition_supplemented:0 });
    }
    expect(words.filter(row => row.part_of_speech==='adverb')).toHaveLength(87);
    expect(db.prepare('SELECT * FROM words WHERE id=?').get(supplement.wordId)).toMatchObject({ word_number:1361,word:'actually',definition:supplement.definition,example_meaning:supplement.exampleMeaning,aichi_exam_appeared:1,definition_supplemented:1 });
    expect(db.prepare('SELECT COUNT(DISTINCT word_number) AS n FROM words').get()?.n).toBe(1531);
    expect(db.prepare('SELECT * FROM catalog_word_definition_supplements').get()).toMatchObject({ original_definition:null,source_entry_id:supplement.sourceEntryId,source_content_hash:supplement.sourceContentHash,definition:supplement.definition });
    expect(db.prepare('SELECT ready,payload_json,content_hash FROM catalog_source_entries WHERE id=?').get(supplement.sourceEntryId)).toEqual({ ready:0,payload_json:supplement.originalPayloadJson,content_hash:supplement.sourceContentHash });
    expect(all(db,'books')[0]).toEqual({ ...beforeBooks[0],word_count:1531,description:supplement.publishedDescription });
    expect(all(db,'material_source_ledger')[0]).toMatchObject({ rights_status:beforeLedger[0].rights_status,review_status:beforeLedger[0].review_status,edition:beforeLedger[0].edition,qa_word_count:1531,qa_source_coverage_rate:0.6088,qa_example_pair_coverage_rate:0.0007 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const changes = Number(db.prepare('SELECT total_changes() AS n').get()?.n); db.exec(sql);
    expect(Number(db.prepare('SELECT total_changes() AS n').get()?.n)).toBe(changes);
  });
  it.each([
    ['pending',"UPDATE material_source_ledger SET review_status='needs_review',rights_status='pending'"],
    ['changed SHA',"UPDATE catalog_workbook_sources SET sha256='changed' WHERE series_key='adverb'"],
    ['held hash',`UPDATE catalog_source_entries SET content_hash='changed' WHERE id='${supplement.sourceEntryId}'`],
    ['held ready',`UPDATE catalog_source_entries SET ready=1 WHERE id='${supplement.sourceEntryId}'`],
    ['held meaning',`UPDATE catalog_source_entries SET payload_json=json_set(payload_json,'$.definition','他の意味') WHERE id='${supplement.sourceEntryId}'`],
    ['archive meaning',"UPDATE catalog_workbook_sheet_rows SET payload_json=json_set(payload_json,'$.values[6]','既存の訳') WHERE row_number=82"],
    ['correction fill',"UPDATE catalog_workbook_sheet_rows SET payload_json=REPLACE(payload_json,'FFFF00','FFF2CC') WHERE row_number=82"],
    ['changed sample',"UPDATE catalog_workbook_sheet_rows SET payload_json=REPLACE(payload_json,'tomatoes','onions') WHERE row_number=82"],
    ['existing meaning',"UPDATE words SET definition='変更された意味' WHERE word_number=1"],
    ['existing source',"UPDATE words SET source_entry_id=999 WHERE word_number=1"],
    ['existing example',"UPDATE words SET example_sentence='Edited example.' WHERE word_number=1500"],
    ['existing number',"UPDATE words SET word_number=9999 WHERE word_number=1530"],
    ['existing wrong source link',"UPDATE catalog_word_source_links SET match_kind='verified_existing' WHERE word_id=(SELECT id FROM words WHERE word_number=1)"],
    ['different target',"UPDATE books SET source_context='different revision'"],
    ['different title',"UPDATE books SET title='Other book'"],
  ])('refuses %s without changing content, history, approvals or source evidence', (_label,mutation) => {
    const { db } = setup(); db.exec(mutation); const beforeWords = all(db,'words'); const beforeSources = snapshot(db); const beforeBooks = all(db,'books'); const beforeLedger = all(db,'material_source_ledger');
    db.exec(migration);
    expect(db.prepare('SELECT COUNT(*) AS n FROM catalog_word_definition_supplements').get()?.n).toBe(0);
    expect(all(db,'words')).toEqual(beforeWords.map(row => ({ ...row,definition_supplemented:0 })));
    expect(snapshot(db)).toEqual(beforeSources); expect(all(db,'books')).toEqual(beforeBooks); expect(all(db,'material_source_ledger')).toEqual(beforeLedger);
  });
  it.each(["word='edited'","definition='編集した訳'","source_sheet='other'",'source_entry_id=999',"part_of_speech='noun'","example_meaning='別の例文訳'"] )('invalidates application provenance after %s and cannot revive it on replay', mutation => {
    const { db } = setup(); db.exec(migration); const evidence = all(db,'catalog_word_definition_supplements'); db.exec(`UPDATE words SET ${mutation} WHERE id='${supplement.wordId}'`);
    expect(db.prepare('SELECT definition_supplemented FROM words WHERE id=?').get(supplement.wordId)?.definition_supplemented).toBe(0);
    if (!mutation.startsWith('example_meaning')) expect(db.prepare('SELECT aichi_exam_appeared FROM words WHERE id=?').get(supplement.wordId)?.aichi_exam_appeared).toBe(0);
    db.exec(sql); expect(db.prepare('SELECT definition_supplemented FROM words WHERE id=?').get(supplement.wordId)?.definition_supplemented).toBe(0); expect(all(db,'catalog_word_definition_supplements')).toEqual(evidence);
  });
  it.each([
    `UPDATE catalog_source_entries SET content_hash='changed' WHERE id='${supplement.sourceEntryId}'`,
    "UPDATE catalog_workbook_sources SET sha256='changed' WHERE series_key='adverb'",
    "UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE row_number=82",
  ])('invalidates flags on source edits and retains historical supplement evidence', mutation => {
    const { db } = setup(); db.exec(migration); const evidence = all(db,'catalog_word_definition_supplements'); db.exec(mutation); db.exec(sql);
    expect(db.prepare('SELECT definition_supplemented,aichi_exam_appeared FROM words WHERE id=?').get(supplement.wordId)).toEqual({ definition_supplemented:0,aichi_exam_appeared:0 }); expect(all(db,'catalog_word_definition_supplements')).toEqual(evidence);
  });
  it('rolls back number movement and all inserts when a downstream statement fails', () => {
    const { db } = setup();
    db.exec(migration.slice(0,migration.lastIndexOf('-- Explicit application-only')));
    db.exec("CREATE TRIGGER synthetic_annotation_failure BEFORE INSERT ON catalog_word_exam_annotations BEGIN SELECT RAISE(ABORT,'synthetic downstream failure'); END;");
    const words = all(db,'words'); const sources = snapshot(db); const books = all(db,'books'); const ledger = all(db,'material_source_ledger');
    expect(() => db.exec(sql)).toThrow('synthetic downstream failure');
    expect(all(db,'words')).toEqual(words); expect(snapshot(db)).toEqual(sources); expect(all(db,'books')).toEqual(books); expect(all(db,'material_source_ledger')).toEqual(ledger); expect(all(db,'catalog_word_definition_supplements')).toEqual([]); expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('supports fresh migrations -> original stage -> approval -> explicit supplement', () => {
    const db = new DatabaseSync(':memory:'); databases.push(db); applySchema(db,true); const model = modelFixture();
    db.exec(buildNaruStageSql(model)); db.exec(sql); expect(counts(db)).toEqual({ words:1530,exam:0,supplemented:0 });
    db.exec(buildNaruApprovalSql(model,'Synthetic originals explicitly reviewed',2)); markOriginalWords(db); db.exec(sql);
    expect(counts(db)).toEqual({ words:1531,exam:638,supplemented:1 }); expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  },15000);
});
