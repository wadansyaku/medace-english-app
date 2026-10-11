// Actual disposable local D1 SQL, injected network-free R2 put/lease races.
// No production configuration, remote binding, provider or application build.
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {permissionFixtureSql,permissionWorkspaceHeaders} from '../../tests/fixtures/organizationDashboardPermissions.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const sqlite=new DatabaseSync(':memory:');
let runtime,bundleDir,checks=0;
const check=(condition,label)=>{if(!condition)throw new Error(`Upload race regression: ${label}`);checks+=1;};
try {
  for(const file of (await readdir(path.join(repo,'migrations'))).filter(name=>name.endsWith('.sql')).sort())
    sqlite.exec(await readFile(path.join(repo,'migrations',file),'utf8'));
  sqlite.exec(permissionFixtureSql(Date.now()));
  await mkdir(path.join(repo,'.wrangler'),{recursive:true});
  bundleDir=await mkdtemp(path.join(repo,'.wrangler','upload-race-bundle-'));
  const bundled=await build({stdin:{contents:`export {handleCreateWritingUploadUrl,handleWritingAssetUpload} from './functions/_shared/writing-actions/mutations';
export {createSession} from './functions/_shared/auth'; export {projectStaffWorkspace} from './functions/_shared/workspace-access';
export {handleError} from './functions/_shared/http';`,resolveDir:repo,loader:'ts'},write:false,bundle:true,packages:'external',
    format:'esm',platform:'node',target:'node22',logLevel:'silent'});
  const bundleFile=path.join(bundleDir,'server.mjs');await writeFile(bundleFile,bundled.outputFiles[0].text);
  const {handleCreateWritingUploadUrl,handleWritingAssetUpload,createSession,projectStaffWorkspace,handleError}=await import(pathToFileURL(bundleFile).href);
  runtime=new Miniflare(convertV4MiniflareOptions({name:'owner-upload-races',modules:true,
    script:'export default {fetch(){return new Response("local synthetic D1 only");}};',compatibilityDate:'2026-10-01',host:'127.0.0.1',port:0,
    d1Databases:{DB:'00000000-0000-4000-8000-000000000003'},d1Persist:false}));
  const db=await runtime.getD1Database('DB');
  const schemas=sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
  await db.batch(schemas.map(({sql})=>db.prepare(sql)));
  for(const table of ['organizations','users','organization_memberships','workspace_access_grants','student_instructor_assignments']) {
    const rows=sqlite.prepare(`SELECT * FROM ${table}`).all();
    if(rows.length)await db.batch(rows.map(row=>db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row))));
  }
  await db.prepare("UPDATE student_instructor_assignments SET instructor_user_id='permission-owner' WHERE student_user_id='permission-assigned'").run();
  await db.prepare(`INSERT INTO writing_assignments (id,organization_id,organization_name,instructor_user_id,student_user_id,
    exam_category,template_type,prompt_title,prompt_text,guidance,word_count_min,word_count_max,submission_code,prompt_snapshot,status,created_at,issued_at,updated_at)
    VALUES('native-race-assignment','permission-org-a','Synthetic classroom A','permission-owner','permission-assigned',
    'EIKEN','OPINION','Synthetic static prompt','Write a local-only answer.','',10,100,'NATIVE-RACE','{}','ISSUED',1,1,1)`).run();
  const objects=new Map(),uploads=[],deleted=[];
  let duringPut,beforeInsert;
  const env={DB:{prepare(sql){
    const original=db.prepare(sql);
    if(!sql.includes('INSERT INTO writing_submission_assets'))return original;
    let bound=original;
    const wrapped={bind(...values){bound=original.bind(...values);return wrapped;},
      first:(...args)=>bound.first(...args),all:(...args)=>bound.all(...args),
      async run(){await beforeInsert?.();return bound.run();}};
    return wrapped;
  },batch:statements=>db.batch(statements)},WRITING_ASSETS:{
    async put(key,value){uploads.push(key);objects.set(key,value);await duringPut?.();return {etag:'synthetic-race-etag'};},
    async delete(key){deleted.push(key);objects.delete(key);},async get(){return null;},
  }};
  const cookie=(await createSession(env,new Request('https://local.example.invalid/api/auth'),'permission-owner')).split(';')[0];
  const headers={Cookie:cookie,'Content-Type':'image/png',...permissionWorkspaceHeaders('instructor')};
  const body=new TextEncoder().encode('Synthetic owner original during local race.');
  const asset=async id=>db.prepare('SELECT * FROM writing_submission_assets WHERE id=?').bind(id).first();
  const preserved=async()=>JSON.stringify({users:(await db.prepare('SELECT id,role,subscription_plan,organization_id,organization_role,password_hash FROM users ORDER BY id').all()).results,
    memberships:(await db.prepare('SELECT * FROM organization_memberships ORDER BY user_id,organization_id').all()).results});
  const reset=async()=>{
    beforeInsert=undefined;duringPut=undefined;objects.clear();uploads.length=0;deleted.length=0;
    await db.batch([db.prepare('DELETE FROM writing_submission_assets'),
      db.prepare("UPDATE organizations SET status='ACTIVE' WHERE id='permission-org-a'"),
      db.prepare("DELETE FROM workspace_access_grants WHERE user_id='permission-owner'"),
      db.prepare("INSERT INTO workspace_access_grants VALUES('permission-owner','permission-org-a',1,1,1,'ACTIVE',7,1,1)")]);
  };
  const mint=async()=>{
    const identity=await db.prepare("SELECT * FROM users WHERE id='permission-owner'").first();
    const actor=await projectStaffWorkspace(env,identity,'instructor',{grantVersion:7,organizationId:'permission-org-a'});
    return handleCreateWritingUploadUrl(env,actor,{assignmentId:'native-race-assignment',fileName:'synthetic-original.png',mimeType:'image/png',byteSize:body.length,attemptNo:1,assetOrder:1});
  };
  const upload=async lease=>handleWritingAssetUpload(env,lease.uploadUrl.split('/').at(-1),new Request('https://local.example.invalid'+lease.uploadUrl,{method:'PUT',headers,body}));
  const loss=async cause=>{
    const response=handleError(cause),details=await response.json();
    check(response.status===403&&details.errorCode==='WORKSPACE_ACCESS_REVOKED','real authority loss is scoped403');
    check(JSON.stringify(details.workspaceContext)===JSON.stringify({uid:'permission-owner',workspace:'instructor',organizationId:'permission-org-a',grantVersion:7}),'marker retains rejected lease context');
  };
  const mutations=["UPDATE workspace_access_grants SET status='REVOKED' WHERE user_id='permission-owner'",
    "UPDATE workspace_access_grants SET grant_version=8 WHERE user_id='permission-owner'",
    "UPDATE workspace_access_grants SET teacher_access=0 WHERE user_id='permission-owner'",
    "UPDATE organizations SET status='INACTIVE' WHERE id='permission-org-a'",
    "DELETE FROM workspace_access_grants WHERE user_id='permission-owner'"];
  for(const sql of mutations) {
    await reset();const before=await preserved();
    beforeInsert=()=>db.prepare(sql).run();
    await loss(await mint().catch(error=>error));
    check((await db.prepare('SELECT COUNT(*) AS n FROM writing_submission_assets').first()).n===0,'failed lease INSERT stores no asset');
    check(uploads.length===0&&await preserved()===before,'mint failure does not write R2, credentials or canonical membership');
    await reset();const lease=await mint(),original=await preserved();
    duringPut=()=>db.prepare(sql).run();
    await loss(await upload(lease).catch(error=>error));
    const row=await asset(lease.assetId);
    check(row.uploaded_at===null&&row.uploaded_etag===null&&row.uploaded_sha256_base64===null&&row.byte_size===0,'failed grant CAS accepts no original receipt');
    check(row.upload_consumed_at!==null,'failed CAS retains the consumed lease');
    check(objects.size===0&&deleted.join(',')===uploads.join(','),'temporary object is deleted before reporting loss');
    check((await db.prepare('SELECT COUNT(*) AS n FROM writing_submissions').first()).n===0&&await preserved()===original,'no submission or authority side effect');
  }
  await reset();const ordinaryLease=await mint();
  duringPut=()=>db.prepare('UPDATE writing_submission_assets SET upload_consumed_at=upload_consumed_at+1 WHERE id=?').bind(ordinaryLease.assetId).run();
  const conflict=await upload(ordinaryLease).catch(error=>error);
  check(conflict.status===409&&!conflict.details,'valid grant with ordinary row CAS loss remains unmarked409');
  check(objects.size===0&&(await asset(ordinaryLease.assetId)).uploaded_at===null,'ordinary conflict cleanup and no acceptance retained');
  await reset();const template=await mint();
  beforeInsert=async()=>{
    const row=await asset(template.assetId),columns=Object.keys(row);
    const copies=[1,2,3].map(index=>({...row,id:row.id+'-concurrent-'+index,upload_token:row.upload_token+'-'+index,r2_key:row.r2_key+'-'+index}));
    await db.batch(copies.map(row=>db.prepare(`INSERT INTO writing_submission_assets(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...columns.map(key=>row[key]))));
  };
  const quotaConflict=await mint().catch(error=>error);
  check(quotaConflict.status===409&&!quotaConflict.details,'valid grant with concurrent reservation capacity loss remains unmarked409');
  check((await db.prepare('SELECT COUNT(*) AS n FROM writing_submission_assets').first()).n===4,'quota conflict preserves the four prior reservations');
  console.log(`Owner upload revocation native local D1 PASS: ${checks} checks; actual INSERT/final CAS SQL, five authority-loss races, readonly actor check, unmarked ordinary409, no accepted originals or canonical identity writes.`);
} finally {
  sqlite.close();await runtime?.dispose();
  if(bundleDir)await rm(bundleDir,{recursive:true,force:true});
}
