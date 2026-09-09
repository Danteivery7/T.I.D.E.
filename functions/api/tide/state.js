import { comparePassword,isAuthenticated,json } from '../../_lib/auth.js';
import { mergeAndWrite,readCloud,validState } from '../../_lib/state.js';
import { entryText,saveEntry } from '../../_lib/diary.js';

const DATE_RE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const clean=(value,max=12000)=>String(value??'').trim().slice(0,max);

async function authorize(context,shortcut=false){
  if(await isAuthenticated(context.env,context.request))return true;
  if(!shortcut)return false;
  return comparePassword(context.env,context.request.headers.get('x-tide-access-code')||'');
}

async function shortcutContext(context,date){
  const todayPath=`$.entries."${date}".text`;
  const todayRow=await context.env.TIDE_DB
    .prepare('SELECT json_extract(json, ?1) AS text FROM tide_state WHERE id=1')
    .bind(todayPath).first();
  const recentResult=await context.env.TIDE_DB
    .prepare(`SELECT e.key AS date, json_extract(e.value,'$.text') AS text
              FROM tide_state, json_each(json,'$.entries') AS e
              WHERE tide_state.id=1 AND e.key < ?1
              ORDER BY e.key DESC LIMIT 5`)
    .bind(date).all();
  const recent=(recentResult?.results||[])
    .map(row=>({date:clean(row?.date,10),text:clean(row?.text)}))
    .filter(row=>row.date&&row.text);
  return {date,today:clean(todayRow?.text),recent};
}

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const shortcut=url.searchParams.get('shortcut')==='1';
  if(!await authorize(context,shortcut))return json({error:'Unauthorized.'},401);
  try{
    if(shortcut){
      const date=clean(url.searchParams.get('date'),10);
      if(!DATE_RE.test(date))return json({error:'Invalid date.'},400);
      return json(await shortcutContext(context,date));
    }
    const current=await readCloud(context.env);
    return json({state:current.state,etag:current.etag});
  }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}

export async function onRequestPost(context){
  const url=new URL(context.request.url);
  const shortcut=url.searchParams.get('shortcut')==='1';
  if(!await authorize(context,shortcut))return json({error:'Unauthorized.'},401);
  try{
    let body;try{body=await context.request.json()}catch{return json({error:'Invalid JSON.'},400)}
    if(shortcut){
      const date=clean(body?.date,10),text=clean(body?.text,4000);
      if(!DATE_RE.test(date))return json({error:'Invalid date.'},400);
      if(!text)return json({error:'Text is required.'},400);
      const current=await readCloud(context.env);
      if(!current.state)return json({error:'T.I.D.E. state has not been initialized yet.'},409);
      const state=structuredClone(current.state);
      const previous=entryText(state.entries?.[date]);
      saveEntry(state,date,previous?`${previous}, ${text}`:text);
      const saved=await mergeAndWrite(context.env,state);
      return json({ok:true,date,text:entryText(saved.state?.entries?.[date])});
    }
    if(!validState(body?.state))return json({error:'Invalid T.I.D.E. state.'},400);
    const saved=await mergeAndWrite(context.env,body.state);
    return json({ok:true,state:saved.state,etag:saved.etag});
  }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}
