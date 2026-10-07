import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteD1 } from './helpers/sqlite-d1';
import { createNaruSupplementFixtureModel } from './helpers/naru-definition-supplement-fixture';
import { buildNaruStageSql } from '../scripts/_shared/naru-workbook-import.mjs';
import { buildNaruDefinitionSupplementSql, NARU_DEFINITION_SUPPLEMENTS } from '../scripts/_shared/naru-definition-supplements.mjs';
import { storageRoutes } from '../functions/_shared/api-routes/storage';
import type { AppEnv } from '../functions/_shared/types';
import type { WordData } from '../types';

const migration = fs.readFileSync('migrations/0058_naru_exam_source_invalidation.sql', 'utf8');
const originalAnnotationMigration = fs.readFileSync('migrations/0056_naru_aichi_exam_annotations.sql', 'utf8');
// Exercise the immutable deployed SQL, including its historical final flag UPDATE.
const legacyAnnotationSql = originalAnnotationMigration.slice(originalAnnotationMigration.indexOf('WITH marks('));
const audit = JSON.parse(fs.readFileSync('data/naru-aichi-exam-annotations.json', 'utf8'));
const supplement = NARU_DEFINITION_SUPPLEMENTS.supplements[0];
const bookId = 'naru-shisto-original-v1';
const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(f => f.sqlite.close()));
const database = () => {
  const f = createSqliteD1(); fixtures.push(f);
  for (const name of fs.readdirSync('migrations').filter(n => n.endsWith('.sql') && Number(n.slice(0, 4)) <= 57).sort()) {
    f.sqlite.exec(fs.readFileSync(`migrations/${name}`, 'utf8'));
  }
  return { ...f, env: { DB: f.DB } as AppEnv };
};
const seedOwner = (f: ReturnType<typeof database>) => {
  f.sqlite.exec("INSERT INTO users(id,email,display_name,role,subscription_plan,created_at,updated_at) VALUES('owner','owner@example.test','Synthetic','STUDENT','TOC_FREE',1,1)");
  f.sqlite.prepare("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES('synthetic-source-session','owner',?,1)").run(Date.now() + 60_000);
};
const authenticatedWords = async (f: ReturnType<typeof database>) => {
  const request = new Request('https://app.example.test/api/storage', { method: 'POST', headers: {
    Origin: 'https://app.example.test', 'Content-Type': 'application/json', Cookie: 'medace_session=synthetic-source-session',
  }, body: JSON.stringify({ action: 'getWordsByBook', payload: { bookId } }) });
  const { response } = await storageRoutes[0].handle({ env: f.env, request, pathname: 'storage' });
  expect(response.status).toBe(200);
  return await response.json() as WordData[];
};
const flags = (f: ReturnType<typeof database>) => f.sqlite.prepare('SELECT id,aichi_exam_appeared FROM words ORDER BY word_number').all();
const invalidations = (f: ReturnType<typeof database>) => f.sqlite.prepare('SELECT word_id,kind FROM catalog_word_exam_annotation_invalidations ORDER BY word_id').all();
const smallFixture = (apply = true) => {
  const f = database();
  f.sqlite.exec(`INSERT INTO books(id,title,word_count,catalog_source,access_scope,created_at,updated_at) VALUES('${bookId}','Naruシスト',4,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1);
    INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,source_file,extracted_at,transform_log,content_qa_report,qa_word_count,qa_source_coverage_rate,created_at,updated_at) VALUES('ledger','${bookId}','STEADY_STUDY_ORIGINAL','Naruシスト','v1','approved','approved','source','date','log','synthetic',4,1,1,1);`);
  const marks = [audit.marks[0], audit.marks.find(m => m.word === 'history' && m.matchKind === 'unique_index'), audit.marks.find(m => m.word === 'snow' && m.matchKind === 'unique_index')];
  const seeds = [...marks.map((m, i) => ({ ...m, id: `word${i}`, rgb: 'FFFF00' })), {
    ...marks[0], id: 'unrelated', word: marks[0].word, definition: '別の語義', sourceKey: 'verb:synthetic:R999C1',
    sourceRow: 999, evidenceRow: 999, evidenceCell: 'A999', rgb: 'FFF2CC',
  }];
  for (const [i, m] of seeds.entries()) {
    f.sqlite.prepare('INSERT OR IGNORE INTO catalog_workbook_sources(id,series_key,source_file,sha256,archive_json,created_at) VALUES(?,?,?,?,?,1)').run(m.partOfSpeech, m.partOfSpeech, m.sourceFile, m.sourceSha256, '[]');
    const payload = { word: m.word, definition: m.definition, partOfSpeech: m.partOfSpeech, sourceSheet: m.sourceSheet, sourceRow: m.sourceRow, sourceColumn: m.sourceColumn, sourceEntryId: null };
    f.sqlite.prepare("INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready) VALUES(?,?,?,'synthetic',?,1)").run(`entry-${m.id}`, m.partOfSpeech, m.sourceKey, JSON.stringify(payload));
    const row = { cells: [{ address: m.evidenceCell, value: m.word, style: { patternType: 'solid', fgColor: { rgb: m.rgb } } }] };
    f.sqlite.prepare('INSERT INTO catalog_workbook_sheet_rows VALUES(?,?,?,?)').run(m.partOfSpeech, m.evidenceSheet, m.evidenceRow, JSON.stringify(row));
    f.sqlite.prepare(`INSERT INTO words(id,book_id,word_number,word,definition,search_key,part_of_speech,source_sheet,created_at,updated_at) VALUES(?,'${bookId}',?,?,?,?,?,?,1,1)`).run(m.id, i + 1, m.word, m.definition, m.word.toLowerCase(), m.partOfSpeech, m.sourceSheet);
    f.sqlite.prepare("INSERT INTO catalog_word_source_links VALUES(?,?,'snapshot_import')").run(`entry-${m.id}`, m.id);
  }
  seedOwner(f);
  f.sqlite.exec(`INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date) VALUES('owner','word0','${bookId}','LEARNING',1,2)`);
  f.sqlite.exec(legacyAnnotationSql);
  if (apply) f.sqlite.exec(migration);
  return f;
};
const protectedSnapshot = (f: ReturnType<typeof database>, tables = ['books', 'material_source_ledger', 'learning_histories']) => JSON.stringify(Object.fromEntries(tables.map(table => [table, f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()])));
const expectOnlyInvalidated = (f: ReturnType<typeof database>, ids: string[]) => {
  expect(invalidations(f).map(row => row.word_id)).toEqual([...ids].sort());
  for (const row of flags(f)) expect(row.aichi_exam_appeared).toBe(ids.includes(String(row.id)) || row.id === 'unrelated' ? 0 : 1);
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
};

