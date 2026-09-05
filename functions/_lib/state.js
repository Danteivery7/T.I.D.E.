const ROW_ID=1;

export function validState(state){return state&&typeof state==='object'&&Number(state.version)>=1&&state.entries&&typeof state.entries==='object'&&Array.isArray(state.occurrences)}

async function ensureTable(env){
  await env.TIDE_DB.prepare(`CREATE TABLE IF NOT EXISTS tide_state (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

export async function readCloud(env){
  await ensureTable(env);
  const row=await env.TIDE_DB.prepare('SELECT version, json FROM tide_state WHERE id=?1').bind(ROW_ID).first();
  if(!row)return {state:null,etag:null,version:0};
  return {state:JSON.parse(row.json),etag:String(row.version),version:Number(row.version)};
}

function newer(a,b){if(!a)return b;if(!b)return a;const at=String(a.updatedAt||a.createdAt||''),bt=String(b.updatedAt||b.createdAt||'');return bt>at?b:a}
function mergeMapByTime(a={},b={}){const out={...a};for(const [k,v] of Object.entries(b||{}))out[k]=newer(out[k],v);return out}
function mergeCounters(a={},b={}){
  const out={...a,...b};
  out.dailyChallenge=newer(a.dailyChallenge,b.dailyChallenge)||a.dailyChallenge||b.dailyChallenge;
  out.montyOverall=newer(a.montyOverall,b.montyOverall)||a.montyOverall||b.montyOverall;
  out.geoguessr10k=newer(a.geoguessr10k,b.geoguessr10k)||a.geoguessr10k||b.geoguessr10k;
  const years={...(a.montyYears||{})};for(const [year,value] of Object.entries(b.montyYears||{}))years[year]=newer(years[year],value);out.montyYears=years;
  out.authoritativeTrackerTotals=mergeMapByTime(a.authoritativeTrackerTotals||{},b.authoritativeTrackerTotals||{});
  return out;
}
function normalOccurrenceKey(x){return x.id||`${x.trackerId}:${x.date}:${x.snippet}:${x.result||''}:${x.value??''}`}
function detectedOccurrenceKey(x){return `detected:${x.trackerId}:${x.date}:${x.snippet||''}:${x.result||''}:${x.value??''}`}
function mergeOccurrences(remoteRows=[],incomingRows=[],remoteEntries={},incomingEntries={}){
  const out=new Map();
  for(const row of [...remoteRows,...incomingRows]){
    if(row?.source==='detected')continue;
    const key=normalOccurrenceKey(row);out.set(key,newer(out.get(key),row));
  }
  const dates=new Set([...remoteRows,...incomingRows].filter(x=>x?.source==='detected'&&x.date).map(x=>x.date));
  for(const date of dates){
    const re=remoteEntries?.[date],ie=incomingEntries?.[date];
    const rs=String(re?.updatedAt||''),is=String(ie?.updatedAt||'');
    let rows;
    if(re||ie)rows=ie&&(!re||is>=rs)?incomingRows:remoteRows;
    else rows=[...remoteRows,...incomingRows];
    for(const row of rows){
      if(row?.source!=='detected'||row.date!==date)continue;
      const key=detectedOccurrenceKey(row);out.set(key,newer(out.get(key),row));
    }
  }
  return [...out.values()];
}
export function mergeStates(remote,incoming){
  if(!remote)return {...incoming,updatedAt:new Date().toISOString()};
  if(!incoming)return remote;
  const out={...remote,...incoming};
  out.entries=mergeMapByTime(remote.entries,incoming.entries);
  out.monthlyReviews=mergeMapByTime(remote.monthlyReviews,incoming.monthlyReviews);
  out.yearlyReviews=mergeMapByTime(remote.yearlyReviews,incoming.yearlyReviews);
  out.occurrences=mergeOccurrences(remote.occurrences,incoming.occurrences,remote.entries,incoming.entries);
  out.trackerOverrides={...(remote.trackerOverrides||{}),...(incoming.trackerOverrides||{})};
  out.musicCache={...(remote.musicCache||{}),...(incoming.musicCache||{})};
  const imports=new Map();for(const x of [...(remote.rawImports||[]),...(incoming.rawImports||[])])imports.set(x.id||`${x.importedAt}:${x.characters}`,x);out.rawImports=[...imports.values()];
  out.tideCounters=mergeCounters(remote.tideCounters,incoming.tideCounters);
  out.yearRankings=newer(remote.yearRankings,incoming.yearRankings)||incoming.yearRankings||remote.yearRankings||null;
  out.settings={...(remote.settings||{}),...(incoming.settings||{}),migrations:{...(remote.settings?.migrations||{}),...(incoming.settings?.migrations||{})}};
  out.updatedAt=new Date().toISOString();
  return out;
}
export async function mergeAndWrite(env,incoming){
  await ensureTable(env);
  for(let attempt=0;attempt<5;attempt++){
    const current=await readCloud(env),merged=mergeStates(current.state,incoming),text=JSON.stringify(merged),ts=new Date().toISOString();
    if(current.version===0){
      const inserted=await env.TIDE_DB.prepare('INSERT OR IGNORE INTO tide_state (id,version,json,updated_at) VALUES (?1,1,?2,?3)').bind(ROW_ID,text,ts).run();
      if(Number(inserted?.meta?.changes||0)===1)return {state:merged,etag:'1'};
      continue;
    }
    const result=await env.TIDE_DB.prepare('UPDATE tide_state SET json=?1, version=version+1, updated_at=?2 WHERE id=?3 AND version=?4').bind(text,ts,ROW_ID,current.version).run();
    if(Number(result?.meta?.changes||0)===1)return {state:merged,etag:String(current.version+1)};
  }
  throw new Error('Shared database changed too many times. Save again.');
}