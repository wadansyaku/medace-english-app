import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const sqlPath = path.resolve(process.argv[2] || 'tmp/october-content-audit/original-workbooks.local-preview.sql');
const reportPath = path.resolve(process.argv[3] || 'tmp/october-content-audit/local-import-validation.json');
const names = (await fs.readdir('migrations')).filter((name) => name.endsWith('.sql')).sort();
const migrationSql = await Promise.all(names.map((name) => fs.readFile(path.join('migrations', name), 'utf8')));
const importSql = await fs.readFile(sqlPath, 'utf8');
if (/\b(?:DELETE|UPDATE|REPLACE)\b/i.test(importSql)) throw new Error('Validation only accepts additive workbook import SQL');
const db = new DatabaseSync(':memory:');
try {
  for (const sql of migrationSql) db.exec(sql);
  // Synthetic sentinels prove that import does not touch pre-existing data.
  db.exec(`INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES ('audit-synthetic-user','fixture@example.invalid','Synthetic fixture','STUDENT',1,1);
    INSERT INTO books(id,title,word_count,created_at,updated_at) VALUES ('audit-preserved-book','Synthetic existing book',1,1,1);
    INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES ('audit-preserved-word','audit-preserved-book',1,'keep','既存の語義を維持','keep',1,1);
    INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date) VALUES ('audit-synthetic-user','audit-preserved-word','audit-preserved-book','LEARNING',1,2);`);
  const oldWord = db.prepare("SELECT * FROM words WHERE id='audit-preserved-word'").get();
  const oldHistory = db.prepare('SELECT * FROM learning_histories').all();
  const oldUser = db.prepare('SELECT * FROM users').all();
  db.exec(importSql);
  const counts = () => Object.fromEntries(['books', 'words', 'catalog_workbook_sources', 'catalog_source_entries', 'catalog_word_source_links', 'catalog_workbook_sheet_rows', 'users', 'learning_histories'].map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
  const first = counts();
  db.exec(importSql);
  const second = counts();
  const archivedRows = db.prepare('SELECT source_id,sheet_name,row_number,payload_json FROM catalog_workbook_sheet_rows').all();
  const sourceEntries = db.prepare('SELECT source_id,payload_json FROM catalog_source_entries').all();
  const bySourceRow = new Map(archivedRows.map(row => [`${row.source_id}:${row.sheet_name}:${row.row_number}`, JSON.parse(row.payload_json)]));
  const columnLetters = (column) => {
    let value = column, result = '';
    while (value > 0) { value -= 1; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
    return result;
  };
  const sourceCoverage = db.prepare(`SELECT b.id,COUNT(w.id) AS word_count,
    SUM(CASE WHEN TRIM(COALESCE(w.source_sheet,''))<>'' AND typeof(w.source_entry_id)='integer' AND w.source_entry_id>0 THEN 1 ELSE 0 END) AS sheet_and_entry_id_count,
    COUNT(l.word_id) AS source_link_count,m.qa_source_coverage_rate
    FROM books b JOIN words w ON w.book_id=b.id JOIN material_source_ledger m ON m.book_id=b.id
    LEFT JOIN catalog_word_source_links l ON l.word_id=w.id
    WHERE b.id LIKE 'workbook-%' GROUP BY b.id ORDER BY b.id`).all();
  const checks = {
    repeatImportIdempotent: JSON.stringify(first) === JSON.stringify(second),
    existingWordUnchanged: JSON.stringify(oldWord) === JSON.stringify(db.prepare("SELECT * FROM words WHERE id='audit-preserved-word'").get()),
    existingHistoryUnchanged: JSON.stringify(oldHistory) === JSON.stringify(db.prepare('SELECT * FROM learning_histories').all()),
    existingUserUnchanged: JSON.stringify(oldUser) === JSON.stringify(db.prepare('SELECT * FROM users').all()),
    foreignKeysValid: db.prepare('PRAGMA foreign_key_check').all().length === 0,
    fourBooksImported: db.prepare("SELECT COUNT(*) AS count FROM books WHERE id LIKE 'workbook-%'").get().count === 4,
    sourceRevisionRecorded: db.prepare("SELECT COUNT(*) AS count FROM books WHERE id LIKE 'workbook-%' AND source_context LIKE '%source_revision:%'").get().count === 4,
    allReadySourceEntriesLinked: db.prepare('SELECT COUNT(*) AS count FROM catalog_source_entries e LEFT JOIN catalog_word_source_links l ON l.source_entry_id=e.id WHERE e.ready=1 AND l.word_id IS NULL').get().count === 0,
    missingMeaningRetainedOnlyInArchive: db.prepare("SELECT COUNT(*) AS count FROM catalog_source_entries WHERE ready=0").get().count === 1,
    oldClientProjectionReadable: db.prepare('SELECT id,book_id,word_number,word,definition,search_key,example_sentence,example_meaning FROM words').all().length === 1531,
    archiveCellsKeepActualRows: archivedRows.every(row => JSON.parse(row.payload_json).cells.every(cell => Number(cell.address.match(/\d+$/)?.[0]) === row.row_number)),
    sourceCoordinatesResolveToOriginalWordCells: sourceEntries.every(entry => {
      const record = JSON.parse(entry.payload_json);
      return bySourceRow.get(`${entry.source_id}:${record.sourceSheet}:${record.sourceRow}`)?.cells.some(cell => cell.address === `${columnLetters(record.sourceColumn)}${record.sourceRow}` && String(cell.value).trim() === record.word);
    }),
    archiveOriginsRecorded: db.prepare('SELECT archive_json FROM catalog_workbook_sources').all().every(row => JSON.parse(row.archive_json).every(sheet => Number.isInteger(sheet.originRow) && sheet.originRow >= 0)),
    ledgerNumericIdCoverageMeasured: sourceCoverage.every(book => book.qa_source_coverage_rate === Number((book.sheet_and_entry_id_count / book.word_count).toFixed(4))),
    sourceLinkCoverageComplete: sourceCoverage.every(book => book.source_link_count === book.word_count),
  };
  const report = { generatedAt: new Date().toISOString(), scope: 'In-memory SQLite with current migrations, original teaching content and synthetic sentinel only', appliedMigrationFiles: names, checks, counts: second,
    books: db.prepare("SELECT b.id,b.title,b.word_count,COUNT(w.id) AS actual_count FROM books b LEFT JOIN words w ON w.book_id=b.id WHERE b.id LIKE 'workbook-%' GROUP BY b.id ORDER BY b.id").all(),
    metadataCounts: db.prepare("SELECT part_of_speech,COUNT(*) AS count,SUM(inflections IS NOT NULL) AS inflection_count,SUM(pronunciation IS NOT NULL) AS pronunciation_count,SUM(source_note IS NOT NULL) AS note_count FROM words WHERE book_id LIKE 'workbook-%' GROUP BY part_of_speech ORDER BY part_of_speech").all(),
    sourceCoverage,
    sourceCoverageDefinition: 'qa_source_coverage_rate = source_sheet plus positive integer source_entry_id count / imported words. Addressed workbook coordinates and catalog_word_source_links are checked separately. Missing numeric IDs are optional and only produce a review warning; no ID is invented.',
    rollback: 'Previous application projections and existing book/word IDs stay readable; retain additive schema/source archives and switch application/catalog selection back. Correct source in a new snapshot; do not rewrite histories.',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath, checks, counts: second, books: report.books }, null, 2));
  if (Object.values(checks).some((ok) => !ok)) process.exitCode = 1;
} finally { db.close(); }
