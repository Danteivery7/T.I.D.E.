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

function showcaseCell(label,value){return '<div class="tracker-spotlight-cell"><div class="stat-label">'+esc(label)+'</div><b>'+esc(value)+'</b></div>'}
function showcaseRow(name,subtitle,columns,key){return '<div class="tracker-row tracker-spotlight-row"><div class="tracker-name"><b>'+esc(name)+'</b><span class="tracker-status">'+esc(subtitle)+'</span></div>'+columns.map(c=>showcaseCell(c[0],c[1])).join('')+'<button type="button" class="button" data-special-edit="'+key+'">View / Add</button></div>'}
function editNumber(id,label,val){return '<label class="label">'+esc(label)+'<input id="'+id+'" class="input" type="number" min="0" step="1" value="'+Math.max(0,Number(val)||0)+'"></label>'}
function openShowcaseEditor(key){
  const s=ensureState(),month=isoToday().slice(0,7),dc=s.tideCounters?.dailyChallenge||{};
  const mo=s.monthlyReviews?.[month]?.versusTotals?.['monty-dc']||{},all=s.tideCounters?.montyOverall||{};
  const labels={dc:'Daily Challenge',monty:'Daily Challenge vs Monty',tenk:'GeoGuessr 10K Streak',hk:'Hong Kong Spawns',collisions:'Collisions'};
  if(!labels[key])return;
  const dialog=document.querySelector('#modal'),body=dialog?.querySelector('#modal-body');if(!body)return;
  document.querySelector('#modal-title').textContent=labels[key];document.querySelector('#modal-eyebrow').textContent='TRACKER · VIEW / ADD';
  let content='';
  if(key==='dc'){
    content='<p class="small muted">Correct your streak here. The main Trackers page remains read-only.</p>'+editNumber('edit-dc','Current streak',dc.current)+'<div class="tracker-edit-actions"><button class="button primary" id="save-dc">Set Current Streak</button><button class="button ghost" id="reset-dc">Streak Lost / Reset</button></div>';
  }else if(key==='monty'){
    content='<p class="small muted">Edit this month and all-time separately. The quick Win and Loss buttons remain on the Trackers page.</p><div class="section-title">THIS MONTH</div><div class="grid grid-2">'+editNumber('edit-mw','Wins',mo.wins)+editNumber('edit-ml','Losses',mo.losses)+'</div><button class="button primary tracker-modal-save" id="save-month">Set This Month</button><div class="section-title">ALL TIME</div><div class="grid grid-2">'+editNumber('edit-aw','Wins',all.wins)+editNumber('edit-al','Losses',all.losses)+'</div><button class="button primary tracker-modal-save" id="save-all">Set All-Time</button>';
  }else{
    const total=key==='tenk'?current10k(s):trackerTotal(s,key==='hk'?HK:COLLISIONS);
    content='<p class="small muted">Use the number arrows or type a total. Save applies the change.</p>'+editNumber('edit-total','Current '+(key==='tenk'?'streak':'all-time total'),total)+'<div class="tracker-edit-actions"><button class="button" id="minus-total">−1</button><button class="button" id="plus-total">+1</button><button class="button primary" id="save-total">Save number</button></div>';
  }
  body.innerHTML='<div class="tracker-quick-modal">'+content+'</div>';
  if(!dialog.open)dialog.showModal();
  const input=id=>body.querySelector('#'+id)?.value;
  const forward=(button,fields)=>{for(const [id,v] of Object.entries(fields)){const el=root.querySelector('#'+id);if(el)el.value=v;}root.querySelector('#'+button)?.click();};
  if(key==='dc'){
    body.querySelector('#save-dc').onclick=()=>forward('gc-dc-set',{'gc-dc':input('edit-dc')});
    body.querySelector('#reset-dc').onclick=()=>forward('gc-reset',{});
  }else if(key==='monty'){
    body.querySelector('#save-month').onclick=()=>forward('gc-ms',{'gc-mw':input('edit-mw'),'gc-ml':input('edit-ml')});
    body.querySelector('#save-all').onclick=()=>forward('gc-as',{'gc-aw':input('edit-aw'),'gc-al':input('edit-al')});
  }else{
    const el=body.querySelector('#edit-total');
    body.querySelector('#minus-total').onclick=()=>{el.value=String(Math.max(0,(Number(el.value)||0)-1))};
    body.querySelector('#plus-total').onclick=()=>{el.value=String(Math.max(0,(Number(el.value)||0)+1))};
    body.querySelector('#save-total').onclick=()=>{if(key==='tenk')set10k(el.value);else setTrackerTotal(key==='hk'?HK:COLLISIONS,el.value,key==='hk'?'Hong Kong Spawns':'Collisions')};
  }
}
function decorateTrackers(){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Trackers')return;
  const geo=root.querySelector('#geo-controls'),table=root.querySelector('.tracker-table');if(!geo||!table||root.querySelector('#tracker-showcase'))return;
  const s=ensureState(),date=isoToday(),month=date.slice(0,7),year=Number(date.slice(0,4));
  const dc=s.tideCounters?.dailyChallenge||{},mo=s.monthlyReviews?.[month]?.versusTotals?.['monty-dc']||{},yr=s.tideCounters?.montyYears?.[year]||{},all=s.tideCounters?.montyOverall||{};
  const wl=r=>String(Math.max(0,Number(r?.wins)||0))+'–'+String(Math.max(0,Number(r?.losses)||0));
  const ids=new Set(['daily-challenge','monty-dc','geoguessr-10k','hong-kong','apartment-collisions','collision-count']);
  table.querySelectorAll('.tracker-row').forEach(row=>{if(ids.has(row.querySelector('[data-tracker]')?.dataset.tracker)){row.dataset.tideSpecialHidden='true';row.style.display='none'}});
  const rows=[
    showcaseRow('Daily Challenge','streak · manually updated',[['Current',Math.max(0,Number(dc.current)||0)],['Longest',Math.max(0,Number(dc.longest)||0)],['Status',(Number(dc.current)||0)>0?'Active':'Inactive']],'dc'),
    showcaseRow('Daily Challenge vs Monty','wins–losses',[['This Month',wl(mo)],[String(year),wl(yr)],['All Time',wl(all)]],'monty'),
    showcaseRow('GeoGuessr 10K Streak','current consecutive total',[['Current',fmt(current10k(s))],['Last Updated',short(s.tideCounters?.geoguessr10k?.lastUpdated)],['Measure','Streak']],'tenk'),
    showcaseRow('Hong Kong Spawns','event totals',[['This Month',fmt(trackerTotal(s,HK,{month}))],[String(year),fmt(trackerTotal(s,HK,{year}))],['All Time',fmt(trackerTotal(s,HK))]],'hk'),
    showcaseRow('Collisions','event totals',[['This Month',fmt(trackerTotal(s,COLLISIONS,{month}))],[String(year),fmt(trackerTotal(s,COLLISIONS,{year}))],['All Time',fmt(trackerTotal(s,COLLISIONS))]],'collisions')
  ];
  const section=document.createElement('section');section.id='tracker-showcase';section.className='card';
  section.innerHTML='<div class="card-header"><div><h2>GeoGuessr & Performance</h2><div class="small muted">Totals stay on display. Select View / Add to make changes.</div></div><span class="chip accent">LIVE TOTALS</span></div>'+
    '<div class="tracker-quick-actions"><button type="button" class="button primary" data-quick="gc-plus">↑ +1 Daily Challenge</button><button type="button" class="button primary" data-quick="gc-win">WIN vs Monty</button><button type="button" class="button" data-quick="gc-loss">LOSS vs Monty</button></div>'+
    '<div class="tracker-table tracker-spotlight-table">'+rows.join('')+'</div>';
  table.closest('section.card').before(section);
  section.querySelectorAll('[data-special-edit]').forEach(b=>b.onclick=()=>openShowcaseEditor(b.dataset.specialEdit));
  section.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>root.querySelector('#'+b.dataset.quick)?.click());
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
