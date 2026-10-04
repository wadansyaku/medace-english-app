import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleProductFeedback } from '../functions/_shared/product-feedback-actions';
import { productFeedbackRoutes } from '../functions/_shared/api-routes/product-feedback';
import * as auth from '../functions/_shared/auth';
import { handleResetAllData } from '../functions/_shared/storage-learning-actions';
import { exportFeedback } from '../shared/productFeedback';
import type { ProductFeedbackAction, ProductFeedbackReport } from '../contracts/productFeedback';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';
const dbs: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { dbs.splice(0).forEach(f => f.sqlite.close()); vi.restoreAllMocks(); });
const setup = () => {
  const f = createSqliteD1(); dbs.push(f);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) f.sqlite.exec(readFileSync(new URL(file,dir),'utf8'));
  f.sqlite.exec(`INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES ('teacher','secret@example.test','Secret Name','INSTRUCTOR',1,1),('other','other@example.test','Other','INSTRUCTOR',1,1),('admin','admin@example.test','Admin','ADMIN',1,1),('student','student@example.test','Student','STUDENT',1,1);
    INSERT INTO organizations(id,display_name,name_key,subscription_plan,status,created_at,updated_at) VALUES ('org','School','school','TOB_PAID','ACTIVE',1,1),('elsewhere','Other','other','TOB_PAID','ACTIVE',1,1);
    INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at,updated_at) VALUES ('org','teacher','INSTRUCTOR','ACTIVE',1,1),('org','other','INSTRUCTOR','ACTIVE',1,1);`);
  const env = { DB:f.DB } as AppEnv;
  const user = (id='teacher') => f.sqlite.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as DbUserRow;
  const run = (body: unknown, actor='teacher') => handleProductFeedback(env,user(actor),body);
  const count = (table: string) => f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n;
  return {...f,env,user,run,count};
};
const input = { title:'Review button fails',version:'release-1',screen:'Review',steps:'Open review and press next',expected:'Next word',actual:'Blank screen',impact:'Cannot finish review' };
const create = (id='report-1') => ({action:'create',id,input,privacyConfirmed:true});
const advance = (expectedRevision: number, change: ProductFeedbackAction, mutationId=`mutation-${expectedRevision}`, id='report-1') => ({action:'advance',id,expectedRevision,mutationId,change});
const triage: ProductFeedbackAction = {type:'triage',priority:'P1',acceptance:'Next word is shown'};
describe('product feedback authenticated atomic loop', () => {
  it('projects only anonymous fields, isolates teachers and organizations, derives admin permission',async () => {
    const f=setup(); const report=await f.run(create()) as ProductFeedbackReport;
    expect(report.isOwnReport).toBe(true); expect(exportFeedback(report)).not.toMatch(/secret@example|Secret Name|reporter_user_id|org_id|isOwnReport/);
    expect(await f.run({action:'list'},'other')).toMatchObject({reports:[],canManage:false,deploymentRevision:null});
    f.env.DEPLOYMENT_SHA='production-commit';
    expect(await f.run({action:'list'},'admin')).toMatchObject({reports:[{isOwnReport:false}],canManage:true,deploymentRevision:'production-commit'});
    await expect(f.run(advance(1,triage),'other')).rejects.toMatchObject({status:404});
    await expect(f.run(advance(1,triage))).rejects.toMatchObject({status:403});
    f.sqlite.exec("UPDATE organization_memberships SET organization_id='elsewhere' WHERE user_id='teacher'");
    expect(await f.run({action:'list'})).toMatchObject({reports:[]});
    await expect(f.run(advance(1,{type:'retest',passed:true,note:'Checked'}))).rejects.toMatchObject({status:404});
  });
  it('requires server role and active membership, blocks privilege injection and private contact',async () => {
    const f=setup();
    await expect(f.run(create(),'student')).rejects.toMatchObject({status:403});
    f.sqlite.exec("UPDATE organization_memberships SET status='INACTIVE' WHERE user_id='teacher'");
    await expect(f.run(create())).rejects.toMatchObject({status:403});
    await expect(f.run({...create(),role:'ADMIN'},'admin')).rejects.toMatchObject({status:400});
    for(const actual of ['email me at user@example.test','call 090-1234-5678']) await expect(f.run({...create(),input:{...input,actual}},'admin')).rejects.toMatchObject({status:400});
    await expect(f.run({...create(),privacyConfirmed:false},'admin')).rejects.toMatchObject({status:400});
  });
  it('blocks every feedback operation after a teacher membership becomes STUDENT, while allowing GROUP_ADMIN and service ADMIN',async()=>{
    const f=setup();await f.run(create());await f.run(advance(1,triage),'admin');
    await f.run(advance(2,{type:'prepare-handoff'}),'admin');
    await f.run(advance(3,{type:'record-fix',revision:'commit-1',note:'Repair button'}),'admin');
    f.sqlite.exec("UPDATE organization_memberships SET role='STUDENT' WHERE user_id='teacher'");
    expect(f.user().role).toBe('INSTRUCTOR');
    for(const body of [create('blocked-report'),{action:'list'},{action:'get',id:'report-1'},advance(4,{type:'retest',passed:true,note:'Checked'})]) {
      await expect(f.run(body)).rejects.toMatchObject({status:403});
    }
    expect(f.count('product_feedback_reports')).toBe(1);expect(f.count('product_feedback_events')).toBe(4);expect(f.count('product_feedback_receipts')).toBe(3);
    expect(await f.run({action:'get',id:'report-1'},'admin')).toMatchObject({status:'FIXED',revision:4});
    expect(await f.run({action:'list'},'admin')).toMatchObject({canManage:true});
    f.sqlite.exec("UPDATE organization_memberships SET role='GROUP_ADMIN' WHERE user_id='teacher'");
    expect(await f.run({action:'get',id:'report-1'})).toMatchObject({status:'FIXED',isOwnReport:true});
    expect(await f.run(advance(4,{type:'retest',passed:true,note:'Checked'}))).toMatchObject({status:'RETEST_PASS',revision:5});
    expect(await f.run(create('group-admin-report'))).toMatchObject({status:'NEW',isOwnReport:true});
    expect(await f.run({action:'list'})).toMatchObject({canManage:false,reports:expect.arrayContaining([expect.objectContaining({id:'group-admin-report'})])});
  });
  it('makes create retry idempotent and rejects altered payload or another owner',async () => {
    const f=setup(); const first=await f.run(create()); expect(await f.run(create())).toEqual(first);
    await expect(f.run({...create(),input:{...input,title:'Changed'}})).rejects.toMatchObject({status:409});
    await expect(f.run(create(),'other')).rejects.toMatchObject({status:409});
    expect(f.count('product_feedback_events')).toBe(1);
  });
  it('CAS permits one winner, receipts recover lost response and reject conflicting mutation reuse',async () => {
    const f=setup(); await f.run(create());
    const results=await Promise.allSettled([f.run(advance(1,triage,'a'),'admin'),f.run(advance(1,triage,'b'),'admin')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}});
    const winner=results[0].status==='fulfilled'?'a':'b';
    const first=await f.run(advance(1,triage,winner),'admin'); expect(await f.run(advance(1,triage,winner),'admin')).toEqual(first);
    await expect(f.run(advance(1,{...triage,priority:'P0'},winner),'admin')).rejects.toMatchObject({status:409});
    expect(f.count('product_feedback_events')).toBe(2);
  });
  it('rolls back report, event and receipt on batch failure',async () => {
    const f=setup(); f.beforeRun(sql=>{if(sql.includes('INSERT OR IGNORE INTO product_feedback_events'))throw new Error('event failed');});
    await expect(f.run(create())).rejects.toThrow('event failed'); expect(f.count('product_feedback_reports')).toBe(0);
    f.beforeRun(undefined); await f.run(create());
    f.beforeRun(sql=>{if(sql.includes('INSERT OR IGNORE INTO product_feedback_events'))throw new Error('event failed');});
    await expect(f.run(advance(1,triage),'admin')).rejects.toThrow('event failed');
    expect(f.count('product_feedback_receipts')).toBe(0); expect(f.count('product_feedback_events')).toBe(1);
    expect(f.sqlite.prepare('SELECT revision FROM product_feedback_reports').get()!.revision).toBe(1);
  });
  it('recovers an actual postcommit lost response without another event',async()=>{
    const f=setup(); await f.run(create()); const original=f.DB.prepare.bind(f.DB); let reads=0;
    vi.spyOn(f.DB,'prepare').mockImplementation(sql=>{if(sql.startsWith('SELECT actor_user_id')&&++reads===2)throw new Error('lost response');return original(sql);});
    await expect(f.run(advance(1,triage),'admin')).rejects.toThrow('lost response'); vi.restoreAllMocks();
    expect(await f.run(advance(1,triage),'admin')).toMatchObject({revision:2,status:'TRIAGED'}); expect(f.count('product_feedback_events')).toBe(2);
  });
  it('persists full failed retest → second fix → passed loop with server authorization',async()=>{
    const f=setup(); await f.run(create()); await f.run(advance(1,triage),'admin'); await f.run(advance(2,{type:'prepare-handoff'}),'admin');
    await f.run(advance(3,{type:'record-fix',revision:'commit-1',note:'Repair button'}),'admin');
    await expect(f.run(advance(4,{type:'record-fix',revision:'bad',note:'Bad'}))).rejects.toMatchObject({status:403});
    await expect(f.run(advance(4,{type:'retest',passed:false,note:'Still blank'}),'other')).rejects.toMatchObject({status:404});
    await f.run(advance(4,{type:'retest',passed:false,note:'Still blank'}));
    await f.run(advance(5,{type:'record-fix',revision:'commit-2',note:'Repair state'}),'admin');
    const result=await f.run(advance(6,{type:'retest',passed:true,note:'Next word shown'})) as ProductFeedbackReport;
    expect(result).toMatchObject({status:'RETEST_PASS',revision:7,fixRevision:'commit-2'}); expect(result.history).toHaveLength(7);
  });
  it('uses stable updatedAt/id keyset pages of 100 and fails loudly on database reads',async()=>{
    const f=setup(); for(let i=0;i<103;i++)await f.run(create(`report-${i}`));
    f.sqlite.exec('UPDATE product_feedback_reports SET updated_at=42');
    const page=await f.run({action:'list'}) as {reports:ProductFeedbackReport[];nextCursor:string}; const next=await f.run({action:'list',cursor:page.nextCursor}) as typeof page;
    expect(page.reports).toHaveLength(100);expect(next.reports).toHaveLength(3);expect(new Set([...page.reports,...next.reports].map(r=>r.id)).size).toBe(103);
    await expect(f.run({action:'list',cursor:'bad'})).rejects.toMatchObject({status:400});
    vi.spyOn(f.DB,'prepare').mockImplementation(()=>{throw new Error('read failed');}); await expect(f.run({action:'list'},'admin')).rejects.toThrow('read failed');
  });
  it('accepts concurrent identical requests once and blocks stale versions and history overflow',async()=>{
    const f=setup(); const creates=await Promise.all(Array.from({length:3},()=>f.run(create())));
    expect(creates[0]).toEqual(creates[1]); expect(f.count('product_feedback_events')).toBe(1);
    const updates=await Promise.all(Array.from({length:3},()=>f.run(advance(1,triage),'admin')));
    expect(updates[0]).toEqual(updates[1]); expect(f.count('product_feedback_events')).toBe(2);
    await expect(f.run(advance(1,triage,'stale'),'admin')).rejects.toMatchObject({status:409});
    f.sqlite.exec('UPDATE product_feedback_reports SET revision=1000');
    await expect(f.run(advance(1000,triage,'limit'),'admin')).rejects.toMatchObject({status:409});
    expect(f.count('product_feedback_events')).toBe(2);
  });
  it('rejects suspended organization, unknown fields and malformed identifiers before writing',async()=>{
    const f=setup(); f.sqlite.exec("UPDATE organizations SET status='SUSPENDED' WHERE id='org'");
    await expect(f.run(create())).rejects.toMatchObject({status:403});
    const invalid=[{action:'advance',id:'report-1',expectedRevision:1,mutationId:'valid',change:{type:'constructor'}},{...create(),id:'x'.repeat(129)},{...create(),input:{...input,userId:'student'}},{action:'advance',id:'report-1',expectedRevision:1,mutationId:'valid',change:{type:'prepare-handoff',actorRole:'ADMIN'}},{action:'advance',id:'report-1',expectedRevision:1.5,mutationId:'valid',change:triage}];
    for(const body of invalid)await expect(f.run(body,'admin')).rejects.toMatchObject({status:400});
    expect(f.count('product_feedback_reports')).toBe(0);
  });
  it('lists summaries with constant query count and authorizes full detail independently',async()=>{
    const f=setup(); for(let i=0;i<103;i++)await f.run(create(`summary-${i}`));
    const prepare=vi.spyOn(f.DB,'prepare');
    const page=await f.run({action:'list'}) as {reports:ProductFeedbackReport[]};
    expect(prepare).toHaveBeenCalledTimes(3); // membership, organization status, page
    expect(prepare.mock.calls.some(([sql])=>sql.includes('product_feedback_events'))).toBe(false);
    expect(page.reports).toHaveLength(100);expect(page.reports.every(r=>!r.historyLoaded&&r.history.length===0)).toBe(true);
    prepare.mockClear();await f.run({action:'list'},'admin');expect(prepare).toHaveBeenCalledTimes(1);
    const detail=await f.run({action:'get',id:'summary-0'}) as ProductFeedbackReport;
    expect(detail.historyLoaded).toBe(true);expect(detail.history).toHaveLength(1);
    expect(await f.run({action:'get',id:'summary-0'},'admin')).toMatchObject({historyLoaded:true,isOwnReport:false});
    await expect(f.run({action:'get',id:'summary-0'},'other')).rejects.toMatchObject({status:404});
    await expect(f.run({action:'get',id:'summary-0'},'student')).rejects.toMatchObject({status:403});
    await expect(f.run({action:'get',id:'missing'})).rejects.toMatchObject({status:404});
    await expect(f.run({action:'get',id:'summary-0',actorRole:'ADMIN'},'admin')).rejects.toMatchObject({status:400});
  });
  it('stores constant-size receipt snapshots and restores only historical events up to their revision',async()=>{
    const f=setup();await f.run(create());const first=await f.run(advance(1,triage),'admin');
    await f.run(advance(2,{type:'prepare-handoff'}),'admin');
    await f.run(advance(3,{type:'record-fix',revision:'commit-1',note:'Repair button'}),'admin');
    const replay=await f.run(advance(1,triage),'admin') as ProductFeedbackReport;
    expect(replay).toEqual(first);expect(replay.historyLoaded).toBe(true);expect(replay.history).toHaveLength(2);
    const rows=f.sqlite.prepare('SELECT response_json FROM product_feedback_receipts').all();
    for(const row of rows)expect(JSON.parse(String(row.response_json))).not.toHaveProperty('history');
    expect((await f.run({action:'get',id:'report-1'} as const) as ProductFeedbackReport).history).toHaveLength(4);
  });
  it('expired demo cleanup cascades owned feedback and its event/receipt children',async()=>{
    const f=setup();f.sqlite.exec("UPDATE users SET email='demo_teacher@medace.app',created_at=1 WHERE id='teacher'");
    await f.run(create());await f.run(advance(1,triage),'admin');
    await auth.deleteExpiredDemoUsers(f.env,2);
    expect(f.sqlite.prepare("SELECT id FROM users WHERE id='teacher'").get()).toBeUndefined();
    for(const table of ['product_feedback_reports','product_feedback_events','product_feedback_receipts'])expect(f.count(table)).toBe(0);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('deleting an administrator preserves another reporter history and role while nulling actor IDs',async()=>{
    const f=setup();await f.run(create());await f.run(advance(1,triage),'admin');await f.run(create('admin-report'),'admin');
    f.sqlite.exec("DELETE FROM users WHERE id='admin'");
    expect(f.count('product_feedback_reports')).toBe(1);expect(f.count('product_feedback_events')).toBe(2);
    const event=f.sqlite.prepare('SELECT actor_user_id,actor_role,status FROM product_feedback_events WHERE revision=2').get();
    expect(event).toMatchObject({actor_user_id:null,actor_role:'ADMIN',status:'TRIAGED'});
    expect(f.sqlite.prepare('SELECT actor_user_id FROM product_feedback_receipts').get()).toMatchObject({actor_user_id:null});
    expect(await f.run({action:'get',id:'report-1'})).toMatchObject({historyLoaded:true,history:[{actorRole:'INSTRUCTOR'},{actorRole:'ADMIN',status:'TRIAGED'}]});
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('organization deletion removes its feedback and children while retaining unrelated admin reports',async()=>{
    const f=setup();await f.run(create());await f.run(advance(1,triage),'admin');await f.run(create('admin-report'),'admin');
    f.sqlite.exec("DELETE FROM organizations WHERE id='org'");
    expect(f.count('product_feedback_reports')).toBe(1);expect(f.count('product_feedback_events')).toBe(1);expect(f.count('product_feedback_receipts')).toBe(0);
    expect(f.count('users')).toBe(4);expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('full reset deletes feedback including administrator reports before deleting organizations',async()=>{
    const f=setup();await f.run(create());await f.run(advance(1,triage),'admin');await f.run(create('admin-report'),'admin');
    await handleResetAllData(f.env);
    for(const table of ['product_feedback_reports','product_feedback_events','product_feedback_receipts','organizations'])expect(f.count(table)).toBe(0);
    expect(f.count('users')).toBe(4);expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('route enforces authentication, same origin, body size and method boundary',async()=>{
    const f=setup();const route=productFeedbackRoutes[0]; const context=(body:unknown)=>({env:f.env,pathname:'product-feedback',request:new Request('https://app.test/api/product-feedback',{method:'POST',headers:{Origin:'https://app.test'},body:JSON.stringify(body)})});
    vi.spyOn(auth,'requireUser').mockRejectedValueOnce(Object.assign(new Error('login required'),{status:401})); await expect(route.handle(context(create()))).rejects.toMatchObject({status:401});
    vi.mocked(auth.requireUser).mockResolvedValue(f.user());
    expect((await route.handle(context(create()))).response.status).toBe(200);
    await expect(route.handle(context({action:'unknown'}))).rejects.toMatchObject({status:400});
    await expect(route.handle(context({action:'list',extra:'x'.repeat(49*1024)}))).rejects.toMatchObject({status:413});
    await expect(route.handle({...context(create()),request:new Request('https://app.test/api/product-feedback',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'})})).rejects.toMatchObject({status:403});
    expect(route.matches({...context(create()),request:new Request('https://app.test/api/product-feedback')})).toBe(false);
  });
});
