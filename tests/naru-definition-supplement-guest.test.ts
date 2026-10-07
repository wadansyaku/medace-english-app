import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteD1 } from './helpers/sqlite-d1';
import { digest } from '../scripts/_shared/original-workbook-import.mjs';
import { createNaruSupplementFixtureModel } from './helpers/naru-definition-supplement-fixture';
import { buildNaruDefinitionSupplementPreflightSql, buildNaruDefinitionSupplementSql, NARU_DEFINITION_SUPPLEMENTS } from '../scripts/_shared/naru-definition-supplements.mjs';
import { commitGuestLearningImport, readGuestLearningCatalog, readGuestLearningSummary } from '../functions/_shared/api-routes/guest-learning';
import { handleGetWordsByBook } from '../functions/_shared/storage-book-actions';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { GUEST_LEARNING_VERSION } from '../shared/guestLearning';
import { SubscriptionPlan, UserRole } from '../types';

const supplement = NARU_DEFINITION_SUPPLEMENTS.supplements[0];
const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(f => f.sqlite.close()));
const model = () => process.env.NARU_ORIGINAL_MODEL_FILE
  ? JSON.parse(fs.readFileSync(process.env.NARU_ORIGINAL_MODEL_FILE,'utf8')) : createNaruSupplementFixtureModel();
