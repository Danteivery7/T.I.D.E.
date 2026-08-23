import { freshState } from './engine.js';

const LOCAL_KEY='tide_state_v1';
const DRAFT_PREFIX='tide_draft:';
const SYNC_STAMP='tide_shared_sync_stamp_v1';
const nativeSetItem=typeof Storage!=='undefined'?Storage.prototype.setItem:null;
let syncTimer=null;
let syncPending=null;
let syncRunning=false;

function migrate(input){
  const base=freshState();
  const s=input&&typeof input==='object'?input:{};
  return {
    ...base,...s,
    entries:s.entries||{},monthlyReviews:s.monthlyReviews||{},yearlyReviews:s.yearlyReviews||{},
    occurrences:Array.isArray(s.occurrences)?s.occurrences:[],trackerOverrides:s.trackerOverrides||{},
    musicCache:s.musicCache||{},rawImports:Array.isArray(s.rawImports)?s.rawImports:[],tideCounters:s.tideCounters||{},
    settings:{...base.settings,...(s.settings||{}),migrations:{...(base.settings?.migrations||{}),...(s.settings?.migrations||{})}},
  };
}

function rawWriteLocal(state){
  const json=JSON.stringify(state);
  if(nativeSetItem)nativeSetItem.call(localStorage,LOCAL_KEY,json);
  else localStorage.setItem(LOCAL_KEY,json);
}

async function sharedPush(state){
  const response=await fetch('/api/tide/state',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
    body:JSON.stringify({state}),
  });
  if(response.status===401||response.status===503)return null;
  let body={};try{body=await response.json()}catch{}
  if(!response.ok)throw new Error(body.error||`Shared sync failed (${response.status})`);
  if(body.state){
    const latest=loadLocal();
    const merged=mergeStates(latest,body.state);
    rawWriteLocal(merged);
    try{sessionStorage.setItem(SYNC_STAMP,String(merged.updatedAt||''))}catch{}
    return {...body,state:merged};
  }
  try{sessionStorage.setItem(SYNC_STAMP,String(state.updatedAt||''))}catch{}
  return body;
}

async function flushSharedSync(){
  if(syncRunning||!syncPending)return;
  syncRunning=true;
  try{
    while(syncPending){
      const state=syncPending;syncPending=null;
      try{await sharedPush(state)}catch{}
    }
  }finally{syncRunning=false}
}

function scheduleSharedSync(value,{immediate=false}={}){
  if(typeof window==='undefined')return;
  let state;try{state=migrate(typeof value==='string'?JSON.parse(value):value)}catch{return}
  const stamp=String(state.updatedAt||'');
  try{if(stamp&&sessionStorage.getItem(SYNC_STAMP)===stamp)return}catch{}
  syncPending=state;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>void flushSharedSync(),immediate?0:120);
}

// Catch writes made by every part of T.I.D.E., including enhancement controls that write localStorage directly.
if(typeof window!=='undefined'&&nativeSetItem&&!window.__tideSharedStoragePatched){
  window.__tideSharedStoragePatched=true;
  Storage.prototype.setItem=function(key,value){
    nativeSetItem.call(this,key,value);
    if(this===localStorage&&key===LOCAL_KEY)scheduleSharedSync(value);
  };
  // A reload immediately after a local write cannot lose the sync: the new page uploads the newest state here.
  const existing=localStorage.getItem(LOCAL_KEY);
  if(existing)scheduleSharedSync(existing,{immediate:true});
}

export function loadLocal(){try{const raw=localStorage.getItem(LOCAL_KEY);if(!raw)return freshState();return migrate(JSON.parse(raw))}catch{return freshState()}}
export function saveLocal(state){state=migrate(state);state.updatedAt=new Date().toISOString();localStorage.setItem(LOCAL_KEY,JSON.stringify(state));return state}
export function saveDraft(date,text){localStorage.setItem(`${DRAFT_PREFIX}${date}`,String(text||''))}
export function loadDraft(date){return localStorage.getItem(`${DRAFT_PREFIX}${date}`)}
export function clearDraft(date){localStorage.removeItem(`${DRAFT_PREFIX}${date}`)}
export function exportState(state){return new Blob([JSON.stringify(state,null,2)],{type:'application/json'})}
export function importStateObject(obj){return migrate(obj)}

async function jsonFetch(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json',...(options.headers||{})},...options});
  let body={};try{body=await response.json()}catch{}
  if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);
  return body;
}

export async function cloudStatus(){try{return await jsonFetch('/api/auth/status',{method:'GET',headers:{}})}catch{return {configured:false,authenticated:false,offline:true}}}
export async function cloudLogin(password){return jsonFetch('/api/auth/login',{method:'POST',body:JSON.stringify({password})})}
export async function cloudLogout(){return jsonFetch('/api/auth/logout',{method:'POST',body:'{}'})}
export async function cloudPull(){return jsonFetch('/api/tide/state',{method:'GET',headers:{}})}
export async function cloudPush(state,etag=null){return jsonFetch('/api/tide/state',{method:'POST',body:JSON.stringify({state,etag})})}

function newer(a,b){
  if(!a)return b;if(!b)return a;
  const at=String(a.updatedAt||a.createdAt||''),bt=String(b.updatedAt||b.createdAt||'');
  return bt>at?b:a;
}
function mergeMapByTime(local={},remote={}){
  const out={...local};
  for(const [key,value] of Object.entries(remote||{}))out[key]=newer(out[key],value);
  return out;
}
function mergeCounters(local={},remote={}){
  const out={...remote,...local};
  out.dailyChallenge=newer(remote.dailyChallenge,local.dailyChallenge)||local.dailyChallenge||remote.dailyChallenge;
  out.montyOverall=newer(remote.montyOverall,local.montyOverall)||local.montyOverall||remote.montyOverall;
  const years={...(remote.montyYears||{})};
  for(const [year,value] of Object.entries(local.montyYears||{}))years[year]=newer(years[year],value);
  out.montyYears=years;
  return out;
}

export function mergeStates(local,remote){
  if(!remote)return migrate(local);
  if(!local)return migrate(remote);
  const l=migrate(local),r=migrate(remote),out=migrate({...r,...l});
  out.entries=mergeMapByTime(l.entries,r.entries);
  out.monthlyReviews=mergeMapByTime(l.monthlyReviews,r.monthlyReviews);
  out.yearlyReviews=mergeMapByTime(l.yearlyReviews,r.yearlyReviews);
  const occ=new Map();
  for(const x of [...(r.occurrences||[]),...(l.occurrences||[])]){
    const key=x.id||`${x.trackerId}:${x.date}:${x.snippet}:${x.result||''}`;
    occ.set(key,newer(occ.get(key),x));
  }
  out.occurrences=[...occ.values()];
  out.trackerOverrides={...(r.trackerOverrides||{}),...(l.trackerOverrides||{})};
  out.musicCache={...(r.musicCache||{}),...(l.musicCache||{})};
  const imports=new Map();for(const x of [...(r.rawImports||[]),...(l.rawImports||[])])imports.set(x.id||`${x.importedAt}:${x.characters}`,x);out.rawImports=[...imports.values()];
  out.tideCounters=mergeCounters(l.tideCounters,r.tideCounters);
  out.settings={...(r.settings||{}),...(l.settings||{}),migrations:{...(r.settings?.migrations||{}),...(l.settings?.migrations||{})}};
  out.updatedAt=new Date().toISOString();
  return out;
}
