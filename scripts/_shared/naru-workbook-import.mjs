import { digest, lookup, measureOriginalSourceCoverage, ORIGINAL_WORKBOOKS, workbookBookId } from './original-workbook-import.mjs';

export const NARU_BOOK_ID = 'naru-shisto-original-v1';
export const NARU_BOOK_TITLE = 'Naruシスト';
const sqlValue = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const fraction = (n, total) => total ? Number((n / total).toFixed(4)) : 0;

// Produce a new, append-only book. Existing four-book imports require a
// separately reviewed history migration and are deliberately rejected here.
export const createNaruWorkbookImport = (workbooks, { timestamp = Date.now(), accessScope = 'PUBLIC' } = {}) => {
  if (workbooks.length !== ORIGINAL_WORKBOOKS.length || new Set(workbooks.map(w => w.spec.key)).size !== 4) throw new Error('All four original workbooks are required');
  if (!['PUBLIC', 'BUSINESS_ONLY'].includes(accessScope)) throw new Error('Invalid access scope');
  const ordered = ORIGINAL_WORKBOOKS.map(spec => {
    const workbook = workbooks.find(w => w.spec.key === spec.key);
    if (!workbook || workbook.spec.file !== spec.file || !/^[a-f0-9]{64}$/.test(workbook.sha256)) throw new Error('Known workbook and full SHA required');
    if (workbook.records.some(r => r.partOfSpeech !== spec.key)) throw new Error('Part of speech does not match the original');
    for (const record of workbook.records) {
      const { contentHash, ...payload } = record;
      if (digest(JSON.stringify(payload)) !== contentHash) throw new Error('Original payload hash mismatch');
    }
    return workbook;
  });
  const revision = digest(JSON.stringify(ordered.map(w => [w.spec.key, w.sha256])));
  const ready = ordered.flatMap(w => w.records.filter(r => r.ready));
  if (!ready.length || new Set(ordered.flatMap(w => w.records.map(r => r.sourceKey))).size !== ordered.reduce((n, w) => n + w.records.length, 0)) throw new Error('Empty or duplicate source entries');
  if (ready.some(r => !r.word.trim() || !r.definition.trim())) throw new Error('Blank playable content');
  const tables = {};
  const add = (table, row) => { (tables[table] ||= []).push(row); };
  const description = '動詞・名詞・副詞・形容詞を一冊にまとめた原本教材。語義・例文・活用・注記を原本どおり保持しています。意味が未記載の1項目は確認待ちとして学習対象から外しています。';
  add('books', { id: NARU_BOOK_ID, title: NARU_BOOK_TITLE, word_count: 0, is_priority: 0, description, source_context: `original-workbooks:${revision}`, created_by: null, catalog_source: 'STEADY_STUDY_ORIGINAL', access_scope: accessScope, created_at: timestamp, updated_at: timestamp });
  const sourceCount = ordered.reduce((n, w) => n + measureOriginalSourceCoverage(w.records.filter(r => r.ready), w.sheets).sheetAndEntryIdCount, 0);
  add('material_source_ledger', { source_id: `ledger-${NARU_BOOK_ID}`, book_id: NARU_BOOK_ID, catalog_source: 'STEADY_STUDY_ORIGINAL', book_title: NARU_BOOK_TITLE, edition: revision, rights_status: 'pending', review_status: 'needs_review', source_file: ordered.map(w => w.spec.file).join(';'), extracted_at: new Date(timestamp).toISOString(), transform_log: 'scripts/import-naru-workbooks.mjs', content_qa_report: 'naru-workbook-manifest.json', qa_word_count: ready.length, qa_required_blank_rows: 0, qa_rows_with_sentinel: 0, qa_sentinel_value_count: 0, qa_duplicate_headword_count: ready.length - new Set(ready.map(r => lookup(r.word))).size, qa_source_coverage_rate: fraction(sourceCount, ready.length), qa_example_pair_coverage_rate: fraction(ready.filter(r => r.exampleSentence && r.exampleMeaning).length, ready.length), notes: '原本4点を一冊化。別義・品詞・索引・修正ログ・座標・原本SHAを保持。actuallyの欠訳1件は保留。承認は全行検証後の別工程。', created_at: timestamp, updated_at: timestamp });
  let number = 0;
  const chapters = [];
  for (const workbook of ordered) {
    const sourceId = `xlsx-${workbook.spec.key}-${workbook.sha256}`;
    const start = number + 1;
    add('catalog_workbook_sources', { id: sourceId, series_key: workbook.spec.key, source_file: workbook.spec.file, sha256: workbook.sha256, archive_json: JSON.stringify(workbook.sheets.map(({ name, range, originRow = 0, originColumn, merges, cells }) => ({ name, range, originRow, originColumn, merges, cellCount: cells.length }))), created_at: timestamp });
    for (const sheet of workbook.sheets) {
      const cellsByRow = new Map();
      for (const cell of sheet.cells) {
        const row = Number(cell.address.match(/\d+$/)?.[0]);
        cellsByRow.set(row, [...(cellsByRow.get(row) || []), cell]);
      }
      sheet.rows.forEach((values, i) => {
        const row = i + (sheet.originRow ?? 0) + 1;
        add('catalog_workbook_sheet_rows', { source_id: sourceId, sheet_name: sheet.name, row_number: row, payload_json: JSON.stringify({ values, cells: cellsByRow.get(row) || [] }) });
      });
    }
    for (const original of workbook.records) {
      const { contentHash: originalContentHash, ...sourcePayload } = original;
      const payload = { ...sourcePayload, bookName: NARU_BOOK_TITLE, originalBookName: original.bookName, originalContentHash, sourceSnapshotBookId: workbookBookId(workbook) };
      const contentHash = digest(JSON.stringify(payload));
      const record = { ...payload, contentHash };
      const entryId = `entry-${digest(`${sourceId}:${record.sourceKey}`)}`;
      add('catalog_source_entries', { id: entryId, source_id: sourceId, source_key: record.sourceKey, content_hash: contentHash, payload_json: JSON.stringify(record), ready: record.ready ? 1 : 0 });
      if (!record.ready) continue;
      // IDs are the same stable source-coordinate IDs as the old local snapshot.
      const wordId = `${workbookBookId(workbook)}-${digest(record.sourceKey).slice(0, 20)}`;
      add('words', { id: wordId, book_id: NARU_BOOK_ID, word_number: ++number, word: record.word, definition: record.definition, search_key: lookup(record.word), category: record.category, subcategory: record.subcategory, section: record.section, source_sheet: record.sourceSheet, source_entry_id: record.sourceEntryId, example_sentence: record.exampleSentence, example_meaning: record.exampleMeaning, part_of_speech: record.partOfSpeech, inflections: record.inflections, pronunciation: record.pronunciation, source_note: record.sourceNote, is_reported: 0, created_at: timestamp, updated_at: timestamp });
      add('catalog_word_source_links', { source_entry_id: entryId, word_id: wordId, match_kind: 'snapshot_import' });
    }
    chapters.push({ partOfSpeech: workbook.spec.key, start, end: number, count: number - start + 1 });
  }
  return { bookId: NARU_BOOK_ID, title: NARU_BOOK_TITLE, revision, timestamp, tables, chapters, legacyBookIds: ordered.map(workbookBookId), wordCount: number, held: ordered.flatMap(w => w.records.filter(r => !r.ready).map(r => ({ sourceKey: r.sourceKey, word: r.word, reason: w.issues.filter(issue => issue.sourceKey === r.sourceKey && issue.severity === 'blocking').map(issue => issue.code) }))), sources: ordered.map(w => ({ key: w.spec.key, file: w.spec.file, sha256: w.sha256 })) };
};

