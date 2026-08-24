const KEY='tide_state_v1';
const BASE_DATE='2026-08-23';
const START_DATE='2026-04-28';
const INITIAL_STREAK=118;
const INITIAL_MONTH='2026-08';
const INITIAL_OVERALL={wins:28,losses:103};
const MIGRATION='geo-performance-v1';
const root=document.querySelector('#view-root');

const now=()=>new Date().toISOString();
const today=()=>{
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const o=Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}`;
};
const shift=(date,n)=>{
  const [y,m,d]=date.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);
};
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const short=d=>d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`)):'—';
const cleanRecord=r=>({wins:Math.max(0,Number(r?.wins)||0),losses:Math.max(0,Number(r?.losses)||0)});
const card=(l,v,d='')=>`<div class="record-card"><div class="stat-label">${esc(l)}</div><div class="record-value">${esc(v)}</div>${d?`<div class="record-detail">${esc(d)}</div>`:''}</div>`;

function read(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||'null');
    return s&&typeof s==='object'?s:{version:1,entries:{},monthlyReviews:{},yearlyReviews:{},occurrences:[],settings:{}};
  }catch{
    return {version:1,entries:{},monthlyReviews:{},yearlyReviews:{},occurrences:[],settings:{}};
  }
}
function shape(s){
  s.settings||={};s.settings.migrations||={};s.monthlyReviews||={};s.yearlyReviews||={};
  s.occurrences||=[];s.entries||={};s.tideCounters||={};s.tideCounters.montyYears||={};
  return s;
}
function write(s){
  s.updatedAt=now();
  localStorage.setItem(KEY,JSON.stringify(s));
}
function hasHistory(s){
  return Object.values(s.entries||{}).some(e=>String(e?.text||'').trim())||
    Object.keys(s.monthlyReviews||{}).length>0||(s.rawImports||[]).length>0;
}
function ensureCounters(s){
  shape(s);
  let changed=false;
  const has=hasHistory(s);
  if(!s.tideCounters.dailyChallenge){
    s.tideCounters.dailyChallenge=has
      ? {current:INITIAL_STREAK,longest:INITIAL_STREAK,currentStart:START_DATE,lastCounted:BASE_DATE,longestStart:START_DATE,longestEnd:BASE_DATE,updatedAt:now()}
      : {current:0,longest:0,currentStart:null,lastCounted:null,longestStart:null,longestEnd:null,updatedAt:now()};
    changed=true;
  }
  if(!s.tideCounters.montyOverall){
    s.tideCounters.montyOverall=has?{...INITIAL_OVERALL,updatedAt:now()}:{wins:0,losses:0,updatedAt:now()};
    changed=true;
  }
  if(has&&!s.tideCounters.montyYears[2026]){
    s.tideCounters.montyYears[2026]={...INITIAL_OVERALL,updatedAt:now()};
    changed=true;
  }
  if(has&&!s.monthlyReviews?.[INITIAL_MONTH]?.versusTotals?.['monty-dc']){
    const old=s.monthlyReviews[INITIAL_MONTH]||{};
    s.monthlyReviews[INITIAL_MONTH]={...old,versusTotals:{...(old.versusTotals||{}),'monty-dc':{wins:0,losses:3,ties:0}},updatedAt:now()};
    changed=true;
  }
  if(!s.settings.migrations[MIGRATION]){
    s.settings.migrations[MIGRATION]=true;
    changed=true;
  }
  if(changed)write(s);
  return s;
}
function streak(s){
  const d=shape(s).tideCounters.dailyChallenge||{};
  return {
    current:Math.max(0,Number(d.current)||0),
    longest:Math.max(0,Number(d.longest)||0),
    start:d.currentStart||null,
    last:d.lastCounted||null,
    longestStart:d.longestStart||null,
    longestEnd:d.longestEnd||null
  };
}
function monthRecord(s,month=today().slice(0,7)){
  return cleanRecord(shape(s).monthlyReviews?.[month]?.versusTotals?.['monty-dc']);
}
function overallRecord(s){return cleanRecord(shape(s).tideCounters.montyOverall);}
function saveAndReload(s){write(s);location.reload();}

