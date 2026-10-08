import fs from 'node:fs';
import { naruSourceCorrectionGuard } from '../../shared/naruSourceCorrectionSql.mjs';
import { digest } from './original-workbook-import.mjs';
import { NARU_DEFINITION_SUPPLEMENTS } from './naru-definition-supplements.mjs';

const original = NARU_DEFINITION_SUPPLEMENTS.supplements[0];
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const changedCells = new Set(['G81', 'G82']);

/** Authorizes exactly the user-confirmed row repair, never a general workbook
 * refresh. Existing words and the old workbook/held payload are not rewritten. */
export const validateNaruAdverbSourceCorrection = (before, after) => {
  if (before.spec.key !== 'adverb' || after.spec.key !== 'adverb'
    || before.sha256 !== original.sourceSha256 || after.sha256 === before.sha256
    || !/^[a-f0-9]{64}$/.test(after.sha256)) throw new Error('Correction requires the pinned old adverb workbook and a distinct full SHA');
  if (before.sheets.length !== after.sheets.length) throw new Error('Workbook sheets changed');
  for (let i = 0; i < before.sheets.length; i += 1) {
    const oldSheet = before.sheets[i]; const newSheet = after.sheets[i];
    const expectedRows = structuredClone(oldSheet.rows);
    if (oldSheet.name === '副詞一覧') {
      if (!String(oldSheet.rows[80]?.[5] ?? '').includes('文副詞') || oldSheet.rows[80]?.[6] !== '実際には'
        || oldSheet.rows[81]?.[5] !== 'actually' || oldSheet.rows[81]?.[6] != null
        || oldSheet.rows[81]?.[7] !== original.exampleSentence) throw new Error('Original G81/G82 context mismatch');
      expectedRows[80][6] = null; expectedRows[81][6] = '実際には';
    }
    if (!same(expectedRows, newSheet.rows)) throw new Error('Only G81 to G82 value repair is allowed');
    const untouched = sheet => sheet.cells.filter(cell => !(sheet.name === '副詞一覧' && changedCells.has(cell.address)));
    if (!same(untouched(oldSheet), untouched(newSheet))) throw new Error('An unrelated cell, style or value changed');
    const metadata = ({ rows, cells, ...rest }) => rest;
    if (!same(metadata(oldSheet), metadata(newSheet))) throw new Error('Workbook range, merges or sheet metadata changed');
  }
  if (before.records.length !== 87 || after.records.length !== 87) throw new Error('Adverb candidate count changed');
  for (let i = 0; i < before.records.length; i += 1) {
    const oldRecord = before.records[i]; const newRecord = after.records[i];
    const { contentHash, ...oldPayload } = oldRecord;
    const { contentHash: newHash, ...newPayload } = newRecord;
    const expected = structuredClone(oldPayload);
    if (oldRecord.sourceKey === original.sourceKey) {
      expected.definition = '実際には'; expected.ready = true; expected.rawCells[1] = '実際には';
    }
    if (!same(expected, newPayload) || digest(JSON.stringify(newPayload)) !== newHash) throw new Error('Unexpected parsed lexical correction');
  }
  const repaired = after.records.find(record => record.sourceKey === original.sourceKey);
  if (!repaired?.ready || before.records.filter(record => record.ready).length !== 86
    || after.records.filter(record => record.ready).length !== 87) throw new Error('Correction readiness classification mismatch');
  return { originalWordId: original.wordId, wordNumber: 1361, oldSha256: before.sha256,
    correctedSha256: after.sha256, wordCount: 1531, adverbCount: 87, examCount: 638,
    sourceKey: original.sourceKey, definition: '実際には', changedCells: ['G81', 'G82'] };
};