const setup = ({ through = 57, applySupplement = true } = {}) => {
  const f = createSqliteD1(); fixtures.push(f);
  for (const name of fs.readdirSync('migrations').filter(name => name.endsWith('.sql') && Number(name.slice(0,4)) <= through).sort()) f.sqlite.exec(fs.readFileSync(`migrations/${name}`,'utf8'));
  f.sqlite.exec('PRAGMA foreign_keys=ON');
  const original = model();
  for (const [table, rows] of Object.entries(original.tables) as [string,Record<string,any>[]][]) {
    if (!rows.length) continue;
    const fields = Object.keys(rows[0]);
    const insert = f.sqlite.prepare(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`);
    for (const row of rows) insert.run(...fields.map(field => row[field]));
  }
  f.sqlite.exec("UPDATE books SET word_count=1530; UPDATE material_source_ledger SET rights_status='approved',review_status='approved';");
  if (through >= 56) {
    if (process.env.NARU_ORIGINAL_MODEL_FILE) {
      // These tests exercise the API and owner-saving gates, not the separately
      // tested exam migration. Seed its reviewed metadata after checking every
      // mark against the actual original source record; avoid replaying the
      // large annotation join once per negative API case.
      const audit=JSON.parse(fs.readFileSync('data/naru-aichi-exam-annotations.json','utf8'));
      const entries=new Map(original.tables.catalog_source_entries.map(entry=>[entry.source_key,entry]));
      const sources=new Map(original.tables.catalog_workbook_sources.map(source=>[source.id,source]));
      const links=new Map(original.tables.catalog_word_source_links.map(link=>[link.source_entry_id,link.word_id]));
      const words=new Map(original.tables.words.map(word=>[word.id,word]));
      const reviewedIds:string[]=[];
      const annotation=f.sqlite.prepare("INSERT INTO catalog_word_exam_annotations VALUES(?,'AICHI_HIGH_SCHOOL_ENTRANCE',?,?,?,'FFFF00',?)");
      const flag=f.sqlite.prepare('UPDATE words SET aichi_exam_appeared=1 WHERE id=?');
      for (const mark of audit.marks) {
        const entry=entries.get(mark.sourceKey) as Record<string,any>;
        const source=sources.get(entry?.source_id) as Record<string,any>;
        const payload=entry && JSON.parse(entry.payload_json);
        if (source?.sha256!==mark.sourceSha256 || source?.source_file!==mark.sourceFile || !entry.ready || payload.word!==mark.word || payload.definition!==mark.definition || payload.partOfSpeech!==mark.partOfSpeech) throw new Error('Original annotation fixture differs from reviewed source');
        const wordId=links.get(entry.id) as string;
        const word=words.get(wordId) as Record<string,any>;
        const expectedId=`${payload.sourceSnapshotBookId}-${digest(mark.sourceKey).slice(0,20)}`;
        if (wordId!==expectedId || word?.word!==mark.word || word?.definition!==mark.definition || word?.part_of_speech!==mark.partOfSpeech || payload.sourceRow!==mark.sourceRow || payload.sourceColumn!==mark.sourceColumn || word?.source_sheet!==mark.sourceSheet || word?.source_entry_id!==payload.sourceEntryId) throw new Error('Original annotation word ID or source locator differs');
        reviewedIds.push(wordId);
        annotation.run(wordId,entry.id,mark.evidenceSheet,mark.evidenceCell,mark.matchKind); flag.run(wordId);
      }
      const markedIds=f.sqlite.prepare('SELECT id FROM words WHERE aichi_exam_appeared=1 ORDER BY id').all().map(row=>row.id);
      if (reviewedIds.length!==637 || new Set(reviewedIds).size!==637 || JSON.stringify(markedIds)!==JSON.stringify(reviewedIds.sort())) throw new Error('Annotation fixture flags differ from the exact 637 reviewed IDs');
    }
    else f.sqlite.exec("UPDATE words SET aichi_exam_appeared=1 WHERE word_number<=637; INSERT INTO catalog_word_exam_annotations SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',l.source_entry_id,'fixture','A1','FFFF00','word_cell' FROM words w JOIN catalog_word_source_links l ON l.word_id=w.id WHERE w.aichi_exam_appeared=1;");
  }
  if (through >= 57 && applySupplement) f.sqlite.exec(buildNaruDefinitionSupplementSql());
  return { ...f,env:{ DB:f.DB } as AppEnv };
};
const sourceSnapshot = (f:ReturnType<typeof setup>) => Object.fromEntries(['catalog_workbook_sources','catalog_workbook_sheet_rows','catalog_source_entries'].map(table => [table, f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));
const queriesSeen = (f:ReturnType<typeof setup>) => {
  const seen:string[] = []; const prepare = f.DB.prepare.bind(f.DB);
  f.DB.prepare = sql => { seen.push(sql); return prepare(sql); }; return seen;
};
const seedUser = (f:ReturnType<typeof setup>,id='synthetic-supplement-owner'):DbUserRow => {
  f.sqlite.prepare("INSERT INTO users(id,email,display_name,role,subscription_plan,created_at,updated_at) VALUES(?,?,?,'STUDENT',?,1,1)").run(id,`${id}@example.test`,'Synthetic',SubscriptionPlan.TOC_FREE);
  return f.sqlite.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as DbUserRow;
};
const attemptRequest = (user:DbUserRow) => ({ expectedUserId:user.id,sessionId:'12345678-1234-4123-8123-123456789abc',version:GUEST_LEARNING_VERSION,
  attempts:[{ attemptId:'87654321-4321-4321-8321-cba987654321',wordId:supplement.wordId,rating:2,responseTimeMs:700,answeredAt:Date.now() }] });

describe('canonical supplemented Naru guest publication and ownership', () => {
  it('keeps the original 1530-word path on schema 56 without querying the future supplement table', async () => {
    const f=setup({ through:56 }); const seen=queriesSeen(f); const catalog=await readGuestLearningCatalog(f.env);
    expect(catalog.words).toHaveLength(1530); expect(catalog.words.some(word=>word.definitionSupplemented)).toBe(false);
    expect(seen.some(sql=>sql.includes('catalog_word_definition_supplements'))).toBe(false);
  });
  it('preflights approved schema 55 without either new column or the supplement table', () => {
    const f=setup({ through:55 }); const sql=buildNaruDefinitionSupplementPreflightSql({ hasDefinitionSupplementColumn:false });
    expect(sql).not.toContain('definition_supplemented'); expect(sql).not.toContain('aichi_exam_appeared'); expect(sql).not.toContain('catalog_word_definition_supplements');
    expect(f.sqlite.prepare('PRAGMA table_info(words)').all().some(column=>column.name==='aichi_exam_appeared')).toBe(false);
    const changes=Number(f.sqlite.prepare('SELECT total_changes() AS n').get()?.n);
    expect(f.sqlite.prepare(sql).get()).toEqual({ eligible:1,currentWordCount:1530,currentHeldSourceCount:1,currentSupplementWordCount:0 });
    expect(Number(f.sqlite.prepare('SELECT total_changes() AS n').get()?.n)).toBe(changes);
    f.sqlite.exec("UPDATE material_source_ledger SET review_status='needs_review'"); expect(f.sqlite.prepare(sql).get()?.eligible).toBe(0);
  });
  it('publishes 1531/638/87, matches all four plans and keeps the held original intact', async () => {
    const f=setup({ applySupplement:false }); const original=sourceSnapshot(f); f.sqlite.exec(buildNaruDefinitionSupplementSql());
    const guest=await readGuestLearningCatalog(f.env);
    expect(guest.book.wordCount).toBe(1531); expect(guest.words).toHaveLength(1531); expect(guest.words.filter(word=>word.aichiExamAppeared)).toHaveLength(638);
    expect(guest.words.filter(word=>word.partOfSpeech==='adverb')).toHaveLength(87); expect(guest.words.filter(word=>word.definitionSupplemented)).toHaveLength(1);
    expect(guest.words.find(word=>word.id===supplement.wordId)).toMatchObject({ number:1361,definition:supplement.definition,exampleSentence:supplement.exampleSentence,exampleMeaning:supplement.exampleMeaning,definitionSupplemented:true,aichiExamAppeared:true });
    expect(sourceSnapshot(f)).toEqual(original);
    const user=seedUser(f);
    for (const plan of Object.values(SubscriptionPlan)) expect(await handleGetWordsByBook(f.env,{ ...user,subscription_plan:plan },supplement.bookId)).toEqual(guest.words);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    if (process.env.NARU_GUEST_PROOF_FILE) fs.writeFileSync(process.env.NARU_GUEST_PROOF_FILE,JSON.stringify({ source:process.env.NARU_ORIGINAL_MODEL_FILE?'original workbook model':'synthetic CI model',annotationFixture:'637 reviewed original source marks seeded by prepared statements after exact sourceKey/SHA/meaning/POS/coordinate/stable-word-ID checks; other words remain unmarked',wordCount:guest.words.length,examCount:guest.words.filter(w=>w.aichiExamAppeared).length,adverbCount:guest.words.filter(w=>w.partOfSpeech==='adverb').length,supplementCount:guest.words.filter(w=>w.definitionSupplemented).length,allFourPlansEqual:true,originalSourcesUnchanged:true,actually:guest.words.find(w=>w.id===supplement.wordId),foreignKeyErrors:[] },null,2));
  });
  it.each([
    ['word',`UPDATE words SET word='changed' WHERE id='${supplement.wordId}'`],
    ['definition',`UPDATE words SET definition='改竄訳' WHERE id='${supplement.wordId}'`],
    ['English example',`UPDATE words SET example_sentence='Changed example.' WHERE id='${supplement.wordId}'`],
    ['example meaning',`UPDATE words SET example_meaning='改竄例文訳' WHERE id='${supplement.wordId}'`],
    ['source locator',`UPDATE words SET source_sheet='other' WHERE id='${supplement.wordId}'`],
    ['supplement flag',`UPDATE words SET definition_supplemented=0 WHERE id='${supplement.wordId}'`],
    ['ledger definition',"UPDATE catalog_word_definition_supplements SET definition='改竄訳'"],
    ['ledger reference',"UPDATE catalog_word_definition_supplements SET references_json='[]'"],
    ['ledger approval',"UPDATE catalog_word_definition_supplements SET approval_json='{}'"],
    ['ledger evidence',"UPDATE catalog_word_definition_supplements SET evidence_json='{}'"],
    ['ledger source key',"UPDATE catalog_word_definition_supplements SET source_key='other'"],
    ['original SHA',"UPDATE catalog_workbook_sources SET sha256='changed' WHERE series_key='adverb'"],
    ['original hash',`UPDATE catalog_source_entries SET content_hash='changed' WHERE id='${supplement.sourceEntryId}'`],
    ['original payload',`UPDATE catalog_source_entries SET payload_json=json_set(payload_json,'$.sourceColumn',1) WHERE id='${supplement.sourceEntryId}'`],
    ['G82 filled',"UPDATE catalog_workbook_sheet_rows SET payload_json=json_set(payload_json,'$.values[6]','既存訳') WHERE row_number=82"],
    ['F82 correction color',"UPDATE catalog_workbook_sheet_rows SET payload_json=REPLACE(payload_json,'FFFF00','FFF2CC') WHERE row_number=82"],
    ['H82 replaced',"UPDATE catalog_workbook_sheet_rows SET payload_json=REPLACE(payload_json,'tomatoes','onions') WHERE row_number=82"],
    ['ready=1 bypass attempt',`UPDATE catalog_source_entries SET ready=1 WHERE id='${supplement.sourceEntryId}'`],
    ['replaced link',`UPDATE catalog_word_source_links SET match_kind='verified_existing' WHERE source_entry_id='${supplement.sourceEntryId}'`],
    ['additional link',`INSERT INTO catalog_word_source_links SELECT source_entry_id,'${supplement.wordId}',match_kind FROM catalog_word_source_links WHERE word_id=(SELECT id FROM words WHERE word_number=1);`],
    ['review hold',"UPDATE material_source_ledger SET review_status='needs_review'"],
    ['rights hold',"UPDATE material_source_ledger SET rights_status='pending'"],
    ['scope hold',"UPDATE books SET access_scope='BUSINESS_ONLY'"],
    ['other ordinary blocked source',"UPDATE catalog_source_entries SET ready=0 WHERE id=(SELECT source_entry_id FROM catalog_word_source_links WHERE word_id=(SELECT id FROM words WHERE word_number=1))"],
  ])('refuses %s, even if the supplement flag is forcibly revived', async (_label,mutation) => {
    const f=setup();
    if (_label==='additional link') {
      // An entry may have only one source link. Use a new synthetic held entry
      // to prove that a second link cannot inherit the supplement exception.
      f.sqlite.prepare("INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready) VALUES('extra-held',?,'extra-held','synthetic','{}',0)").run(supplement.sourceId);
      f.sqlite.prepare("INSERT INTO catalog_word_source_links VALUES('extra-held',?,'snapshot_import')").run(supplement.wordId);
    } else f.sqlite.exec(mutation);
    if (_label!=='supplement flag') f.sqlite.prepare('UPDATE words SET definition_supplemented=1 WHERE id=?').run(supplement.wordId);
    await expect(readGuestLearningCatalog(f.env)).rejects.toMatchObject({ status:503 });
  });
  it('imports a supplemented guest attempt once into the owner history and receipt', async () => {
    const f=setup(); const user=seedUser(f); const request=attemptRequest(user);
    const imported=await commitGuestLearningImport(f.env,user,request);
    expect(imported.importedAttemptIds).toEqual([request.attempts[0].attemptId]); expect(imported.failedAttempts).toEqual([]);
    expect(f.sqlite.prepare('SELECT user_id,word_id,attempt_count FROM learning_histories').get()).toEqual({ user_id:user.id,word_id:supplement.wordId,attempt_count:1 });
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM study_attempt_receipts').get()?.n).toBe(1);
    expect((await readGuestLearningSummary(f.env,user,request.sessionId))?.importedAttemptIds).toEqual(imported.importedAttemptIds);
    expect((await commitGuestLearningImport(f.env,user,request)).failedAttempts).toEqual([]);
    expect(f.sqlite.prepare('SELECT attempt_count FROM learning_histories').get()?.attempt_count).toBe(1);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    if (process.env.NARU_GUEST_PROOF_FILE) {
      const proof=JSON.parse(fs.readFileSync(process.env.NARU_GUEST_PROOF_FILE,'utf8'));
      proof.ownerImport={ supplementedWordSaved:true,historyAttemptCount:1,receiptCount:1,replayDoesNotDuplicate:true,foreignKeyErrors:[] };
      fs.writeFileSync(process.env.NARU_GUEST_PROOF_FILE,JSON.stringify(proof,null,2));
    }
  });
  it('refuses another owner and an unapproved source before saving a guest attempt', async () => {
    const f=setup(); const user=seedUser(f); const other=seedUser(f,'synthetic-other-owner'); const request=attemptRequest(user);
    await expect(commitGuestLearningImport(f.env,other,request)).rejects.toMatchObject({ status:409 });
    f.sqlite.exec("UPDATE material_source_ledger SET review_status='needs_review'");
    await expect(commitGuestLearningImport(f.env,user,request)).rejects.toMatchObject({ status:503 });
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM guest_learning_claims').get()?.n).toBe(0); expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_histories').get()?.n).toBe(0);
  });
});
