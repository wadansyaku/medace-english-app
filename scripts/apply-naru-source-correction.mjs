#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { waitForSmokeServer, extractAssetPaths } from './_shared/smoke-readiness.mjs';
import { NARU_SOURCE_CORRECTIONS, naruCorrectionProof, buildNaruSourceCorrectionSql } from './_shared/naru-source-corrections.mjs';
import { naruSourceCorrectionGuard } from '../shared/naruSourceCorrectionSql.mjs';
const m=NARU_SOURCE_CORRECTIONS.corrections[0];
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const globals=['users','books','words','learning_histories','study_attempt_receipts','quiz_attempt_receipts'];
const failure=code=>Object.assign(new Error(code),{safeCode:code});
const reviewedApplySql=()=>{
 const sql=buildNaruSourceCorrectionSql();
 if(!/ON CONFLICT DO NOTHING;\s*$/.test(sql))throw failure('CANONICAL_APPLY_INVALID');
 // D1 local metadata omits changes; RETURNING proves this invocation inserted
 // the fixed correction, rather than accepting another invocation's result.
 return sql.replace(/ON CONFLICT DO NOTHING;\s*$/,'ON CONFLICT DO NOTHING RETURNING id,word_id;');
};
// Runtime SHA is environment metadata, so also prove the actual route code and
// the build bytes before any mutation. A stale deployment cannot pass this gate.
export const verifyCorrectionDeployment=async(options,{fetcher=fetch,read=fs.readFile}={})=>{
 const request=url=>fetcher(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)});
 const root=await request(`${options.url}/`);
 if(!root.ok)throw failure('BUILD_IDENTITY_INVALID');
 const expected=extractAssetPaths(await read(path.resolve('dist/index.html'),'utf8')).sort();
 const observed=extractAssetPaths(await root.text()).sort();
 if(!expected.length||JSON.stringify(expected)!==JSON.stringify(observed))throw failure('BUILD_IDENTITY_INVALID');
 for(const asset of expected){
  if(!/^\/assets\/[A-Za-z0-9_.-]+$/.test(asset))throw failure('BUILD_IDENTITY_INVALID');
  const response=await request(`${options.url}${asset}`);
  if(!response.ok)throw failure('BUILD_IDENTITY_INVALID');
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  if(digest(Buffer.from(await response.arrayBuffer()))!==digest(await read(path.resolve('dist',asset.slice(1)))))throw failure('BUILD_IDENTITY_INVALID');
 }
 const route=await request(`${options.url}/api/guest-learning/naru`);
 const compatible=route.ok&&route.headers.get('x-deployment-sha')===options.expectedSha&&route.headers.get('x-naru-source-correction')===m.id;
 await route.arrayBuffer();
 if(!compatible)throw failure('SOURCE_CORRECTION_CODE_NOT_READY');
};
const defaultReadiness=async(url,options)=>{
 await waitForSmokeServer(url,options);
 await verifyCorrectionDeployment({url,expectedSha:options.expectedDeploymentSha});
};
export const parseCorrectionApplyArgs=args=>{
 const options={database:'',mode:'',persistTo:'',url:'',expectedSha:'',output:''};
 const fields={'--database':'database','--persist-to':'persistTo','--url':'url','--expected-sha':'expectedSha','--output':'output'};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--remote'||args[i]==='--local'){if(options.mode)throw failure('ARGUMENTS_INVALID');options.mode=args[i];}
  else if(fields[args[i]]){if(!args[i+1]||args[i+1].startsWith('--')||options[fields[args[i]]])throw failure('ARGUMENTS_INVALID');options[fields[args[i]]]=args[++i];}
  else throw failure('ARGUMENTS_INVALID');
 }
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(options.database)||!options.mode||!/^[a-f0-9]{40}$/.test(options.expectedSha)||!options.output||(options.persistTo&&options.mode!=='--local'))throw failure('ARGUMENTS_INVALID');
 let url;try{url=new URL(options.url);}catch{throw failure('URL_INVALID');}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw failure('URL_INVALID');
 options.url=url.origin;options.output=path.resolve(options.output);if(options.persistTo)options.persistTo=path.resolve(options.persistTo);
 return options;
};
export const correctionApplyAuditSql=()=>{
 const ids=m.originalSupplement.sources.map(source=>`xlsx-${source.key}-${source.sha256}`).concat(m.correctedSourceId);
 const proof=quote(JSON.stringify(naruCorrectionProof(m)));
 return `WITH x(payload) AS(SELECT ${proof}) SELECT
 (${naruSourceCorrectionGuard({phase:'before'})}) AS beforeEligible,
 (${naruSourceCorrectionGuard({phase:'after'})}) AS afterEligible,
 ${globals.map(table=>`(SELECT COUNT(*) FROM ${table}) AS global_${table}`).join(',')},
 (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)}) AS wordCount,
 (SELECT COUNT(*) FROM words WHERE book_id=${quote(m.bookId)} AND aichi_exam_appeared=1) AS marks,
 (SELECT COUNT(*) FROM catalog_source_entries WHERE source_id IN(${ids.map(quote).join(',')})) AS sourceEntries,
 (SELECT COUNT(*) FROM catalog_word_source_links l JOIN words w ON w.id=l.word_id WHERE w.book_id=${quote(m.bookId)}) AS links,
 (SELECT COUNT(*) FROM words WHERE id=${quote(m.originalWordId)} AND book_id=${quote(m.bookId)} AND word_number=1361) AS target,
 (SELECT COUNT(*) FROM catalog_word_source_corrections WHERE id=${quote(m.id)} AND applied_at>0) AS applied,
 (SELECT COUNT(*) FROM catalog_word_source_correction_invalidations WHERE correction_id=${quote(m.id)}) AS invalid,
 (SELECT ready FROM catalog_source_entries WHERE id=${quote(m.originalSourceEntryId)}) AS originalReady,
 (SELECT ready FROM catalog_source_entries WHERE id=${quote(m.correctedSourceEntryId)}) AS correctedReady,
 (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreignKeyErrors FROM x;`;
};
const safeRow=row=>{
 const keys=['beforeEligible','afterEligible','wordCount','marks','sourceEntries','links','target','applied','invalid','originalReady','correctedReady','foreignKeyErrors',...globals.map(table=>'global_'+table)];
 if(!row||keys.some(key=>!Number.isSafeInteger(row[key])||row[key]<0))throw failure('AGGREGATE_INVALID');
 return Object.fromEntries(keys.map(key=>[key,row[key]]));
};
const consistent=row=>row.wordCount===1531&&row.marks===638&&row.sourceEntries===1532&&row.links===1531&&row.target===1&&row.invalid===0&&row.originalReady===0&&row.correctedReady===1&&row.foreignKeyErrors===0;
const defaultExecute=async(options,sql)=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'naru-correction-apply-'));
 try{
  const file=path.join(folder,'fixed.sql');await fs.writeFile(file,sql,{mode:0o600});
  const args=[path.resolve('node_modules/wrangler/bin/wrangler.js'),'d1','execute',options.database,options.mode,'--json','--file',file];
  if(options.persistTo)args.push('--persist-to',options.persistTo);
  let stdout;try{({stdout}=await promisify(execFile)(process.execPath,args,{cwd:process.cwd(),encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,CI:'1',FORCE_COLOR:'0'}}));}catch{throw failure('D1_EXECUTION_FAILED');}
  let results;try{results=JSON.parse(stdout);}catch{throw failure('D1_RESULT_INVALID');}
  if(!Array.isArray(results)||results.length!==1||results.some(result=>result.success!==true))throw failure('D1_RESULT_INVALID');
  return results[0];
 }finally{await fs.rm(folder,{recursive:true,force:true});}
};
const defaultGuest=async options=>{
 let response;try{response=await fetch(`${options.url}/api/guest-learning/naru`,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw failure('GUEST_FETCH_FAILED');}
 if(!response.ok||response.headers.get('x-deployment-sha')!==options.expectedSha||response.headers.get('x-naru-source-correction')!==m.id){await response.body?.cancel();throw failure('GUEST_DEPLOYMENT_INVALID');}
 try{return await response.json();}catch{throw failure('GUEST_JSON_INVALID');}
};
export const validateCorrectionGuestCatalog=(catalog,corrected)=>{
 const words=catalog?.words;const word=Array.isArray(words)&&words.find(word=>word.id===m.originalWordId);
 if(catalog?.book?.id!==m.bookId||catalog.book.wordCount!==1531||!Array.isArray(words)||words.length!==1531||new Set(words.map(word=>word.id)).size!==1531||words.filter(word=>word.aichiExamAppeared===true).length!==638||!word
  ||word.bookId!==m.bookId||word.number!==1361||word.word!=='actually'||word.definition!==(corrected?m.definition:m.previousAppDefinition)||word.exampleSentence!==m.exampleSentence||word.exampleMeaning!==m.exampleMeaning||word.partOfSpeech!=='adverb'||word.aichiExamAppeared!==true
  ||(corrected?(word.definitionSupplemented===true||word.exampleMeaningSupplemented!==true):(word.definitionSupplemented!==true||word.exampleMeaningSupplemented===true)))throw failure('GUEST_CATALOG_INVALID');
 return {wordCount:1531,marks:638,wordId:word.id,number:1361,definition:word.definition,definitionSupplemented:word.definitionSupplemented===true,exampleMeaningSupplemented:word.exampleMeaningSupplemented===true};
};
const writeEvidence=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});};
export const runCorrectionApply=async(options,{readiness=defaultReadiness,execute=defaultExecute,guest=defaultGuest,write=writeEvidence}={})=>{
 const evidence={schemaVersion:1,status:'FAILED',expectedSha:options.expectedSha,mode:options.mode,correctionId:m.id,wordId:m.originalWordId,correctedSourceSha256:m.correctedSha256,applyAttempted:false};
 try{
  // No D1 call (including a write) precedes code/assets/session readiness.
  await readiness(options.url,{expectedDeploymentSha:options.expectedSha});evidence.readiness=true;
  if(write===writeEvidence){
   await fs.mkdir(path.dirname(options.output),{recursive:true,mode:0o700});
   try{await fs.lstat(options.output);throw failure('OUTPUT_ALREADY_EXISTS');}catch(error){if(error?.code!=='ENOENT')throw failure('OUTPUT_UNAVAILABLE');}
  }
  const before=safeRow((await execute(options,correctionApplyAuditSql())).results?.[0]);evidence.before=before;
  if(!consistent(before))throw failure('BEFORE_AGGREGATE_REJECTED');
  const already=before.afterEligible===1&&before.applied===1;
  if(!already&&(before.beforeEligible!==1||before.afterEligible!==0||before.applied!==0))throw failure('BEFORE_GUARD_REJECTED');
  evidence.guestBefore=validateCorrectionGuestCatalog(await guest(options),already);
  if(!already){
   // Re-check deployment immediately before the only mutation; SQL itself
   // repeats the complete atomic canonical source/approval/invalidation guard.
   await readiness(options.url,{expectedDeploymentSha:options.expectedSha});
   evidence.applyAttempted=true;const applied=await execute(options,reviewedApplySql());
   if(applied.results?.length!==1||applied.results[0].id!==m.id||applied.results[0].word_id!==m.originalWordId)throw failure('APPLY_NO_VERIFIED_WRITES');
   evidence.applyWrites=1;
  }
  const after=safeRow((await execute(options,correctionApplyAuditSql())).results?.[0]);evidence.after=after;
  if(!consistent(after)||after.afterEligible!==1||after.beforeEligible!==0||after.applied!==1)throw failure('AFTER_GUARD_REJECTED');
  if(globals.some(table=>after['global_'+table]<before['global_'+table]))throw failure('GLOBAL_COUNT_DECREASED');
  evidence.guestAfter=validateCorrectionGuestCatalog(await guest(options),true);
  evidence.status=already?'ALREADY_APPLIED_VERIFIED':'APPLIED_VERIFIED';
 }catch(error){evidence.failure=error?.safeCode||'READINESS_OR_VERIFICATION_FAILED';}
 await write(options.output,evidence);
 if(evidence.status==='FAILED')throw failure(evidence.failure);
 return evidence;
};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await runCorrectionApply(parseCorrectionApplyArgs(process.argv.slice(2)));console.log(JSON.stringify({status:result.status,output:path.resolve(process.argv[process.argv.indexOf('--output')+1]),applyAttempted:result.applyAttempted}));}
 catch(error){console.error(JSON.stringify({status:'FAILED',reason:error?.safeCode||'ARTIFACT_WRITE_OR_ARGUMENT_ERROR'}));process.exitCode=1;}
}