export const createNaruAdverbSourceCorrection = (before, after, approval) => {
  const review = validateNaruAdverbSourceCorrection(before, after);
  if (!approval?.instruction || !approval?.evidence) throw new Error('Specific two-cell correction approval is required');
  const repaired = after.records.find(record => record.sourceKey === original.sourceKey);
  const { contentHash: originalContentHash, ...sourcePayload } = repaired;
  const correctedPayload = { ...sourcePayload, bookName: 'Naruシスト', originalBookName: repaired.bookName,
    originalContentHash, sourceSnapshotBookId: `workbook-adverb-${after.sha256.slice(0, 16)}` };
  const contentHash = digest(JSON.stringify(correctedPayload));
  const correctedSourceId = `xlsx-adverb-${after.sha256}`;
  const correctedSourceEntryId = `entry-${digest(`${correctedSourceId}:${original.sourceKey}`)}`;
  const archiveRows = [];
  const originalRows = new Map();
  for (const sheet of before.sheets) {
    const cellsByRow = new Map();
    for (const cell of sheet.cells) { const row=Number(cell.address.match(/\d+$/)?.[0]); cellsByRow.set(row,[...(cellsByRow.get(row)||[]),cell]); }
    sheet.rows.forEach((values,i) => { const row=i+(sheet.originRow??0)+1;originalRows.set(`${sheet.name}:${row}`,JSON.stringify({values,cells:cellsByRow.get(row)||[]})); });
  }
  for (const sheet of after.sheets) {
    const cellsByRow = new Map();
    for (const cell of sheet.cells) {
      const row = Number(cell.address.match(/\d+$/)?.[0]);
      cellsByRow.set(row, [...(cellsByRow.get(row) || []), cell]);
    }
    sheet.rows.forEach((values, i) => archiveRows.push({ sheet: sheet.name, row: i + (sheet.originRow ?? 0) + 1,
      payloadJson: JSON.stringify({ values, cells: cellsByRow.get(i + (sheet.originRow ?? 0) + 1) || [] }), originalPayloadJson: originalRows.get(`${sheet.name}:${i + (sheet.originRow ?? 0) + 1}`) }));
  }
  return { schemaVersion: 1, id: 'naru-actually-source-row-correction-v1', ...review,
    bookId: original.bookId, sourceFile: original.sourceFile, originalSourceId: original.sourceId,
    originalSourceEntryId: original.sourceEntryId, originalPayloadJson: original.originalPayloadJson,
    originalSourceContentHash: original.sourceContentHash, originalArchiveRowPayloadJson: original.originalArchiveRowPayloadJson,
    previousAppDefinition: original.definition, originalWorkbookDefinition: JSON.parse(original.originalPayloadJson).definition, exampleSentence: original.exampleSentence,
    exampleMeaning: original.exampleMeaning, originalSupplementId: original.id,
    originalRevision: original.revision, originalSupplement: original,
    originalArchiveJson: JSON.stringify(before.sheets.map(({ name, range, originRow = 0, originColumn, merges, cells }) => ({ name, range, originRow, originColumn, merges, cellCount: cells.length }))),
    correctedSourceId, correctedSourceEntryId,
    correctedSourceContentHash: contentHash, correctedPayloadJson: JSON.stringify({ ...correctedPayload, contentHash }),
    correctedArchiveJson: JSON.stringify(after.sheets.map(({ name, range, originRow = 0, originColumn, merges, cells }) => ({ name, range, originRow, originColumn, merges, cellCount: cells.length }))),
    archiveRows, approval, originalSupplementEvidence: { sheet:original.sourceSheet,wordCell:original.sourceWordCell,definitionCell:original.sourceDefinitionCell,exampleCell:original.sourceExampleCell,fillRgb:original.sourceFillRgb,originalContentHash:original.originalContentHash } };
};

