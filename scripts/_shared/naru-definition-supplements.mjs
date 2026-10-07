import fs from 'node:fs';

export const NARU_DEFINITION_SUPPLEMENTS = JSON.parse(fs.readFileSync(new URL('../../data/naru-app-definition-supplements.json', import.meta.url), 'utf8'));
const quote = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : '(' + String(value).split('\n').map(line => `'${line.replaceAll("'", "''")}'`).join(' || char(10) || ') + ')';
const canonicalManifestJson = JSON.stringify(NARU_DEFINITION_SUPPLEMENTS);
const reviewed = manifest => {
  if (JSON.stringify(manifest) !== canonicalManifestJson) throw new Error('Only the reviewed original-source application supplement may be applied');
  return manifest.supplements[0];
};
const note = 'actuallyの原本欠訳は、辞書根拠と本人承認によるアプリ用訳補完として独立台帳へ保存（原本ready・payload・hashは不変）。';

// Check the entire pre-supplement catalog against its linked original payloads,
// not merely the missing word. Mutable report flags/timestamps remain allowed.
// No approval, source archive, source ready flag or original payload is changed.
const sourceGuard = (m, { hasDefinitionSupplementColumn = true } = {}) => {
  const originalFiles = m.sources.map(s => s.file).join(';');
  const sourceChecks = m.sources.map(s => `EXISTS(SELECT 1 FROM catalog_workbook_sources s WHERE s.id=${quote(`xlsx-${s.key}-${s.sha256}`)} AND s.series_key=${quote(s.key)} AND s.source_file=${quote(s.file)} AND s.sha256=${quote(s.sha256)})`).join(' AND ');
  const sourceIds = m.sources.map(s => quote(`xlsx-${s.key}-${s.sha256}`)).join(',');
  const fields = { word: 'word', definition: 'definition', example_sentence: 'exampleSentence', example_meaning: 'exampleMeaning', part_of_speech: 'partOfSpeech', source_sheet: 'sourceSheet', source_entry_id: 'sourceEntryId', inflections: 'inflections', pronunciation: 'pronunciation', source_note: 'sourceNote', category: 'category', subcategory: 'subcategory', section: 'section' };
  const equalFields = Object.entries(fields).map(([column, field]) => `w.${column} IS json_extract(e.payload_json,'$.${field}')`).join(' AND ');
  const correctNumber = `(w.part_of_speech='verb' AND w.word_number=json_extract(e.payload_json,'$.number')) OR (w.part_of_speech='noun' AND w.word_number=json_extract(e.payload_json,'$.number')+353) OR (w.part_of_speech='adverb' AND json_extract(e.payload_json,'$.number')<76 AND w.word_number=json_extract(e.payload_json,'$.number')+1285) OR (w.part_of_speech='adverb' AND json_extract(e.payload_json,'$.number')>76 AND w.word_number=json_extract(e.payload_json,'$.number')+1284) OR (w.part_of_speech='adjective' AND w.word_number=json_extract(e.payload_json,'$.number')+1371)`;
  return `EXISTS(SELECT 1 FROM books b JOIN material_source_ledger ml ON ml.book_id=b.id WHERE b.id=${quote(m.bookId)} AND b.title='Naruシスト' AND b.created_by IS NULL AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.source_context=${quote(`original-workbooks:${m.revision}`)} AND b.word_count=1530 AND b.description=${quote(m.originalDescription)} AND ml.source_id=${quote(`ledger-${m.bookId}`)} AND ml.catalog_source='STEADY_STUDY_ORIGINAL' AND ml.book_title=b.title AND ml.edition=${quote(m.revision)} AND ml.source_file=${quote(originalFiles)} AND ml.review_status='approved' AND ml.rights_status='approved' AND ml.qa_word_count=1530 AND ml.qa_required_blank_rows=0 AND ml.qa_rows_with_sentinel=0 AND ml.qa_sentinel_value_count=0)
AND ${sourceChecks}
AND (SELECT COUNT(*) FROM catalog_source_entries WHERE source_id IN (${sourceIds}))=1531
AND (SELECT COUNT(*) FROM catalog_source_entries WHERE source_id IN (${sourceIds}) AND ready=1)=1530
AND (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)})=1530
AND (SELECT COUNT(DISTINCT word_number) FROM words WHERE book_id=${quote(m.bookId)})=1530
AND (SELECT MIN(word_number) FROM words WHERE book_id=${quote(m.bookId)})=1
AND (SELECT MAX(word_number) FROM words WHERE book_id=${quote(m.bookId)})=1530
AND (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)} AND word_number>=1361)=170
AND NOT EXISTS(SELECT 1 FROM words w WHERE w.book_id=${quote(m.bookId)} AND NOT EXISTS(SELECT 1 FROM catalog_word_source_links l JOIN catalog_source_entries e ON e.id=l.source_entry_id JOIN catalog_workbook_sources s ON s.id=e.source_id WHERE l.word_id=w.id AND l.match_kind='snapshot_import' AND e.ready=1 AND s.series_key=w.part_of_speech AND s.id IN (${sourceIds}) AND e.source_key=json_extract(e.payload_json,'$.sourceKey') AND e.content_hash=json_extract(e.payload_json,'$.contentHash') AND json_extract(e.payload_json,'$.bookName')='Naruシスト' AND json_extract(e.payload_json,'$.ready')=1 AND json_extract(e.payload_json,'$.sourceSnapshotBookId')=SUBSTR(w.id,1,LENGTH(json_extract(e.payload_json,'$.sourceSnapshotBookId'))) ${hasDefinitionSupplementColumn ? 'AND w.definition_supplemented=0 ' : ''}AND ${equalFields} AND (${correctNumber})))
AND (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)} AND part_of_speech='verb')=353
AND (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)} AND part_of_speech='noun')=932
AND (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)} AND part_of_speech='adverb')=86
AND (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)} AND part_of_speech='adjective')=159
AND EXISTS(SELECT 1 FROM catalog_source_entries e WHERE e.id=${quote(m.sourceEntryId)} AND e.source_id=${quote(m.sourceId)} AND e.source_key=${quote(m.sourceKey)} AND e.content_hash=${quote(m.sourceContentHash)} AND e.ready=0 AND e.payload_json=${quote(m.originalPayloadJson)} AND json_extract(e.payload_json,'$.contentHash')=e.content_hash AND json_extract(e.payload_json,'$.definition')='' AND json_extract(e.payload_json,'$.sourceEntryId') IS NULL)
AND EXISTS(SELECT 1 FROM catalog_workbook_sheet_rows r WHERE r.source_id=${quote(m.sourceId)} AND r.sheet_name=${quote(m.sourceSheet)} AND r.row_number=82 AND r.payload_json=${quote(m.originalArchiveRowPayloadJson)} AND json_extract(r.payload_json,'$.values[5]')='actually' AND json_extract(r.payload_json,'$.values[6]') IS NULL AND json_extract(r.payload_json,'$.values[7]')=${quote(m.exampleSentence)} AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c WHERE json_extract(c.value,'$.address')='F82' AND json_extract(c.value,'$.value')='actually' AND json_extract(c.value,'$.style.patternType')='solid' AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00') AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL))
AND NOT EXISTS(SELECT 1 FROM words WHERE id=${quote(m.wordId)} OR (book_id=${quote(m.bookId)} AND word='actually'))
AND NOT EXISTS(SELECT 1 FROM catalog_word_source_links WHERE source_entry_id=${quote(m.sourceEntryId)})`;
};

