import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { archiveWorkbook, digest, ORIGINAL_WORKBOOKS, parseOriginalWorkbook } from './_shared/original-workbook-import.mjs';
import { auditNaruExamAnnotations, buildNaruExamAnnotationSql } from './_shared/naru-exam-annotations.mjs';
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const input = value('--input-dir'); const output = value('--output-dir');
if (!input || !output || args.length !== 4) throw new Error('Use --input-dir PATH --output-dir PATH; files only, never D1 writes');
const workbooks = await Promise.all(ORIGINAL_WORKBOOKS.map(async spec => {
 const bytes = await fs.readFile(path.join(input, spec.file));
 return parseOriginalWorkbook({ spec, sha256: digest(bytes), sheets: archiveWorkbook(XLSX.read(bytes,{type:'buffer',cellStyles:true,cellFormula:true,cellHTML:false}),XLSX) });
}));
const audit = auditNaruExamAnnotations(workbooks);
if(audit.marks.length!==637 || audit.held.length!==1) throw new Error('Reviewed classification counts changed');
await fs.mkdir(output,{recursive:true,mode:0o700});
await fs.writeFile(path.join(output,'naru-aichi-exam-annotations.json'),JSON.stringify(audit,null,2)+'\n');
await fs.writeFile(path.join(output,'naru-aichi-exam-annotations.sql'),buildNaruExamAnnotationSql(audit));
console.log(JSON.stringify({output,ready:audit.marks.length,held:audit.held.length,direct:audit.marks.filter(m=>m.matchKind==='word_cell').length,uniqueIndex:audit.marks.filter(m=>m.matchKind==='unique_index').length,unresolvedCells:audit.unresolved.length}));
