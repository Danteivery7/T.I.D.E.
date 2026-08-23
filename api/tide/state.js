import { get, put } from '@vercel/blob';
import { isAuthenticated, json } from '../_lib/auth.js';

const PATH='tide/state-v1.json';

function validState(state){return state&&typeof state==='object'&&Number(state.version)>=1&&state.entries&&typeof state.entries==='object'&&Array.isArray(state.occurrences)}
function newer(a,b){if(!a)return b;if(!b)return a;const at=String(a.updatedAt||a.createdAt||''),bt=String(b.updatedAt||b.createdAt||'');return bt>at?b:a}
function mergeMapByTime(a={},b={}){const out={...a};for(const [k,v] of Object.entries(b||{}))out[k]=newer(out[k],v);return out}
function cleanCounter(counter){if(!counter||typeof counter!=='object')return counter;return {...counter}}
function mergeCounters(a={},b={}){
  const out={...a,...b};
  out.dailyChallenge=cleanCounter(newer(a.dailyChallenge,b.dailyChallenge)||a.dailyChallenge||b.dailyChallenge);
  out.montyOverall=cleanCounter(newer(a.montyOverall,b.montyOverall)||a.montyOverall||b.montyOverall);
  const years={...(a.montyYears||{})};for(const [year,value] of Object.entries(b.montyYears||{}))years[year]=newer(years[year],value);out.montyYears=years;
  return out;
}
function mergeStates(remote,incoming){
  if(!remote)return {...incoming,updatedAt:new Date().toISOString()};
  if(!incoming)return remote;
  const out={...remote,...incoming};
  out.entries=mergeMapByTime(remote.entries,incoming.entries);
  out.monthlyReviews=mergeMapByTime(remote.monthlyReviews,incoming.monthlyReviews);
  out.yearlyReviews=mergeMapByTime(remote.yearlyReviews,incoming.yearlyReviews);
  const occ=new Map();
  for(const row of [...(remote.occurrences||[]),...(incoming.occurrences||[])]){
    const key=row.id||`${row.trackerId}:${row.date}:${row.snippet}:${row.result||''}`;
    occ.set(key,newer(occ.get(key),row));
  }
  out.occurrences=[...occ.values()];
  out.trackerOverrides={...(remote.trackerOverrides||{}),...(incoming.trackerOverrides||{})};
  out.musicCache={...(remote.musicCache||{}),...(incoming.musicCache||{})};
  const imports=new Map();for(const x of [...(remote.rawImports||[]),...(incoming.rawImports||[])])imports.set(x.id||`${x.importedAt}:${x.characters}`,x);out.rawImports=[...imports.values()];
  out.tideCounters=mergeCounters(remote.tideCounters,incoming.tideCounters);
  out.settings={...(remote.settings||{}),...(incoming.settings||{}),migrations:{...(remote.settings?.migrations||{}),...(incoming.settings?.migrations||{})}};
  out.updatedAt=new Date().toISOString();
  return out;
}

async function readCloud(){
  try{
    const result=await get(PATH,{access:'private',useCache:false});
    if(!result||result.statusCode!==200||!result.stream)return{state:null,etag:null};
    const text=await new Response(result.stream).text();
    return{state:text?JSON.parse(text):null,etag:result.blob?.etag||null};
  }catch(error){
    if(/not.?found/i.test(String(error?.name||error?.message||'')))return{state:null,etag:null};
    throw error;
  }
}

export default async function handler(request){
  if(!isAuthenticated(request))return json({error:'Unauthorized.'},401);
  try{
    if(request.method==='GET'){
      const current=await readCloud();
      return json({state:current.state,etag:current.etag});
    }
    if(request.method==='POST'){
      let body;try{body=await request.json()}catch{return json({error:'Invalid JSON.'},400)}
      if(!validState(body?.state))return json({error:'Invalid T.I.D.E. state.'},400);
      const current=await readCloud();
      const merged=mergeStates(current.state,body.state);
      const blob=await put(PATH,JSON.stringify(merged),{
        access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,
      });
      return json({ok:true,state:merged,etag:blob.etag});
    }
    return json({error:'Method not allowed.'},405);
  }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}