// Read-only before-migration release check. Omitting the new column is the
// only difference: ALTER TABLE will give every existing word the default zero.
// Return counts and eligibility only, never archive text or personal data.
export const buildNaruDefinitionSupplementPreflightSql = ({ hasDefinitionSupplementColumn = true } = {}) => {
  if (typeof hasDefinitionSupplementColumn !== 'boolean') throw new Error('Explicit supplement-column availability is required');
  const m = reviewed(NARU_DEFINITION_SUPPLEMENTS);
  return `SELECT (${sourceGuard(m, { hasDefinitionSupplementColumn })}) AS eligible,(SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)}) AS currentWordCount,(SELECT COUNT(*) FROM catalog_source_entries WHERE id=${quote(m.sourceEntryId)} AND ready=0 AND content_hash=${quote(m.sourceContentHash)} AND payload_json=${quote(m.originalPayloadJson)}) AS currentHeldSourceCount,(SELECT COUNT(*) FROM words WHERE id=${quote(m.wordId)}) AS currentSupplementWordCount;\n`;
};

// One INSERT statement. Its AFTER INSERT trigger completes all catalog changes
// before SQLite checks the immediate word FK. A failed trigger rolls it all back.
export const buildNaruDefinitionSupplementSql = (manifest = NARU_DEFINITION_SUPPLEMENTS) => {
  const m = reviewed(manifest);
  const columns = ['id','word_id','source_entry_id','source_content_hash','source_file','source_sha256','source_key','original_definition','definition','original_example_meaning','example_meaning','reason','references_json','approval_json','evidence_json','applied_at'];
  const values = [m.id,m.wordId,m.sourceEntryId,m.sourceContentHash,m.sourceFile,m.sourceSha256,m.sourceKey,m.sourceDefinition,m.definition,m.originalExampleMeaning,m.exampleMeaning,m.reason,JSON.stringify(m.references),JSON.stringify(m.approval),JSON.stringify({ sheet:m.sourceSheet,wordCell:m.sourceWordCell,definitionCell:m.sourceDefinitionCell,exampleCell:m.sourceExampleCell,fillRgb:m.sourceFillRgb,originalContentHash:m.originalContentHash })].map(quote);
  const statement = `INSERT INTO catalog_word_definition_supplements(${columns.join(',')}) SELECT ${values.join(',')},CAST(strftime('%s','now') AS INTEGER)*1000 WHERE NOT EXISTS(SELECT 1 FROM catalog_word_definition_supplements WHERE id=${quote(m.id)} OR word_id=${quote(m.wordId)} OR source_entry_id=${quote(m.sourceEntryId)}) AND ${sourceGuard(m)} ON CONFLICT DO NOTHING;`;
  if (Buffer.byteLength(statement)>100000) throw new Error('Supplement SQL exceeds D1 statement limit');
  return `-- Explicit application-only supplement; original archive/payload/ready/hash and approvals stay intact.\n${statement}\n`;
};

