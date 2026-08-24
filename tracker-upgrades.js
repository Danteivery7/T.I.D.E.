import { loadLocal, saveLocal } from './storage.js';
import {
  MONTHS,activityStats,dailyChallengeStreaks,geoguessr10kRecord,isoToday,
  loggingStreak,mostActivityDay,trackerTotal
} from './engine-v4.js';
import { fetchPeriodMusic } from './spotify.js';

const root=document.querySelector('#view-root');
const MIGRATION='authoritative-hk-collisions-alltime-v1';
const MUSIC_START='2020-11-01';
const BASE_10K=708;
const HK='hong-kong';
const COLLISIONS='apartment-collisions';
const now=()=>new Date().toISOString();
const fmt=n=>new Intl.NumberFormat('en-US').format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const short=d=>d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`)):'—';

function ensureState(){
  const s=loadLocal();
  s.settings||={};s.settings.migrations||={};s.tideCounters||={};s.trackerOverrides||={};s.occurrences||=[];
  s.tideCounters.authoritativeTrackerTotals||={};
  if(!s.settings.migrations[MIGRATION]){
    const stamp=now();
    s.tideCounters.authoritativeTrackerTotals[HK]={
      allTime:11,years:{2025:6,2026:5},months:{},updatedAt:stamp,
      note:'Authoritative all-time total from T.I.D.E. notes.'
    };
    s.tideCounters.authoritativeTrackerTotals[COLLISIONS]={
      allTime:109,years:{2025:77,2026:32},months:{},updatedAt:stamp,
      note:'Includes 12 additional collisions from July/August 2026; exact month split was not recorded.'
    };
    s.trackerOverrides[COLLISIONS]={...(s.trackerOverrides[COLLISIONS]||{}),name:'Collisions',status:'active'};
    s.trackerOverrides['collision-count']={...(s.trackerOverrides['collision-count']||{}),status:'retired'};
    if(!Number.isFinite(Number(s.tideCounters?.geoguessr10k?.current))){
      s.tideCounters.geoguessr10k={current:BASE_10K,lastUpdated:'2026-08-23',updatedAt:stamp};
      s.occurrences.push({id:'seed:10k-authoritative:2026-08-23',trackerId:'geoguessr-10k',date:'2026-08-23',count:1,value:BASE_10K,source:'seed',snippet:`Geoguessr 10K streak set to ${BASE_10K}`,createdAt:stamp});
    }
    s.settings.migrations[MIGRATION]=true;
    saveLocal(s);
  }
  return s;
}

function recordFor(s,id){
  s.tideCounters||={};s.tideCounters.authoritativeTrackerTotals||={};
  return s.tideCounters.authoritativeTrackerTotals[id]||{allTime:trackerTotal(s,id),years:{},months:{},updatedAt:now()};
}

function setTrackerTotal(id,value,label){
  const n=Math.max(0,Math.floor(Number(value)||0)),s=loadLocal(),date=isoToday(),year=date.slice(0,4),month=date.slice(0,7);
  s.tideCounters||={};s.tideCounters.authoritativeTrackerTotals||={};s.occurrences||=[];
  const rec={...recordFor(s,id)},old=Math.max(0,Number(rec.allTime)||0),delta=n-old;
  rec.years={...(rec.years||{})};rec.months={...(rec.months||{})};
  rec.allTime=n;
  if(delta!==0){
    const yearBase=Number.isFinite(Number(rec.years[year]))?Number(rec.years[year]):trackerTotal(s,id,{year:Number(year)});
    const monthBase=Number.isFinite(Number(rec.months[month]))?Number(rec.months[month]):trackerTotal(s,id,{month});
    rec.years[year]=Math.max(0,yearBase+delta);
    rec.months[month]=Math.max(0,monthBase+delta);
  }
  rec.updatedAt=now();s.tideCounters.authoritativeTrackerTotals[id]=rec;
  if(delta>0)s.occurrences.push({id:`manual-total:${id}:${crypto.randomUUID?.()||Date.now()}`,trackerId:id,date,count:delta,source:'manual',snippet:`${label} total increased to ${n}`,createdAt:now()});
  saveLocal(s);location.reload();
}

function current10k(s){
  const saved=Number(s?.tideCounters?.geoguessr10k?.current);
  if(Number.isFinite(saved))return saved;
  return Number(geoguessr10kRecord(s)?.value)||BASE_10K;
}
function set10k(value){
  const n=Math.max(0,Math.floor(Number(value)||0)),s=loadLocal(),date=isoToday();
  s.tideCounters||={};s.occurrences||=[];
  s.tideCounters.geoguessr10k={current:n,lastUpdated:date,updatedAt:now()};
  s.occurrences.push({id:`10k:${crypto.randomUUID?.()||Date.now()}`,trackerId:'geoguessr-10k',date,count:1,value:n,source:'manual',snippet:`Geoguessr 10K streak set to ${n}`,createdAt:now()});
  saveLocal(s);location.reload();
}

function appendAllTimeOption(select){
  if(!select||select.querySelector('option[value="all-time"]'))return;
  const option=document.createElement('option');option.value='all-time';option.textContent='ALL TIME';select.append(option);
}

function hideDuplicateRows(){
  root?.querySelectorAll('.tracker-row').forEach(row=>{
    const name=row.querySelector('.tracker-name b')?.textContent?.trim();
    if(['Hong Kong Spawns','Walked into an object (Apartment)','Collision Count','Collisions','Geoguessr 10K Streak'].includes(name))row.style.display='none';
  });
}

function decorateTrackers(){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Trackers')return;
  const box=root.querySelector('#geo-controls');if(!box||box.querySelector('#authoritative-tracker-controls'))return;
  const s=ensureState(),hk=trackerTotal(s,HK),collisions=trackerTotal(s,COLLISIONS),tenk=current10k(s);
  const section=document.createElement('div');section.id='authoritative-tracker-controls';
  section.innerHTML=`
    <div class="section-title">GEOGUESSR 10K STREAK</div>
    <div class="filter-row"><input id="authoritative-10k" class="input" type="number" min="0" value="${tenk}" style="max-width:180px"><button id="authoritative-10k-set" class="button primary">Set 10K Streak</button><span class="small muted">Replace the number whenever the streak changes.</span></div>
    <div class="section-title">HONG KONG SPAWNS</div>
    <div class="filter-row"><input id="authoritative-hk" class="input" type="number" min="0" value="${hk}" style="max-width:180px"><button id="authoritative-hk-set" class="button primary">Set Hong Kong Total</button><span class="small muted">Authoritative total. Current all-time baseline: 11.</span></div>
    <div class="section-title">COLLISIONS</div>
    <div class="filter-row"><input id="authoritative-collisions" class="input" type="number" min="0" value="${collisions}" style="max-width:180px"><button id="authoritative-collisions-set" class="button primary">Set Collision Total</button><span class="small muted">109 all time · 32 in 2026. Includes +12 from July/August.</span></div>`;
  box.append(section);
  section.querySelector('#authoritative-10k-set').onclick=()=>set10k(section.querySelector('#authoritative-10k').value);
  section.querySelector('#authoritative-hk-set').onclick=()=>setTrackerTotal(HK,section.querySelector('#authoritative-hk').value,'Hong Kong Spawns');
  section.querySelector('#authoritative-collisions-set').onclick=()=>setTrackerTotal(COLLISIONS,section.querySelector('#authoritative-collisions').value,'Collisions');
  hideDuplicateRows();
}

function decorateRecords(){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Personal Records')return;
  const grid=root.querySelector('.records-grid');if(!grid||grid.querySelector('[data-authoritative="collisions"]'))return;
  const s=ensureState(),card=document.createElement('div');card.className='record-card';card.dataset.authoritative='collisions';
  card.innerHTML=`<div class="stat-label">Collisions</div><div class="record-value">${fmt(trackerTotal(s,COLLISIONS))}</div><div class="record-detail">All time</div>`;
  grid.append(card);
}

function decorateYear(){
  const select=root?.querySelector('#year-select');if(!select)return;
  appendAllTimeOption(select);
  const title=root.querySelector('.page-head h1')?.textContent||'';
  if(!/^\d{4}\s*·\s*Year in Review$/.test(title))return;
  const year=Number(select.value);if(!year)return;
  const topGrid=root.querySelector('.grid.grid-4');if(topGrid&&!topGrid.querySelector('[data-authoritative="year-collisions"]')){
    const s=ensureState(),card=document.createElement('div');card.className='card';card.dataset.authoritative='year-collisions';
    card.innerHTML=`<div class="stat-label">Collisions</div><div class="big-stat">${fmt(trackerTotal(s,COLLISIONS,{year}))}</div>`;
    topGrid.append(card);
  }
}

function pageHead(title,sub,years){
  return `<div class="page-head"><div><div class="eyebrow">T.I.D.E.</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><select id="year-select" class="select">${years.map(y=>`<option value="${y}">${y}</option>`).join('')}<option value="all-time" selected>ALL TIME</option></select></div>`;
}
function recordCard(label,value,detail=''){
  return `<div class="record-card"><div class="stat-label">${esc(label)}</div><div class="record-value">${esc(value)}</div>${detail?`<div class="record-detail">${esc(detail)}</div>`:''}</div>`;
}
function renderMusicList(items){
  return `<div class="music-grid">${items?.length?items.map(x=>`<div class="music-item"><div class="music-rank">${x.rank===5&&items.filter(y=>y.rank===5).length>1?'T-':''}${x.rank}</div>${x.image?`<img class="music-cover" src="${esc(x.image)}" alt="">`:'<div class="music-cover"></div>'}<div><div class="music-title">${esc(x.name)}</div><div class="music-meta">${esc(x.artist||x.album||'')}</div></div><div class="music-count">${fmt(x.streams)}<div class="tiny subtle">STREAMS</div></div></div>`).join(''):'<div class="muted small">No listening data returned.</div>'}</div>`;
}
function renderMusicSections(data){
  return `<div class="grid grid-3"><div><div class="section-title" style="margin-top:0">SONGS</div>${renderMusicList(data.songs)}</div><div><div class="section-title" style="margin-top:0">ARTISTS</div>${renderMusicList(data.artists)}</div><div><div class="section-title" style="margin-top:0">ALBUMS</div>${renderMusicList(data.albums)}</div></div>`;
}
async function loadAllTimeMusic(target,force=false){
  const el=root.querySelector(target);if(!el)return;
  el.innerHTML='<div class="muted small">Loading all-time stats.fm data…</div>';
  try{
    const s=loadLocal(),data=await fetchPeriodMusic(MUSIC_START,isoToday(),s,{force});saveLocal(s);
    if(root.querySelector(target))root.querySelector(target).innerHTML=renderMusicSections(data);
  }catch(error){
    if(root.querySelector(target))root.querySelector(target).innerHTML=`<div class="callout danger-callout">Could not load all-time stats.fm data: ${esc(error.message)}</div>`;
  }
}

function renderAllTimeReview(){
  const s=ensureState(),dates=Object.entries(s.entries||{}).filter(([,e])=>e?.text?.trim()).map(([d])=>d).sort();
  const start=dates[0]||isoToday(),end=isoToday(),years=[...new Set(dates.map(d=>Number(d.slice(0,4))))].sort();
  const log=loggingStreak(s),dc=dailyChallengeStreaks(s),geo=current10k(s),top=activityStats(s).counts.slice(0,5),edit=mostActivityDay(s,'Editing');
  root.innerHTML=`${pageHead('ALL TIME · Year in Review',`Life and tracker history from ${short(start)} through ${short(end)}. Music uses Nov 1, 2020 through today.`,years)}
    <div class="records-grid">
      ${recordCard('Diary Days',fmt(dates.length),'Total saved days')}
      ${recordCard('Mors Mutual',fmt(trackerTotal(s,'mors-mutual')),'All time')}
      ${recordCard('Migraines',fmt(trackerTotal(s,'migraines')),'All time')}
      ${recordCard('Hong Kong Spawns',fmt(trackerTotal(s,HK)),'Authoritative all time')}
      ${recordCard('Collisions',fmt(trackerTotal(s,COLLISIONS)),'Authoritative all time')}
    </div>
    <div class="section-title">GEOGUESSR</div>
    <div class="records-grid">
      ${recordCard('Longest Daily Challenge',`${dc.longest} days`)}
      ${recordCard('Current Daily Challenge',String(dc.active?dc.current:0),dc.active?'Active':'Inactive')}
      ${recordCard('Geoguessr 10K Streak',fmt(geo),'Current')}
      ${recordCard('Hong Kong Spawns',fmt(trackerTotal(s,HK)),'All time')}
    </div>
    <div class="section-title">LIFETIME RECORDS</div>
    <div class="records-grid">
      ${recordCard('Longest Diary Streak',`${log.longest} days`,log.last?`Last entry ${short(log.last)}`:'')}
      ${recordCard('Most Editing in One Day',edit?`${edit.count} events`:'—',edit?short(edit.date):'')}
      ${recordCard('Top Activity',top[0]?.[0]||'—',top[0]?`${top[0][1]} recognized events`:'')}
    </div>
    <div class="section-title">TOP ACTIVITIES</div>
    <section class="card">${top.length?top.map(([a,n])=>`<div class="detected-item"><span>${esc(a)}</span><b>${fmt(n)}</b></div>`).join(''):'<div class="muted">No activity data yet.</div>'}</section>
    <div class="section-title">MUSIC · ALL TIME</div>
    <section class="card"><div class="card-header"><div><h2>Nov 1, 2020 → Today</h2><div class="small muted">Same all-time starting date as Spotify Power Rankings. Actual stats.fm stream counts.</div></div><button id="refresh-alltime-music" class="button">Refresh</button></div><div id="alltime-year-music"></div></section>`;
  const select=root.querySelector('#year-select');
  select.onchange=()=>{
    if(select.value==='all-time')return;
    const year=select.value,nav=document.querySelector('[data-view="yearly"]');nav?.click();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{const next=root.querySelector('#year-select');if(next){next.value=year;next.dispatchEvent(new Event('change',{bubbles:true}));}}));
  };
  root.querySelector('#refresh-alltime-music').onclick=()=>loadAllTimeMusic('#alltime-year-music',true);
  loadAllTimeMusic('#alltime-year-music',false);
}

function decorateMusic(){
  const select=root?.querySelector('#music-month');if(!select)return;
  appendAllTimeOption(select);
}
function showAllTimeMusic(){
  const select=root.querySelector('#music-month');if(!select)return;
  select.value='all-time';
  const heading=root.querySelector('.card .card-header h2');if(heading)heading.textContent='ALL TIME · Nov 1, 2020 → Today';
  const sub=root.querySelector('.card .card-header .small.muted');if(sub)sub.textContent='Same all-time starting date as Spotify Power Rankings.';
  const refresh=root.querySelector('#music-refresh');if(refresh)refresh.onclick=()=>loadAllTimeMusic('#music-content',true);
  loadAllTimeMusic('#music-content',false);
}

function scheduleDecorate(){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    decorateTrackers();decorateRecords();decorateYear();decorateMusic();
  }));
}

ensureState();
scheduleDecorate();

document.addEventListener('click',event=>{
  if(event.target.closest('[data-view="trackers"],[data-view="records"],[data-view="yearly"],[data-view="music"]'))scheduleDecorate();
});

document.addEventListener('change',event=>{
  if(event.target?.id==='year-select'&&event.target.value==='all-time'){
    event.preventDefault();event.stopImmediatePropagation();renderAllTimeReview();
  }else if(event.target?.id==='music-month'&&event.target.value==='all-time'){
    event.preventDefault();event.stopImmediatePropagation();showAllTimeMusic();
  }else if(event.target?.id==='year-select'||event.target?.id==='music-month'){
    scheduleDecorate();
  }
},true);
