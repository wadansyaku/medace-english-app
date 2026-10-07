import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ files: new Map<string,string>(), audit: null as any, databaseFailure: false }));
vi.mock('node:fs/promises', () => ({ default: {
  mkdir: vi.fn(async () => {}),
  rm: vi.fn(async (file:string) => { state.files.delete(path.basename(file)); }),
  readFile: vi.fn(async (file:string) => state.files.get(path.basename(file)) || Buffer.from('synthetic source')),
  writeFile: vi.fn(async (file:string, value:string) => { state.files.set(path.basename(file),value); }),
} }));
vi.mock('xlsx', () => ({ default: { read: () => ({}) } }));
vi.mock('node:child_process', () => ({ execFileSync: () => { throw new Error('Synthetic read-back unavailable'); } }));
vi.mock('../scripts/_shared/original-workbook-import.mjs', async importOriginal => ({
  ...await importOriginal<any>(), archiveWorkbook: () => [], parseOriginalWorkbook: () => ({}),
}));
vi.mock('../scripts/_shared/naru-workbook-import.mjs', async importOriginal => ({
  ...await importOriginal<any>(),
  createNaruWorkbookImport: () => ({ bookId:'naru-shisto-original-v1', title:'Naruシスト', revision:'reviewed', timestamp:1,
    wordCount:1530, held:[{sourceKey:'adverb:副詞一覧:R82C6',word:'actually'}],
    chapters:[353,932,86,159].map(count => ({count})), tables:{} }),
  buildNaruStageSql: () => '-- reviewed pending snapshot', naruImportQueries: () => [],
}));
vi.mock('../scripts/_shared/naru-exam-annotations.mjs', async importOriginal => ({
  ...await importOriginal<any>(), auditNaruExamAnnotations: () => state.audit,
}));
const originalArgv = process.argv;
beforeEach(() => {
  vi.resetModules(); state.files.clear();
  state.audit=JSON.parse(fs.readFileSync('data/naru-aichi-exam-annotations.json','utf8'));
  state.files.set('naru-workbooks.approval.sql','old approval');
  state.files.set('naru-readback-proof.json','old proof');
  state.files.set('naru-workbooks.pending.sql','previous reviewed SQL');
});
afterEach(() => { process.argv=originalArgv; vi.restoreAllMocks(); });
const run = async (extra:string[] = []) => {
  process.argv=['node','import-naru-workbooks.mjs','--input-dir','synthetic-input','--output-dir','synthetic-output',...extra];
  return import('../scripts/import-naru-workbooks.mjs');
};
describe('standard Naru import classification gate before artifact writes', () => {
  it.each(['missing mark','same-count wrong sense','missing held','wrong held meaning','wrong held evidence'])('fails closed for %s and preserves reviewed SQL', async kind => {
    if(kind==='missing mark') state.audit.marks.pop();
    if(kind==='same-count wrong sense') state.audit.marks[0].definition='Unreviewed meaning';
    if(kind==='missing held') state.audit.held=[];
    if(kind==='wrong held meaning') state.audit.held[0].definition='Unreviewed definition';
    if(kind==='wrong held evidence') state.audit.held[0].evidenceCell='F83';
    await expect(run()).rejects.toThrow('Reviewed exam classification changed');
    expect(state.files.get('naru-workbooks.pending.sql')).toBe('previous reviewed SQL');
    expect(state.files.has('naru-workbook-manifest.json')).toBe(false);
    expect(state.files.has('naru-workbooks.exam-annotations.sql')).toBe(false);
    expect(state.files.has('naru-workbooks.definition-supplements.sql')).toBe(false);
    expect(state.files.has('naru-workbooks.approval.sql')).toBe(false);
    expect(state.files.has('naru-readback-proof.json')).toBe(false);
  });
  it('generates the reviewed metadata byte-for-byte and reports measured classification counts', async () => {
    const log=vi.spyOn(console,'log').mockImplementation(() => {});
    const {buildNaruExamAnnotationSql}=await import('../scripts/_shared/naru-exam-annotations.mjs');
    const {buildNaruDefinitionSupplementSql}=await import('../scripts/_shared/naru-definition-supplements.mjs');
    await run();
    expect(state.files.get('naru-workbooks.exam-annotations.sql')).toBe(buildNaruExamAnnotationSql(state.audit));
    expect(state.files.get('naru-workbooks.definition-supplements.sql')).toBe(buildNaruDefinitionSupplementSql());
    const result=JSON.parse(log.mock.calls[0][0]);
    expect(result.examAnnotations).toEqual({originalReadyMarks:637,originalMissingDefinitions:1,direct:634,uniqueIndex:3,unresolvedCells:98});
    expect(result.appSupplement).toMatchObject({wordCountAfterSeparateApplication:1531,aichiMarksAfterSeparateApplication:638});
    expect(result.wordCount).toBe(1530);expect(result.heldCount).toBe(1);
    expect(state.files.has('naru-workbooks.approval.sql')).toBe(false);
  });
  it('does not replace reviewed metadata or leave authorization artifacts when read-back fails', async () => {
    const {digest}=await import('../scripts/_shared/original-workbook-import.mjs');
    state.files.set('naru-workbooks.pending.sql','-- reviewed pending snapshot');
    state.files.set('naru-workbook-manifest.json',JSON.stringify({timestamp:1,revision:'reviewed',stageSqlSha256:digest('-- reviewed pending snapshot')}));
    state.files.set('naru-workbooks.exam-annotations.sql','previous metadata SQL');
    await expect(run(['--database','synthetic-db','--local','--approval-basis','fixture-only'])).rejects.toThrow('D1 read-back failed');
    expect(state.files.get('naru-workbooks.pending.sql')).toBe('-- reviewed pending snapshot');
    expect(state.files.get('naru-workbooks.exam-annotations.sql')).toBe('previous metadata SQL');
    expect(state.files.has('naru-workbooks.approval.sql')).toBe(false);
    expect(state.files.has('naru-readback-proof.json')).toBe(false);
  });
});
