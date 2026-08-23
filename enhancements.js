import {
  dailyChallengeCounter,dailyChallengeLogForDate,dailyChallengeScoreStats,isoToday,markDailyChallengeMissed,
  markDailyChallengePlayed,montyRecord,setDailyChallengeLog,setDailyChallengeStreak,setMonthlyMontyBaseline,trackerTotal
} from './engine-v3.js';

const KEY='tide_state_v1';
const root=document.querySelector('#view-root');
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=n=>n==null?'—':new Intl.NumberFormat('en-US').format(Number(n)||0);
const shortDate=d=>d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`)):'—';
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
const save=state=>{state.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(state))};
function card(label,value,detail=''){return `<div class="record-card"><div class="stat-label">${esc(label)}</div><div class="record-value">${esc(value)}</div>${detail?`<div class="record-detail">${esc(detail)}</div>`:''}</div>`}
function isoFromDayHeading(){const text=root.querySelector('.day-nav-center h1')?.textContent?.trim();if(!text)return null;const clean=text.replace(/^[A-Za-z]+,\s*/,'');const d=new Date(`${clean} 12:00:00`);if(Number.isNaN(d.getTime()))return null;return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

function enhanceToday(){
  if(document.querySelector('#tide-v3-today-dc')||!root.querySelector('#day-editor'))return;
  const date=isoFromDayHeading(),state=load();if(!date||!state)return;
  const month=date.slice(0,7),counter=dailyChallengeCounter(state),record=montyRecord(state,{month}),log=dailyChallengeLogForDate(state,date),today=isoToday();
  const alreadyCounted=counter.lastDate===date&&counter.active;
  const section=document.createElement('section');section.id='tide-v3-today-dc';section.className='card';
  section.innerHTML=`
    <div class="card-header"><div><h3>GeoGuessr Daily Challenge</h3><div class="small muted">One explicit click controls the streak. Diary wording never changes this number.</div></div><span class="chip accent">AUTHORITATIVE</span></div>
    <div style="text-align:center;padding:8px 0 16px"><div class="stat-label">CURRENT DAILY CHALLENGE STREAK</div><div class="big-stat" style="font-size:58px;line-height:1.05;margin-top:6px">${counter.value}</div><div class="tiny subtle" style="margin-top:6px">${counter.active?'ACTIVE':'INACTIVE'}${counter.lastDate?` · through ${shortDate(counter.lastDate)}`:''}</div></div>
    <button id="v4-played" class="button primary" style="width:100%;font-size:17px;padding:13px" ${alreadyCounted?'disabled':''}>${alreadyCounted?'Today Counted ✓':'↑ +1 · I Played Today'}</button>
    <button id="v4-missed" class="button ghost" style="width:100%;margin-top:8px">Streak Lost / Reset</button>
    <div class="section-title">VS MONTY</div>
    <div class="grid grid-2" style="margin-bottom:10px"><div><div class="stat-label">This month</div><div class="big-stat" style="font-size:25px">${record.wins}-${record.losses}</div></div><div><div class="stat-label">This day</div><div class="big-stat" style="font-size:21px">${log.versus==='win'?'WIN':log.versus==='loss'?'LOSS':'—'}</div></div></div>
    <label class="label">Result vs Monty<select id="v4-versus" class="select" style="width:100%"><option value="none" ${log.versus==='none'?'selected':''}>Did not play Monty</option><option value="win" ${log.versus==='win'?'selected':''}>Win</option><option value="loss" ${log.versus==='loss'?'selected':''}>Loss</option></select></label>
    <div class="grid grid-2" style="margin-top:10px"><label class="label">My score<input id="v4-me" class="input" type="number" min="0" max="25000" placeholder="Optional" value="${log.myScore??''}"></label><label class="label">Monty score<input id="v4-monty" class="input" type="number" min="0" max="25000" placeholder="Optional" value="${log.opponentScore??''}"></label></div>
    <button id="v4-save-monty" class="button" style="width:100%;margin-top:10px">Save Monty Result</button>
    <div class="tiny subtle" style="margin-top:9px">Nothing here calls Netlify while you are choosing values. Saves are local-first.</div>`;
  const stack=root.querySelector('.right-stack');if(stack)stack.prepend(section);else root.append(section);
  const played=section.querySelector('#v4-played');if(played)played.onclick=()=>{const current=load();if(!current)return;markDailyChallengePlayed(current,date);save(current);location.reload()};
  section.querySelector('#v4-missed').onclick=()=>{const current=load();if(!current)return;markDailyChallengeMissed(current,date);save(current);location.reload()};
  section.querySelector('#v4-save-monty').onclick=()=>{const current=load();if(!current)return;setDailyChallengeLog(current,{date,status:'none',versus:section.querySelector('#v4-versus').value,myScore:section.querySelector('#v4-me').value,opponentScore:section.querySelector('#v4-monty').value});save(current);location.reload()};
}

function enhanceMonthly(){
  if(document.querySelector('#tide-v3-month-monty'))return;
  const select=root.querySelector('#month-select');if(!select)return;const month=select.value,state=load();if(!state)return;
  const record=montyRecord(state,{month}),counter=dailyChallengeCounter(state);
  const section=document.createElement('section');section.id='tide-v3-month-monty';section.className='card';section.style.marginTop='16px';
  section.innerHTML=`<div class="card-header"><div><h2>Daily Challenge vs Monty</h2><div class="small muted">Wins and losses only. There is no tie state anywhere in T.I.D.E.</div></div><span class="chip accent">${record.wins}-${record.losses}</span></div><div class="grid grid-3"><div class="record-card"><div class="stat-label">Wins</div><div class="record-value">${record.wins}</div></div><div class="record-card"><div class="stat-label">Losses</div><div class="record-value">${record.losses}</div></div><div class="record-card"><div class="stat-label">Current DC Streak</div><div class="record-value">${counter.value}</div><div class="record-detail">${counter.active?'ACTIVE':'INACTIVE'}</div></div></div><div class="section-title">CORRECT MONTH RECORD</div><div class="grid grid-2"><label class="label">Wins<input id="v3-month-wins" class="input" type="number" min="0" value="${record.wins}"></label><label class="label">Losses<input id="v3-month-losses" class="input" type="number" min="0" value="${record.losses}"></label></div><button id="v3-month-save" class="button primary" style="margin-top:12px">Save / Correct Month Record</button>`;
  root.append(section);
  section.querySelector('#v3-month-save').onclick=()=>{const current=load();if(!current)return;setMonthlyMontyBaseline(current,month,{wins:section.querySelector('#v3-month-wins').value,losses:section.querySelector('#v3-month-losses').value});save(current);location.reload()};
}

function enhanceYear(){
  if(document.querySelector('#tide-v2-year-details'))return;
  const title=root.querySelector('.page-head h1')?.textContent||'';const m=title.match(/^(20\d{2})\s*·\s*Year in Review/);if(!m)return;
  const year=Number(m[1]),state=load();if(!state)return;const review=state.yearlyReviews?.[year]||{},legacy=review.legacyFields||{},monty=montyRecord(state,{year}),scores=dailyChallengeScoreStats(state,{year}),counter=dailyChallengeCounter(state);
  const section=document.createElement('div');section.id='tide-v2-year-details';section.innerHTML=`
    <div class="section-title">T.I.D.E. DETAIL RECORDS</div><section class="card"><div class="card-header"><div><h2>Full Year-Review Detail</h2><div class="small muted">Monty is W-L only, calculated from monthly records. The Daily Challenge streak uses the authoritative counter.</div></div><span class="chip accent">LIVE</span></div>
    <div class="records-grid">${card('Google Car Casualties',trackerTotal(state,'google-car',{year}))}${card('Collision Count',trackerTotal(state,'collision-count',{year}))}${card('Daily Challenge vs Monty',`${monty.wins}-${monty.losses}`,'Monthly records summed')}${card('Current DC Streak',counter.value,counter.lastDate?`Through ${shortDate(counter.lastDate)}`:'')}${card('AVG DC Score · Me',fmt(scores.myAverage))}${card('AVG DC Score · Monty',fmt(scores.opponentAverage))}${card('Highest DC Score · Me',scores.myHigh?fmt(scores.myHigh.score):'—',scores.myHigh?shortDate(scores.myHigh.date):'')}${card('Highest DC Score · Monty',scores.opponentHigh?fmt(scores.opponentHigh.score):'—',scores.opponentHigh?shortDate(scores.opponentHigh.date):'')}</div>
    <div class="section-title">MUSIC DETAIL</div><div class="filter-row"><label class="label" style="flex:1">Final Song of ${year}<input id="v2-final-song" class="input" style="width:100%" value="${esc(review.finalSong||legacy[`FINAL SONG OF ${year}`]||'')}" placeholder="Save the final song of the year"></label><button id="v2-save-final" class="button primary">Save Final Song</button></div>${Object.keys(legacy).length?`<div class="section-title">PRESERVED FROM ORIGINAL YEAR IN REVIEW</div><div class="tracker-table">${Object.entries(legacy).map(([k,v])=>`<div class="detected-item"><span>${esc(k)}</span><b>${esc(v||'—')}</b></div>`).join('')}</div>`:''}</section>`;
  const musicHeading=[...root.querySelectorAll('.section-title')].find(x=>/MUSIC YEAR IN REVIEW/i.test(x.textContent));if(musicHeading)musicHeading.before(section);else root.append(section);
  section.querySelector('#v2-save-final').onclick=()=>{const current=load();if(!current)return;current.yearlyReviews||={};current.yearlyReviews[year]={...(current.yearlyReviews[year]||{}),finalSong:section.querySelector('#v2-final-song').value.trim(),updatedAt:new Date().toISOString()};save(current)};
}

function enhanceTrackers(){
  if(document.querySelector('#tide-v2-dc-log'))return;
  const title=root.querySelector('.page-head h1')?.textContent||'';if(title!=='Trackers')return;const state=load();if(!state)return;const counter=dailyChallengeCounter(state),record=montyRecord(state,{year:Number(isoToday().slice(0,4))});
  const section=document.createElement('section');section.id='tide-v2-dc-log';section.className='card';section.style.marginBottom='16px';section.innerHTML=`<div class="card-header"><div><h2>Daily Challenge Streak Control</h2><div class="small muted">This is the authoritative streak number. Old diary detections cannot inflate it.</div></div><span class="chip accent">${counter.value}</span></div><div class="grid grid-3"><div class="record-card"><div class="stat-label">Current streak</div><div class="record-value">${counter.value}</div></div><div class="record-card"><div class="stat-label">Last counted</div><div class="record-value" style="font-size:20px">${counter.lastDate?shortDate(counter.lastDate):'—'}</div></div><div class="record-card"><div class="stat-label">This year vs Monty</div><div class="record-value">${record.wins}-${record.losses}</div></div></div><div class="filter-row" style="margin-top:14px"><button id="v4-track-plus" class="button primary">↑ +1 Played Today</button><button id="v4-track-miss" class="button ghost">Streak Lost</button></div><div class="section-title">CORRECT STREAK NUMBER</div><div class="filter-row"><input id="v4-streak-value" class="input" type="number" min="0" value="${counter.value}" style="max-width:180px"><button id="v4-streak-set" class="button">Set Current Streak</button></div>`;
  const firstCard=root.querySelector(':scope > .card');if(firstCard)firstCard.before(section);else root.append(section);
  section.querySelector('#v4-track-plus').onclick=()=>{const current=load();if(!current)return;markDailyChallengePlayed(current,isoToday());save(current);location.reload()};
  section.querySelector('#v4-track-miss').onclick=()=>{const current=load();if(!current)return;markDailyChallengeMissed(current,isoToday());save(current);location.reload()};
  section.querySelector('#v4-streak-set').onclick=()=>{const current=load();if(!current)return;setDailyChallengeStreak(current,section.querySelector('#v4-streak-value').value,isoToday());save(current);location.reload()};
}

let pending=false;const run=()=>{pending=false;enhanceToday();enhanceMonthly();enhanceYear();enhanceTrackers()};new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(run)}).observe(root,{childList:true,subtree:true});run();