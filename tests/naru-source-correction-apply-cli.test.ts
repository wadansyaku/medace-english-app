import {describe,it,expect,vi} from 'vitest';
import {parseCorrectionApplyArgs,runCorrectionApply,correctionApplyAuditSql,verifyCorrectionDeployment} from '../scripts/apply-naru-source-correction.mjs';
import {NARU_SOURCE_CORRECTIONS} from '../scripts/_shared/naru-source-corrections.mjs';
const m=NARU_SOURCE_CORRECTIONS.corrections[0];
const options=parseCorrectionApplyArgs(['--database','test-db','--local','--persist-to','/tmp/synthetic','--url','http://localhost:12345','--expected-sha','a'.repeat(40),'--output','/tmp/synthetic-proof.json']);
const row=(after=false)=>({beforeEligible:after?0:1,afterEligible:after?1:0,wordCount:1531,marks:638,sourceEntries:1532,links:1531,target:1,applied:after?1:0,invalid:0,originalReady:0,correctedReady:1,foreignKeyErrors:0,global_users:13,global_books:59,global_words:67242,global_learning_histories:218,global_study_attempt_receipts:23,global_quiz_attempt_receipts:0});
const catalog=(after=false)=>({book:{id:m.bookId,wordCount:1531},words:Array.from({length:1531},(_,i)=>i===0?{id:m.originalWordId,bookId:m.bookId,number:1361,word:'actually',definition:after?m.definition:m.previousAppDefinition,exampleSentence:m.exampleSentence,exampleMeaning:m.exampleMeaning,partOfSpeech:'adverb',aichiExamAppeared:true,definitionSupplemented:!after,exampleMeaningSupplemented:after}:{id:`synthetic-${i}`,aichiExamAppeared:i<638})});
const harness=(already=false)=>{
 let applied=already;const order:string[]=[];let artifact:any;
 const readiness=vi.fn(async()=>{order.push('ready');});
 const execute=vi.fn(async(_options:any,sql:string):Promise<any>=>{if(sql.startsWith('WITH')){order.push('read');return{results:[row(applied)]};}order.push('write');applied=true;return{results:[{id:m.id,word_id:m.originalWordId}],meta:{}};});
 const guest=vi.fn(async()=>{order.push('guest');return catalog(applied);});
 const write=vi.fn(async(_file:string,value:any)=>{artifact=value;});
 return {deps:{readiness,execute,guest,write},order,getArtifact:()=>artifact};
};
describe('post-code source correction release helper',()=>{
 it('rejects stale build bytes or missing route capability even with a matching runtime SHA',async()=>{
  const html='<script src="/assets/index-verified.js"></script>';
  const read=vi.fn(async(file:string)=>file.endsWith('index.html')?html:Buffer.from('new-code'));
  const fetcher=vi.fn(async(url:string)=>new Response(url.endsWith('/')?html:url.includes('/assets/')?'old-code':'{}',{headers:{'x-deployment-sha':options.expectedSha}}));
  await expect(verifyCorrectionDeployment(options,{read:read as any,fetcher})).rejects.toThrow('BUILD_IDENTITY_INVALID');
  fetcher.mockImplementation(async(url:string)=>new Response(url.endsWith('/')?html:url.includes('/assets/')?'new-code':'{}',{headers:{'x-deployment-sha':options.expectedSha}}));
  await expect(verifyCorrectionDeployment(options,{read:read as any,fetcher})).rejects.toThrow('SOURCE_CORRECTION_CODE_NOT_READY');
  fetcher.mockImplementation(async(url:string)=>new Response(url.endsWith('/')?html:url.includes('/assets/')?'new-code':'{}',{headers:{'x-deployment-sha':options.expectedSha,'x-naru-source-correction':m.id}}));
  await expect(verifyCorrectionDeployment(options,{read:read as any,fetcher})).resolves.toBeUndefined();
 });
 it('rejects a stale HTML entry point before fetching its assets',async()=>{
  const fetcher=vi.fn(async()=>new Response('<script src="/assets/index-old.js"></script>'));
  await expect(verifyCorrectionDeployment(options,{fetcher,read:(async()=>'<script src="/assets/index-new.js"></script>') as any})).rejects.toThrow('BUILD_IDENTITY_INVALID');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('gates mutation behind expected-code readiness and verifies after aggregates/catalog',async()=>{
  const h=harness();expect((await runCorrectionApply(options,h.deps)).status).toBe('APPLIED_VERIFIED');
  expect(h.order).toEqual(['ready','read','guest','ready','write','read','guest']);
  expect(h.getArtifact().after).toMatchObject({wordCount:1531,marks:638,sourceEntries:1532,links:1531,applied:1});
 });
 it('already-valid after state performs no application writes',async()=>{
  const h=harness(true);expect((await runCorrectionApply(options,h.deps)).status).toBe('ALREADY_APPLIED_VERIFIED');expect(h.order).not.toContain('write');
 });
 it('wrong SHA/assets/session readiness performs no database call and sanitizes failures',async()=>{
  const h=harness();h.deps.readiness.mockRejectedValueOnce(new Error('token=secret cookie=private'));
  await expect(runCorrectionApply(options,h.deps)).rejects.toThrow('READINESS_OR_VERIFICATION_FAILED');expect(h.deps.execute).not.toHaveBeenCalled();expect(JSON.stringify(h.getArtifact())).not.toContain('secret');
 });
 it('invalidated or mismatching before metadata never applies',async()=>{
  const h=harness();h.deps.execute.mockResolvedValueOnce({results:[{...row(),invalid:1}]});
  await expect(runCorrectionApply(options,h.deps)).rejects.toThrow('BEFORE_AGGREGATE_REJECTED');expect(h.order).not.toContain('write');
 });
 it.each([[],[{id:'other',word_id:m.originalWordId}],[{id:m.id,word_id:m.originalWordId},{id:m.id,word_id:m.originalWordId}]].map(results=>({results})))('unverified RETURNING rows cannot report success ($results)',async({results})=>{
  const h=harness();const execute=h.deps.execute.getMockImplementation()!;
  h.deps.execute.mockImplementation(async(options,sql)=>sql.startsWith('WITH')?execute(options,sql):{results,meta:{}});
  await expect(runCorrectionApply(options,h.deps)).rejects.toThrow('APPLY_NO_VERIFIED_WRITES');expect(h.getArtifact().status).toBe('FAILED');
 });
 it('global counts may grow but cannot decrease',async()=>{
  const h=harness();const execute=h.deps.execute.getMockImplementation()!;h.deps.execute.mockImplementation(async(...args)=>{const result=await execute(...args);if(result.results?.[0]?.afterEligible===1)result.results[0].global_learning_histories=217;return result;});
  await expect(runCorrectionApply(options,h.deps)).rejects.toThrow('GLOBAL_COUNT_DECREASED');
  const h2=harness();const original=h2.deps.execute.getMockImplementation()!;h2.deps.execute.mockImplementation(async(...args)=>{const result=await original(...args);if(result.results?.[0]?.afterEligible===1)result.results[0].global_learning_histories=219;return result;});expect((await runCorrectionApply(options,h2.deps)).status).toBe('APPLIED_VERIFIED');
 });
 it('HTTP guest projection must match canonical source versus app-only example flags',async()=>{
  const h=harness();h.deps.guest.mockResolvedValueOnce(catalog()).mockResolvedValueOnce(catalog());await expect(runCorrectionApply(options,h.deps)).rejects.toThrow('GUEST_CATALOG_INVALID');
 });
 it('aggregate audit contains no learner identifiers/answers and fixed proof only',()=>{
  const sql=correctionApplyAuditSql();expect(sql).toContain('global_learning_histories');expect(sql).toContain('foreignKeyErrors');expect(sql).not.toMatch(/SELECT\s+\*|SELECT\s+(?:user_id|email|answer)/i);
 });
 it.each([
  ['--remote','--local'],['--remote','--persist-to','/tmp/x'],
 ].map(extra=>({extra})))('rejects ambiguous database scopes',({extra})=>{
  expect(()=>parseCorrectionApplyArgs(['--database','test','--url','https://example.test','--expected-sha','a'.repeat(40),'--output','/tmp/x',...extra])).toThrow();
 });
 it('rejects credential-bearing URLs and option-injection database names',()=>{
  expect(()=>parseCorrectionApplyArgs(['--database','--yes','--remote','--url','https://secret@example.test','--expected-sha','a'.repeat(40),'--output','/tmp/x'])).toThrow();
 });
});
