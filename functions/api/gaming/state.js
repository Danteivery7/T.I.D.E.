import { isAuthenticated, json } from '../../_lib/auth.js';

const ROW_ID=1;
async function ensureTable(env){await env.TIDE_DB.prepare(`CREATE TABLE IF NOT EXISTS tide_gaming_state (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();}
async function read(env){await ensureTable(env);const row=await env.TIDE_DB.prepare('SELECT version,json FROM tide_gaming_state WHERE id=?1').bind(ROW_ID).first();if(!row)return{gaming:null,version:0,etag:null};return{gaming:JSON.parse(row.json),version:Number(row.version),etag:String(row.version)};}
function stamp(x){return String(x?.updatedAt||'');}
function newer(a,b){if(!a)return b;if(!b)return a;return stamp(b)>=stamp(a)?b:a;}
function mergeGaming(remote={},incoming={}){
  const newerState=stamp(incoming)>=stamp(remote)?incoming:remote,older=newerState===incoming?remote:incoming,out={...older,...newerState};
  out.activity={...(older.activity||{})};
  for(const [date,rec] of Object.entries(newerState.activity||{}))out.activity[date]=newer(out.activity[date],rec);
  out.recoveredMonths={...(older.recoveredMonths||{})};
  for(const [month,rec] of Object.entries(newerState.recoveredMonths||{}))out.recoveredMonths[month]=newer(out.recoveredMonths[month],rec);
  out.baselineDate=[remote.baselineDate,incoming.baselineDate].filter(Boolean).sort()[0]||null;
  out.latestSources=Array.isArray(newerState.latestSources)?newerState.latestSources:[];
  out.updatedAt=new Date().toISOString();
  return out;
}
async function write(env,incoming){
  await ensureTable(env);
  for(let i=0;i<5;i++){
    const cur=await read(env),merged=mergeGaming(cur.gaming||{},incoming||{}),text=JSON.stringify(merged),ts=new Date().toISOString();
    if(cur.version===0){
      const ins=await env.TIDE_DB.prepare('INSERT OR IGNORE INTO tide_gaming_state (id,version,json,updated_at) VALUES (?1,1,?2,?3)').bind(ROW_ID,text,ts).run();
      if(Number(ins?.meta?.changes||0)===1)return{gaming:merged,etag:'1'};
      continue;
    }
    const result=await env.TIDE_DB.prepare('UPDATE tide_gaming_state SET json=?1,version=version+1,updated_at=?2 WHERE id=?3 AND version=?4').bind(text,ts,ROW_ID,cur.version).run();
    if(Number(result?.meta?.changes||0)===1)return{gaming:merged,etag:String(cur.version+1)};
  }
  throw new Error('Gaming database changed too many times. Refresh again.');
}
export async function onRequestGet({env,request}){if(!(await isAuthenticated(env,request)))return json({error:'Connect T.I.D.E. Cloud Sync first.'},401);const r=await read(env);return json({gaming:r.gaming||{},etag:r.etag});}
export async function onRequestPost({env,request}){
  if(!(await isAuthenticated(env,request)))return json({error:'Connect T.I.D.E. Cloud Sync first.'},401);
  let body={};try{body=await request.json();}catch{return json({error:'Invalid gaming state.'},400);}
  if(!body.gaming||typeof body.gaming!=='object')return json({error:'Missing gaming state.'},400);
  try{return json(await write(env,body.gaming));}catch(error){return json({error:String(error?.message||error)},409);}
}
