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
  const years={...(a.montyYears||{})};for(const [year,value] of Object.entries(b.montyYears||{}))years[year]=newer(years[year],value);out.montyYears=years;
  return out;
}
export function mergeStates(remote,incoming){
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
