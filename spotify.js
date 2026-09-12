const POWER_RANKINGS_ORIGIN='https://spotifypowerrankings.danteivery88.workers.dev';
const BRIDGE_URL=`${POWER_RANKINGS_ORIGIN}/tide-bridge.html`;
const FALLBACK_API='https://api.stats.fm/api/v1';
const USER='31c4puiblaxm3wzzwg3hfc7t75yq';
const CACHE_MS=6*60*60*1000;
const MAP={songs:{endpoint:'tracks',key:'track'},artists:{endpoint:'artists',key:'artist'},albums:{endpoint:'albums',key:'album'}};
const BRIDGE_TIMEOUT_MS=12000;

let bridgeFrame=null;
let bridgeReadyPromise=null;
let bridgeReadyResolve=null;
const pendingBridgeRequests=new Map();

function easternParts(ms=Date.now()){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]))}
function easternMs(parts){let guess=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour||0,parts.minute||0,parts.second||0);for(let i=0;i<3;i++){const r=easternParts(guess);guess+=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour||0,parts.minute||0,parts.second||0)-Date.UTC(r.year,r.month-1,r.day,r.hour,r.minute,r.second)}return guess}
function dateMs(date,end=false){const[y,m,d]=date.split('-').map(Number);const base=easternMs({year:y,month:m,day:d});if(!end)return base;const dt=new Date(Date.UTC(y,m-1,d+1));return easternMs({year:dt.getUTCFullYear(),month:dt.getUTCMonth()+1,day:dt.getUTCDate()})}
function normalize(raw,category){const c=MAP[category],o=raw?.[c.key]||{};const artists=o.artists||[],albums=o.albums||[];return{id:String(o.id||''),name:o.name||'Unknown',artist:artists.map(a=>a.name).filter(Boolean).join(', '),album:albums[0]?.name||'',image:o.image||albums.find(a=>a.image)?.image||artists.find(a=>a.image)?.image||'',streams:Number(raw.streams??raw.count??0)}}
function withRanks(items){let previous=null,rank=0;return items.map((x,i)=>{if(previous===null||x.streams!==previous)rank=i+1;previous=x.streams;return{...x,rank}})}
function throughFifth(items){return withRanks(items).filter(x=>x.rank<=5)}

function requestId(){return globalThis.crypto?.randomUUID?.()||`tide-${Date.now()}-${Math.random().toString(36).slice(2)}`}

window.addEventListener('message',event=>{
  if(event.origin!==POWER_RANKINGS_ORIGIN)return;
  const message=event.data||{};
  if(message.type==='tide-music-bridge-ready'){
    bridgeReadyResolve?.();
    return;
  }
  if(message.type!=='tide-music-response'||!message.requestId)return;
  const pending=pendingBridgeRequests.get(message.requestId);
  if(!pending)return;
  pendingBridgeRequests.delete(message.requestId);
  clearTimeout(pending.timer);
  if(message.ok)pending.resolve(message.items||[]);
  else pending.reject(new Error(message.error||'Spotify Power Rankings bridge failed.'));
});

function ensureBridge(){
  if(bridgeReadyPromise)return bridgeReadyPromise;
  bridgeReadyPromise=new Promise((resolve,reject)=>{
    bridgeReadyResolve=resolve;
    const timeout=setTimeout(()=>reject(new Error('Spotify Power Rankings bridge timed out.')),BRIDGE_TIMEOUT_MS);
    const done=()=>{clearTimeout(timeout);resolve()};
    bridgeReadyResolve=done;
    bridgeFrame=document.createElement('iframe');
    bridgeFrame.src=BRIDGE_URL;
    bridgeFrame.title='Spotify Power Rankings data bridge';
    bridgeFrame.setAttribute('aria-hidden','true');
    bridgeFrame.tabIndex=-1;
    bridgeFrame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px';
    bridgeFrame.onerror=()=>reject(new Error('Spotify Power Rankings bridge could not load.'));
    document.body.appendChild(bridgeFrame);
  }).catch(error=>{
    bridgeReadyPromise=null;
    bridgeReadyResolve=null;
    bridgeFrame?.remove();
    bridgeFrame=null;
    throw error;
  });
  return bridgeReadyPromise;
}

async function fetchThroughPowerRankings(category,startDate,endDate){
  await ensureBridge();
  const id=requestId();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      pendingBridgeRequests.delete(id);
      reject(new Error('Spotify Power Rankings request timed out.'));
    },BRIDGE_TIMEOUT_MS);
    pendingBridgeRequests.set(id,{resolve,reject,timer});
    bridgeFrame?.contentWindow?.postMessage({type:'tide-music-request',requestId:id,category,startDate,endDate},POWER_RANKINGS_ORIGIN);
  });
}

async function fetchDirect(category,startDate,endDate){
  const params=new URLSearchParams({after:String(Math.round(dateMs(startDate))),before:String(Math.round(dateMs(endDate,true))),limit:'50',offset:'0',orderBy:'COUNT'});
  const response=await fetch(`${FALLBACK_API}/users/${encodeURIComponent(USER)}/top/${MAP[category].endpoint}?${params}`,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`stats.fm returned ${response.status}`);
  const payload=await response.json();
  return payload.items||[];
}

async function loadRaw(category,startDate,endDate){
  try{return await fetchThroughPowerRankings(category,startDate,endDate)}catch{return fetchDirect(category,startDate,endDate)}
}

export async function fetchTop(category,startDate,endDate,state,{force=false}={}){
  if(!MAP[category])throw new Error('Unsupported music category.');
  const cacheKey=`${category}:${startDate}:${endDate}`;
  const cached=state.musicCache?.[cacheKey];
  if(!force&&cached&&Date.now()-new Date(cached.fetchedAt).getTime()<CACHE_MS)return cached.items;
  const rawItems=await loadRaw(category,startDate,endDate);
  const items=throughFifth(rawItems.map(x=>normalize(x,category)).filter(x=>x.id).sort((a,b)=>b.streams-a.streams||a.name.localeCompare(b.name)));
  state.musicCache||={};
  state.musicCache[cacheKey]={fetchedAt:new Date().toISOString(),items};
  return items;
}

export async function fetchPeriodMusic(start,end,state,{force=false}={}){
  const [songs,artists,albums]=await Promise.all(['songs','artists','albums'].map(c=>fetchTop(c,start,end,state,{force})));
  return{songs,artists,albums};
}
