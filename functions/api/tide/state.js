import { comparePassword,isAuthenticated,json } from '../../_lib/auth.js';
import { mergeAndWrite,readCloud,validState } from '../../_lib/state.js';
import { entryText,saveEntry } from '../../_lib/diary.js';

const DATE_RE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const clean=(value,max=12000)=>String(value??'').trim().slice(0,max);

async function normalAuthorize(context){return isAuthenticated(context.env,context.request)}
async function shortcutAuthorize(context,body={}){
  if(await isAuthenticated(context.env,context.request))return true;
  const code=body?.code||context.request.headers.get('x-tide-access-code')||'';
  return comparePassword(context.env,code);
}

async function ensureShortcutQueue(env){
  await env.TIDE_DB.prepare(`CREATE TABLE IF NOT EXISTS tide_shortcut_queue (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
}

async function queueShortcutEntry(context,date,text){
  await ensureShortcutQueue(context.env);
  const id=crypto.randomUUID();
  const createdAt=new Date().toISOString();
  await context.env.TIDE_DB
    .prepare('INSERT INTO tide_shortcut_queue (id,date,text,created_at) VALUES (?1,?2,?3,?4)')
    .bind(id,date,text,createdAt).run();
  return {ok:true,queued:true,id,date};
}

async function flushShortcutQueue(context){
  await ensureShortcutQueue(context.env);
  const pendingResult=await context.env.TIDE_DB
    .prepare('SELECT id,date,text FROM tide_shortcut_queue ORDER BY created_at ASC')
    .all();
  const pending=(pendingResult?.results||[]).filter(row=>DATE_RE.test(clean(row?.date,10))&&clean(row?.text,4000));
  if(!pending.length)return;

  const current=await readCloud(context.env);
  if(!current.state)return;
  const state=structuredClone(current.state);
  state.settings||={};
  const applied=new Set(Array.isArray(state.settings.shortcutAppliedIds)?state.settings.shortcutAppliedIds:[]);
  let changed=false;

  for(const row of pending){
    const id=clean(row.id,120),date=clean(row.date,10),text=clean(row.text,4000);
    if(!id||applied.has(id))continue;
    const previous=entryText(state.entries?.[date]);
    saveEntry(state,date,previous?`${previous}, ${text}`:text);
    applied.add(id);
    changed=true;
  }

  if(changed){
    state.settings.shortcutAppliedIds=[...applied].slice(-500);
    await mergeAndWrite(context.env,state);
  }

  for(const row of pending){
    const id=clean(row.id,120);
    if(id)await context.env.TIDE_DB.prepare('DELETE FROM tide_shortcut_queue WHERE id=?1').bind(id).run();
  }
}

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const shortcut=url.searchParams.get('shortcut')==='1';

  if(shortcut){
    if(!await shortcutAuthorize(context))return json({error:'Unauthorized.'},401);
    return json({ok:true});
  }

  if(!await normalAuthorize(context))return json({error:'Unauthorized.'},401);
  try{
    await flushShortcutQueue(context);
    const current=await readCloud(context.env);
    return json({state:current.state,etag:current.etag});
  }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}

export async function onRequestPost(context){
  const url=new URL(context.request.url);
  const shortcut=url.searchParams.get('shortcut')==='1';
  let body;try{body=await context.request.json()}catch{return json({error:'Invalid JSON.'},400)}

  if(shortcut){
    if(!await shortcutAuthorize(context,body))return json({error:'Unauthorized.'},401);
    const date=clean(body?.date,10),text=clean(body?.text,4000);
    if(!DATE_RE.test(date))return json({error:'Invalid date.'},400);
    if(!text)return json({error:'Text is required.'},400);
    try{return json(await queueShortcutEntry(context,date,text))}
    catch(error){return json({error:error?.message||'Shortcut queue request failed.'},500)}
  }

  if(!await normalAuthorize(context))return json({error:'Unauthorized.'},401);
  try{
    if(!validState(body?.state))return json({error:'Invalid T.I.D.E. state.'},400);
    const saved=await mergeAndWrite(context.env,body.state);
    return json({ok:true,state:saved.state,etag:saved.etag});
  }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}
