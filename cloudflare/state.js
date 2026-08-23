import { decryptSeed } from './seed.js';

const ROW_ID='main';
function validState(state){return state&&typeof state==='object'&&Number(state.version)>=1&&state.entries&&typeof state.entries==='object'&&Array.isArray(state.occurrences)}
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
  const occ=new Map();for(const row of [...(remote.occurrences||[]),...(incoming.occurrences||[])]){const key=row.id||`${row.trackerId}:${row.date}:${row.snippet}:${row.result||''}`;occ.set(key,newer(occ.get(key),row))}out.occurrences=[...occ.values()];
  out.trackerOverrides={...(remote.trackerOverrides||{}),...(incoming.trackerOverrides||{})};
  out.musicCache={...(remote.musicCache||{}),...(incoming.musicCache||{})};
  const imports=new Map();for(const x of [...(remote.rawImports||[]),...(incoming.rawImports||[])])imports.set(x.id||`${x.importedAt}:${x.characters}`,x);out.rawImports=[...imports.values()];
  out.tideCounters=mergeCounters(remote.tideCounters,incoming.tideCounters);
  out.settings={...(remote.settings||{}),...(incoming.settings||{}),migrations:{...(remote.settings?.migrations||{}),...(incoming.settings?.migrations||{})}};
  out.updatedAt=new Date().toISOString();return out;
}

export async function ensureTable(env){
  if(!env?.TIDE_DB)throw new Error('TIDE_DB binding is missing.');
  await env.TIDE_DB.prepare('CREATE TABLE IF NOT EXISTS tide_state (id TEXT PRIMARY KEY, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)').run();
}
async function row(env){return env.TIDE_DB.prepare('SELECT state, revision FROM tide_state WHERE id = ?1').bind(ROW_ID).first()}
export async function readState(env,{seed=true}={}){
  await ensureTable(env);let current=await row(env);
  if(!current&&seed){
    const seeded=await decryptSeed(env);if(!validState(seeded))throw new Error('Bundled T.I.D.E. history is invalid.');
    const at=new Date().toISOString();
    await env.TIDE_DB.prepare('INSERT OR IGNORE INTO tide_state (id,state,revision,updated_at) VALUES (?1,?2,1,?3)').bind(ROW_ID,JSON.stringify(seeded),at).run();
    current=await row(env);
  }
  return current?{state:JSON.parse(current.state),etag:String(current.revision),revision:Number(current.revision)}:{state:null,etag:null,revision:0};
}
export async function mergeAndWrite(env,incoming){
  if(!validState(incoming))throw new Error('Invalid T.I.D.E. state.');
  await ensureTable(env);
  for(let attempt=0;attempt<6;attempt++){
    const current=await readState(env,{seed:true}),merged=mergeStates(current.state,incoming),json=JSON.stringify(merged),at=new Date().toISOString();
    const result=await env.TIDE_DB.prepare('UPDATE tide_state SET state=?1, revision=revision+1, updated_at=?2 WHERE id=?3 AND revision=?4').bind(json,at,ROW_ID,current.revision).run();
    if(Number(result?.meta?.changes||0)===1)return{state:merged,etag:String(current.revision+1)};
  }
  throw new Error('Shared state changed repeatedly. Save again.');
}