const policies = {
  books: { pk: ['id'], guard: 'title', mutable: ['created_at', 'updated_at', 'word_count'] },
  material_source_ledger: { pk: ['source_id'], guard: 'book_title', mutable: ['created_at', 'updated_at', 'extracted_at', 'rights_status', 'review_status', 'notes'] },
  catalog_workbook_sources: { pk: ['id'], guard: 'archive_json', mutable: ['created_at'] },
  catalog_workbook_sheet_rows: { pk: ['source_id', 'sheet_name', 'row_number'], guard: 'payload_json', mutable: [] },
  catalog_source_entries: { pk: ['id'], guard: 'content_hash', mutable: [] },
  words: { pk: ['id'], guard: 'definition', mutable: ['created_at', 'updated_at', 'is_reported'] },
  catalog_word_source_links: { pk: ['source_entry_id'], guard: 'match_kind', mutable: [] },
};
const immutableMatches = (table, columns) => columns.filter(c => !policies[table].mutable.includes(c)).map(c => `${table}.${c} IS excluded.${c}`).join(' AND ');
const guardedInsert = (table, row, condition = '1') => {
  const { pk, guard } = policies[table];
  const columns = Object.keys(row);
  const values = columns.map(c => c === guard ? `CASE WHEN ${condition} THEN ${sqlValue(row[c])} ELSE NULL END` : sqlValue(row[c]));
  const policy = table === 'material_source_ledger' ? ` AND ${table}.rights_status IN ('pending','approved') AND ${table}.review_status IN ('needs_review','approved')` : '';
  return `INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.join(',')}) ON CONFLICT (${pk.join(',')}) DO UPDATE SET ${guard}=CASE WHEN ${immutableMatches(table, columns)}${policy} THEN ${table}.${guard} ELSE NULL END;`;
};

