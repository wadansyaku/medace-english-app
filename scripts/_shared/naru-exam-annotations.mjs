import fs from 'node:fs';
import { text } from './original-workbook-import.mjs';
import { NARU_BOOK_ID } from './naru-workbook-import.mjs';

export const AICHI_EXAM_KIND = 'AICHI_HIGH_SCHOOL_ENTRANCE';
export const ORIGINAL_EXAM_SHA256 = Object.freeze({
  verb: '5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b',
  noun: '48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d',
  adverb: '78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a',
  adjective: 'e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4',
});
const letters = n => { let result = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; };
const bright = cell => cell?.style?.patternType === 'solid'
  && ['FFFF00', 'FFFFFF00'].includes(cell.style.fgColor?.rgb?.toUpperCase())
  && !cell.style.fgColor?.tint && cell.style.fgColor?.theme == null;
const sql = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;

// The user supplied the yellow=Aichi convention. Color is not used to infer a
// year/frequency. Pin the audited files: theme/conditional-format changes need a
// new review, rather than silently interpreting a different workbook.
export const auditNaruExamAnnotations = workbooks => {
  const marks = []; const held = []; const unresolved = [];
  for (const workbook of workbooks) {
    if (workbook.sha256 !== ORIGINAL_EXAM_SHA256[workbook.spec.key]) throw new Error('Exam annotation source SHA changed; re-audit required');
    const bySheet = new Map(workbook.sheets.map(sheet => [sheet.name, new Map(sheet.cells.map(cell => [cell.address, cell]))]));
    const marked = new Set();
    const add = (record, sheet, cell, matchKind) => {
      if (marked.has(record.sourceKey)) return;
      marked.add(record.sourceKey);
      const entry = { sourceFile: workbook.spec.file, sourceSha256: workbook.sha256,
        sourceKey: record.sourceKey, word: record.word, definition: record.definition,
        partOfSpeech: record.partOfSpeech, sourceSheet: record.sourceSheet,
        sourceRow: record.sourceRow, sourceColumn: record.sourceColumn,
        evidenceSheet: sheet, evidenceCell: cell.address,
        evidenceRow: Number(cell.address.match(/\d+$/)[0]), fillRgb: 'FFFF00', matchKind };
      (record.ready ? marks : held).push(entry);
    };
    for (const record of workbook.records) {
      const cell = bySheet.get(record.sourceSheet)?.get(`${letters(record.sourceColumn)}${record.sourceRow}`);
      if (bright(cell) && text(cell.value) === record.word) add(record, record.sourceSheet, cell, 'word_cell');
    }
    for (const index of workbook.indexEntries) {
      const cell = bySheet.get(index.sourceSheet)?.get(`${letters(index.sourceColumn)}${index.sourceRow}`);
      if (!bright(cell)) continue;
      // Exact trimmed text, not substring/synonym/stemming. A single original
      // entry of this POS is required; homographs never inherit all meanings.
      const candidates = workbook.records.filter(record => record.word === text(cell.value));
      if (candidates.length === 1) add(candidates[0], index.sourceSheet, cell, 'unique_index');
      else unresolved.push({ sourceFile: workbook.spec.file, sheet: index.sourceSheet, cell: cell.address,
        word: text(cell.value), reason: candidates.length ? 'AMBIGUOUS_MEANING' : 'NO_CONTENT_ENTRY',
        candidateSourceKeys: candidates.map(record => record.sourceKey) });
    }
  }
  return { schemaVersion: 1, kind: AICHI_EXAM_KIND, attribution: 'User confirmed original bright-yellow cells mean Aichi entrance-exam appearances',
    sources: workbooks.map(w => ({ file: w.spec.file, sha256: w.sha256 })), marks, held, unresolved };
};

// Generated application artifacts must match the reviewed snapshot classification,
// including the exact held missing definition; counts alone cannot detect a
// misplaced mark or a different homograph with the same totals.
export const validateNaruExamClassification = audit => {
  const expected = JSON.parse(fs.readFileSync(new URL('../../data/naru-aichi-exam-annotations.json', import.meta.url), 'utf8'));
  const canonical = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const classification = value => ({ kind: value.kind, sources: value.sources,
    marks: value.marks, held: value.held, unresolved: value.unresolved });
  if (audit.marks.length !== 637 || audit.held.length !== 1
    || canonical(classification(audit)) !== canonical(classification(expected))) {
    throw new Error('Reviewed exam classification changed; re-audit required before generating application SQL');
  }
  return { originalReadyMarks: audit.marks.length, originalMissingDefinitions: audit.held.length,
    direct: audit.marks.filter(mark => mark.matchKind === 'word_cell').length,
    uniqueIndex: audit.marks.filter(mark => mark.matchKind === 'unique_index').length,
    unresolvedCells: audit.unresolved.length };
};

// Add metadata only to the exact Naru source link and unchanged playable entry.
// The original archive must still contain the selected bright word cell. The
// original user-approved book gate is independent and is never modified here.
export const buildNaruExamAnnotationSql = audit => {
  if (audit.kind !== AICHI_EXAM_KIND || audit.marks.some(m => ORIGINAL_EXAM_SHA256[m.partOfSpeech] !== m.sourceSha256)) throw new Error('Reviewed exam sources required');
  const statements = ['-- Source-coordinate metadata only. No book access/approval, word content or study history changes.'];
  for (let offset = 0; offset < audit.marks.length; offset += 80) {
    const marks = audit.marks.slice(offset, offset + 80);
    const columns = ['source_file', 'sha256', 'source_key', 'word', 'definition', 'pos', 'source_sheet', 'source_row', 'source_column', 'evidence_sheet', 'evidence_cell', 'evidence_row', 'match_kind'];
    const values = marks.map(m => [m.sourceFile, m.sourceSha256, m.sourceKey, m.word, m.definition, m.partOfSpeech, m.sourceSheet, m.sourceRow, m.sourceColumn, m.evidenceSheet, m.evidenceCell, m.evidenceRow, m.matchKind].map(sql).join(',')).map(row => `(${row})`).join(',\n');
    statements.push(`WITH marks(${columns.join(',')}) AS (VALUES\n${values}\n)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,${sql(AICHI_EXAM_KIND)},e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id=${sql(NARU_BOOK_ID)}
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;`);
  }
  // Revalidate archived entry content on every application, including an edited
  // word that still retains historical annotation evidence.
  statements.push(`UPDATE words SET aichi_exam_appeared=1 WHERE book_id=${sql(NARU_BOOK_ID)} AND EXISTS(
 SELECT 1 FROM catalog_word_exam_annotations a JOIN catalog_source_entries e ON e.id=a.source_entry_id
 JOIN catalog_word_source_links l ON l.source_entry_id=e.id AND l.word_id=words.id
 WHERE a.word_id=words.id AND a.kind=${sql(AICHI_EXAM_KIND)} AND e.ready=1
 AND json_extract(e.payload_json,'$.word')=words.word AND json_extract(e.payload_json,'$.definition')=words.definition
 AND json_extract(e.payload_json,'$.partOfSpeech')=words.part_of_speech AND json_extract(e.payload_json,'$.sourceSheet')=words.source_sheet
 AND words.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId'));`);
  if (statements.some(statement => Buffer.byteLength(statement) > 100000)) throw new Error('Annotation SQL exceeds D1 statement limit');
  return statements.join('\n') + '\n';
};
