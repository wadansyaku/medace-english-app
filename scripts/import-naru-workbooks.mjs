#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import XLSX from 'xlsx';
import { archiveWorkbook, digest, ORIGINAL_WORKBOOKS, parseOriginalWorkbook } from './_shared/original-workbook-import.mjs';
import { buildNaruApprovalSql, buildNaruStageSql, createNaruWorkbookImport, naruImportQueries, verifyNaruImportRows } from './_shared/naru-workbook-import.mjs';

// This command generates private files and optionally performs read-only D1
// verification. Applying either SQL file is an explicit separate operation.
const options = { inputDir: null, outputDir: 'tmp/naru-import', database: null, mode: null, persistTo: null, approval: null, expectApproved: false };
const fields = { '--input-dir': 'inputDir', '--output-dir': 'outputDir', '--database': 'database', '--persist-to': 'persistTo', '--approval-basis': 'approval' };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (fields[args[i]]) { if (!args[i + 1]) throw new Error('Argument value required'); options[fields[args[i]]] = args[++i]; }
  else if (args[i] === '--remote' || args[i] === '--local') { if (options.mode) throw new Error('Choose one verification mode'); options.mode = args[i]; }
  else if (args[i] === '--expect-approved') options.expectApproved = true;
  else if (args[i] === '--help') { console.log('Generate: --input-dir PATH --output-dir PRIVATE_PATH. Read-back: add --database NAME --local|--remote [--persist-to PATH]. Generate approval only after read-back: --approval-basis TEXT. This command never writes D1.'); process.exit(0); }
  else throw new Error('Unknown argument');
}
if (!options.inputDir || Boolean(options.mode) !== Boolean(options.database) || (options.persistTo && options.mode !== '--local') || ((options.approval || options.expectApproved) && !options.database)) throw new Error('Explicit source directory and valid read-back mode required');
const outputDir = path.resolve(options.outputDir);
await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
// A failed run must never leave a previous successful authorization artifact.
await fs.rm(path.join(outputDir, 'naru-workbooks.approval.sql'), { force: true });
await fs.rm(path.join(outputDir, 'naru-readback-proof.json'), { force: true });
let generatedManifest;
if (options.database) generatedManifest = JSON.parse(await fs.readFile(path.join(outputDir, 'naru-workbook-manifest.json'), 'utf8'));
const workbooks = [];
for (const spec of ORIGINAL_WORKBOOKS) {
  const bytes = await fs.readFile(path.join(options.inputDir, spec.file));
  workbooks.push(parseOriginalWorkbook({ spec, sha256: digest(bytes), sheets: archiveWorkbook(XLSX.read(bytes, { type: 'buffer', cellStyles: true, cellFormula: true, cellHTML: false }), XLSX) }));
}
const model = createNaruWorkbookImport(workbooks, generatedManifest ? { timestamp: generatedManifest.timestamp } : {});
if (JSON.stringify(model.chapters.map(c => c.count)) !== JSON.stringify([353, 932, 86, 159]) || model.held.length !== 1 || model.held[0].sourceKey !== 'adverb:副詞一覧:R82C6' || model.held[0].word !== 'actually') throw new Error('Original snapshot totals changed; review a new version before import');
const stageSql = buildNaruStageSql(model);
const { tables, ...manifest } = model;
manifest.tableCounts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]));
manifest.stageSqlSha256 = digest(stageSql);
if (!options.database) {
  await fs.writeFile(path.join(outputDir, 'naru-workbooks.pending.sql'), stageSql, { mode: 0o600 });
  await fs.writeFile(path.join(outputDir, 'naru-workbook-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
} else if (generatedManifest.revision !== model.revision || generatedManifest.stageSqlSha256 !== digest(stageSql) || digest(await fs.readFile(path.join(outputDir, 'naru-workbooks.pending.sql'))) !== digest(stageSql)) throw new Error('Generated snapshot changed; verification never replaces the reviewed SQL');
if (options.database) {
  const queries = naruImportQueries(model);
  const cli = ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', options.database, options.mode, '--json', '--command', queries.map(q => q.sql).join('\n')];
  if (options.persistTo) cli.push('--persist-to', options.persistTo);
  let results;
  try { results = JSON.parse(execFileSync(process.execPath, cli, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, CI: '1', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch { throw new Error('D1 read-back failed; no approval generated'); }
  if (results.length !== queries.length || results.some(r => !r.success || !Array.isArray(r.results))) throw new Error('Incomplete D1 read-back');
  const actual = Object.fromEntries(queries.map((q, i) => [q.table, results[i].results]));
  const proof = verifyNaruImportRows(model, actual);
  if (options.expectApproved && actual.material_source_ledger.some(r => r.rights_status !== 'approved' || r.review_status !== 'approved')) throw new Error('Approval was not committed');
  await fs.writeFile(path.join(outputDir, 'naru-readback-proof.json'), JSON.stringify({ ...proof, revision: model.revision, database: options.database, mode: options.mode, checkedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  if (options.approval) await fs.writeFile(path.join(outputDir, 'naru-workbooks.approval.sql'), buildNaruApprovalSql(model, options.approval), { mode: 0o600 });
}
console.log(JSON.stringify({ outputDir, bookId: model.bookId, title: model.title, wordCount: model.wordCount, heldCount: model.held.length, chapters: model.chapters, verified: Boolean(options.database), approvalSqlGenerated: Boolean(options.approval) }, null, 2));
