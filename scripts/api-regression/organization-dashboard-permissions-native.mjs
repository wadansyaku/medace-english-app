// Focused direct API acceptance on real local D1 and production server modules.
// No remote DB/config, application build, provider request, or browser is used.
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {permissionFixtureSql,permissionWorkspaceHeaders,forbiddenPayloadMarkers} from '../../tests/fixtures/organizationDashboardPermissions.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const assert=(condition,label)=>{if(!condition) throw new Error(`Organization dashboard permission regression: ${label}`);};
const sqlite=new DatabaseSync(':memory:');
let mf;
let assertions=0;
const check=(condition,label)=>{assert(condition,label);assertions+=1;};
try {
  const migrationDir=path.join(repo,'migrations');
  for(const name of (await readdir(migrationDir)).filter(name=>name.endsWith('.sql')).sort()) sqlite.exec(await readFile(path.join(migrationDir,name),'utf8'));
  sqlite.exec(permissionFixtureSql(Date.now()));
  const schemas=sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
  const bundled=await build({stdin:{contents:"import {onRequest} from './functions/_shared/api-router'; export default {fetch(request,env){return onRequest({request,env});}};",
    resolveDir:repo,sourcefile:'synthetic-dashboard-permissions.ts',loader:'ts'},write:false,bundle:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  mf=new Miniflare(convertV4MiniflareOptions({name:'organization-dashboard-permissions',modules:true,
    script:bundled.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
    host:'127.0.0.1',port:0,d1Databases:{DB:'00000000-0000-4000-8000-000000000002'},d1Persist:false}));
  const db=await mf.getD1Database('DB');
  await db.batch(schemas.map(({sql})=>db.prepare(sql)));
  // Only our synthetic identity/organization rows are copied. No official
  // material or production learner records are exported into this fixture.
  for(const name of ['organizations','users','organization_memberships','workspace_access_grants',
    'organization_cohorts','organization_cohort_students','organization_cohort_instructors',
    'student_instructor_assignments','student_instructor_assignment_events']) {
    const rows=sqlite.prepare(`SELECT * FROM ${name} WHERE ${name==='users'?"id LIKE 'permission-%'":"1=1"}`).all();
    if(rows.length) await db.batch(rows.map(row=>{
      const columns=Object.keys(row);
      return db.prepare(`INSERT INTO ${name}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...Object.values(row));
    }));
  }
  const cookieByUid=new Map();
  for(const uid of ['permission-owner','permission-teacher','permission-unassigned-teacher','permission-school','permission-admin']) {
    const sessionId=`${uid}-session`,rawToken=`${sessionId}.synthetic-only-session-secret`;
    await db.prepare('INSERT INTO sessions(token,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
      .bind(sessionId,uid,createHash('sha256').update(rawToken).digest('base64'),Date.now()+600000,Date.now()).run();
    cookieByUid.set(uid,`medace_session=${encodeURIComponent(rawToken)}`);
  }
  const call=async(uid,action='getOrganizationDashboardSnapshot',headers={},payload)=>{
    const response=await mf.dispatchFetch('http://localhost/api/storage',{method:'POST',headers:{
      Origin:'http://localhost','Content-Type':'application/json',Cookie:cookieByUid.get(uid),...headers},body:JSON.stringify({action,...(payload===undefined?{}:{payload})})});
    const body=await response.text();
    return {status:response.status,body,data:body?JSON.parse(body):null};
  };
  const denied=async(uid,headers,label)=>{
    const response=await call(uid,'getOrganizationDashboardSnapshot',headers);
    check(response.status===403,`${label} denied`);
    for(const marker of forbiddenPayloadMarkers) check(!response.body.includes(marker),`${label} must not expose ${marker}`);
  };
  await denied('permission-teacher',{},'canonical assigned teacher');
  await denied('permission-unassigned-teacher',{},'canonical unassigned teacher');
  if(process.env.MEDACE_VERIFY_WORKSPACE_REVOCATION==='1') {
    check(!(await call('permission-teacher')).data.errorCode,'ordinary teacher scope denial remains unmarked');
    for(const headers of [
      {...permissionWorkspaceHeaders('instructor'),'X-MedAce-Workspace-Identity':'permission-foreign'},
      {...permissionWorkspaceHeaders('instructor'),'X-MedAce-Workspace-Org':'permission-org-b'},
    ]) {
      const scope=await call('permission-owner','getAllStudentsProgress',headers);
      check(scope.status===403&&!scope.data.errorCode,'forged identity or classroom denial remains unmarked');
    }
  }
  await denied('permission-owner',permissionWorkspaceHeaders('instructor'),'owner unassigned teacher');
  const noAssigned=await call('permission-owner','getAllStudentsProgress',permissionWorkspaceHeaders('instructor'));
  check(noAssigned.status===200&&noAssigned.data.length===0,'owner unassigned progress stays empty');
  await db.prepare("UPDATE student_instructor_assignments SET instructor_user_id='permission-owner' WHERE student_user_id='permission-assigned'").run();
  const assigned=await call('permission-owner','getAllStudentsProgress',permissionWorkspaceHeaders('instructor'));
  check(assigned.status===200&&assigned.data.length===1&&assigned.data[0].uid==='permission-assigned','owner assigned progress stays scoped');
  await denied('permission-owner',permissionWorkspaceHeaders('instructor'),'owner assigned teacher');
  for(const [uid,headers] of [['permission-school',{}],['permission-owner',permissionWorkspaceHeaders('group-admin')]]) {
    const response=await call(uid,'getOrganizationDashboardSnapshot',headers);
    check(response.status===200,'school administrator dashboard remains available');
    check(response.data.organizationId==='permission-org-a','school fixed organization');
    check(response.data.studentAssignments.map(row=>row.uid).sort().join(',')==='permission-assigned,permission-hidden','school has its own organization students only');
    check(response.data.assignmentEvents.length===1&&response.data.assignmentEvents[0].studentUid==='permission-hidden'
      &&response.data.assignmentEvents[0].studentName==='Synthetic UNASSIGNED PRIVATE student A','authorized administrator gets real same-organization event');
    check(!response.body.includes('permission-foreign')&&!response.body.includes('Synthetic FOREIGN PRIVATE student B'),'no other-classroom names in any school payload field');
  }
  await denied('permission-owner',permissionWorkspaceHeaders('service-admin'),'service mode single-organization contract');
  const global=await call('permission-owner','getAllStudentsProgress',permissionWorkspaceHeaders('service-admin'));
  check(global.status===200&&global.data.some(row=>row.uid==='permission-foreign'),'separate service global progress permission retained');
  for(const [sql,label] of [
    ["UPDATE workspace_access_grants SET status='REVOKED' WHERE user_id='permission-owner'",'revoked grant'],
    ["UPDATE workspace_access_grants SET grant_version=8 WHERE user_id='permission-owner'",'stale version'],
    ["UPDATE workspace_access_grants SET school_admin_access=0 WHERE user_id='permission-owner'",'school flag removed'],
    ["UPDATE organizations SET status='INACTIVE' WHERE id='permission-org-a'",'inactive organization'],
  ]) {
    await db.prepare(sql).run();
    await denied('permission-owner',permissionWorkspaceHeaders('group-admin'),label);
    if(process.env.MEDACE_VERIFY_WORKSPACE_REVOCATION==='1') {
      const denied=await call('permission-owner','getOrganizationDashboardSnapshot',permissionWorkspaceHeaders('group-admin'));
      check(denied.status===403&&denied.data.errorCode==='WORKSPACE_ACCESS_REVOKED','latest grant loss has an explicit scoped machine marker');
      check(JSON.stringify(denied.data.workspaceContext)===JSON.stringify({uid:'permission-owner',workspace:'group-admin',organizationId:'permission-org-a',grantVersion:7}),
        'machine marker identifies the rejected request context instead of a newer profile');
    }
    await db.batch([db.prepare("UPDATE workspace_access_grants SET status='ACTIVE',grant_version=7,school_admin_access=1 WHERE user_id='permission-owner'"),
      db.prepare("UPDATE organizations SET status='ACTIVE' WHERE id='permission-org-a'")]);
  }
  // This optional DTO regression only runs after the independent picker repair
  // is integrated; the dashboard boundary above is also useful by itself.
  if(process.env.MEDACE_VERIFY_GRANTED_STAFF_PICKER==='1') {
    const settings=await call('permission-school','getOrganizationSettingsSnapshot');
    check(settings.status===200,'canonical school settings available');
    const selected=settings.data.eligibleInstructors?.find(row=>row.userUid==='permission-owner');
    check(selected&&settings.data.eligibleInstructors.filter(row=>row.userUid==='permission-owner').length===1,'granted raw student is offered once');
    check(settings.data.eligibleInstructors.every(row=>row.userUid!=='permission-foreign'&&row.userUid!=='permission-hidden'),'foreign and plain students are not instructor candidates');
    check(settings.data.members.every(row=>row.userUid!=='permission-owner'),'canonical membership remains only in owner personal organization');
    const save=await call('permission-school','setInstructorCohorts',{}, {instructorUid:selected.userUid,cohortIds:['permission-class-hidden']});
    check(save.status===204,'offered grant instructor is accepted by the real cohort save API');
    const reread=await call('permission-school','getOrganizationSettingsSnapshot');
    check(reread.data.instructorCohorts['permission-owner']?.join(',')==='permission-class-hidden','saved grant instructor cohort persists');
    for(const mutation of ["UPDATE workspace_access_grants SET status='REVOKED' WHERE user_id='permission-owner'",
      "UPDATE workspace_access_grants SET teacher_access=0 WHERE user_id='permission-owner'",
      "UPDATE workspace_access_grants SET staff_organization_id='permission-org-b' WHERE user_id='permission-owner'"]) {
      await db.prepare(mutation).run();
      const refreshed=await call('permission-school','getOrganizationSettingsSnapshot');
      check(refreshed.status===200&&refreshed.data.eligibleInstructors.every(row=>row.userUid!=='permission-owner'),'fresh canonical admin removes ineligible grant candidate');
      const deniedSave=await call('permission-school','setInstructorCohorts',{}, {instructorUid:'permission-owner',cohortIds:['permission-class-hidden']});
      check(deniedSave.status===404,'revoked/disabled/foreign instructor cannot be saved');
      const retained=await db.prepare("SELECT cohort_id FROM organization_cohort_instructors WHERE instructor_user_id='permission-owner'").all();
      check(retained.results?.length===1&&retained.results[0].cohort_id==='permission-class-hidden','rejected save preserves the existing cohort assignment');
      await db.prepare("UPDATE workspace_access_grants SET status='ACTIVE',teacher_access=1,staff_organization_id='permission-org-a' WHERE user_id='permission-owner'").run();
    }
    await db.prepare("UPDATE workspace_access_grants SET grant_version=8 WHERE user_id='permission-owner'").run();
    const latest=await call('permission-school','getOrganizationSettingsSnapshot');
    check(latest.status===200&&latest.data.eligibleInstructors.some(row=>row.userUid==='permission-owner'),'canonical admin lists the instructor from the latest grant version');
  }
  const raw=await db.prepare("SELECT role,organization_id,organization_role FROM users WHERE id='permission-owner'").first();
  check(raw.role==='STUDENT'&&raw.organization_id==='permission-org-b'&&raw.organization_role==='STUDENT','raw owner canonical student identity retained');
  console.log(`Organization dashboard native local D1 direct API PASS: ${assertions} checks, assigned/unassigned canonical and granted teachers denied without whole payload, school fixed organization allowed, separate service global permission and grant revoke/version/flag/org boundaries retained.`);
} finally {
  sqlite.close();
  await mf?.dispose();
}
