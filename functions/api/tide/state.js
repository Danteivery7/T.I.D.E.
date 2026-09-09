import { comparePassword,isAuthenticated,json } from '../../_lib/auth.js';
import { mergeAndWrite,readCloud,validState } from '../../_lib/state.js';
import { entryText,saveEntry } from '../../_lib/diary.js';

const DATE_RE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const clean=(value,max=12000)=>String(value??'').trim().slice(0,max);

function parseJson(value,fallback){
  if(value==null)return fallback;
  if(typeof value==='object')return value;
  try{return JSON.parse(String(value))}catch{return fallback}
}

async function normalAuthorize(context){return isAuthenticated(context.env,context.request)}
async function shortcutAuthorize(context,body={}){
  if(await isAuthenticated(context.env,context.request))return true;
  const code=body?.code||context.request.headers.get('x-tide-access-code')||'';
  return comparePassword(context.env,code);
}

async function shortcutContext(context,date){
  const todayPath=`$.entries."${date}".text`;
  const todayRow=await context.env.TIDE_DB
    .prepare('SELECT json_extract(json, ?1) AS text FROM tide_state WHERE id=1')
    .bind(todayPath).first();
  return {date,today:clean(todayRow?.text),recent:[]};
}

async function quickSave(context,date,text){
  const entryPath=`$.entries."${date}"`;
  for(let attempt=0;attempt<5;attempt++){
    const row=await context.env.TIDE_DB
      .prepare(`SELECT version,
                       json_extract(json, ?1) AS entry,
                       json_extract(json, '$.occurrences') AS occurrences
                FROM tide_state WHERE id=1`)
      .bind(entryPath).first();
    if(!row)return {error:'T.I.D.E. state has not been initialized yet.',status:409};

    const previous=parseJson(row.entry,null);
    const occurrences=parseJson(row.occurrences,[]);
    const state={entries:{},occurrences:Array.isArray(occurrences)?occurrences:[]};
    if(previous)state.entries[date]=previous;
    const oldText=entryText(previous);
    const combined=oldText?`${oldText}, ${text}`:text;
    saveEntry(state,date,combined);

    const now=state.updatedAt||new Date().toISOString();
    const result=await context.env.TIDE_DB
      .prepare(`UPDATE tide_state
                SET json=json_set(
                      json,
                      ?1, json(?2),
                      '$.occurrences', json(?3),
                      '$.updatedAt', ?4
                    ),
                    version=version+1,
                    updated_at=?4
                WHERE id=1 AND version=?5`)
      .bind(entryPath,JSON.stringify(state.entries[date]),JSON.stringify(state.occurrences),now,Number(row.version)).run();
    if(Number(result?.meta?.changes||0)===1)return {ok:true,date,text:state.entries[date].text};
  }
  return {error:'Shared database changed too many times. Try again.',status:409};
}

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const shortcut=url.searchParams.get('shortcut')==='1';
  if(shortcut){
    if(!await shortcutAuthorize(context))return json({error:'Unauthorized.'},401);
    const date=clean(url.searchParams.get('date'),10);
    if(!DATE_RE.test(date))return json({error:'Invalid date.'},400);
    try{return json(await shortcutContext(context,date))}
    catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
  }
  if(!await normalAuthorize(context))return json({error:'Unauthorized.'},401);
  try{const current=await readCloud(context.env);return json({state:current.state,etag:current.etag})}
  catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
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
    try{
      const saved=await quickSave(context,date,text);
      if(saved.error)return json({error:saved.error},saved.status||500);
      return json(saved);
    }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
  }

  if(!await normalAuthorize(context))return json({error:'Unauthorized.'},401);
  try{
    if(!validState(body?.state))return json({error:'Invalid T.I.D.E. state.'},400);
    const saved=await mergeAndWrite(context.env,body.state);
    return json({ok:true,state:saved.state,etag:saved.etag});
  }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}
