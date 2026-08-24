import { loadLocal, mergeStates, saveLocal } from './storage.js';

const MIGRATION='github-history-seed-v1';
const PAYLOADS=Array.from({length:13},(_,i)=>`/history/payload-${String(i+1).padStart(2,'0')}.txt`);
const SEED_UPDATED_AT='2026-08-23T22:00:00.000Z';

function hasSeed(state){
  return Boolean(state?.settings?.migrations?.[MIGRATION]);
}

function seedToState(seed){
  const entries={};
  for(const [date,text] of Object.entries(seed?.entries||{})){
    if(!String(text||'').trim())continue;
    entries[date]={text:String(text).trim(),updatedAt:`${date}T12:00:00.000Z`,revisions:[]};
  }
  const monthlyReviews={};
  for(const [month,review] of Object.entries(seed?.monthlyReviews||{})){
    monthlyReviews[month]={...review,updatedAt:review?.updatedAt||SEED_UPDATED_AT};
  }
  return {
    version:1,
    createdAt:SEED_UPDATED_AT,
    updatedAt:SEED_UPDATED_AT,
    entries,
    monthlyReviews,
    yearlyReviews:seed?.yearlyReviews||{},
    occurrences:[],
    trackerOverrides:{},
    musicCache:{},
    rawImports:[],
    tideCounters:seed?.tideCounters||{},
    settings:{autoCloudSync:false,theme:'dark',migrations:{[MIGRATION]:true}},
  };
}

async function decodeSeed(){
  const responses=await Promise.all(PAYLOADS.map(path=>fetch(path,{cache:'force-cache'})));
  for(const response of responses)if(!response.ok)throw new Error(`History payload failed (${response.status})`);
  const base64=(await Promise.all(responses.map(r=>r.text()))).join('').trim();
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
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
    if(Number(seed?.meta?.entryCount)!==740)throw new Error('History seed validation failed.');
    const seeded=seedToState(seed);
    const merged=mergeStates(local,seeded);
    const localDc=Number(local?.tideCounters?.dailyChallenge?.current)||0;
    const seedDc=Number(seeded?.tideCounters?.dailyChallenge?.current)||0;
    if(localDc<=seedDc)merged.tideCounters.dailyChallenge=seeded.tideCounters.dailyChallenge;
    const localOverall=(Number(local?.tideCounters?.montyOverall?.wins)||0)+(Number(local?.tideCounters?.montyOverall?.losses)||0);
    const seedOverall=(Number(seeded?.tideCounters?.montyOverall?.wins)||0)+(Number(seeded?.tideCounters?.montyOverall?.losses)||0);
    if(localOverall<=seedOverall)merged.tideCounters.montyOverall=seeded.tideCounters.montyOverall;
    const localYear=(Number(local?.tideCounters?.montyYears?.[2026]?.wins)||0)+(Number(local?.tideCounters?.montyYears?.[2026]?.losses)||0);
    if(localYear<=seedOverall)merged.tideCounters.montyYears={...(merged.tideCounters.montyYears||{}),2026:seeded.tideCounters.montyYears?.[2026]};
    const localAug=local?.monthlyReviews?.['2026-08']?.versusTotals?.['monty-dc'];
    if((Number(localAug?.wins)||0)+(Number(localAug?.losses)||0)<=3){
      const aug=merged.monthlyReviews['2026-08']||{};
      merged.monthlyReviews['2026-08']={...aug,versusTotals:{...(aug.versusTotals||{}),'monty-dc':seeded.monthlyReviews['2026-08'].versusTotals['monty-dc']}};
    }
    merged.settings||={};merged.settings.migrations||={};merged.settings.migrations[MIGRATION]=true;
    saveLocal(merged);
    return merged;
  }catch(error){
    console.error('T.I.D.E. history bootstrap failed:',error);
    return local;
  }
}