describe('Naru exam source evidence invalidation, isolated SQLite and authenticated API', () => {
  it('reproduces the deployed stale SHA flag, then prevents the same authenticated API result with 0058', async () => {
    const f = smallFixture(false);
    const original = f.sqlite.prepare("SELECT sha256 FROM catalog_workbook_sources WHERE id='verb'").get()?.sha256;
    f.sqlite.exec("UPDATE catalog_workbook_sources SET sha256='changed' WHERE id='verb'");
    f.sqlite.exec(legacyAnnotationSql);
    expect((await authenticatedWords(f)).find(w => w.id === 'word0')?.aichiExamAppeared).toBe(true);
    f.sqlite.prepare("UPDATE catalog_workbook_sources SET sha256=? WHERE id='verb'").run(original);
    f.sqlite.exec(migration);
    const before = protectedSnapshot(f);
    f.sqlite.exec("UPDATE catalog_workbook_sources SET sha256='changed' WHERE id='verb'");
    f.sqlite.exec(legacyAnnotationSql);
    expectOnlyInvalidated(f, ['word0']);
    expect((await authenticatedWords(f)).find(w => w.id === 'word0')?.aichiExamAppeared).toBeUndefined();
    expect((await authenticatedWords(f)).find(w => w.id === 'word1')?.aichiExamAppeared).toBe(true);
    expect(protectedSnapshot(f)).toBe(before);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM catalog_word_exam_annotations').get()?.n).toBe(3);
  });

  it.each([
    ['entry payload', "UPDATE catalog_source_entries SET payload_json=json_set(payload_json,'$.definition','changed') WHERE id='entry-word0'"],
    ['entry hash', "UPDATE catalog_source_entries SET content_hash='changed' WHERE id='entry-word0'"],
    ['entry readiness', "UPDATE catalog_source_entries SET ready=0 WHERE id='entry-word0'"],
    ['entry source key', "UPDATE catalog_source_entries SET source_key='changed' WHERE id='entry-word0'"],
    ['entry workbook move', "UPDATE catalog_source_entries SET source_id='noun' WHERE id='entry-word0'"],
    ['workbook SHA', "UPDATE catalog_workbook_sources SET sha256='changed' WHERE id='verb'"],
    ['workbook archive', "UPDATE catalog_workbook_sources SET archive_json='[{}]' WHERE id='verb'"],
    ['workbook filename', "UPDATE catalog_workbook_sources SET source_file='changed.xlsx' WHERE id='verb'"],
    ['workbook series', "UPDATE catalog_workbook_sources SET series_key='changed' WHERE id='verb'"],
    ['evidence color', "UPDATE catalog_workbook_sheet_rows SET payload_json=REPLACE(payload_json,'FFFF00','FFF2CC') WHERE source_id='verb' AND row_number=4"],
    ['evidence cell value', "UPDATE catalog_workbook_sheet_rows SET payload_json=REPLACE(payload_json,'keep','other') WHERE source_id='verb' AND row_number=4"],
    ['evidence row move', "UPDATE catalog_workbook_sheet_rows SET row_number=5 WHERE source_id='verb' AND row_number=4"],
    ['evidence sheet move', "UPDATE catalog_workbook_sheet_rows SET sheet_name='other' WHERE source_id='verb' AND row_number=4"],
    ['evidence workbook move', "UPDATE catalog_workbook_sheet_rows SET source_id='noun' WHERE source_id='verb' AND row_number=4"],
    ['evidence row delete', "DELETE FROM catalog_workbook_sheet_rows WHERE source_id='verb' AND row_number=4"],
    ['source link kind', "UPDATE catalog_word_source_links SET match_kind='verified_existing' WHERE source_entry_id='entry-word0'"],
    ['source link delete', "DELETE FROM catalog_word_source_links WHERE source_entry_id='entry-word0'"],
    ['source link word move', "UPDATE catalog_word_source_links SET word_id='unrelated' WHERE source_entry_id='entry-word0'"],
    ['annotation cell', "UPDATE catalog_word_exam_annotations SET evidence_cell='A5' WHERE word_id='word0'"],
    ['annotation sheet', "UPDATE catalog_word_exam_annotations SET evidence_sheet='other' WHERE word_id='word0'"],
    ['annotation source', "UPDATE catalog_word_exam_annotations SET source_entry_id='entry-unrelated' WHERE word_id='word0'"],
    ['annotation match', "UPDATE catalog_word_exam_annotations SET match_kind='unique_index' WHERE word_id='word0'"],
    ['annotation deletion', "DELETE FROM catalog_word_exam_annotations WHERE word_id='word0'"],
  ])('invalidates %s without touching unrelated annotations, approval, words or history', async (_label, sql) => {
    const f = smallFixture();
    const before = protectedSnapshot(f);
    const words = JSON.stringify(f.sqlite.prepare('SELECT * FROM words ORDER BY id').all().map(({ aichi_exam_appeared, ...word }) => word));
    f.sqlite.exec(sql);
    expectOnlyInvalidated(f, ['word0']);
    f.sqlite.exec(legacyAnnotationSql);
    expectOnlyInvalidated(f, ['word0']);
    expect((await authenticatedWords(f)).find(w => w.id === 'word0')?.aichiExamAppeared).toBeUndefined();
    expect(protectedSnapshot(f)).toBe(before);
    expect(JSON.stringify(f.sqlite.prepare('SELECT * FROM words ORDER BY id').all().map(({ aichi_exam_appeared, ...word }) => word))).toBe(words);
  });

  it('keeps invalidation after evidence is restored and after annotation deletion/recreation', () => {
    const f = smallFixture();
    const original = f.sqlite.prepare("SELECT payload_json FROM catalog_workbook_sheet_rows WHERE source_id='verb' AND row_number=4").get()?.payload_json;
    f.sqlite.exec("UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE source_id='verb' AND row_number=4");
    f.sqlite.prepare("UPDATE catalog_workbook_sheet_rows SET payload_json=? WHERE source_id='verb' AND row_number=4").run(original);
    f.sqlite.exec("DELETE FROM catalog_word_exam_annotations WHERE word_id='word0'");
    f.sqlite.exec(legacyAnnotationSql);
    f.sqlite.exec("UPDATE words SET aichi_exam_appeared=1 WHERE id='word0'");
    expectOnlyInvalidated(f, ['word0']);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM catalog_word_exam_annotations WHERE word_id='word0'").get()?.n).toBe(1);
  });

  it('tracks the unique-index evidence row rather than the different source payload row', () => {
    const f = smallFixture();
    f.sqlite.exec("UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE source_id='noun' AND sheet_name='名詞一覧' AND row_number=425");
    expectOnlyInvalidated(f, ['word1']);
    f.sqlite.exec(legacyAnnotationSql);
    expectOnlyInvalidated(f, ['word1']);
  });

  it.each(['insert', 'update', 'delete'])('invalidates only the matching unique-index proof on duplicate-word entry %s', operation => {
    const f = smallFixture(false);
    f.sqlite.prepare("INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready) VALUES('extra','noun','extra','synthetic',?,0)").run(JSON.stringify({ word: operation === 'delete' ? 'history' : 'unrelated' }));
    f.sqlite.exec(migration);
    if (operation === 'insert') f.sqlite.prepare("INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready) VALUES('duplicate','noun','duplicate','synthetic',?,0)").run(JSON.stringify({ word: 'history' }));
    if (operation === 'update') f.sqlite.exec("UPDATE catalog_source_entries SET payload_json=json_set(payload_json,'$.word','history') WHERE id='extra'");
    if (operation === 'delete') f.sqlite.exec("DELETE FROM catalog_source_entries WHERE id='extra'");
    expectOnlyInvalidated(f, ['word1']);
    f.sqlite.exec(legacyAnnotationSql);
    expectOnlyInvalidated(f, ['word1']);
  });

  it('invalidates a replaced or additional source link, including its previous annotation', () => {
    const f = smallFixture();
    f.sqlite.exec("INSERT INTO catalog_source_entries VALUES('extra','verb','extra','synthetic','{}',0)");
    f.sqlite.exec("UPDATE catalog_word_source_links SET source_entry_id='extra' WHERE source_entry_id='entry-word0'");
    expectOnlyInvalidated(f, ['word0']);
    f.sqlite.exec("INSERT INTO catalog_word_source_links VALUES('entry-word0','word1','snapshot_import')");
    expectOnlyInvalidated(f, ['word0', 'word1']);
  });

  it('preserves no-op source updates and unrelated source/row edits', () => {
    const f = smallFixture();
    f.sqlite.exec(`UPDATE catalog_source_entries SET payload_json=payload_json,ready=ready,content_hash=content_hash;
      UPDATE catalog_workbook_sources SET series_key=series_key,source_file=source_file,sha256=sha256,archive_json=archive_json;
      UPDATE catalog_workbook_sheet_rows SET source_id=source_id,sheet_name=sheet_name,row_number=row_number,payload_json=payload_json;
      UPDATE catalog_word_source_links SET source_entry_id=source_entry_id,word_id=word_id,match_kind=match_kind;
      UPDATE catalog_word_exam_annotations SET evidence_cell=evidence_cell;
      UPDATE catalog_source_entries SET content_hash='unrelated edit' WHERE id='entry-unrelated';
      UPDATE catalog_workbook_sheet_rows SET payload_json='{}' WHERE source_id='verb' AND row_number=999;`);
    expectOnlyInvalidated(f, []);
  });

  it.each([
    ['entry', "INSERT OR REPLACE INTO catalog_source_entries SELECT id,source_id,source_key,'replacement hash',payload_json,ready FROM catalog_source_entries WHERE id='entry-word0'"],
    ['workbook', "INSERT OR REPLACE INTO catalog_workbook_sources SELECT id,series_key,source_file,'replacement SHA',archive_json,created_at FROM catalog_workbook_sources WHERE id='verb'"],
    ['evidence row', "INSERT OR REPLACE INTO catalog_workbook_sheet_rows SELECT source_id,sheet_name,row_number,'{}' FROM catalog_workbook_sheet_rows WHERE source_id='verb' AND row_number=4"],
    ['annotation locator', "INSERT OR REPLACE INTO catalog_word_exam_annotations SELECT word_id,kind,source_entry_id,evidence_sheet,'A5',fill_rgb,match_kind FROM catalog_word_exam_annotations WHERE word_id='word0'"],
  ])('invalidates a changed %s INSERT OR REPLACE with recursive delete triggers disabled', (_label, sql) => {
    const f = smallFixture();
    expect(f.sqlite.prepare('PRAGMA recursive_triggers').get()?.recursive_triggers).toBe(0);
    f.sqlite.exec(sql);
    expectOnlyInvalidated(f, ['word0']);
    f.sqlite.exec(legacyAnnotationSql);
    expectOnlyInvalidated(f, ['word0']);
  });

  it.each([
    ['entry', "INSERT OR REPLACE INTO catalog_source_entries SELECT * FROM catalog_source_entries WHERE id='entry-word0'"],
    ['workbook', "INSERT OR REPLACE INTO catalog_workbook_sources SELECT * FROM catalog_workbook_sources WHERE id='verb'"],
    ['evidence row', "INSERT OR REPLACE INTO catalog_workbook_sheet_rows SELECT * FROM catalog_workbook_sheet_rows WHERE source_id='verb' AND row_number=4"],
  ])('treats even a byte-identical %s REPLACE as a replacement requiring review', (_label, sql) => {
    const f = smallFixture();
    f.sqlite.exec(sql);
    expectOnlyInvalidated(f, ['word0']);
  });

  it('preserves identical annotation INSERT, source DO NOTHING, and unrelated replacements', () => {
    const f = smallFixture();
    f.sqlite.exec("INSERT OR REPLACE INTO catalog_word_exam_annotations SELECT * FROM catalog_word_exam_annotations WHERE word_id='word0'");
    for (const table of ['catalog_workbook_sources', 'catalog_source_entries', 'catalog_workbook_sheet_rows', 'catalog_word_source_links', 'catalog_word_exam_annotations']) {
      f.sqlite.exec(`INSERT INTO ${table} SELECT * FROM ${table} WHERE 1 ON CONFLICT DO NOTHING`);
    }
    f.sqlite.exec("INSERT OR REPLACE INTO catalog_source_entries SELECT id,source_id,source_key,'replacement',payload_json,ready FROM catalog_source_entries WHERE id='entry-unrelated'");
    f.sqlite.exec("INSERT OR REPLACE INTO catalog_workbook_sheet_rows SELECT source_id,sheet_name,row_number,'{}' FROM catalog_workbook_sheet_rows WHERE source_id='verb' AND row_number=999");
    expectOnlyInvalidated(f, []);
  });

  it('lets foreign keys reject referenced original deletions atomically and cascades word deletion safely', () => {
    const f = smallFixture();
    expect(() => f.sqlite.exec("DELETE FROM catalog_source_entries WHERE id='entry-word0'")).toThrow(/FOREIGN KEY/);
    expect(() => f.sqlite.exec("DELETE FROM catalog_workbook_sources WHERE id='verb'")).toThrow(/FOREIGN KEY/);
    expectOnlyInvalidated(f, []);
    // Source link uses the existing restrictive FK; explicit unlink precedes a
    // word deletion. Annotation cascade must not create a new FK error.
    f.sqlite.exec("DELETE FROM catalog_word_source_links WHERE source_entry_id='entry-word0'; DELETE FROM words WHERE id='word0'");
    expect(invalidations(f)).toEqual([]);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('keeps the full 1531/638 synthetic original snapshot and canonical ready=0 supplement byte-for-byte on initial migration', async () => {
    const f = database();
    const model = createNaruSupplementFixtureModel();
    for (const [table, rows] of Object.entries(model.tables) as [string, Record<string, any>[]][]) {
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const insert = f.sqlite.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
      for (const row of rows) insert.run(...columns.map(column => row[column]));
    }
    f.sqlite.exec("UPDATE books SET word_count=1530; UPDATE material_source_ledger SET rights_status='approved',review_status='approved'");
    // Synthetic ordinary words have matching payloads and yellow original rows;
    // this is a portable count/preservation fixture, not evidence about live DB.
    const marked = f.sqlite.prepare('SELECT w.id,e.id AS entry_id,e.source_id,e.payload_json FROM words w JOIN catalog_word_source_links l ON l.word_id=w.id JOIN catalog_source_entries e ON e.id=l.source_entry_id WHERE w.word_number<=637 ORDER BY w.word_number').all();
    for (const row of marked) {
      const payload = JSON.parse(String(row.payload_json));
      const address = `A${payload.sourceRow}`;
      const archivedRow = { cells: [{ address, value: payload.word, style: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } } }] };
      f.sqlite.prepare('INSERT INTO catalog_workbook_sheet_rows(source_id,sheet_name,row_number,payload_json) VALUES(?,?,?,?)').run(row.source_id, payload.sourceSheet, payload.sourceRow, JSON.stringify(archivedRow));
      f.sqlite.prepare("INSERT INTO catalog_word_exam_annotations VALUES(?,'AICHI_HIGH_SCHOOL_ENTRANCE',?,?,?,'FFFF00','word_cell')").run(row.id, row.entry_id, payload.sourceSheet, address);
      f.sqlite.prepare('UPDATE words SET aichi_exam_appeared=1 WHERE id=?').run(row.id);
    }
    f.sqlite.exec(buildNaruDefinitionSupplementSql());
    seedOwner(f);
    f.sqlite.prepare("INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date) VALUES('owner',?,?,'LEARNING',1,2)").run(marked[0].id, bookId);
    const tables = ['words', 'books', 'material_source_ledger', 'learning_histories', 'catalog_source_entries', 'catalog_workbook_sources', 'catalog_workbook_sheet_rows', 'catalog_word_source_links', 'catalog_word_exam_annotations', 'catalog_word_definition_supplements'];
    const before = protectedSnapshot(f, tables);
    f.sqlite.exec(migration);
    expect(protectedSnapshot(f, tables)).toBe(before);
    // Replay the actual generated source-import UPSERTs after canonical 0057.
    // The original word-number stage intentionally differs after the canonical
    // insertion; this regression concerns unchanged original proof tables.
    const sourceImportReplay = buildNaruStageSql(model).split('\n').filter(statement => /^INSERT INTO (catalog_workbook_sources|catalog_workbook_sheet_rows|catalog_source_entries|catalog_word_source_links)\s/.test(statement)).join('\n');
    expect(sourceImportReplay).toContain('ON CONFLICT');
    f.sqlite.exec(sourceImportReplay);
    for (const table of ['catalog_workbook_sources', 'catalog_source_entries', 'catalog_workbook_sheet_rows', 'catalog_word_source_links', 'catalog_word_exam_annotations']) {
      f.sqlite.exec(`INSERT INTO ${table} SELECT * FROM ${table} WHERE 1 ON CONFLICT DO NOTHING`);
    }
    expect(protectedSnapshot(f, tables)).toBe(before);
    expect(invalidations(f)).toEqual([]);
    const words = await authenticatedWords(f);
    expect(words).toHaveLength(1531);
    expect(words.filter(w => w.aichiExamAppeared)).toHaveLength(638);
    expect(words.find(w => w.id === supplement.wordId)).toMatchObject({ word: 'actually', definitionSupplemented: true, aichiExamAppeared: true });
    expect(f.sqlite.prepare('SELECT ready FROM catalog_source_entries WHERE id=?').get(supplement.sourceEntryId)?.ready).toBe(0);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    f.sqlite.prepare('UPDATE catalog_source_entries SET content_hash=? WHERE id=?').run('changed', marked[0].entry_id);
    f.sqlite.exec(buildNaruDefinitionSupplementSql());
    expect(f.sqlite.prepare('SELECT aichi_exam_appeared FROM words WHERE id=?').get(marked[0].id)?.aichi_exam_appeared).toBe(0);
    expect(f.sqlite.prepare('SELECT aichi_exam_appeared FROM words WHERE id=?').get(supplement.wordId)?.aichi_exam_appeared).toBe(1);
  });

  it('also accepts the canonical 0057 INSERT→link→annotation order when its first application follows 0058', () => {
    const f = database();
    const model = createNaruSupplementFixtureModel();
    for (const [table, rows] of Object.entries(model.tables) as [string, Record<string, any>[]][]) {
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const insert = f.sqlite.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
      for (const row of rows) insert.run(...columns.map(column => row[column]));
    }
    f.sqlite.exec("UPDATE books SET word_count=1530; UPDATE material_source_ledger SET rights_status='approved',review_status='approved'");
    f.sqlite.exec(migration);
    f.sqlite.exec(buildNaruDefinitionSupplementSql());
    expect(f.sqlite.prepare('SELECT aichi_exam_appeared,definition_supplemented FROM words WHERE id=?').get(supplement.wordId)).toEqual({ aichi_exam_appeared: 1, definition_supplemented: 1 });
    expect(invalidations(f)).toEqual([]);
    expect(f.sqlite.prepare('SELECT ready FROM catalog_source_entries WHERE id=?').get(supplement.sourceEntryId)?.ready).toBe(0);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
