import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {naruSourceCorrectionGuard} from '../shared/naruSourceCorrectionSql.mjs';
import {NARU_SOURCE_CORRECTIONS,naruCorrectionProof} from '../scripts/_shared/naru-source-corrections.mjs';

// Native SQLite uses a larger depth limit. Exercise the actual workerd D1
// parser without records, networking, providers or persistent application state.
// The separate native fixtures cover eligibility, immutability and saved history.
describe('source correction real workerd D1 expression-depth regression',()=>{
 it('prepares all three proof-bound guards on the complete empty schema at the real depth limit',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({name:'depth-test',modules:true,script:'export default {fetch(){return new Response("local test");}}',d1Databases:{DB:'naru-correction-depth-test'}}));
  try{
   const db=await mf.getD1Database('DB');
   for(const file of fs.readdirSync('migrations').filter(name=>name.endsWith('.sql')&&Number(name.slice(0,4))<=59).sort()){
    for(const statement of unstable_splitSqlQuery(fs.readFileSync(`migrations/${file}`,'utf8')))await db.prepare(statement).run();
   }
   const proof=JSON.stringify(naruCorrectionProof(NARU_SOURCE_CORRECTIONS.corrections[0]));
   for(const phase of ['before','pending','after']){
    const guard=naruSourceCorrectionGuard({phase,payload:'x.payload'});
    const result=await db.prepare(`WITH x(payload) AS(SELECT ?) SELECT ${guard} AS eligible FROM x`).bind(proof).first();
    expect(result).toEqual({eligible:0});
   }
   // Positive control: this engine really enforces the smaller expression limit.
   await expect(db.prepare(`SELECT ${Array.from({length:101},()=>"json_extract('{}','$.value') IS NULL").join(' AND ')} AS flat`).first()).rejects.toThrow(/Expression tree is too large|maximum depth 100/i);
  }finally{await mf.dispose();}
 },30000);
});
