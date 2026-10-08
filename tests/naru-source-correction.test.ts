import fs from 'node:fs';
import {handleGetWordsByBook} from '../functions/_shared/storage-book-actions';
import {SubscriptionPlan} from '../types';
import type {DbUserRow} from '../functions/_shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';
import { createSqliteD1 } from './helpers/sqlite-d1';
import { createNaruSupplementFixtureModel } from './helpers/naru-definition-supplement-fixture';
import { NARU_SOURCE_CORRECTIONS, buildNaruSourceCorrectionMigrationSql, buildNaruSourceCorrectionSql, buildNaruSourceCorrectionStageSql, buildNaruSourceCorrectionPreflightSql } from '../scripts/_shared/naru-source-corrections.mjs';
import { buildNaruDefinitionSupplementSql } from '../scripts/_shared/naru-definition-supplements.mjs';
import { readGuestLearningCatalog, commitGuestLearningImport } from '../functions/_shared/api-routes/guest-learning';
import WordExamBadge from '../components/WordExamBadge';
import { GUEST_LEARNING_VERSION } from '../shared/guestLearning';
import { toWordData } from '../functions/_shared/storage-support';
const m=NARU_SOURCE_CORRECTIONS.corrections[0];
const sql=buildNaruSourceCorrectionSql();
const migration=fs.readFileSync('migrations/0059_naru_actually_source_correction.sql','utf8');
const fixtures:ReturnType<typeof createSqliteD1>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
const setup=({approved=true,correct=true}={})=>{
 const f=createSqliteD1();fixtures.push(f);
 for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))<=58).sort()) f.sqlite.exec(fs.readFileSync(`migrations/${name}`,'utf8'));
 const model=process.env.NARU_ORIGINAL_MODEL_FILE?JSON.parse(fs.readFileSync(process.env.NARU_ORIGINAL_MODEL_FILE,'utf8')):createNaruSupplementFixtureModel();
 // Synthetic lexical catalog uses the actual old adverb archive and actual held
 // actually payload. An optional real original model exercises all 1530 words.
 model.tables.catalog_workbook_sheet_rows=model.tables.catalog_workbook_sheet_rows.filter(r=>r.source_id!==m.originalSourceId);
 model.tables.catalog_workbook_sheet_rows.push(...m.archiveRows.map(r=>({source_id:m.originalSourceId,sheet_name:r.sheet,row_number:r.row,payload_json:r.originalPayloadJson})));
 model.tables.catalog_workbook_sources.find(r=>r.id===m.originalSourceId).archive_json=m.originalArchiveJson;
 for(const[table,rows]of Object.entries(model.tables) as [string,Record<string,any>[]][]){
  if(!rows.length)continue;const cols=Object.keys(rows[0]),insert=f.sqlite.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`);
  for(const row of rows)insert.run(...cols.map(col=>row[col]));
 }
 f.sqlite.exec("UPDATE books SET word_count=1530;UPDATE material_source_ledger SET rights_status='approved',review_status='approved';");
 if(!process.env.NARU_ORIGINAL_MODEL_FILE)f.sqlite.exec("UPDATE words SET aichi_exam_appeared=1 WHERE word_number<=637;INSERT INTO catalog_word_exam_annotations SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',l.source_entry_id,'fixture','A1','FFFF00','word_cell' FROM words w JOIN catalog_word_source_links l ON l.word_id=w.id WHERE w.aichi_exam_appeared=1;");
 f.sqlite.exec(buildNaruDefinitionSupplementSql());
 if(process.env.NARU_ORIGINAL_MODEL_FILE){

  const audit=JSON.parse(fs.readFileSync('data/naru-aichi-exam-annotations.json','utf8'));
  const entries=new Map(model.tables.catalog_source_entries.map(e=>[e.source_key,e]));
  const sources=new Map(model.tables.catalog_workbook_sources.map(e=>[e.id,e]));
  const links=new Map(model.tables.catalog_word_source_links.map(e=>[e.source_entry_id,e.word_id]));
  const annotation=f.sqlite.prepare("INSERT INTO catalog_word_exam_annotations VALUES(?,'AICHI_HIGH_SCHOOL_ENTRANCE',?,?,?,'FFFF00',?)");
  for(const mark of audit.marks){const entry=entries.get(mark.sourceKey) as any;const source=sources.get(entry?.source_id) as any;const payload=entry&&JSON.parse(entry.payload_json);const id=links.get(entry?.id) as string;
   if(source?.sha256!==mark.sourceSha256||!entry.ready||payload.word!==mark.word||payload.definition!==mark.definition||payload.partOfSpeech!==mark.partOfSpeech||payload.sourceRow!==mark.sourceRow||payload.sourceColumn!==mark.sourceColumn)throw new Error('Original mark mismatch');
   annotation.run(id,entry.id,mark.evidenceSheet,mark.evidenceCell,mark.matchKind);f.sqlite.prepare('UPDATE words SET aichi_exam_appeared=1 WHERE id=?').run(id);
  }
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM catalog_word_exam_annotations').get()?.n).toBe(638);
 }

 if(!approved)f.sqlite.exec("UPDATE material_source_ledger SET review_status='needs_review'");
 if(correct){f.sqlite.exec(migration);f.sqlite.exec(sql);}
 return Object.assign(f,{env:{DB:f.DB}});
};
const snap=(f:ReturnType<typeof setup>)=>({
 words:f.sqlite.prepare('SELECT * FROM words ORDER BY id').all(),
 sources:f.sqlite.prepare('SELECT * FROM catalog_workbook_sources ORDER BY id').all(),
 entries:f.sqlite.prepare('SELECT * FROM catalog_source_entries ORDER BY id').all(),
 links:f.sqlite.prepare('SELECT * FROM catalog_word_source_links ORDER BY 1,2').all(),
 supplement:f.sqlite.prepare('SELECT * FROM catalog_word_definition_supplements').all(),
});
describe('strict original row correction, native SQLite',()=>{
 it('pins the actual Excel hashes and splitter-safe bounded statements',()=>{
  expect(m.originalWorkbookDefinition).toBe('');
  expect(m.previousAppDefinition).toBe(m.originalSupplement.definition);
  expect(m.definition).toBe('実際には');
  expect(m.oldSha256).toBe('78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a');
  expect(m.correctedSha256).toBe('3688952cc169cb72e3bea169dce3b02f6942c10ab5755b071ff9fbef56525205');
  expect(migration).toBe(buildNaruSourceCorrectionMigrationSql());
  for(const statement of unstable_splitSqlQuery(migration))expect(new TextEncoder().encode(statement).length).toBeLessThan(100000);
  expect(migration.split('\n').filter(line=>line.startsWith('CREATE TRIGGER')).every(line=>line.endsWith('END;'))).toBe(true);
  expect(()=>buildNaruSourceCorrectionSql({...m,definition:'別の訳'})).toThrow('reviewed');
 });
 it('changes one definition on the same ID without numbers, historical sources, links, supplement or history changes',async()=>{
  const f=setup({correct:false}),before=snap(f);
  f.sqlite.exec("INSERT INTO users(id,email,display_name,role,created_at,updated_at)VALUES('synthetic','synthetic@test.invalid','Synthetic','STUDENT',1,1)");
  f.sqlite.prepare('INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,interval_days,ease_factor,correct_count,attempt_count,total_response_time_ms,interaction_source)VALUES(?,?,?,\'review\',1,9,6,2.5,4,5,1234,\'STUDY\')').run('synthetic',m.originalWordId,m.bookId);
  const history=f.sqlite.prepare('SELECT * FROM learning_histories').all();
  for(const statement of unstable_splitSqlQuery(migration))f.sqlite.exec(statement);
  f.sqlite.exec(sql);
  expect(f.sqlite.prepare('SELECT COUNT(*) n,SUM(aichi_exam_appeared) exam,SUM(definition_supplemented) def,SUM(example_meaning_supplemented) example FROM words').get()).toEqual({n:1531,exam:638,def:0,example:1});
  const after=snap(f);
  expect(after.sources.filter(r=>r.id!==m.correctedSourceId)).toEqual(before.sources);
  expect(after.entries.filter(r=>r.id!==m.correctedSourceEntryId)).toEqual(before.entries);
  expect(after.links).toEqual(before.links);expect(after.supplement).toEqual(before.supplement);
  expect(after.words.map(({example_meaning_supplemented,...row})=>row).filter(w=>w.id!==m.originalWordId)).toEqual(before.words.filter(w=>w.id!==m.originalWordId));
  expect(f.sqlite.prepare('SELECT * FROM learning_histories').all()).toEqual(history);
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  const catalog=await readGuestLearningCatalog(f.env);
  expect(catalog.words).toHaveLength(1531);
  expect(catalog.words.find(w=>w.id===m.originalWordId)).toMatchObject({number:1361,definition:'実際には',aichiExamAppeared:true,exampleMeaningSupplemented:true,exampleMeaning:m.exampleMeaning});
  expect(catalog.words.find(w=>w.id===m.originalWordId)?.definitionSupplemented).toBeUndefined();
  f.sqlite.exec(buildNaruSourceCorrectionStageSql()+sql);
  expect(snap(f)).toEqual(after);
 });
 it('keeps all four plan projections equal and imports the corrected ID once into owner history',async()=>{
  const f=setup();f.sqlite.exec("INSERT INTO users(id,email,display_name,role,subscription_plan,created_at,updated_at) VALUES('owner','owner@test.invalid','Synthetic','STUDENT','TOC_FREE',1,1)");
  const user=f.sqlite.prepare("SELECT * FROM users WHERE id='owner'").get() as unknown as DbUserRow;
  const guest=await readGuestLearningCatalog(f.env);
  for(const plan of Object.values(SubscriptionPlan))expect(await handleGetWordsByBook(f.env,{...user,subscription_plan:plan},m.bookId)).toEqual(guest.words);
  const request={expectedUserId:user.id,sessionId:'12345678-1234-4123-8123-123456789abc',version:GUEST_LEARNING_VERSION,attempts:[{attemptId:'87654321-4321-4321-8321-cba987654321',wordId:m.originalWordId,rating:2,responseTimeMs:700,answeredAt:Date.now()}]};
  expect((await commitGuestLearningImport(f.env,user,request)).importedAttemptIds).toEqual([request.attempts[0].attemptId]);
  expect((await commitGuestLearningImport(f.env,user,request)).failedAttempts).toEqual([]);
  expect(f.sqlite.prepare('SELECT word_id,attempt_count FROM learning_histories').get()).toEqual({word_id:m.originalWordId,attempt_count:1});
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM study_attempt_receipts').get()?.n).toBe(1);
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 });
 it('retains the old supplement guest path before the new schema',async()=>{
  const f=setup({correct:false});expect((await readGuestLearningCatalog(f.env)).words).toHaveLength(1531);
 });
 it('keeps the old guest catalog through stage-only migration until explicit post-code apply',async()=>{
  const f=setup({correct:false});const before=await readGuestLearningCatalog(f.env);
  expect(before.words.find(w=>w.id===m.originalWordId)?.definition).toBe(m.previousAppDefinition);
  f.sqlite.exec(migration);
  const staged=await readGuestLearningCatalog(f.env);
  expect(staged.words).toEqual(before.words);expect(staged.book).toEqual(before.book);
  expect(f.sqlite.prepare('SELECT COUNT(*) n,SUM(aichi_exam_appeared) marks FROM words').get()).toEqual({n:1531,marks:638});
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM catalog_word_source_corrections').get()?.n).toBe(0);
  f.sqlite.exec(sql);
  const after=await readGuestLearningCatalog(f.env);
  expect(after.words).toHaveLength(1531);
  expect(after.words.filter(w=>w.aichiExamAppeared)).toHaveLength(638);
  expect(after.words.find(w=>w.id===m.originalWordId)).toMatchObject({number:1361,definition:'実際には',exampleMeaningSupplemented:true});
 });
 it('stages append-only sources without approving a pending book or editing its words',()=>{
  const f=setup({approved:false,correct:false}),before=snap(f);
  f.sqlite.exec(migration);
  f.sqlite.exec(sql);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM catalog_word_source_corrections').get()?.n).toBe(0);
  expect(snap(f).words.map(({example_meaning_supplemented,...w})=>w)).toEqual(before.words);
  expect(f.sqlite.prepare('SELECT review_status FROM material_source_ledger').get()?.review_status).toBe('needs_review');
 });
 it.each(['word','source','archive','ledger','approval','link'])('durably invalidates %s edits and refuses automatic replay/restoration',async kind=>{
  const f=setup();
  if(kind==='word')f.sqlite.prepare("UPDATE words SET definition='edited' WHERE id=?").run(m.originalWordId);
  if(kind==='source')f.sqlite.prepare("UPDATE catalog_source_entries SET ready=0 WHERE id=?").run(m.correctedSourceEntryId);
  if(kind==='archive')f.sqlite.prepare("UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE source_id=? AND row_number=82").run(m.correctedSourceId);
  if(kind==='ledger')f.sqlite.prepare("UPDATE catalog_word_source_corrections SET proof_json='{}' WHERE id=?").run(m.id);
  if(kind==='approval')f.sqlite.exec("UPDATE material_source_ledger SET review_status='needs_review'");
  if(kind==='link')f.sqlite.prepare("UPDATE catalog_word_source_links SET match_kind='verified_existing' WHERE word_id=?").run(m.originalWordId);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM catalog_word_source_correction_invalidations').get()?.n).toBe(1);
  f.sqlite.prepare('UPDATE words SET definition=?,aichi_exam_appeared=1,example_meaning_supplemented=1 WHERE id=?').run('実際には',m.originalWordId);
  f.sqlite.exec(sql);
  expect(f.sqlite.prepare('SELECT aichi_exam_appeared,example_meaning_supplemented FROM words WHERE id=?').get(m.originalWordId)).toEqual({aichi_exam_appeared:0,example_meaning_supplemented:0});
  await expect(readGuestLearningCatalog(f.env)).rejects.toMatchObject({status:503});
 });
 it('rejects missing/wrong archive staging and keeps word content intact',()=>{
  const f=setup({correct:false});const before=snap(f).words;
  const ddl=migration.slice(0,migration.indexOf('-- Append-only correction source staging.'));
  f.sqlite.exec(ddl);f.sqlite.exec(buildNaruSourceCorrectionStageSql());
  f.sqlite.prepare("UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE source_id=? AND row_number=81").run(m.correctedSourceId);
  expect(f.sqlite.prepare(buildNaruSourceCorrectionPreflightSql()).get()?.eligible).toBe(0);
  f.sqlite.exec(sql);
  expect(snap(f).words.map(({example_meaning_supplemented,...w})=>w)).toEqual(before);
 });
 it('does not silently revise immutable expected archive evidence',()=>{
  const f=setup();expect(()=>f.sqlite.exec("UPDATE catalog_source_correction_archive_evidence SET corrected_payload_json='{}'")).toThrow('immutable');
 });
 it('labels only the app example translation; never labels the source definition as dictionary supplied',()=>{
  const f=setup();const w=toWordData(f.sqlite.prepare('SELECT * FROM words WHERE id=?').get(m.originalWordId) as never);
  const html=renderToStaticMarkup(React.createElement(WordExamBadge,{word:w}));
  expect(html).toContain('例文訳のみ：アプリ補完');expect(html).not.toContain('訳・例文訳');
 });
});
