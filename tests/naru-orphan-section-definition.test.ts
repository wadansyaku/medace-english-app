import {describe,it,expect} from 'vitest';
import * as XLSX from 'xlsx';
import {ORIGINAL_WORKBOOKS,archiveWorkbook,parseOriginalWorkbook} from '../scripts/_shared/original-workbook-import.mjs';
const parse=(rows:unknown[][])=>{
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'副詞一覧');
 return parseOriginalWorkbook({spec:ORIGINAL_WORKBOOKS.find(w=>w.key==='adverb'),sha256:'a'.repeat(64),sheets:archiveWorkbook(wb,XLSX)});
};
describe('limited section/blank lexical definition correspondence audit',()=>{
 it('reports adjacent coordinates without moving Japanese or changing the held record',()=>{
  const p=parse([[null,null,null,null,null,'文副詞','実際には'],[null,null,null,null,null,'actually',null,'Actually, I do.']]);
  expect(p.issues).toContainEqual(expect.objectContaining({code:'ORPHAN_DEFINITION_ON_SECTION',severity:'blocking',sectionCell:'F1',orphanDefinitionCell:'G1',wordCell:'F2',definitionCell:'G2'}));
  expect(p.records[0]).toMatchObject({word:'actually',definition:'',ready:false});
  const unchanged=parse([[null,null,null,null,null,'文副詞'],[null,null,null,null,null,'actually',null,'Actually, I do.']]);
  expect(p.records).toEqual(unchanged.records);
 });
 it.each([
  [[null,null,null,null,null,'文副詞','実際には'],[null,null,null,null,null,'actually','実際には']],
  [[null,null,null,null,null,'文副詞','English'],[null,null,null,null,null,'actually']],
  [[null,null,null,null,null,'文副詞','実際には'],[],[null,null,null,null,null,'actually']],
  [[null,null,null,null,null,'forward','前へ'],[null,null,null,null,null,'actually']],
 ].map(rows=>({rows})))('does not infer unrelated or already translated row mappings',({rows})=>{
  expect(parse(rows).issues.some(i=>i.code==='ORPHAN_DEFINITION_ON_SECTION')).toBe(false);
 });
});