export const buildNaruDefinitionSupplementMigrationSql = (manifest = NARU_DEFINITION_SUPPLEMENTS) => {
  const m = reviewed(manifest);
  const metadata = JSON.stringify({ sheet:m.sourceSheet,wordCell:m.sourceWordCell,definitionCell:m.sourceDefinitionCell,exampleCell:m.sourceExampleCell,fillRgb:m.sourceFillRgb,originalContentHash:m.originalContentHash });
  const validate = `NEW.id=${quote(m.id)} AND NEW.word_id=${quote(m.wordId)} AND NEW.source_entry_id=${quote(m.sourceEntryId)} AND NEW.source_content_hash=${quote(m.sourceContentHash)} AND NEW.source_file=${quote(m.sourceFile)} AND NEW.source_sha256=${quote(m.sourceSha256)} AND NEW.source_key=${quote(m.sourceKey)} AND NEW.original_definition IS NULL AND NEW.definition=${quote(m.definition)} AND NEW.original_example_meaning IS NULL AND NEW.example_meaning=${quote(m.exampleMeaning)} AND NEW.reason=${quote(m.reason)} AND NEW.references_json=${quote(JSON.stringify(m.references))} AND NEW.approval_json=${quote(JSON.stringify(m.approval))} AND NEW.evidence_json=${quote(metadata)} AND ${sourceGuard(m)}`;
  const trigger = `CREATE TRIGGER apply_naru_definition_supplement AFTER INSERT ON catalog_word_definition_supplements BEGIN SELECT RAISE(ABORT,'Naru supplement source mismatch') WHERE NOT (${validate}); UPDATE words SET word_number=word_number+1 WHERE book_id=${quote(m.bookId)} AND word_number>=1361; INSERT INTO words(id,book_id,word_number,word,definition,search_key,category,subcategory,section,source_sheet,source_entry_id,example_sentence,example_meaning,part_of_speech,inflections,pronunciation,source_note,is_reported,created_at,updated_at,aichi_exam_appeared,definition_supplemented) VALUES(NEW.word_id,${quote(m.bookId)},1361,'actually',NEW.definition,'actually','文副詞','','',${quote(m.sourceSheet)},NULL,${quote(m.exampleSentence)},NEW.example_meaning,'adverb','','','',0,NEW.applied_at,NEW.applied_at,1,1); INSERT INTO catalog_word_source_links(source_entry_id,word_id,match_kind) VALUES(NEW.source_entry_id,NEW.word_id,'snapshot_import'); INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind) VALUES(NEW.word_id,'AICHI_HIGH_SCHOOL_ENTRANCE',NEW.source_entry_id,${quote(m.sourceSheet)},'F82','FFFF00','word_cell'); UPDATE books SET word_count=1531,description=${quote(m.publishedDescription)} WHERE id=${quote(m.bookId)}; UPDATE material_source_ledger SET qa_word_count=1531,qa_duplicate_headword_count=(SELECT COUNT(*)-COUNT(DISTINCT search_key) FROM words WHERE book_id=${quote(m.bookId)}),qa_source_coverage_rate=ROUND((SELECT COUNT(*)*1.0 FROM words WHERE book_id=${quote(m.bookId)} AND source_entry_id IS NOT NULL)/1531,4),qa_example_pair_coverage_rate=ROUND((SELECT COUNT(*)*1.0 FROM words WHERE book_id=${quote(m.bookId)} AND example_sentence<>'' AND example_meaning<>'')/1531,4),notes=REPLACE(notes,'actuallyの欠訳1件は保留。',${quote(note)}) WHERE source_id=${quote(`ledger-${m.bookId}`)}; END;`;
  // D1's importer splits multiline trigger bodies incorrectly. Keep each CREATE
  // TRIGGER on one physical line, including quoted application definitions.
  const oneLine = statement => statement.replaceAll('\n', ' ');
  const statements = [
    '-- Application-only definition supplement. All original archives/source entries remain immutable.',
    'ALTER TABLE words ADD COLUMN definition_supplemented INTEGER NOT NULL DEFAULT 0 CHECK(definition_supplemented IN (0,1));',
    `CREATE TABLE catalog_word_definition_supplements (id TEXT PRIMARY KEY,word_id TEXT NOT NULL UNIQUE REFERENCES words(id),source_entry_id TEXT NOT NULL UNIQUE REFERENCES catalog_source_entries(id),source_content_hash TEXT NOT NULL,source_file TEXT NOT NULL,source_sha256 TEXT NOT NULL,source_key TEXT NOT NULL,original_definition TEXT CHECK(original_definition IS NULL),definition TEXT NOT NULL,original_example_meaning TEXT CHECK(original_example_meaning IS NULL),example_meaning TEXT NOT NULL,reason TEXT NOT NULL,references_json TEXT NOT NULL CHECK(json_valid(references_json)),approval_json TEXT NOT NULL CHECK(json_valid(approval_json)),evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),applied_at INTEGER NOT NULL);`,
    oneLine(trigger),
    `CREATE TRIGGER invalidate_word_definition_supplement AFTER UPDATE OF word,definition,part_of_speech,source_sheet,source_entry_id,book_id,example_sentence,example_meaning ON words WHEN OLD.word IS NOT NEW.word OR OLD.definition IS NOT NEW.definition OR OLD.part_of_speech IS NOT NEW.part_of_speech OR OLD.source_sheet IS NOT NEW.source_sheet OR OLD.source_entry_id IS NOT NEW.source_entry_id OR OLD.book_id IS NOT NEW.book_id OR OLD.example_sentence IS NOT NEW.example_sentence OR OLD.example_meaning IS NOT NEW.example_meaning BEGIN UPDATE words SET definition_supplemented=0 WHERE id=NEW.id; END;`,
    `CREATE TRIGGER invalidate_supplement_source_entry AFTER UPDATE OF source_id,source_key,content_hash,payload_json,ready ON catalog_source_entries WHEN OLD.source_id IS NOT NEW.source_id OR OLD.source_key IS NOT NEW.source_key OR OLD.content_hash IS NOT NEW.content_hash OR OLD.payload_json IS NOT NEW.payload_json OR OLD.ready IS NOT NEW.ready BEGIN UPDATE words SET definition_supplemented=0,aichi_exam_appeared=0 WHERE id IN (SELECT word_id FROM catalog_word_definition_supplements WHERE source_entry_id=NEW.id); END;`,
    `CREATE TRIGGER invalidate_supplement_workbook_source AFTER UPDATE OF source_file,sha256,archive_json ON catalog_workbook_sources WHEN OLD.source_file IS NOT NEW.source_file OR OLD.sha256 IS NOT NEW.sha256 OR OLD.archive_json IS NOT NEW.archive_json BEGIN UPDATE words SET definition_supplemented=0,aichi_exam_appeared=0 WHERE id IN (SELECT d.word_id FROM catalog_word_definition_supplements d JOIN catalog_source_entries e ON e.id=d.source_entry_id WHERE e.source_id=NEW.id); END;`,
    `CREATE TRIGGER invalidate_supplement_archive_row AFTER UPDATE OF source_id,sheet_name,row_number,payload_json ON catalog_workbook_sheet_rows WHEN OLD.source_id IS NOT NEW.source_id OR OLD.sheet_name IS NOT NEW.sheet_name OR OLD.row_number IS NOT NEW.row_number OR OLD.payload_json IS NOT NEW.payload_json BEGIN UPDATE words SET definition_supplemented=0,aichi_exam_appeared=0 WHERE id IN (SELECT d.word_id FROM catalog_word_definition_supplements d JOIN catalog_source_entries e ON e.id=d.source_entry_id WHERE e.source_id=OLD.source_id AND json_extract(e.payload_json,'$.sourceSheet')=OLD.sheet_name AND json_extract(e.payload_json,'$.sourceRow')=OLD.row_number); END;`,
    buildNaruDefinitionSupplementSql(manifest),
  ];
  if (statements.some(statement => Buffer.byteLength(statement)>100000)) throw new Error('Supplement migration exceeds D1 statement limit');
  return statements.join('\n')+'\n';
};
