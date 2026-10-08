import { describe, expect, it } from 'vitest';
import { digest } from '../scripts/_shared/original-workbook-import.mjs';
import { NARU_DEFINITION_SUPPLEMENTS } from '../scripts/_shared/naru-definition-supplements.mjs';
import { validateNaruAdverbSourceCorrection } from '../scripts/_shared/naru-source-corrections.mjs';
const m = NARU_DEFINITION_SUPPLEMENTS.supplements[0];
const fixture = () => {
  const held = JSON.parse(m.originalPayloadJson);
  const { contentHash, originalBookName, originalContentHash, sourceSnapshotBookId, ...payload } = held;
  payload.bookName = originalBookName;
  const records = Array.from({ length:87 }, (_, i) => i===75
    ? { ...payload, contentHash:digest(JSON.stringify(payload)) }
    : { word:`fixture${i}`, sourceKey:`fixture${i}`, definition:'意味',ready:true,rawCells:[],contentHash:'' });
  for (const r of records) { const {contentHash,...v}=r; r.contentHash=digest(JSON.stringify(v)); }
  const rows = Array.from({ length:82 }, () => [] as unknown[]);
  rows[80] = [null,null,null,null,null,'文副詞','実際には']; rows[81] = ['suddenly',null,null,null,null,'actually',null,m.exampleSentence];
  const before = { spec:{key:'adverb'},sha256:m.sourceSha256,records,sheets:[{name:'副詞一覧',range:'A1:H82',rows,cells:[{address:'F82',value:'actually',style:{patternType:'solid',fgColor:{rgb:'FFFF00'}}}],merges:[]}] };
  const after = structuredClone(before); after.sha256='1'.repeat(64);
  after.sheets[0].rows[80][6]=null;after.sheets[0].rows[81][6]='実際には';
  after.records[75].definition='実際には';after.records[75].ready=true;after.records[75].rawCells[1]='実際には';
  const {contentHash:_,...p}=after.records[75];after.records[75].contentHash=digest(JSON.stringify(p));
  return {before,after};
};
describe('exact two-cell source correction contract',()=>{
 it('accepts only the row repair and keeps the historical actually ID and counts',()=>{
  const {before,after}=fixture();const snap=JSON.stringify({before,after});
  expect(validateNaruAdverbSourceCorrection(before,after)).toMatchObject({originalWordId:m.wordId,wordNumber:1361,wordCount:1531,examCount:638,definition:'実際には'});
  expect(JSON.stringify({before,after})).toBe(snap);
 });
 it.each(['unrelated-cell','style','merge','wrong-definition','different-source','lexical-edit','wrong-row'])('rejects %s',kind=>{
  const {before,after}=fixture();
  if(kind==='unrelated-cell')after.sheets[0].rows[0]=['changed'];
  if(kind==='style')after.sheets[0].cells[0].style.patternType='none';
  if(kind==='merge')after.sheets[0].merges.push({s:{r:1,c:1},e:{r:2,c:2}} as never);
  if(kind==='wrong-definition')after.sheets[0].rows[81][6]='実は';
  if(kind==='different-source')before.sha256='2'.repeat(64);
  if(kind==='lexical-edit')after.records[0].definition='別義';
  if(kind==='wrong-row')after.sheets[0].rows[80][6]='実際には';
  expect(()=>validateNaruAdverbSourceCorrection(before,after)).toThrow();
 });
});
