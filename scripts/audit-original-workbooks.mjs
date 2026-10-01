import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  ORIGINAL_WORKBOOKS, archiveWorkbook, buildOriginalWorkbookSql,
  compareOriginalCatalog, digest, parseOriginalWorkbook, workbookBookId,
} from './_shared/original-workbook-import.mjs';

const args = process.argv.slice(2);
const options = { inputDir: '/Users/Yodai/Downloads', outputDir: 'tmp/october-content-audit', catalog: null, localPreview: false, catalogScope: 'unrelated', lineageMap: null };
for (let i = 0; i < args.length; i += 1) {
  const flag = args[i];
  if (flag === '--local-preview') options.localPreview = true;
  else if (['--input-dir', '--output-dir', '--catalog', '--catalog-scope', '--lineage-map'].includes(flag)) {
    if (!args[i + 1]) throw new Error(`${flag} requires a value`);
    options[{ '--input-dir': 'inputDir', '--output-dir': 'outputDir', '--catalog': 'catalog', '--catalog-scope': 'catalogScope', '--lineage-map': 'lineageMap' }[flag]] = args[++i];
  } else if (flag === '--help') {
    console.log('Usage: node scripts/audit-original-workbooks.mjs [--input-dir path] [--output-dir path] [--catalog official-content.json] [--catalog-scope unrelated|source-lineage --lineage-map verified-book-ids.json] [--local-preview]');
    console.log('Reads four original XLSX files unchanged. Writes JSON audit, source archives, import rows, CSV differences and local-only additive SQL. Does not access or mutate any DB.');
    process.exit(0);
  } else throw new Error(`Unknown flag: ${flag}`);
}

const inputDir = path.resolve(options.inputDir);
const outputDir = path.resolve(options.outputDir);
const workbooks = [];
for (const spec of ORIGINAL_WORKBOOKS) {
  const sourcePath = path.join(inputDir, spec.file);
  const bytes = await fs.readFile(sourcePath);
  const sha256 = digest(bytes);
  const workbook = XLSX.read(bytes, { type: 'buffer', cellStyles: true, cellFormula: true, cellHTML: false });
  const sheets = archiveWorkbook(workbook, XLSX);
  workbooks.push(parseOriginalWorkbook({ spec, sha256, sheets }));
  if (digest(await fs.readFile(sourcePath)) !== sha256) throw new Error(`Original changed during read: ${spec.file}`);
}

let catalog = null;
if (options.catalog) {
  const parsed = JSON.parse(await fs.readFile(path.resolve(options.catalog), 'utf8'));
  catalog = Array.isArray(parsed) ? parsed.flatMap((item) => Array.isArray(item.results) ? item.results : [item]) : parsed.words ?? parsed.results;
  if (!Array.isArray(catalog) || catalog.some((row) => typeof row.id !== 'string' || typeof row.word !== 'string' || typeof row.definition !== 'string')) {
    throw new Error('--catalog must contain only authorized teaching word rows (id, word, definition required)');
  }
}
if (!['unrelated', 'source-lineage'].includes(options.catalogScope)) throw new Error('--catalog-scope must be unrelated or source-lineage');
const lineageMap = options.lineageMap ? JSON.parse(await fs.readFile(path.resolve(options.lineageMap), 'utf8')) : null;
const comparison = compareOriginalCatalog(workbooks, catalog, {
  correspondenceScope: options.catalogScope === 'source-lineage' ? 'SOURCE_WORKBOOK_LINEAGE' : 'UNRELATED_CATALOG_RECOMPOSITION',
  sourceBookIdsByPartOfSpeech: lineageMap,
});
await fs.mkdir(outputDir, { recursive: true });
const writeJson = (name, value) => fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
const audit = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  scope: 'Source workbooks and supplied authorized teaching catalog only; no users or histories',
  originalHashes: workbooks.map((w) => ({ file: w.spec.file, sha256: w.sha256 })),
  summary: workbooks.map((w) => ({ ...w.summary, snapshotBookId: workbookBookId(w) })),
  totals: { candidateCount: workbooks.reduce((n, w) => n + w.summary.candidateCount, 0), readyCount: workbooks.reduce((n, w) => n + w.summary.readyCount, 0) },
  comparison,
  workbooks: workbooks.map(({ sheets, ...parsed }) => ({ ...parsed, sheets: sheets.map(({ name, range, originRow, originColumn, rows, cells }) => ({ name, range, originRow, originColumn, rowCount: rows.length, cellCount: cells.length })) })),
  unverified: ['Small-test generator reflection pending authorized session comparison', 'Production cutover and workbook approval not performed', 'Pronunciation is not provided by the supplied sources'],
};
await writeJson('original-workbook-audit.json', audit);
await writeJson('original-workbook-import-rows.json', workbooks.flatMap((w) => w.records.filter((r) => r.ready).map(({ sourceKey, contentHash, rawCells, sourceRow, sourceColumn, ready, ...row }) => row)));
await writeJson('original-workbook-source-archives.json', workbooks.map((w) => ({ sourceFile: w.spec.file, sha256: w.sha256, sheets: w.sheets })));
const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const differenceRows = comparison.verified ? comparison.records.filter((row) => row.status !== 'exact_source_match' || row.metadataDifferences.length) : [];
const columns = ['sourceKey', 'partOfSpeech', 'word', 'definition', 'sourceSheet', 'sourceEntryId', 'status', 'wordPresent', 'wordMeaningPresent', 'wordMeaningProvidedExamplesPresent', 'matchingMeaningPartOfSpeechUnknown', 'matchedWordId', 'matchingMeaningWordIds', 'matchingContentWordIds', 'candidateWordIds', 'metadataDifferences'];
await fs.writeFile(path.join(outputDir, 'catalog-differences.csv'), `${columns.join(',')}\n${differenceRows.map((row) => columns.map((column) => quote(Array.isArray(row[column]) ? row[column].join(';') : row[column])).join(',')).join('\n')}\n`);
const referenceRows = comparison.lexicalOverlapReference?.records || [];
await fs.writeFile(path.join(outputDir, 'lexical-overlap-reference.csv'), `correspondenceScope,${columns.join(',')}\n${referenceRows.map((row) => [quote('UNRELATED_CATALOG_RECOMPOSITION'), ...columns.map((column) => quote(Array.isArray(row[column]) ? row[column].join(';') : row[column]))].join(',')).join('\n')}\n`);
await fs.writeFile(path.join(outputDir, options.localPreview ? 'original-workbooks.local-preview.sql' : 'original-workbooks.pending.sql'), buildOriginalWorkbookSql(workbooks, { localPreview: options.localPreview }));
console.log(JSON.stringify({ outputDir, totals: audit.totals, summary: audit.summary, comparison: { verified: comparison.verified, correspondenceScope: comparison.correspondenceScope, counts: comparison.counts, coverage: comparison.coverage, coverageByPartOfSpeech: comparison.coverageByPartOfSpeech, lexicalOverlapReference: comparison.lexicalOverlapReference?.metrics, reason: comparison.reason } }, null, 2));
