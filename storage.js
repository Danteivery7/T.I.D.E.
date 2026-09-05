import { freshState } from './engine.js';

const LOCAL_KEY='tide_state_v1';
const OUTBOX_KEY='tide_shared_outbox_v1';
const DRAFT_PREFIX='tide_draft:';
const DC_RECOVERY='dc-119-persistence-recovery-v1';
const nativeSetItem=typeof Storage!=='undefined'?Storage.prototype.setItem:null;
const nativeRemoveItem=typeof Storage!=='undefined'?Storage.prototype.removeItem:null;
let syncTimer=null;
let syncPromise=null;

function migrate(input){
  const base=freshState();
  const s=input&&typeof input==='object'?input:{};
  return {
    ...base,...s,
    entries:s.entries||{},monthlyReviews:s.monthlyReviews||{},yearlyReviews:s.yearlyReviews||{},
    occurrences:Array.isArray(s.occurrences)?s.occurrences:[],trackerOverrides:s.trackerOverrides||{},
    musicCache:s.musicCache||{},rawImports:Array.isArray(s.rawImports)?s.rawImports:[],tideCounters:s.tideCounters||{},
    yearRankings:s.yearRankings||null,
    settings:{...base.settings,...(s.settings||{}),migrations:{...(base.settings?.migrations||{}),...(s.settings?.migrations||{})}},
  };
}

function rawSet(key,value){
  if(nativeSetItem)nativeSetItem.call(localStorage,key,value);
  else localStorage.setItem(key,value);
}
function rawRemove(key){
  if(nativeRemoveItem)nativeRemoveItem.call(localStorage,key);
  else localStorage.removeItem(key);
}
function rawWriteLocal(state){rawSet(LOCAL_KEY,JSON.stringify(migrate(state)));}
function readLocalRaw(){
  try{const raw=localStorage.getItem(LOCAL_KEY);return raw?migrate(JSON.parse(raw)):freshState();}
  catch{return freshState();}
}
function envelopeId(){return crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function readOutbox(){
  try{
    const raw=localStorage.getItem(OUTBOX_KEY);if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(parsed?.state)return {...parsed,state:migrate(parsed.state)};
    return {id:`legacy-${String(parsed?.updatedAt||Date.now())}`,queuedAt:new Date().toISOString(),state:migrate(parsed)};
  }catch{return null;}
}
function queueState(state){
  const envelope={id:envelopeId(),queuedAt:new Date().toISOString(),state:migrate(state)};
  rawSet(OUTBOX_KEY,JSON.stringify(envelope));
  return envelope;
}
function clearEnvelope(id){
  const current=readOutbox();
  if(current?.id===id)rawRemove(OUTBOX_KEY);
}

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
  out.geoguessr10k=newer(remote.geoguessr10k,local.geoguessr10k)||local.geoguessr10k||remote.geoguessr10k;
  const years={...(remote.montyYears||{})};
  for(const [year,value] of Object.entries(local.montyYears||{}))years[year]=newer(years[year],value);
  out.montyYears=years;
  out.authoritativeTrackerTotals=mergeMapByTime(remote.authoritativeTrackerTotals||{},local.authoritativeTrackerTotals||{});
  return out;
}
function normalOccurrenceKey(x){return x.id||`${x.trackerId}:${x.date}:${x.snippet}:${x.result||''}:${x.value??''}`;}
function detectedOccurrenceKey(x){return `detected:${x.trackerId}:${x.date}:${x.snippet||''}:${x.result||''}:${x.value??''}`;}
function mergeOccurrences(localRows=[],remoteRows=[],localEntries={},remoteEntries={}){
  const out=new Map();
  for(const x of [...remoteRows,...localRows]){
    if(x?.source==='detected')continue;
    const key=normalOccurrenceKey(x);out.set(key,newer(out.get(key),x));
  }
  const dates=new Set([...remoteRows,...localRows].filter(x=>x?.source==='detected'&&x.date).map(x=>x.date));
  for(const date of dates){
    const le=localEntries?.[date],re=remoteEntries?.[date];
    const ls=String(le?.updatedAt||''),rs=String(re?.updatedAt||'');
    let rows;
    if(le||re)rows=re&&(!le||rs>ls)?remoteRows:localRows;
    else rows=[...remoteRows,...localRows];
    for(const x of rows){
      if(x?.source!=='detected'||x.date!==date)continue;
      const key=detectedOccurrenceKey(x);out.set(key,newer(out.get(key),x));
    }
  }
  return [...out.values()];
}
export function mergeStates(local,remote){
  if(!remote)return migrate(local);
  if(!local)return migrate(remote);
  const l=migrate(local),r=migrate(remote),out=migrate({...r,...l});
  out.entries=mergeMapByTime(l.entries,r.entries);
  out.monthlyReviews=mergeMapByTime(l.monthlyReviews,r.monthlyReviews);
  out.yearlyReviews=mergeMapByTime(l.yearlyReviews,r.yearlyReviews);
  out.occurrences=mergeOccurrences(l.occurrences,r.occurrences,l.entries,r.entries);
  out.trackerOverrides={...(r.trackerOverrides||{}),...(l.trackerOverrides||{})};
  out.musicCache={...(r.musicCache||{}),...(l.musicCache||{})};
  const imports=new Map();for(const x of [...(r.rawImports||[]),...(l.rawImports||[])])imports.set(x.id||`${x.importedAt}:${x.characters}`,x);out.rawImports=[...imports.values()];
  out.tideCounters=mergeCounters(l.tideCounters,r.tideCounters);
  out.yearRankings=newer(r.yearRankings,l.yearRankings)||l.yearRankings||r.yearRankings||null;
  out.settings={...(r.settings||{}),...(l.settings||{}),migrations:{...(r.settings?.migrations||{}),...(l.settings?.migrations||{})}};
  out.updatedAt=new Date().toISOString();
  return out;
}

