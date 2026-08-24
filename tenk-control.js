const KEY='tide_state_v1';
const BASE_VALUE=708;
const BASE_DATE='2026-08-23';
const root=document.querySelector('#view-root');

const now=()=>new Date().toISOString();
const today=()=>{
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const o=Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}`;
};
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')||null}catch{return null}}
function write(s){s.updatedAt=now();localStorage.setItem(KEY,JSON.stringify(s));}
function values(s){return (s?.occurrences||[]).filter(x=>x.trackerId==='geoguessr-10k'&&Number.isFinite(Number(x.value))).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));}
function current(s){const c=Number(s?.tideCounters?.geoguessr10k?.current);if(Number.isFinite(c))return c;const rows=values(s);return rows.length?Number(rows.at(-1).value):null;}
function ensureBaseline(){
  const s=read();if(!s||current(s)!=null||!Object.keys(s.entries||{}).length)return false;
  s.occurrences||=[];s.tideCounters||={};
  s.occurrences.push({id:'seed:geoguessr-10k:2026-08-23',trackerId:'geoguessr-10k',date:BASE_DATE,count:1,value:BASE_VALUE,source:'seed',logType:'geoguessr-10k-authoritative',snippet:`Geoguessr 10K streak: ${BASE_VALUE}`,createdAt:now()});
  s.tideCounters.geoguessr10k={current:BASE_VALUE,lastUpdated:BASE_DATE,updatedAt:now()};
  write(s);return true;
}
function setValue(value){
  const n=Math.max(0,Math.floor(Number(value)||0)),s=read();if(!s)return;
  s.occurrences||=[];s.tideCounters||={};
  s.occurrences.push({id:`10k:${crypto.randomUUID?.()||Date.now()}`,trackerId:'geoguessr-10k',date:today(),count:1,value:n,source:'manual',logType:'geoguessr-10k-authoritative',snippet:`Geoguessr 10K streak set to ${n}`,createdAt:now()});
  s.tideCounters.geoguessr10k={current:n,lastUpdated:today(),updatedAt:now()};
  write(s);location.reload();
}
function inject(){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Trackers')return;
  const box=root.querySelector('#geo-controls');if(!box||box.querySelector('#gc-10k-set'))return;
  const s=read(),value=current(s)??BASE_VALUE,section=document.createElement('div');
  section.innerHTML=`<div class="section-title">GEOGUESSR 10K STREAK</div><div class="filter-row"><input id="gc-10k" class="input" type="number" min="0" value="${value}" style="max-width:180px"><button id="gc-10k-set" class="button primary">Set 10K Streak</button><span class="small muted">Type the current streak number whenever it changes.</span></div>`;
  box.append(section);
  section.querySelector('#gc-10k-set').onclick=()=>setValue(section.querySelector('#gc-10k').value);
}
if(ensureBaseline())location.reload();
else{
  inject();
  if(root)new MutationObserver(()=>queueMicrotask(inject)).observe(root,{childList:true});
}