export const buildNaruStageSql = (model, { requireComplete = false } = {}) => {
  const legacy = model.legacyBookIds.map(sqlValue).join(',');
  const counts = requireComplete ? naruImportQueries(model).map(({ table, sql }) => `(${sql.replace('SELECT *', 'SELECT COUNT(*)').replace(/;$/, '')})=${model.tables[table].length}`).join(' AND ') : '1';
  const conflict = `NOT EXISTS (SELECT 1 FROM books WHERE id IN (${legacy}) OR (title=${sqlValue(model.title)} AND id<>${sqlValue(model.bookId)})) AND NOT EXISTS (SELECT 1 FROM words WHERE book_id IN (${legacy})) AND (${counts})`;
  const statements = ['-- Private source import: apply 0043, verify backup and target first. No BEGIN/COMMIT for D1 file import.', 'PRAGMA foreign_keys=ON;'];
  for (const [table, rows] of Object.entries(model.tables)) for (const row of rows) statements.push(guardedInsert(table, row, table === 'books' ? conflict : '1'));
  statements.push(`UPDATE books SET word_count=${model.wordCount} WHERE id=${sqlValue(model.bookId)} AND (SELECT COUNT(*) FROM words WHERE book_id=${sqlValue(model.bookId)})=${model.wordCount};`);
  for (const statement of statements) if (Buffer.byteLength(statement) > 100000) throw new Error('SQL statement exceeds D1 limit');
  return `${statements.join('\n')}\n`;
};

// Read-back verification includes every original archive row, payload, link and
// playable field. Timestamps, approval decisions and report flags are preserved.
export const verifyNaruImportRows = (model, actual) => {
  for (const [table, expected] of Object.entries(model.tables)) {
    const rows = actual[table];
    if (!Array.isArray(rows) || rows.length !== expected.length) throw new Error(`${table}: row count mismatch`);
    const { pk, mutable } = policies[table];
    const key = row => JSON.stringify(pk.map(c => row[c]));
    const byKey = new Map(rows.map(row => [key(row), row]));
    for (const row of expected) {
      const found = byKey.get(key(row));
      if (!found || Object.entries(row).some(([c, value]) => !mutable.includes(c) && found[c] !== value)) throw new Error(`${table}: immutable content mismatch`);
    }
  }
  const book = actual.books[0];
  const ledger = actual.material_source_ledger[0];
  if (book.word_count !== model.wordCount || !['pending', 'approved'].includes(ledger.rights_status) || !['needs_review', 'approved'].includes(ledger.review_status)) throw new Error('Book incomplete or approval decision changed');
  return { wordCount: model.wordCount, sourceCount: model.sources.length, sourceEntryCount: actual.catalog_source_entries.length, heldCount: model.held.length, verified: true };
};

export const buildNaruApprovalSql = (model, approvalNote, timestamp = Date.now()) => {
  if (!approvalNote?.trim()) throw new Error('Explicit approval basis required');
  const id = sqlValue(model.bookId);
  const expected = model.tables.material_source_ledger[0];
  const ledgerChecks = Object.entries(expected).filter(([c]) => !policies.material_source_ledger.mutable.includes(c) && c !== 'notes').map(([c, value]) => `${c} IS ${sqlValue(value)}`).join(' AND ');
  const finalCounts = naruImportQueries(model).map(({ table, sql }) => `(${sql.replace('SELECT *', 'SELECT COUNT(*)').replace(/;$/, '')})=${model.tables[table].length}`).join(' AND ');
  const proof = `(${ledgerChecks}) AND (${finalCounts}) AND rights_status IN ('pending','approved') AND review_status IN ('needs_review','approved') AND (SELECT word_count FROM books WHERE id=${id})=${model.wordCount}`;
  // Reassert every immutable row in the same D1 file import before approval,
  // closing the gap between a read-back and the separate approval operation.
  // The caller must check the final RETURNING row and read back approved status.
  return `${buildNaruStageSql(model, { requireComplete: true })}UPDATE material_source_ledger SET review_status=CASE WHEN ${proof} THEN 'approved' ELSE NULL END,rights_status='approved',notes=${sqlValue(`${expected.notes} 公開承認根拠: ${approvalNote.trim()}`)},updated_at=${timestamp} WHERE source_id=${sqlValue(expected.source_id)} AND book_id=${id} RETURNING book_id,edition,rights_status,review_status;\n`;
};

export const naruImportQueries = model => Object.entries(model.tables).map(([table]) => {
  const sourceIds = model.tables.catalog_workbook_sources.map(row => sqlValue(row.id)).join(',');
  const clauses = {
    books: `id=${sqlValue(model.bookId)}`, material_source_ledger: `book_id=${sqlValue(model.bookId)}`,
    words: `book_id=${sqlValue(model.bookId)}`, catalog_workbook_sources: `id IN (${sourceIds})`,
    catalog_workbook_sheet_rows: `source_id IN (${sourceIds})`, catalog_source_entries: `source_id IN (${sourceIds})`,
    catalog_word_source_links: `source_entry_id IN (SELECT id FROM catalog_source_entries WHERE source_id IN (${sourceIds}))`,
  };
  return { table, sql: `SELECT * FROM ${table} WHERE ${clauses[table]};` };
});
