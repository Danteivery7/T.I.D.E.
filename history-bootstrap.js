import { loadLocal, mergeStates, saveLocal } from './storage.js';

const MIGRATION='github-history-seed-v1';
const PAYLOADS=Array.from({length:13},(_,i)=>`/history/payload-${String(i+1).padStart(2,'0')}.txt`);
const SEED_UPDATED_AT='2026-08-23T22:00:00.000Z';
const AUTHORITATIVE_COUNTERS={
  dailyChallenge:{current:118,longest:118,currentStart:'2026-04-28',lastCounted:'2026-08-23',longestStart:'2026-04-28',longestEnd:'2026-08-23',updatedAt:SEED_UPDATED_AT},
  montyOverall:{wins:28,losses:103,updatedAt:SEED_UPDATED_AT},
  montyYears:{2026:{wins:28,losses:103,updatedAt:SEED_UPDATED_AT}},
};

function hasSeed(state){return Boolean(state?.settings?.migrations?.[MIGRATION]);}

function seedToState(seed){
  const entries={};
  const rows=Array.isArray(seed?.entries)?seed.entries:Object.entries(seed?.entries||{});
  for(const [date,text] of rows){
    if(!String(text||'').trim())continue;
    entries[date]={text:String(text).trim(),updatedAt:`${date}T12:00:00.000Z`,revisions:[]};
  }
  const monthlyReviews={};
  for(const [month,review] of Object.entries(seed?.monthlyReviews||{}))monthlyReviews[month]={...review,updatedAt:review?.updatedAt||SEED_UPDATED_AT};
  return {
    version:1,createdAt:SEED_UPDATED_AT,updatedAt:SEED_UPDATED_AT,
    entries,monthlyReviews,yearlyReviews:{},occurrences:[],trackerOverrides:{},musicCache:{},rawImports:[],
    tideCounters:structuredClone(AUTHORITATIVE_COUNTERS),
    settings:{autoCloudSync:false,theme:'dark',migrations:{[MIGRATION]:true}},
  };
}

async function decodeSeed(){
  const responses=await Promise.all(PAYLOADS.map(path=>fetch(path,{cache:'force-cache'})));
  for(const response of responses)if(!response.ok)throw new Error(`History payload failed (${response.status})`);
  const base64=(await Promise.all(responses.map(r=>r.text()))).join('').trim();
  const binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  if(typeof DecompressionStream!=='function')throw new Error('This browser does not support the history decompressor.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export async function ensureBundledHistory(){
  const local=loadLocal();
  if(hasSeed(local))return local;
  try{
    const seed=await decodeSeed();
    const rows=Array.isArray(seed?.entries)?seed.entries:[];
    if(rows.length!==740||rows[0]?.[0]!=='2024-03-29'||rows.at(-1)?.[0]!=='2026-08-23'||seed?.through!=='2026-08-23')throw new Error('History seed validation failed.');
    const seeded=seedToState(seed),merged=mergeStates(local,seeded);
    const localDc=Number(local?.tideCounters?.dailyChallenge?.current)||0;
    if(localDc<=118)merged.tideCounters.dailyChallenge=seeded.tideCounters.dailyChallenge;
    const localOverall=(Number(local?.tideCounters?.montyOverall?.wins)||0)+(Number(local?.tideCounters?.montyOverall?.losses)||0);
    if(localOverall<=131)merged.tideCounters.montyOverall=seeded.tideCounters.montyOverall;
    const localYear=(Number(local?.tideCounters?.montyYears?.[2026]?.wins)||0)+(Number(local?.tideCounters?.montyYears?.[2026]?.losses)||0);
    if(localYear<=131)merged.tideCounters.montyYears={...(merged.tideCounters.montyYears||{}),2026:seeded.tideCounters.montyYears[2026]};
    const localAug=local?.monthlyReviews?.['2026-08']?.versusTotals?.['monty-dc'];
    if((Number(localAug?.wins)||0)+(Number(localAug?.losses)||0)<=3){
      const aug=merged.monthlyReviews['2026-08']||{};
      merged.monthlyReviews['2026-08']={...aug,versusTotals:{...(aug.versusTotals||{}),'monty-dc':{wins:0,losses:3,ties:0}}};
    }
    merged.settings||={};merged.settings.migrations||={};merged.settings.migrations[MIGRATION]=true;
    saveLocal(merged);
    return merged;
  }catch(error){
    console.error('T.I.D.E. history bootstrap failed:',error);
    return local;
  }
}
