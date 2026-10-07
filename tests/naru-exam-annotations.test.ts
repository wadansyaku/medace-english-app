import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { auditNaruExamAnnotations, buildNaruExamAnnotationSql } from '../scripts/_shared/naru-exam-annotations.mjs';
import { handleGetWordsByBook } from '../functions/_shared/storage-book-actions';
import { readGuestLearningCatalog } from '../functions/_shared/api-routes/guest-learning';
import { SubscriptionPlan, UserRole } from '../types';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';
const audit = JSON.parse(fs.readFileSync('data/naru-aichi-exam-annotations.json','utf8'));
const migration = fs.readFileSync('migrations/0056_naru_aichi_exam_annotations.sql','utf8');
const annotationSql = buildNaruExamAnnotationSql(audit);
const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(f=>f.sqlite.close()));
const setup = () => {
 const f=createSqliteD1();fixtures.push(f);
 for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')&&n<'0056').sort()) f.sqlite.exec(fs.readFileSync(`migrations/${name}`,'utf8'));
 const marks=[audit.marks[0],audit.marks.find(m=>m.word==='history'&&m.matchKind==='unique_index')];
 f.sqlite.exec(`INSERT INTO books(id,title,word_count,catalog_source,access_scope,created_at,updated_at) VALUES('naru-shisto-original-v1','Naruシスト',3,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1);
 INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,source_file,extracted_at,transform_log,content_qa_report,qa_word_count,qa_source_coverage_rate,created_at,updated_at) VALUES('ledger','naru-shisto-original-v1','STEADY_STUDY_ORIGINAL','Naruシスト','v1','approved','approved','source','date','log','local',3,1,1,1);`);
 const seeds=[...marks.map((m,i)=>({...m,id:`word${i}`,evidenceRgb:'FFFF00'})),{...marks[0],id:'homograph',sourceKey:'verb:文法分類:R999C1',word:marks[0].word,definition:'別の語義',sourceRow:999,evidenceRow:999,evidenceCell:'A999',evidenceRgb:'FFF2CC'}];
 for(const m of seeds){
  const source=m.partOfSpeech;
  f.sqlite.prepare(`INSERT OR IGNORE INTO catalog_workbook_sources(id,series_key,source_file,sha256,archive_json,created_at) VALUES(?,?,?,?,?,1)`).run(source,source,m.sourceFile,m.sourceSha256,'[]');
  const payload={word:m.word,definition:m.definition,partOfSpeech:m.partOfSpeech,sourceSheet:m.sourceSheet,sourceRow:m.sourceRow,sourceColumn:m.sourceColumn,sourceEntryId:null};
  f.sqlite.prepare(`INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready) VALUES(?,?,?,'synthetic',?,1)`).run(`entry-${m.id}`,source,m.sourceKey,JSON.stringify(payload));
  const cell={address:m.evidenceCell,value:m.word,style:{patternType:'solid',fgColor:{rgb:m.evidenceRgb}}};
  f.sqlite.prepare(`INSERT INTO catalog_workbook_sheet_rows VALUES(?,?,?,?)`).run(source,m.evidenceSheet,m.evidenceRow,JSON.stringify({cells:[cell]}));
  f.sqlite.prepare(`INSERT INTO words(id,book_id,word_number,word,definition,search_key,part_of_speech,source_sheet,created_at,updated_at) VALUES(?,'naru-shisto-original-v1',?,?,?,?,?,?,1,1)`).run(m.id,seeds.indexOf(m)+1,m.word,m.definition,m.word.toLowerCase(),m.partOfSpeech,m.sourceSheet);
  f.sqlite.prepare(`INSERT INTO catalog_word_source_links VALUES(?,?,'snapshot_import')`).run(`entry-${m.id}`,m.id);
 }
 return {...f,env:{DB:f.DB} as AppEnv,marks};
};
const flags=(f:ReturnType<typeof setup>)=>f.sqlite.prepare('SELECT id,aichi_exam_appeared FROM words ORDER BY word_number').all();
describe('Naru exam metadata native migration and API',()=>{
 it('pins original hashes, excludes correction colors and holds the missing meaning',()=>{
  expect(audit.marks).toHaveLength(637);expect(audit.marks.filter(m=>m.matchKind==='word_cell')).toHaveLength(634);
  expect(audit.marks.filter(m=>m.matchKind==='unique_index').map(m=>m.word)).toEqual(['history','snow','along']);
  expect(audit.held).toHaveLength(1);expect(audit.held[0]).toMatchObject({word:'actually',sourceKey:'adverb:副詞一覧:R82C6'});
  expect(audit.marks.every(m=>m.fillRgb==='FFFF00')).toBe(true);
  expect(migration.endsWith(annotationSql)).toBe(true);
  expect(()=>auditNaruExamAnnotations([{spec:{key:'verb'},sha256:'changed'}])).toThrow('SHA changed');
 });
 it('upgrades an existing original, keeps every preexisting word field and does not tag a different meaning',()=>{
  const f=setup();const before=f.sqlite.prepare('SELECT * FROM words').all();f.sqlite.exec(migration);
  const after=f.sqlite.prepare('SELECT * FROM words').all().map(({aichi_exam_appeared,...row})=>row);expect(after).toEqual(before);
  expect(flags(f)).toEqual([{id:'word0',aichi_exam_appeared:1},{id:'word1',aichi_exam_appeared:1},{id:'homograph',aichi_exam_appeared:0}]);
  f.sqlite.exec(annotationSql);expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM catalog_word_exam_annotations').get()?.n).toBe(2);
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 });
 it.each(['FFF2CC','FFFF00-tinted'])('refuses replacement color %s and source hash mismatch',color=>{
  const f=setup();f.sqlite.prepare(`UPDATE catalog_workbook_sheet_rows SET payload_json=? WHERE source_id='verb'`).run(JSON.stringify({cells:[{address:'A4',value:f.marks[0].word,style:{patternType:'solid',fgColor:{rgb:color==='FFF2CC'?'FFF2CC':'FFFF00',...(color==='FFF2CC'?{}:{tint:0.4})}}}]}));
  f.sqlite.exec(migration);expect(flags(f)[0].aichi_exam_appeared).toBe(0);
  f.sqlite.exec(`DELETE FROM catalog_word_exam_annotations;UPDATE words SET aichi_exam_appeared=0;UPDATE catalog_workbook_sources SET sha256='changed'`);
  f.sqlite.exec(annotationSql);expect(flags(f).every(row=>row.aichi_exam_appeared===0)).toBe(true);
 });
 it.each(["definition='書換後の語義'",'source_entry_id=999',"source_sheet='書換後のシート'"] )('invalidates edited content or locator %s and refuses stale replay',change=>{
  const f=setup();f.sqlite.exec(migration);f.sqlite.exec(`UPDATE words SET ${change} WHERE id='word0'`);
  expect(flags(f)[0].aichi_exam_appeared).toBe(0);f.sqlite.exec(annotationSql);expect(flags(f)[0].aichi_exam_appeared).toBe(0);
 });
 it('gives guests and all four plans identical metadata and preserves publication gates',async()=>{
  const f=setup();f.sqlite.exec(migration);const guest=await readGuestLearningCatalog(f.env);
  expect(guest.words.map(w=>w.aichiExamAppeared===true)).toEqual([true,true,false]);
  for(const plan of Object.values(SubscriptionPlan)){
   const user={id:'synthetic',role:UserRole.STUDENT,subscription_plan:plan} as DbUserRow;
   expect(await handleGetWordsByBook(f.env,user,'naru-shisto-original-v1')).toEqual(guest.words);
  }
  f.sqlite.exec(`UPDATE material_source_ledger SET review_status='needs_review'`);
  await expect(readGuestLearningCatalog(f.env)).rejects.toMatchObject({status:503});
  await expect(handleGetWordsByBook(f.env,{id:'synthetic',role:UserRole.STUDENT} as DbUserRow,'naru-shisto-original-v1')).rejects.toMatchObject({status:403});
 });
});