function plusOne(){
  const s=ensureCounters(read()),d=streak(s),date=today();
  const current=d.current+1;
  const start=d.current>0?(d.start||shift(date,-(d.current-1))):date;
  s.tideCounters.dailyChallenge={
    current,
    longest:Math.max(d.longest,current),
    currentStart:start,
    lastCounted:date,
    longestStart:current>d.longest?start:(d.longestStart||start),
    longestEnd:current>d.longest?date:(d.longestEnd||date),
    updatedAt:now()
  };
  saveAndReload(s);
}
function resetStreak(){
  if(!confirm('Reset the active Daily Challenge streak to 0?'))return;
  const s=ensureCounters(read()),d=streak(s);
  s.tideCounters.dailyChallenge={...s.tideCounters.dailyChallenge,current:0,currentStart:null,lastCounted:today(),longest:d.longest,updatedAt:now()};
  saveAndReload(s);
}
function setStreak(value){
  const s=ensureCounters(read()),d=streak(s),n=Math.max(0,Number(value)||0),date=today();
  const start=n?(d.start||shift(date,-(n-1))):null;
  s.tideCounters.dailyChallenge={
    ...s.tideCounters.dailyChallenge,
    current:n,longest:Math.max(d.longest,n),currentStart:start,lastCounted:n?date:d.last,
    longestStart:n>d.longest?start:(d.longestStart||start),
    longestEnd:n>d.longest?date:(d.longestEnd||date),
    updatedAt:now()
  };
  saveAndReload(s);
}
function setMonth(w,l){
  const s=ensureCounters(read()),month=today().slice(0,7),old=s.monthlyReviews[month]||{};
  s.monthlyReviews[month]={...old,versusTotals:{...(old.versusTotals||{}),'monty-dc':{wins:Math.max(0,Number(w)||0),losses:Math.max(0,Number(l)||0),ties:0}},updatedAt:now()};
  saveAndReload(s);
}
function setOverall(w,l){
  const s=ensureCounters(read());
  s.tideCounters.montyOverall={wins:Math.max(0,Number(w)||0),losses:Math.max(0,Number(l)||0),updatedAt:now()};
  saveAndReload(s);
}
function monty(result){
  const s=ensureCounters(read()),month=today().slice(0,7),year=Number(month.slice(0,4));
  const m=monthRecord(s,month),a=overallRecord(s),y=cleanRecord(s.tideCounters.montyYears[year]);
  if(result==='win'){m.wins++;a.wins++;y.wins++;}else{m.losses++;a.losses++;y.losses++;}
  const old=s.monthlyReviews[month]||{};
  s.monthlyReviews[month]={...old,versusTotals:{...(old.versusTotals||{}),'monty-dc':{...m,ties:0}},updatedAt:now()};
  s.tideCounters.montyOverall={...a,updatedAt:now()};
  s.tideCounters.montyYears[year]={...y,updatedAt:now()};
  s.occurrences.push({id:`monty:${crypto.randomUUID?.()||Date.now()}`,trackerId:'monty-dc',date:today(),count:1,result,source:'manual',logType:'monty-authoritative',snippet:`Daily Challenge vs Monty: ${result.toUpperCase()}`,createdAt:now()});
  saveAndReload(s);
}

