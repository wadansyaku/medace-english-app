import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  ORIGINAL_WORKBOOKS, archiveWorkbook, buildOriginalWorkbookSql,
  compareOriginalCatalog, parseOriginalWorkbook, workbookBookId,
} from '../scripts/_shared/original-workbook-import.mjs';
import { catalogRowsAreEquivalent, normalizeCatalogImport } from '../shared/catalogImport';
import { toWordData, type DbWordRow } from '../functions/_shared/storage-support';

type SheetFixture = { name: string; rows: unknown[][]; start?: string; cellMetadata?: Record<string, Partial<XLSX.CellObject>> };
const parse = (key: string, fixture: SheetFixture[], sha = 'a'.repeat(64)) => {
  const spec = ORIGINAL_WORKBOOKS.find((workbook) => workbook.key === key)!;
  const workbook = XLSX.utils.book_new();
  fixture.forEach(({ name, rows, start = 'A1', cellMetadata = {} }) => {
    const origin = XLSX.utils.decode_cell(start);
    const sheet: XLSX.WorkSheet = { '!ref': XLSX.utils.encode_range(origin, { r: origin.r + rows.length - 1, c: origin.c + Math.max(...rows.map(row => row.length)) - 1 }) };
    rows.forEach((row, r) => row.forEach((value, c) => {
      if (value == null) return;
      const address = XLSX.utils.encode_cell({ r: origin.r + r, c: origin.c + c });
      sheet[address] = { t: typeof value === 'number' ? 'n' : 's', v: value, ...cellMetadata[address] };
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  return parseOriginalWorkbook({ spec, sha256: sha, sheets: archiveWorkbook(workbook, XLSX) });
};
const nounFixture: SheetFixture[] = [
  { name: '名詞一覧', rows: [['goal', '○'], ['bike', '○'], ['bicycle', '○'], ['unknown', '○']] },
  { name: '生活', rows: [[null, '生活', null, null, null], [1, 'goal', '目標', 'Set a goal.', '確認済み'], [2, 'goal', '得点', 'We scored a goal.', null], [3, 'bike(bicycle)', '自転車', 'I ride a bike.', null]] },
  { name: '修正ログ', rows: [['状態', 'シート', 'source id', 'セル', '項目', '修正前', '修正後', '理由'], ['修正済み', '生活', '1', 'C2', '意味', '旧訳', '目標', '確認']] },
];
const migrationSql = fs.readdirSync(`${process.cwd()}/migrations`).filter(name => name.endsWith('.sql')).sort()
  .map((migration) => fs.readFileSync(`${process.cwd()}/migrations/${migration}`, 'utf8')).join('\n');
const compareLineage = (workbooks, existing) => compareOriginalCatalog(workbooks, existing, {
  correspondenceScope: 'SOURCE_WORKBOOK_LINEAGE',
  sourceBookIdsByPartOfSpeech: { verb: [], noun: ['source-book'], adverb: [], adjective: [] },
});

describe('original workbook source fidelity', () => {
  it('keeps actual shifted rows, blank rows, columns and addressed comments together through SQL', () => {
    const workbook = parse('adjective', [
      { name: '形容詞', start: 'B5', rows: [['kind', '親切な', 'She is kind.'], [null, null, null], ['calm', '落ち着いた', 'Stay calm.']],
        cellMetadata: { B5: { f: '"kind"', c: [{ a: 'Synthetic teacher', t: 'Synthetic source comment' }], s: { fgColor: { rgb: 'FFFF00' } } } } },
      { name: '形容詞一覧', start: 'C8', rows: [['kind', null, 'calm'], [null, 'other', null]] },
    ]);
    expect(workbook.records.map(record => [record.sourceKey, record.sourceRow, record.sourceColumn])).toEqual([
      ['adjective:形容詞:R5C2', 5, 2], ['adjective:形容詞:R7C2', 7, 2],
    ]);
    expect(workbook.indexEntries.map(entry => [entry.sourceRow, entry.sourceColumn])).toEqual([[8, 3], [8, 5], [9, 4]]);
    expect(workbook.summary.sourceCoverage).toMatchObject({ sheetAndEntryIdCoverageRate: 0, coordinateCoverageRate: 1 });
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(migrationSql);
      const sql = buildOriginalWorkbookSql([workbook], { localPreview: true, timestamp: 1 });
      db.exec(sql); db.exec(sql);
      const rows = db.prepare("SELECT row_number,payload_json FROM catalog_workbook_sheet_rows WHERE sheet_name='形容詞' ORDER BY row_number").all();
      expect(rows.map(row => row.row_number)).toEqual([5, 6, 7]);
      expect(JSON.parse(String(rows[0].payload_json))).toMatchObject({ values: ['kind', '親切な', 'She is kind.'], cells: [
        expect.objectContaining({ address: 'B5', formula: '"kind"', comments: [{ author: 'Synthetic teacher', text: 'Synthetic source comment' }], style: { fgColor: { rgb: 'FFFF00' } } }),
        expect.objectContaining({ address: 'C5' }), expect.objectContaining({ address: 'D5' }),
      ] });
      expect(JSON.parse(String(rows[1].payload_json)).cells).toEqual([]);
      const metadata = JSON.parse(String(db.prepare('SELECT archive_json FROM catalog_workbook_sources').get()?.archive_json));
      expect(metadata[0]).toMatchObject({ originRow: 4, originColumn: 1, range: 'B5:D7' });
      expect(db.prepare('SELECT qa_source_coverage_rate FROM material_source_ledger').get()?.qa_source_coverage_rate).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_word_source_links').get()?.count).toBe(2);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });

  it('uses actual offsets for every layout, index and section marker', () => {
    const verb = parse('verb', [
      { name: '文法分類', start: 'D4', rows: [['状態', null, null, null, null], ['grow', 'grew-grown', '成長する', 'He grew.', null], ['walk', null, '歩く', 'Walk home.', null]] },
      { name: '動詞一覧', start: 'B8', rows: [['学習', null, null, null, null], ['grow', null, null, null, 'grew-grown']] },
      { name: 'メモ', start: 'C12', rows: [['walk']] },
    ]);
    expect(verb.records.map(record => [record.sourceRow, record.sourceColumn])).toEqual([[5, 4], [6, 4]]);
    expect(verb.sectionMarkers).toEqual([{ sheet: '文法分類', row: 4, column: 4, text: '状態' }]);
    expect(verb.indexEntries.map(entry => [entry.sourceRow, entry.sourceColumn])).toEqual([[9, 2], [12, 3]]);
    const noun = parse('noun', [
      { name: '名詞一覧', start: 'E10', rows: [['goal'], ['bike']] },
      { name: '生活', start: 'C5', rows: [[null, '生活', null, null, null, null, '交通', null, null, null], [null, '目的', null, null, null, null, '乗り物', null, null, null], [1, 'goal', '目標', 'Set a goal.', null, 2, 'bike', '自転車', 'Ride a bike.', null]] },
    ]);
    expect(noun.records.map(record => [record.sourceRow, record.sourceColumn, record.sourceEntryId])).toEqual([[7, 4, 1], [7, 9, 2]]);
    expect(noun.sectionMarkers).toEqual([{ sheet: '生活', row: 6, column: 4, text: '目的' }, { sheet: '生活', row: 6, column: 9, text: '乗り物' }]);
    expect(noun.indexEntries.map(entry => entry.sourceRow)).toEqual([10, 11]);
    const adverb = parse('adverb', [{ name: '副詞一覧', start: 'B5', rows: [['well', null, null, null, null, '程度', null, null], [null, null, null, null, null, 'well', '上手に', 'She sings well.']] }]);
    expect(adverb.records[0]).toMatchObject({ sourceKey: 'adverb:副詞一覧:R6C7', sourceRow: 6, sourceColumn: 7 });
    expect(adverb.sectionMarkers).toEqual([{ sheet: '副詞一覧', row: 5, column: 7, text: '程度' }]);
    expect(adverb.indexEntries[0]).toMatchObject({ sourceRow: 5, sourceColumn: 2 });
  });

  it.each(['未抽出', '訳は[要確認]', 'ＴＯＤＯ'])('archives blocked content without making it learnable: %s', definition => {
    const workbook = parse('adjective', [{ name: '形容詞', rows: [['kind', definition, 'She is kind.']] }, { name: '形容詞一覧', rows: [['kind']] }]);
    expect(workbook.records[0].ready).toBe(false);
    expect(workbook.issues).toContainEqual(expect.objectContaining({ code: 'BLOCKED_CONTENT_MARKER', severity: 'blocking' }));
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(migrationSql); db.exec(buildOriginalWorkbookSql([workbook], { localPreview: true, timestamp: 1 }));
      expect(db.prepare('SELECT COUNT(*) AS count FROM words').get()?.count).toBe(0);
      expect(db.prepare('SELECT ready FROM catalog_source_entries').get()?.ready).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_word_source_links').get()?.count).toBe(0);
      expect(db.prepare('SELECT qa_word_count FROM material_source_ledger').get()?.qa_word_count).toBe(0);
    } finally { db.close(); }
  });

  it('measures numeric ID coverage separately without withholding valid coordinate sources', () => {
    const fixture = structuredClone(nounFixture);
    fixture[1].rows[3][0] = null;
    const workbook = parse('noun', fixture);
    expect(workbook.records.every(record => record.ready)).toBe(true);
    expect(workbook.summary.sourceCoverage).toMatchObject({ wordCount: 3, sheetAndEntryIdCount: 2, sheetAndEntryIdCoverageRate: 0.6667, coordinateCount: 3, coordinateCoverageRate: 1 });
    expect(workbook.records[2].sourceEntryId).toBeNull();
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(migrationSql); db.exec(buildOriginalWorkbookSql([workbook], { timestamp: 1 }));
      expect(db.prepare('SELECT COUNT(*) AS count FROM words').get()?.count).toBe(3);
      expect(db.prepare('SELECT qa_source_coverage_rate,rights_status,review_status FROM material_source_ledger').get()).toMatchObject({ qa_source_coverage_rate: 0.6667, rights_status: 'pending', review_status: 'needs_review' });
    } finally { db.close(); }
  });

  it('keeps legitimate vocabulary containing English marker letters', () => {
    const workbook = parse('verb', [
      { name: '文法分類', rows: [['mastodon', null, 'マストドン', 'The mastodon lived long ago.', 'An/another animal.']] },
      { name: '動詞一覧', rows: [['mastodon']] }, { name: 'メモ', rows: [['mastodon']] },
    ]);
    expect(workbook.records[0].ready).toBe(true);
    expect(workbook.issues.filter(issue => issue.code === 'BLOCKED_CONTENT_MARKER')).toEqual([]);
    expect(workbook.summary.readyCount).toBe(1);
  });

  it('keeps separate senses, source IDs, notes, audit changes, and index-only aliases', () => {
    const workbook = parse('noun', nounFixture);
    expect(workbook.records).toHaveLength(3);
    expect(workbook.records.filter((r) => r.word === 'goal').map((r) => r.definition)).toEqual(['目標', '得点']);
    expect(workbook.records[0]).toMatchObject({ sourceEntryId: 1, sourceSheet: '生活', sourceRow: 2, sourceColumn: 2, sourceNote: '確認済み' });
    expect(workbook.summary.duplicateHeadwordGroupCount).toBe(1);
    expect(workbook.summary.indexOnlyUniqueCount).toBe(3);
    expect(workbook.auditChanges).toEqual([expect.objectContaining({ before: '旧訳', after: '目標', verified: true })]);
    expect(workbook.sheets.find((sheet) => sheet.name === '修正ログ')?.rows).toEqual(nounFixture[2].rows);
  });

  it('parses each different sheet layout and does not label English duplicate notes as Japanese example meanings', () => {
    const verb = parse('verb', [
      { name: '文法分類', rows: [['主語が状態になる'], ['grow', 'grows-grew-grown', '成長する\n〜になる', 'He grew tall.', 'He grew tall.\n文法注記']] },
      { name: '動詞一覧', rows: [['勉強'], ['grow', null, null, null, 'grow-grew-grown-growing']] },
      { name: 'メモ', rows: [['grow']] },
    ]);
    expect(verb.records[0]).toMatchObject({ word: 'grow', inflections: 'grows-grew-grown', definition: '成長する\n〜になる', sourceNote: 'He grew tall.\n文法注記', exampleMeaning: '', partOfSpeech: 'verb' });
    expect(verb.indexEntries[0].inflections).toBe('grow-grew-grown-growing');
    const adverb = parse('adverb', [{ name: '副詞一覧', rows: [['actually', null, null, null, null, '程度'], ['well', null, null, null, null, 'actually', null, 'Actually, I agree.'], [null, null, null, null, null, 'well', '上手に', 'She sings well.']] }]);
    expect(adverb.summary.candidateCount).toBe(2);
    expect(adverb.summary.readyCount).toBe(1);
    expect(adverb.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_DEFINITION', word: 'actually' }));
    const adjective = parse('adjective', [{ name: '形容詞', rows: [['kind', '親切な', 'She is kind.']] }, { name: '形容詞一覧', rows: [[null, null, '性質', 'kind'], [null, null, 'missing']] }]);
    expect(adjective.records[0].partOfSpeech).toBe('adjective');
    expect(adjective.indexOnly[0].word).toBe('missing');
  });

  it('preserves addressed comments, formulas and source correction colors', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['word']]);
    Object.assign(sheet.A1, { f: '"word"', c: [{ a: 'Teacher', t: 'Correction reason' }], s: { fgColor: { rgb: 'FFFF00' } } });
    XLSX.utils.book_append_sheet(workbook, sheet, 'source');
    const archive = archiveWorkbook(workbook, XLSX);
    expect(archive[0].cells[0]).toMatchObject({ address: 'A1', value: 'word', formula: '"word"', comments: [{ author: 'Teacher', text: 'Correction reason' }], style: { fgColor: { rgb: 'FFFF00' } } });
  });

  it('never calls a headword-only match complete and does not choose ambiguous IDs', () => {
    const workbook = parse('noun', nounFixture);
    const baseline = [{ id: 'old-1', book_id: 'source-book', word: 'goal', definition: '目標', example_sentence: 'Set a goal.', source_sheet: '生活', source_entry_id: 1 }];
    expect(compareLineage([workbook], baseline).records[0]).toMatchObject({ status: 'exact_source_match', matchedWordId: 'old-1', metadataDifferences: ['partOfSpeech', 'sourceNote'] });
    expect(compareLineage([workbook], baseline).records[1].status).toBe('headword_only_match');
    expect(compareLineage([workbook], [...baseline, { ...baseline[0], id: 'old-2' }]).records[0]).toMatchObject({ status: 'ambiguous_source_match', matchedWordId: null });
    expect(compareLineage([workbook], [{ ...baseline[0], source_sheet: null }]).records[0].status).toBe('content_match_needs_source_confirmation');
    expect(compareLineage([workbook], [{ ...baseline[0], definition: '変更された訳' }]).records[0].status).toBe('source_content_changed');
    expect(compareOriginalCatalog([workbook]).verified).toBe(false);
    const unrelated = compareOriginalCatalog([workbook], [{ ...baseline[0], book_id: 'level-1' }]);
    expect(unrelated).toMatchObject({ verified: false, correspondenceScope: 'UNRELATED_CATALOG_RECOMPOSITION', records: [] });
    expect(unrelated).not.toHaveProperty('coverage');
    expect(unrelated.lexicalOverlapReference.metrics.wordMeaningProvidedExamplesPresent).toBe(1);
    expect(compareLineage([workbook], [{ ...baseline[0], book_id: 'level-1' }]).records[0].status).toBe('missing');
    expect(() => compareOriginalCatalog([workbook], baseline, { correspondenceScope: 'SOURCE_WORKBOOK_LINEAGE' })).toThrow('verified book-ID map');
  });
});

describe('source import remains additive and repeatable', () => {
  it('imports twice without changing an existing word, user or history and archives new source revisions separately', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(migrationSql);
      db.exec(`INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES ('synthetic-user','fixture@example.invalid','Fixture','STUDENT',1,1);
        INSERT INTO books (id,title,word_count,created_at,updated_at) VALUES ('old-book','Existing',1,1,1);
        INSERT INTO words (id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES ('old-word','old-book',1,'goal','既存語義','goal',1,1);
        INSERT INTO learning_histories (user_id,word_id,book_id,status,last_studied_at,next_review_date) VALUES ('synthetic-user','old-word','old-book','LEARNING',1,2);`);
      const oldWord = db.prepare("SELECT * FROM words WHERE id='old-word'").get();
      const history = db.prepare('SELECT * FROM learning_histories').get();
      const workbook = parse('noun', nounFixture);
      const sql = buildOriginalWorkbookSql([workbook], { timestamp: 1, localPreview: true });
      expect(sql).not.toMatch(/\b(?:DELETE|UPDATE|REPLACE)\b/i);
      db.exec(sql);
      db.exec(sql);
      expect(db.prepare('SELECT COUNT(*) AS count FROM words').get()?.count).toBe(4);
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_source_entries').get()?.count).toBe(3);
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_word_source_links').get()?.count).toBe(3);
      expect(db.prepare("SELECT * FROM words WHERE id='old-word'").get()).toEqual(oldWord);
      expect(db.prepare('SELECT * FROM learning_histories').get()).toEqual(history);
      const mapped = toWordData(db.prepare('SELECT * FROM words WHERE book_id=? ORDER BY word_number').get(workbookBookId(workbook)) as unknown as DbWordRow);
      expect(mapped).toMatchObject({ partOfSpeech: 'noun', sourceNote: '確認済み', definition: '目標', exampleSentence: 'Set a goal.' });
      const revision = parse('noun', nounFixture, 'b'.repeat(64));
      db.exec(buildOriginalWorkbookSql([revision], { timestamp: 2 }));
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_workbook_sources').get()?.count).toBe(2);
      expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()?.count).toBe(1);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });
});

describe('application catalog import fields', () => {
  it('keeps quoted multiline definitions, examples, grammar notes and escaped quotes in CSV', () => {
    const result = normalizeCatalogImport({ defaultBookName: 'Original', source: { kind: 'csv', csvText: 'Word,Meaning,ExampleSentence,PartOfSpeech,Inflections,SourceNote\n"grow","成長する\n〜になる","He said ""grow"".\nKeep trying.",verb,grows-grew-grown,"原本\n注記"' } });
    expect(result.warnings).toEqual([]);
    expect(result.rows[0]).toMatchObject({ definition: '成長する\n〜になる', exampleSentence: 'He said "grow".\nKeep trying.', partOfSpeech: 'verb', inflections: 'grows-grew-grown', sourceNote: '原本\n注記' });
    expect(normalizeCatalogImport({ defaultBookName: 'Original', source: { kind: 'csv', csvText: 'Word,Meaning\n"broken,未完' } }).warnings[0].code).toBe('INVALID_CSV');
  });

  it('compares the full sense and provenance and rejects unsupported part of speech', () => {
    const row = { word: 'plant', definition: '植物', exampleSentence: 'A green plant.', partOfSpeech: 'noun' as const, sourceEntryId: 1 };
    expect(catalogRowsAreEquivalent(row, { ...row })).toBe(true);
    expect(catalogRowsAreEquivalent(row, { ...row, sourceEntryId: 2 })).toBe(false);
    expect(catalogRowsAreEquivalent(row, { ...row, exampleSentence: 'Water the plant.' })).toBe(false);
    expect(catalogRowsAreEquivalent(row, { ...row, partOfSpeech: 'verb' })).toBe(false);
    expect(normalizeCatalogImport({ defaultBookName: 'Original', source: { kind: 'rows', rows: [{ ...row, partOfSpeech: 'arbitrary' as never }] } }).warnings[0].code).toBe('INVALID_PART_OF_SPEECH');
  });
});