export function loadLocal(){
  const local=readLocalRaw(),pending=readOutbox();
  return pending?.state?mergeStates(local,pending.state):local;
}
export function saveLocal(state){
  state=migrate(state);state.updatedAt=new Date().toISOString();
  localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
  return state;
}
export function saveDraft(date,text){localStorage.setItem(`${DRAFT_PREFIX}${date}`,String(text||''));}
export function loadDraft(date){return localStorage.getItem(`${DRAFT_PREFIX}${date}`);}
export function clearDraft(date){localStorage.removeItem(`${DRAFT_PREFIX}${date}`);}
export function exportState(state){return new Blob([JSON.stringify(state,null,2)],{type:'application/json'});}
export function importStateObject(obj){return migrate(obj);}

async function jsonFetch(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json',...(options.headers||{})},...options});
  let body={};try{body=await response.json();}catch{}
  if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);
  return body;
}

async function pushEnvelope(envelope){
  const response=await fetch('/api/tide/state',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
    body:JSON.stringify({state:envelope.state}),
  });
  let body={};try{body=await response.json();}catch{}
  if(!response.ok)throw new Error(body.error||`Shared sync failed (${response.status})`);
  const latest=loadLocal();
  const confirmed=body.state?mergeStates(latest,body.state):latest;
  rawWriteLocal(confirmed);
  clearEnvelope(envelope.id);
  return {...body,ok:body.ok!==false,state:confirmed};
}

export async function flushSharedSync(){
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
    let last=null;
    while(true){
      const envelope=readOutbox();
      if(!envelope)return last;
      last=await pushEnvelope(envelope);
    }
  })();
  try{return await syncPromise;}
  finally{syncPromise=null;}
}
function scheduleSharedSync({immediate=false}={}){
  if(typeof window==='undefined'||!readOutbox())return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{void flushSharedSync().catch(()=>{});},immediate?0:120);
}

// Every T.I.D.E. state write is synchronously copied to a durable outbox before any reload/navigation can interrupt networking.
if(typeof window!=='undefined'&&nativeSetItem&&!window.__tideSharedStoragePatched){
  window.__tideSharedStoragePatched=true;
  Storage.prototype.setItem=function(key,value){
    nativeSetItem.call(this,key,value);
    if(this===localStorage&&key===LOCAL_KEY){
      try{queueState(JSON.parse(value));scheduleSharedSync();}catch{}
    }
  };
  if(readOutbox())scheduleSharedSync({immediate:true});
}

function recoverDailyChallenge119(){
  try{
    const state=readLocalRaw();
    state.settings||={};state.settings.migrations||={};
    if(state.settings.migrations[DC_RECOVERY])return;
    const dc=state?.tideCounters?.dailyChallenge;
    const current=Number(dc?.current);
    if(current===118){
      const stamp=new Date().toISOString();
      state.tideCounters||={};
      state.tideCounters.dailyChallenge={
        ...(dc||{}),current:119,longest:Math.max(119,Number(dc?.longest)||0),lastCounted:'2026-08-23',
        longestEnd:Number(dc?.longest)>=119?(dc?.longestEnd||'2026-08-23'):'2026-08-23',updatedAt:stamp,
      };
      state.settings.migrations[DC_RECOVERY]=true;
      state.updatedAt=stamp;
      localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
    }else if(current>=119){
      state.settings.migrations[DC_RECOVERY]=true;
      state.updatedAt=new Date().toISOString();
      localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
    }
  }catch{}
}
if(typeof window!=='undefined')recoverDailyChallenge119();

export async function cloudStatus(){try{return await jsonFetch('/api/auth/status',{method:'GET',headers:{}});}catch{return {configured:false,authenticated:false,offline:true};}}
export async function cloudLogin(password){
  const result=await jsonFetch('/api/auth/login',{method:'POST',body:JSON.stringify({password})});
  const pulled=await jsonFetch('/api/tide/state',{method:'GET',headers:{}});
  const merged=mergeStates(loadLocal(),pulled.state);
  rawWriteLocal(merged);
  queueState(merged);
  await flushSharedSync();
  return result;
}
export async function cloudLogout(){return jsonFetch('/api/auth/logout',{method:'POST',body:'{}'});}
export async function cloudPull(){
  // Pending local changes always reach D1 before an older cloud snapshot is allowed to come back down.
  if(readOutbox())await flushSharedSync();
  return jsonFetch('/api/tide/state',{method:'GET',headers:{}});
}
export async function cloudPush(state,etag=null){
  const next=migrate(state);next.updatedAt=String(next.updatedAt||new Date().toISOString());
  rawWriteLocal(next);
  queueState(next);
  return await flushSharedSync();
}