function selectedDay(){
  const t=root?.querySelector('.day-nav-center h1')?.textContent?.trim();
  if(!t)return null;
  const d=new Date(`${t.replace(/^[A-Za-z]+,\s*/,'')} 12:00:00`);
  if(Number.isNaN(d.getTime()))return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function injectToday(s){
  if(!root?.querySelector('#day-editor')||root.querySelector('#geo-controls'))return;
  const date=selectedDay();if(!date)return;
  const d=streak(s),m=monthRecord(s),a=overallRecord(s),isToday=date===today();
  const x=document.createElement('section');
  x.id='geo-controls';x.className='card';
  x.innerHTML=`<div class="card-header"><div><h3>GeoGuessr Daily Challenge</h3><div class="small muted">Manual counter. Diary text never changes this.</div></div><span class="chip accent">${d.current>0?'ACTIVE':'INACTIVE'}</span></div>
    <div style="text-align:center;padding:8px 0 14px"><div class="stat-label">CURRENT STREAK</div><div class="big-stat" style="font-size:62px;line-height:1.05;margin-top:6px">${d.current}</div><div class="tiny subtle" style="margin-top:6px">${d.current&&d.start?`Started ${short(d.start)}`:'No active streak'}</div></div>
    ${isToday?`<button id="geo-plus" class="button primary" style="width:100%;font-size:18px;padding:14px">↑ +1 Daily Challenge</button>`:''}
    <div class="section-title">VS MONTY</div><div class="grid grid-2" style="margin-bottom:12px">${card('This Month',`${m.wins}-${m.losses}`)}${card('All Time',`${a.wins}-${a.losses}`)}</div>
    ${isToday?`<div class="grid grid-2"><button id="geo-win" class="button primary">WIN · I Beat Monty</button><button id="geo-loss" class="button">LOSS · Monty Beat Me</button></div><div class="tiny subtle" style="margin-top:8px;text-align:center">No scores. No ties. New months start 0-0.</div>`:''}`;
  (root.querySelector('.right-stack')||root).prepend(x);
  x.querySelector('#geo-plus')?.addEventListener('click',plusOne);
  x.querySelector('#geo-win')?.addEventListener('click',()=>monty('win'));
  x.querySelector('#geo-loss')?.addEventListener('click',()=>monty('loss'));
}
function injectTrackers(s){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Trackers'||root.querySelector('#geo-controls'))return;
  const d=streak(s),m=monthRecord(s),a=overallRecord(s),x=document.createElement('section');
  x.id='geo-controls';x.className='card';x.style.marginBottom='16px';
  x.innerHTML=`<div class="card-header"><div><h2>GeoGuessr Controls</h2><div class="small muted">Manual, authoritative counters.</div></div><span class="chip accent">LIVE</span></div>
    <div class="records-grid">${card('Current DC Streak',d.current,d.start?`Started ${short(d.start)}`:'Inactive')}${card('Longest DC Streak',`${d.longest} days`)}${card('Monty This Month',`${m.wins}-${m.losses}`)}${card('Monty All Time',`${a.wins}-${a.losses}`)}</div>
    <div class="grid grid-3" style="margin-top:14px"><button id="gc-plus" class="button primary">↑ +1 Daily Challenge</button><button id="gc-win" class="button primary">WIN vs Monty</button><button id="gc-loss" class="button">LOSS vs Monty</button></div>
    <div class="section-title">CORRECT DAILY CHALLENGE</div><div class="filter-row"><input id="gc-dc" class="input" type="number" min="0" value="${d.current}" style="max-width:180px"><button id="gc-dc-set" class="button">Set Current Streak</button><button id="gc-reset" class="button ghost">Streak Lost / Reset</button></div>
    <div class="section-title">CORRECT THIS MONTH VS MONTY</div><div class="grid grid-2"><label class="label">Wins<input id="gc-mw" class="input" type="number" min="0" value="${m.wins}"></label><label class="label">Losses<input id="gc-ml" class="input" type="number" min="0" value="${m.losses}"></label></div><button id="gc-ms" class="button" style="margin-top:10px">Set This Month</button>
    <div class="section-title">CORRECT ALL-TIME VS MONTY</div><div class="grid grid-2"><label class="label">Wins<input id="gc-aw" class="input" type="number" min="0" value="${a.wins}"></label><label class="label">Losses<input id="gc-al" class="input" type="number" min="0" value="${a.losses}"></label></div><button id="gc-as" class="button" style="margin-top:10px">Set All-Time</button>`;
  root.prepend(x);
  x.querySelector('#gc-plus').onclick=plusOne;
  x.querySelector('#gc-win').onclick=()=>monty('win');
  x.querySelector('#gc-loss').onclick=()=>monty('loss');
  x.querySelector('#gc-dc-set').onclick=()=>setStreak(x.querySelector('#gc-dc').value);
  x.querySelector('#gc-reset').onclick=resetStreak;
  x.querySelector('#gc-ms').onclick=()=>setMonth(x.querySelector('#gc-mw').value,x.querySelector('#gc-ml').value);
  x.querySelector('#gc-as').onclick=()=>setOverall(x.querySelector('#gc-aw').value,x.querySelector('#gc-al').value);
  root.querySelectorAll('.tracker-row').forEach(r=>{
    const n=r.querySelector('.tracker-name b')?.textContent?.trim();
    if(n==='Daily Challenge'||n==='Daily Challenge vs Monty')r.style.display='none';
  });
}
function injectRecords(s){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Personal Records'||root.querySelector('#geo-records'))return;
  const d=streak(s),m=monthRecord(s),a=overallRecord(s),grid=root.querySelector('.records-grid');if(!grid)return;
  const x=document.createElement('div');x.id='geo-records';x.style.display='contents';
  x.innerHTML=`${card('Current Daily Challenge',`${d.current} days`,d.current?'ACTIVE':'INACTIVE')}${card('Monty This Month',`${m.wins}-${m.losses}`)}${card('Monty All Time',`${a.wins}-${a.losses}`)}`;
  grid.prepend(x);
}
function injectMonthly(s){
  if(!root?.querySelector('#month-select')||root.querySelector('#geo-month'))return;
  const month=root.querySelector('#month-select').value,r=monthRecord(s,month),x=document.createElement('section');
  x.id='geo-month';x.className='card';x.style.marginTop='16px';
  x.innerHTML=`<div class="card-header"><div><h2>Daily Challenge vs Monty</h2><div class="small muted">Win-loss only.</div></div><span class="chip accent">${r.wins}-${r.losses}</span></div><div class="grid grid-2">${card('Wins',r.wins)}${card('Losses',r.losses)}</div>`;
  root.append(x);
}

let observer=null;
let running=false;
function observe(){
  if(!root)return;
  observer?.disconnect();
  observer=new MutationObserver(()=>{
    if(running)return;
    running=true;
    observer.disconnect();
    queueMicrotask(()=>{
      try{run();}finally{running=false;observe();}
    });
  });
  observer.observe(root,{childList:true});
}
function run(){
  if(!root)return;
  const s=ensureCounters(read());
  injectTrackers(s);
  injectRecords(s);
  injectMonthly(s);
}

run();
observe();
