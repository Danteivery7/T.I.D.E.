import {BASELINE_DATE,activityRange,aggregateAllTime,allTimeTotal,currentSources,esc,filterAllows,fmt,gaming,historicalActivityEvidence,hours,platformLabel,shortDate} from './gaming-data.js';
import {refreshGaming} from './gaming-live.js';

const root=document.querySelector('#view-root');
let mode='all-time',filter='all',sort='playtime',month=new Date().toISOString().slice(0,7),year=new Date().getFullYear(),search='';

function bounds(){
  if(mode==='month'){const [y,m]=month.split('-').map(Number),d=new Date(y,m,0).getDate();return{start:`${month}-01`,end:`${month}-${String(d).padStart(2,'0')}`,label:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(y,m-1,1))};}
  if(mode==='year')return{start:`${year}-01-01`,end:`${year}-12-31`,label:String(year)};
  return null;
}
function data(){
  if(mode==='all-time')return{games:aggregateAllTime(filter),total:allTimeTotal(filter),label:'All Time',full:true,partial:false,historical:[]};
  const b=bounds(),p=activityRange(b.start,b.end,filter),e=historicalActivityEvidence(b.start,b.end,filter),covered=Boolean(p.coverageStart&&b.end>=p.coverageStart),full=Boolean(p.coverageStart&&b.start>=p.coverageStart);
  if(!covered)return{...b,games:e.boundedGames,total:e.boundedTotal,recoveredMinutes:0,trackedMinutes:0,covered:false,full:false,partial:false,historical:e.lastPlayedGames,historicalBounded:e.boundedTotal};
  const hourKeys=new Set(p.games.map(g=>g.key));
  return{...p,...b,covered,full,partial:covered&&!full,historical:e.lastPlayedGames.filter(g=>!hourKeys.has(g.key)),historicalBounded:0};
}
function order(list){
  const out=list.filter(g=>!search||g.title.toLowerCase().includes(search.toLowerCase()));
  if(sort==='recent')out.sort((a,b)=>String(b.lastPlayed||'').localeCompare(String(a.lastPlayed||''))||b.minutes-a.minutes);
  else if(sort==='az')out.sort((a,b)=>a.title.localeCompare(b.title));
  else if(sort==='platforms')out.sort((a,b)=>Object.keys(b.platformMinutes||{}).length-Object.keys(a.platformMinutes||{}).length||b.minutes-a.minutes);
  else out.sort((a,b)=>b.minutes-a.minutes);
  return out;
}
function breakdown(g){return Object.entries(g.platformMinutes||{}).sort((a,b)=>b[1]-a[1]).map(([p,m])=>`${platformLabel(p)} ${hours(m)}`).join(' · ');}
function card(g,i,d){
  const tag=mode==='all-time'?'LIFETIME':d.full?'TRACKED':'KNOWN';
  return `<div class="card" style="display:grid;grid-template-columns:46px 60px minmax(0,1fr) auto;gap:13px;align-items:center;padding:14px 16px;margin-bottom:10px"><div style="font-size:24px;font-weight:800;text-align:center">${i+1}</div>${g.image?`<img src="${esc(g.image)}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:9px">`:'<div style="width:60px;height:60px;border-radius:9px;background:rgba(255,255,255,.05);display:grid;place-items:center;font-size:22px">🎮</div>'}<div style="min-width:0"><div style="font-size:18px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.title)}</div><div class="small muted" style="margin-top:4px">${esc(breakdown(g)||'Tracked gaming')}</div><div class="tiny subtle" style="margin-top:4px">True last played: ${esc(shortDate(g.lastPlayed))}</div></div><div style="text-align:right"><div style="font-size:21px;font-weight:800">${esc(hours(g.minutes))}</div><div class="tiny subtle">${tag}</div></div></div>`;
}
function notice(d){
  if(mode==='all-time')return`<div class="callout" style="margin-top:18px">Legacy PS4: <b>8,504h 16m</b> across the 19 visible games. The remaining <b>118h</b> is preserved only in lifetime totals and never becomes a fake game.</div>`;
  if(d.full)return`<div class="callout" style="margin-top:18px">This period is fully covered by T.I.D.E.'s cumulative-playtime snapshots, so the hour totals are authoritative.</div>`;
  if(d.partial){
    const recovered=Number(d.recoveredMinutes)||0,tracked=Number(d.trackedMinutes)||0;
    return`<div class="callout" style="margin-top:18px"><b>Partial historical month/year.</b> Exact forward tracking began <b>${esc(shortDate(gaming().baselineDate||BASELINE_DATE))}</b>. T.I.D.E. currently knows <b>${esc(hours(d.total))}</b>${recovered?` including <b>${esc(hours(recovered))}</b> defensibly recovered from pre-baseline source data`:''}${tracked?` plus <b>${esc(hours(tracked))}</b> captured by T.I.D.E. snapshots`:''}. Long-running games played before the baseline can still have additional hours that the platforms do not expose by month.</div>`;
  }
  if(d.historicalBounded>0)return`<div class="callout" style="margin-top:18px"><b>Historical recovery:</b> ${esc(hours(d.historicalBounded))} can be assigned to this period because those source records both began and ended inside it. Other old playtime is not split into months by the source APIs, so T.I.D.E. does not invent it.</div>`;
  return`<div class="callout" style="margin-top:18px">Historical period: the source APIs preserve lifetime playtime and dated activity, but they do not expose a complete old month-by-month hour ledger. Known activity is shown below instead of falsely reporting zero playtime.</div>`;
}
function knownActiveBlock(rows){
  if(!rows?.length)return'';
  const filtered=rows.filter(g=>!search||g.title.toLowerCase().includes(search.toLowerCase())).slice(0,30);
  if(!filtered.length)return'';
  return `<div class="section-title">KNOWN ACTIVE · HOURS NOT RECOVERABLE</div><section class="card"><div class="small muted" style="margin-bottom:8px">These games have a source date inside the selected period, but their pre-snapshot hours cannot be split safely from lifetime playtime.</div>${filtered.map(g=>`<div class="detected-item"><span>${esc(g.title)}</span><b>${esc(shortDate(g.lastPlayed))}</b></div>`).join('')}</section>`;
}
export function renderGaming(){
  const d=data(),games=order(d.games),top=games[0],known=d.historical||[],gameCount=new Set([...games.map(g=>g.key),...known.map(g=>g.key)]).size,platformTypes=new Set(currentSources().filter(x=>x.countMinutes&&filterAllows(x.platform,filter)).map(x=>x.platform));
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='gaming'));
  const eye=document.querySelector('#view-eyebrow');if(eye)eye.textContent='GAMING';
  document.querySelector('#sidebar')?.classList.remove('open');document.querySelector('#sidebar-scrim')?.classList.remove('show');
  const hourLabel=mode==='all-time'?'Gaming Hours':d.full?`${d.label} Hours`:`${d.label} Known Hours`;
  root.innerHTML=`<div class="page-head"><div><div class="eyebrow">T.I.D.E.</div><h1>Gaming</h1><p>Combined playtime across live accounts plus your frozen legacy PS4 history.</p></div><div class="chip-row"><button class="button ${mode==='month'?'primary':'ghost'}" data-gmode="month">Monthly</button><button class="button ${mode==='year'?'primary':'ghost'}" data-gmode="year">Yearly</button><button class="button ${mode==='all-time'?'primary':'ghost'}" data-gmode="all-time">All Time</button></div></div>
<section class="card" style="margin-bottom:18px"><div class="filter-row"><select id="g-platform" class="select"><option value="all">All Platforms</option><option value="pc">PC Only</option><option value="console">Console · PS5 + Xbox + Nintendo</option><option value="playstation">PlayStation</option><option value="ps5">PS5 Only</option><option value="ps4">PS4 Only</option><option value="xbox">Xbox Only</option><option value="nintendo">Nintendo Only</option><option value="steam">Steam Only</option><option value="ubisoft">Ubisoft PC Only</option></select><select id="g-sort" class="select"><option value="playtime">Sort · Playtime</option><option value="recent">Sort · Last Played</option><option value="platforms">Sort · Platform Count</option><option value="az">Sort · A–Z</option></select>${mode==='month'?`<input id="g-month" type="month" class="input" value="${month}" style="max-width:180px">`:''}${mode==='year'?`<input id="g-year" type="number" min="2006" max="${new Date().getFullYear()}" class="input" value="${year}" style="max-width:120px">`:''}<input id="g-search" class="input" placeholder="Search games…" value="${esc(search)}" style="flex:1;min-width:170px"><button id="g-refresh" class="button primary">Refresh Accounts</button></div><div class="small muted" style="margin-top:10px">Exophase · danteivery &nbsp;|&nbsp; Steam · dante45673 &nbsp;|&nbsp; Ubisoft counts one stable PC identity; duplicate Ubisoft identities are ignored.</div></section>
<div class="grid grid-4"><div class="card"><div class="stat-label">${esc(hourLabel)}</div><div class="big-stat">${esc(hours(d.total))}</div></div><div class="card"><div class="stat-label">Games Known Active</div><div class="big-stat">${fmt(gameCount)}</div></div><div class="card"><div class="stat-label">Most Played${d.full||mode==='all-time'?'':' · Known'}</div><div class="big-stat" style="font-size:21px">${esc(top?.title||'—')}</div><div class="small muted">${top?hours(top.minutes):''}</div></div><div class="card"><div class="stat-label">Platform Types</div><div class="big-stat">${platformTypes.size}</div></div></div>${notice(d)}
<div class="section-title">${mode==='all-time'?'MOST PLAYED GAMES':`MOST PLAYED · ${esc(d.label)}${d.full?'':' · KNOWN HOURS'}`}</div>${games.length?games.map((g,i)=>card(g,i,d)).join(''):'<section class="card"><div class="muted">No defensible hour total is available for this period yet.</div></section>'}${knownActiveBlock(known)}`;

  root.querySelector('#g-platform').value=filter;root.querySelector('#g-sort').value=sort;
  root.querySelectorAll('[data-gmode]').forEach(b=>b.onclick=()=>{mode=b.dataset.gmode;renderGaming();});
  root.querySelector('#g-platform').onchange=e=>{filter=e.target.value;renderGaming();};
  root.querySelector('#g-sort').onchange=e=>{sort=e.target.value;renderGaming();};
  root.querySelector('#g-search').onchange=e=>{search=e.target.value;renderGaming();};
  root.querySelector('#g-refresh').onclick=()=>refreshGaming({manual:true,onDone:()=>{renderGaming();decorateGamingReviews();}});
  const m=root.querySelector('#g-month');if(m)m.onchange=e=>{month=e.target.value;renderGaming();};
  const y=root.querySelector('#g-year');if(y)y.onchange=e=>{year=Number(e.target.value);renderGaming();};
}
function mini(label,start,end,all=false){
  const d=all?{games:aggregateAllTime('all'),total:allTimeTotal('all'),coverageStart:BASELINE_DATE,recoveredMinutes:0,trackedMinutes:0}:activityRange(start,end,'all'),evidence=all?{lastPlayedGames:[],boundedGames:[],boundedTotal:0}:historicalActivityEvidence(start,end,'all');
  let games=[...d.games],total=d.total,known=evidence.lastPlayedGames||[];
  const covered=all||Boolean(d.coverageStart&&end>=d.coverageStart),full=all||Boolean(d.coverageStart&&start>=d.coverageStart);
  if(!covered&&evidence.boundedGames?.length){games=evidence.boundedGames;total=evidence.boundedTotal;}
  games.sort((a,b)=>b.minutes-a.minutes);const top=games.slice(0,5),partial=!all&&!full;
  return`<div class="section-title">GAMING · ${esc(label)}</div><section class="card"><div class="grid grid-3"><div><div class="stat-label">${partial?'Known Gaming Hours':'Gaming Hours'}</div><div class="big-stat">${esc(hours(total))}</div></div><div><div class="stat-label">Most Played${partial?' · Known':''}</div><div class="big-stat" style="font-size:21px">${esc(top[0]?.title||'—')}</div></div><div><div class="stat-label">Games Known Active</div><div class="big-stat">${new Set([...games.map(g=>g.key),...known.map(g=>g.key)]).size}</div></div></div>${top.length?`<div style="margin-top:15px">${top.map((g,i)=>`<div class="detected-item"><span>${i+1}. ${esc(g.title)}</span><b>${esc(hours(g.minutes))}</b></div>`).join('')}</div>`:''}${partial?`<div class="small muted" style="margin-top:10px">Partial historical coverage. Exact snapshot tracking starts ${shortDate(d.coverageStart||BASELINE_DATE)}; recoverable pre-baseline hours are included where the source data supports them.</div>`:''}${!all&&known.length?`<div class="small muted" style="margin-top:10px">${known.length} additional game${known.length===1?'':'s'} have dated activity in this period but no defensible old hour split.</div>`:''}</section>`;
}
export function decorateGamingReviews(){
  const title=root?.querySelector('.page-head h1')?.textContent||'';
  if(title==='Monthly Review'&&!root.querySelector('#gaming-month-review')){
    const m=root.querySelector('#month-select')?.value||month,[y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate(),w=document.createElement('div');
    w.id='gaming-month-review';w.innerHTML=mini(new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(y,mo-1,1)),`${m}-01`,`${m}-${String(last).padStart(2,'0')}`);root.append(w);
  }else if(/^\d{4}\s*·\s*Year in Review$/.test(title)&&!root.querySelector('#gaming-year-review')){
    const y=Number(title.slice(0,4)),w=document.createElement('div');w.id='gaming-year-review';w.innerHTML=mini(String(y),`${y}-01-01`,`${y}-12-31`);root.append(w);
  }else if(/^ALL TIME\s*·\s*Year in Review$/.test(title)&&!root.querySelector('#gaming-all-review')){
    const w=document.createElement('div');w.id='gaming-all-review';w.innerHTML=mini('ALL TIME','','',true);root.append(w);
  }
}
export function wireGamingView(){
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="gaming"]'))setTimeout(renderGaming,0);if(e.target.closest('[data-view="monthly"],[data-view="yearly"]'))setTimeout(decorateGamingReviews,0);});
  document.addEventListener('change',e=>{if(e.target.matches('#month-select,#year-select'))setTimeout(decorateGamingReviews,0);});
  setTimeout(decorateGamingReviews,0);
}
