import {readFileSync,readdirSync} from 'node:fs';
import {afterEach,describe,expect,it} from 'vitest';
import {createSqliteD1} from './helpers/sqlite-d1';
import {permissionFixtureSql,permissionWorkspaceHeaders,forbiddenPayloadMarkers} from './fixtures/organizationDashboardPermissions.mjs';
import {handleGetOrganizationDashboardSnapshot} from '../functions/_shared/organization-dashboard-actions';
import {handleGetAllStudentsProgress} from '../functions/_shared/organization-student-read-model';
import {projectStaffWorkspace} from '../functions/_shared/workspace-access';
import {createSession} from '../functions/_shared/auth';
import {onRequest} from '../functions/_shared/api-router';
import type {AppEnv,DbUserRow} from '../functions/_shared/types';

const fixtures:ReturnType<typeof createSqliteD1>[]=[];
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
const setup=()=>{
  const fixture=createSqliteD1();fixtures.push(fixture);
  const dir=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(dir).filter(file=>file.endsWith('.sql')).sort()) fixture.sqlite.exec(readFileSync(new URL(file,dir),'utf8'));
  fixture.sqlite.exec(permissionFixtureSql(Date.now()));
  const env:AppEnv={DB:fixture.DB};
  const identity=(uid='permission-owner')=>fixture.sqlite.prepare('SELECT * FROM users WHERE id=?').get(uid) as unknown as DbUserRow;
  const project=(workspace:'instructor'|'group-admin'|'service-admin')=>projectStaffWorkspace(env,identity(),workspace,{grantVersion:7,...(workspace==='service-admin'?{}:{organizationId:'permission-org-a'})});
  const request=async(uid:string,headers:Record<string,string>={})=>{
    const cookie=(await createSession(env,new Request('https://local.example.invalid/api/auth'),uid)).split(';')[0];
    return onRequest({env,request:new Request('https://local.example.invalid/api/storage',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:'https://local.example.invalid',Cookie:cookie,...headers},
      body:JSON.stringify({action:'getOrganizationDashboardSnapshot'}),
    })});
  };
  return {...fixture,env,identity,project,request};
};
const deniedWithoutPayload=async(response:Response)=>{
  expect(response.status).toBe(403);
  const body=await response.text();
  for(const marker of forbiddenPayloadMarkers) expect(body).not.toContain(marker);
};

describe('organization-wide dashboard has a school-administrator boundary before any payload reads',()=>{
  it.each(['permission-teacher','permission-unassigned-teacher'])('rejects canonical %s direct API with no student names/events/aggregate payload',async uid=>{
    const f=setup();
    await deniedWithoutPayload(await f.request(uid));
  });
  it('rejects explicit owner teacher before assignment and after same-class assignment while progress stays scoped',async()=>{
    const f=setup(),teacher=await f.project('instructor');
    await expect(handleGetAllStudentsProgress(f.env,teacher)).resolves.toEqual([]);
    await deniedWithoutPayload(await f.request('permission-owner',permissionWorkspaceHeaders('instructor')));
    f.sqlite.exec("UPDATE student_instructor_assignments SET instructor_user_id='permission-owner' WHERE student_user_id='permission-assigned'");
    expect((await handleGetAllStudentsProgress(f.env,teacher)).map(row=>row.uid)).toEqual(['permission-assigned']);
    await deniedWithoutPayload(await f.request('permission-owner',permissionWorkspaceHeaders('instructor')));
  });
  it('authorizes canonical school administrator and returns every payload only from the fixed organization',async()=>{
    const f=setup();
    const response=await f.request('permission-school');expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.organizationId).toBe('permission-org-a');
    expect(body.studentAssignments.map((row:{uid:string})=>row.uid).sort()).toEqual(['permission-assigned','permission-hidden']);
    expect(body.assignmentEvents.map((row:{studentUid:string})=>row.studentUid)).toEqual(['permission-hidden']);
    expect(body.assignmentEvents[0].studentName).toBe('Synthetic UNASSIGNED PRIVATE student A');
    expect(JSON.stringify(body)).not.toContain('permission-foreign');
    expect(JSON.stringify(body)).not.toContain('Synthetic FOREIGN PRIVATE student B');
  });
  it('authorizes owner school workspace independently of its canonical student organization',async()=>{
    const f=setup();
    const response=await f.request('permission-owner',permissionWorkspaceHeaders('group-admin'));expect(response.status).toBe(200);
    const body=await response.json();expect(body.organizationId).toBe('permission-org-a');
    expect(body.assignmentEvents.map((row:{studentUid:string})=>row.studentUid)).toEqual(['permission-hidden']);
    expect(JSON.stringify(body)).not.toContain('permission-foreign');
    expect(f.identity().role).toBe('STUDENT');expect(f.identity().organization_id).toBe('permission-org-b');
  });
  it.each([
    "UPDATE workspace_access_grants SET status='REVOKED' WHERE user_id='permission-owner'",
    "UPDATE workspace_access_grants SET grant_version=8 WHERE user_id='permission-owner'",
    "UPDATE workspace_access_grants SET school_admin_access=0 WHERE user_id='permission-owner'",
    "UPDATE organizations SET status='INACTIVE' WHERE id='permission-org-a'",
  ])('rereads current authority and rejects a cached school actor after %s',async mutation=>{
    const f=setup(),school=await f.project('group-admin');
    await expect(handleGetOrganizationDashboardSnapshot(f.env,school)).resolves.toMatchObject({organizationId:'permission-org-a'});
    f.sqlite.exec(mutation);
    await expect(handleGetOrganizationDashboardSnapshot(f.env,school)).rejects.toMatchObject({status:403});
    await deniedWithoutPayload(await f.request('permission-owner',permissionWorkspaceHeaders('group-admin')));
  });
  it('keeps service workspace outside the single-organization snapshot and preserves the separate global progress API',async()=>{
    const f=setup(),service=await f.project('service-admin');
    await expect(handleGetOrganizationDashboardSnapshot(f.env,service)).rejects.toMatchObject({status:403});
    const globalStudents=await handleGetAllStudentsProgress(f.env,service);
    expect(globalStudents.map(row=>row.uid)).toEqual(expect.arrayContaining(['permission-assigned','permission-hidden','permission-foreign']));
    await deniedWithoutPayload(await f.request('permission-owner',permissionWorkspaceHeaders('service-admin')));
  });
});