export const NARU_SOURCE_CORRECTIONS = JSON.parse(fs.readFileSync(new URL('../../data/naru-source-corrections.json', import.meta.url), 'utf8'));
const sql = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
export const naruCorrectionProof = manifest => {
  const { archiveRows, ...proof } = manifest;
  return { ...proof, archiveRowCount:archiveRows.length };
};
const reviewedCorrection = manifest => {
  const canonical = NARU_SOURCE_CORRECTIONS.corrections[0];
  if (!canonical || JSON.stringify(manifest) !== JSON.stringify(canonical)) throw new Error('Pinned reviewed two-cell correction required');
  return canonical;
};
const statementLimit = statements => {
  if (statements.some(statement => Buffer.byteLength(statement)>100000)) throw new Error('Correction SQL exceeds D1 statement limit');
  return statements.map(statement => statement.startsWith('CREATE TRIGGER') ? statement.replaceAll('\n',' ') : statement).join('\n')+'\n';
};
export const buildNaruSourceCorrectionStageSql = (manifest = NARU_SOURCE_CORRECTIONS.corrections[0]) => {
  const m=reviewedCorrection(manifest);
  const statements=[];
  const append = (table, columns, values, guard) => statements.push(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${values.map(sql).join(',')} WHERE ${guard} ON CONFLICT DO NOTHING;`);
  append('catalog_workbook_sources',['id','series_key','source_file','sha256','archive_json','created_at'],[m.correctedSourceId,'adverb','adverb_list.xlsx',m.correctedSha256,m.correctedArchiveJson,1],`EXISTS(SELECT 1 FROM catalog_workbook_sources WHERE id=${sql(m.originalSourceId)} AND sha256=${sql(m.oldSha256)})`);
  for(const row of m.archiveRows) append('catalog_workbook_sheet_rows',['source_id','sheet_name','row_number','payload_json'],[m.correctedSourceId,row.sheet,row.row,row.payloadJson],`EXISTS(SELECT 1 FROM catalog_workbook_sources WHERE id=${sql(m.correctedSourceId)} AND sha256=${sql(m.correctedSha256)} AND archive_json=${sql(m.correctedArchiveJson)})`);
  append('catalog_source_entries',['id','source_id','source_key','content_hash','payload_json','ready'],[m.correctedSourceEntryId,m.correctedSourceId,m.sourceKey,m.correctedSourceContentHash,m.correctedPayloadJson,1],`EXISTS(SELECT 1 FROM catalog_workbook_sources WHERE id=${sql(m.correctedSourceId)} AND sha256=${sql(m.correctedSha256)})`);
  return '-- Append-only correction source staging. No word, link or approval changes.\n'+statementLimit(statements);
};
export const buildNaruSourceCorrectionSql = (manifest = NARU_SOURCE_CORRECTIONS.corrections[0]) => {
  const m=reviewedCorrection(manifest), proof=JSON.stringify(naruCorrectionProof(m));
  return statementLimit([`INSERT INTO catalog_word_source_corrections(id,word_id,original_source_entry_id,corrected_source_entry_id,proof_json,applied_at) SELECT ${sql(m.id)},${sql(m.originalWordId)},${sql(m.originalSourceEntryId)},${sql(m.correctedSourceEntryId)},${sql(proof)},0 FROM (SELECT ${sql(proof)} AS payload) x WHERE (${naruSourceCorrectionGuard()}) ON CONFLICT DO NOTHING;`]);
};
export const buildNaruSourceCorrectionPreflightSql = () => {
  const m=reviewedCorrection(NARU_SOURCE_CORRECTIONS.corrections[0]), proof=JSON.stringify(naruCorrectionProof(m));
  return `WITH expected(payload) AS(SELECT ${sql(proof)}) SELECT (${naruSourceCorrectionGuard()}) AS eligible,(SELECT COUNT(*) FROM words WHERE book_id='naru-shisto-original-v1') AS wordCount FROM expected x;\n`;
};
export const buildNaruSourceCorrectionMigrationSql = (manifest = NARU_SOURCE_CORRECTIONS.corrections[0]) => {
  const m=reviewedCorrection(manifest), proof=JSON.stringify(naruCorrectionProof(m));
  const statements=[
    '-- Two-cell user-approved source correction. Historical sources and application supplement ledger remain unchanged.',
    'ALTER TABLE words ADD COLUMN example_meaning_supplemented INTEGER NOT NULL DEFAULT 0 CHECK(example_meaning_supplemented IN(0,1));',
    'CREATE TABLE catalog_source_correction_archive_evidence(correction_id TEXT NOT NULL,sheet_name TEXT NOT NULL,row_number INTEGER NOT NULL,original_payload_json TEXT NOT NULL,corrected_payload_json TEXT NOT NULL,PRIMARY KEY(correction_id,sheet_name,row_number));',
    `CREATE TRIGGER immutable_correction_archive_evidence_update BEFORE UPDATE ON catalog_source_correction_archive_evidence BEGIN SELECT RAISE(ABORT,'Correction evidence is immutable'); END;`,
    `CREATE TRIGGER immutable_correction_archive_evidence_delete BEFORE DELETE ON catalog_source_correction_archive_evidence BEGIN SELECT RAISE(ABORT,'Correction evidence is immutable'); END;`,
    'CREATE TABLE catalog_word_source_corrections(id TEXT PRIMARY KEY,word_id TEXT NOT NULL UNIQUE REFERENCES words(id),original_source_entry_id TEXT NOT NULL REFERENCES catalog_source_entries(id),corrected_source_entry_id TEXT NOT NULL UNIQUE REFERENCES catalog_source_entries(id),proof_json TEXT NOT NULL CHECK(json_valid(proof_json)),applied_at INTEGER NOT NULL DEFAULT 0);',
    'CREATE TABLE catalog_word_source_correction_invalidations(correction_id TEXT PRIMARY KEY REFERENCES catalog_word_source_corrections(id),reason TEXT NOT NULL,invalidated_at INTEGER NOT NULL);',
  ];
  for(const row of m.archiveRows) statements.push(`INSERT INTO catalog_source_correction_archive_evidence VALUES(${[m.id,row.sheet,row.row,row.originalPayloadJson,row.payloadJson].map(sql).join(',')});`);
  statements.push(`CREATE TRIGGER apply_naru_source_correction AFTER INSERT ON catalog_word_source_corrections BEGIN SELECT RAISE(ABORT,'Correction source mismatch') WHERE NEW.id<>${sql(m.id)} OR NEW.word_id<>${sql(m.originalWordId)} OR NEW.original_source_entry_id<>${sql(m.originalSourceEntryId)} OR NEW.corrected_source_entry_id<>${sql(m.correctedSourceEntryId)} OR NEW.proof_json<>${sql(proof)} OR NOT (${naruSourceCorrectionGuard({phase:'pending',payload:'NEW.proof_json'})}); UPDATE words SET definition='実際には',definition_supplemented=0,example_meaning_supplemented=1 WHERE id=NEW.word_id; UPDATE words SET aichi_exam_appeared=1 WHERE id=NEW.word_id; UPDATE books SET description='動詞・名詞・副詞・形容詞を一冊にまとめた原本教材。語義と英例文は原本に対応しています。actuallyの日本語例文訳のみアプリ補完です。' WHERE id='naru-shisto-original-v1'; UPDATE catalog_word_source_corrections SET applied_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=NEW.id; END;`);
  const invalidate=(name, table, event, condition, match) => statements.push(`CREATE TRIGGER ${name} ${event} ON ${table} ${condition ? 'WHEN '+condition : ''} BEGIN INSERT OR IGNORE INTO catalog_word_source_correction_invalidations SELECT c.id,${sql(name)},CAST(strftime('%s','now') AS INTEGER)*1000 FROM catalog_word_source_corrections c WHERE c.applied_at>0 AND (${match}); END;`);
  invalidate('invalidate_naru_correction_word','words','AFTER UPDATE OF word,definition,book_id,word_number,part_of_speech,source_sheet,source_entry_id,example_sentence,example_meaning','OLD.word IS NOT NEW.word OR OLD.definition IS NOT NEW.definition OR OLD.book_id IS NOT NEW.book_id OR OLD.word_number IS NOT NEW.word_number OR OLD.part_of_speech IS NOT NEW.part_of_speech OR OLD.source_sheet IS NOT NEW.source_sheet OR OLD.source_entry_id IS NOT NEW.source_entry_id OR OLD.example_sentence IS NOT NEW.example_sentence OR OLD.example_meaning IS NOT NEW.example_meaning','c.word_id=NEW.id');
  for(const [suffix,event] of [['update','AFTER UPDATE'],['delete','BEFORE DELETE']]){
    invalidate(`invalidate_naru_correction_entry_${suffix}`,'catalog_source_entries',event,'',"OLD.id IN(c.original_source_entry_id,c.corrected_source_entry_id)");
    invalidate(`invalidate_naru_correction_source_${suffix}`,'catalog_workbook_sources',event,'',"OLD.id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId'))");
    invalidate(`invalidate_naru_correction_archive_${suffix}`,'catalog_workbook_sheet_rows',event,'',"OLD.source_id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId'))");
    invalidate(`invalidate_naru_correction_link_${suffix}`,'catalog_word_source_links',event,'','OLD.word_id=c.word_id');
  }
  invalidate('invalidate_naru_correction_entry_insert','catalog_source_entries','AFTER INSERT','',"NEW.source_id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId'))");
  invalidate('invalidate_naru_correction_archive_insert','catalog_workbook_sheet_rows','AFTER INSERT','',"NEW.source_id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId'))");
  invalidate('invalidate_naru_correction_ledger','catalog_word_source_corrections','AFTER UPDATE OF word_id,original_source_entry_id,corrected_source_entry_id,proof_json','OLD.word_id IS NOT NEW.word_id OR OLD.original_source_entry_id IS NOT NEW.original_source_entry_id OR OLD.corrected_source_entry_id IS NOT NEW.corrected_source_entry_id OR OLD.proof_json IS NOT NEW.proof_json','c.id=OLD.id');
  invalidate('invalidate_naru_correction_approval','material_source_ledger','AFTER UPDATE OF edition,rights_status,review_status,book_id','OLD.edition IS NOT NEW.edition OR OLD.rights_status IS NOT NEW.rights_status OR OLD.review_status IS NOT NEW.review_status OR OLD.book_id IS NOT NEW.book_id',"json_extract(c.proof_json,'$.bookId')=OLD.book_id");
  invalidate('invalidate_naru_correction_link_insert','catalog_word_source_links','AFTER INSERT','','NEW.word_id=c.word_id');
  statements.push('CREATE TRIGGER clear_naru_correction_flags AFTER INSERT ON catalog_word_source_correction_invalidations BEGIN UPDATE words SET aichi_exam_appeared=0,example_meaning_supplemented=0 WHERE id=(SELECT word_id FROM catalog_word_source_corrections WHERE id=NEW.correction_id); END;');
  statements.push('CREATE TRIGGER preserve_naru_correction_history BEFORE DELETE ON catalog_word_source_corrections BEGIN SELECT RAISE(ABORT,\'Correction history is immutable\'); END;');
  statements.push('CREATE TRIGGER refuse_invalidated_naru_correction_flags AFTER UPDATE OF aichi_exam_appeared,example_meaning_supplemented ON words WHEN (NEW.aichi_exam_appeared<>0 OR NEW.example_meaning_supplemented<>0) AND EXISTS(SELECT 1 FROM catalog_word_source_corrections c JOIN catalog_word_source_correction_invalidations i ON i.correction_id=c.id WHERE c.word_id=NEW.id) BEGIN UPDATE words SET aichi_exam_appeared=0,example_meaning_supplemented=0 WHERE id=NEW.id; END;');
  // Migration runs before Pages deployment: stage only. Apply explicitly after
  // the compatible backend has been deployed; never change the old guest word.
  return statementLimit(statements)+buildNaruSourceCorrectionStageSql(m);
};

/** Additive repair for 0059. Preserve the historical generator above byte-for-
 * byte: validity invalidation and saved example-translation provenance differ. */
export const buildNaruSourceCorrectionMaintenanceMigrationSql = (manifest = NARU_SOURCE_CORRECTIONS.corrections[0]) => {
  const m=reviewedCorrection(manifest),proof=JSON.stringify(naruCorrectionProof(m));
  const statements=['-- Repair correction UPDATE no-ops and retain saved application-example provenance. No source/archive/ledger/history deletion.'];
  const materialUpdates=[
    ['entry','catalog_source_entries',['id','source_id','source_key','content_hash','payload_json','ready'],"OLD.id IN(c.original_source_entry_id,c.corrected_source_entry_id) OR NEW.id IN(c.original_source_entry_id,c.corrected_source_entry_id)"],
    ['source','catalog_workbook_sources',['id','series_key','source_file','sha256','archive_json'],"OLD.id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId')) OR NEW.id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId'))"],
    ['archive','catalog_workbook_sheet_rows',['source_id','sheet_name','row_number','payload_json'],"OLD.source_id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId')) OR NEW.source_id IN(json_extract(c.proof_json,'$.originalSourceId'),json_extract(c.proof_json,'$.correctedSourceId'))"],
    ['link','catalog_word_source_links',['source_entry_id','word_id','match_kind'],'OLD.word_id=c.word_id OR NEW.word_id=c.word_id'],
  ];
  for(const [suffix,table,columns,match] of materialUpdates){
    const name=`invalidate_naru_correction_${suffix}_update`;
    statements.push(`DROP TRIGGER ${name};`);
    statements.push(`CREATE TRIGGER ${name} AFTER UPDATE OF ${columns.join(',')} ON ${table} WHEN ${columns.map(column=>`OLD.${column} IS NOT NEW.${column}`).join(' OR ')} BEGIN INSERT OR IGNORE INTO catalog_word_source_correction_invalidations SELECT c.id,${sql(name)},CAST(strftime('%s','now') AS INTEGER)*1000 FROM catalog_word_source_corrections c WHERE c.applied_at>0 AND (${match}); END;`);
  }
  statements.push('DROP TRIGGER clear_naru_correction_flags;');
  statements.push('CREATE TRIGGER clear_naru_correction_flags AFTER INSERT ON catalog_word_source_correction_invalidations BEGIN UPDATE words SET aichi_exam_appeared=0 WHERE id=(SELECT word_id FROM catalog_word_source_corrections WHERE id=NEW.correction_id); END;');
  statements.push('DROP TRIGGER refuse_invalidated_naru_correction_flags;');
  statements.push('CREATE TRIGGER refuse_invalidated_naru_correction_flags AFTER UPDATE OF aichi_exam_appeared ON words WHEN NEW.aichi_exam_appeared<>0 AND EXISTS(SELECT 1 FROM catalog_word_source_corrections c JOIN catalog_word_source_correction_invalidations i ON i.correction_id=c.id WHERE c.word_id=NEW.id) BEGIN UPDATE words SET aichi_exam_appeared=0 WHERE id=NEW.id; END;');
  // Only the fixed, previously applied, exact historical ledger may establish
  // provenance. This never changes validity, source proof or exam appearance.
  const origin=`EXISTS(SELECT 1 FROM catalog_word_source_corrections c WHERE c.id=${sql(m.id)} AND c.word_id=${sql(m.originalWordId)} AND c.original_source_entry_id=${sql(m.originalSourceEntryId)} AND c.corrected_source_entry_id=${sql(m.correctedSourceEntryId)} AND c.proof_json=${sql(proof)} AND c.applied_at>0)`;
  statements.push(`CREATE TRIGGER preserve_naru_correction_example_origin AFTER UPDATE OF example_meaning,example_meaning_supplemented ON words WHEN NEW.id=${sql(m.originalWordId)} AND NEW.example_meaning=${sql(m.exampleMeaning)} AND NEW.example_meaning_supplemented<>1 AND ${origin} BEGIN UPDATE words SET example_meaning_supplemented=1 WHERE id=NEW.id; END;`);
  statements.push(`CREATE TRIGGER clear_changed_naru_correction_example_origin AFTER UPDATE OF example_meaning,example_meaning_supplemented ON words WHEN NEW.id=${sql(m.originalWordId)} AND NEW.example_meaning IS NOT ${sql(m.exampleMeaning)} AND NEW.example_meaning_supplemented<>0 AND ${origin} BEGIN UPDATE words SET example_meaning_supplemented=0 WHERE id=NEW.id; END;`);
  // Repair only the lost label for the same saved canonical translation; an
  // edited/mismatching ledger or changed example is deliberately not healed.
  statements.push(`UPDATE words SET example_meaning_supplemented=1 WHERE id=${sql(m.originalWordId)} AND example_meaning=${sql(m.exampleMeaning)} AND example_meaning_supplemented=0 AND ${origin};`);
  return statementLimit(statements);
};
