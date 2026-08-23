import {
  dailyChallengeLogForDate,dailyChallengeScoreStats,dailyChallengeStreaks,isoToday,montyRecord,
  setDailyChallengeLog,setMonthlyMontyBaseline,trackerTotal
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
function resultLabel(result){return result==='win'?'Win':result==='loss'?'Loss':result==='tie'?'Tie':'Did not play Monty'}

function enhanceToday(){
  if(document.querySelector('#tide-v3-today-dc')||!root.querySelector('#day-editor'))return;
  const date=isoFromDayHeading();const state=load();if(!date||!state)return;
  const month=date.slice(0,7),dc=dailyChallengeStreaks(state),record=montyRecord(state,{month}),log=dailyChallengeLogForDate(state,date);
  const section=document.createElement('section');section.id='tide-v3-today-dc';section.className='card';
  section.innerHTML=`
    <div class="card-header"><div><h3>GeoGuessr Daily Challenge</h3><div class="small muted">Mark the streak day here. Your diary text can stay natural.</div></div><span class="chip accent">${dc.active?`${dc.current} DAY ACTIVE`:'INACTIVE'}</span></div>
    <div class="grid grid-2" style="margin-bottom:12px">
      <div><div class="stat-label">This day</div><div class="big-stat" style="font-size:22px">${log.status==='complete'?'Completed ✓':log.status==='miss'?'Missed':'Not logged'}</div></div>
      <div><div class="stat-label">Vs Monty this month</div><div class="big-stat" style="font-size:22px">${record.wins}-${record.losses}</div>${record.ties?`<div class="tiny subtle">${record.ties} tie${record.ties===1?'':'s'}</div>`:''}</div>
    </div>
    <label class="label">Daily Challenge status<select id="v3-today-status" class="select" style="width:100%"><option value="complete" ${log.status==='complete'?'selected':''}>Completed · extend streak</option><option value="miss" ${log.status==='miss'?'selected':''}>Missed · streak lost</option><option value="clear">Clear my manual log</option></select></label>
    <label class="label" style="margin-top:10px">Result vs Monty<select id="v3-today-versus" class="select" style="width:100%"><option value="none" ${log.versus==='none'?'selected':''}>Did not play Monty</option><option value="win" ${log.versus==='win'?'selected':''}>Win</option><option value="loss" ${log.versus==='loss'?'selected':''}>Loss</option><option value="tie" ${log.versus==='tie'?'selected':''}>Tie</option></select></label>
    <div class="grid grid-2" style="margin-top:10px"><label class="label">My score<input id="v3-today-me" class="input" type="number" min="0" max="25000" placeholder="Optional" value="${log.myScore??''}"></label><label class="label">Monty score<input id="v3-today-monty" class="input" type="number" min="0" max="25000" placeholder="Optional" value="${log.opponentScore??''}"></label></div>
    <button id="v3-today-save" class="button primary" style="width:100%;margin-top:12px">Save GeoGuessr Day</button>
    <div class="tiny subtle" style="margin-top:9px">Saves locally with one click. It will join cloud sync on your next explicit Save Day or Sync Now.</div>`;
  const stack=root.querySelector('.right-stack');if(stack)stack.prepend(section);else root.append(section);
  const status=section.querySelector('#v3-today-status'),versus=section.querySelector('#v3-today-versus');
  status.onchange=()=>{if(status.value==='miss')versus.value='none'};
  section.querySelector('#v3-today-save').onclick=()=>{const current=load();if(!current)return;setDailyChallengeLog(current,{date,status:status.value,versus:versus.value,myScore:section.querySelector('#v3-today-me').value,opponentScore:section.querySelector('#v3-today-monty').value});save(current);location.reload()};
}

function enhanceMonthly(){
  if(document.querySelector('#tide-v3-month-monty'))return;
  const select=root.querySelector('#month-select');if(!select)return;const month=select.value,state=load();if(!state)return;
  const record=montyRecord(state,{month}),dc=dailyChallengeStreaks(state);
  const section=document.createElement('section');section.id='tide-v3-month-monty';section.className='card';section.style.marginTop='16px';
  section.innerHTML=`<div class="card-header"><div><h2>Daily Challenge vs Monty</h2><div class="small muted">The month record is W-L. Daily results add automatically; use the correction fields only if the running record needs fixing.</div></div><span class="chip accent">${record.wins}-${record.losses}</span></div><div class="grid grid-3"><div class="record-card"><div class="stat-label">Wins</div><div class="record-value">${record.wins}</div></div><div class="record-card"><div class="stat-label">Losses</div><div class="record-value">${record.losses}</div></div><div class="record-card"><div class="stat-label">Current DC Streak</div><div class="record-value">${dc.active?dc.current:0}</div><div class="record-detail">${dc.active?'ACTIVE':'INACTIVE'}</div></div></div><div class="section-title">CORRECT MONTH RECORD</div><div class="grid grid-3"><label class="label">Wins<input id="v3-month-wins" class="input" type="number" min="0" value="${record.wins}"></label><label class="label">Losses<input id="v3-month-losses" class="input" type="number" min="0" value="${record.losses}"></label><label class="label">Ties<input id="v3-month-ties" class="input" type="number" min="0" value="${record.ties||0}"></label></div><button id="v3-month-save" class="button primary" style="margin-top:12px">Save / Correct Month Record</button>`;
  root.append(section);
  section.querySelector('#v3-month-save').onclick=()=>{const current=load();if(!current)return;setMonthlyMontyBaseline(current,month,{wins:section.querySelector('#v3-month-wins').value,losses:section.querySelector('#v3-month-losses').value,ties:section.querySelector('#v3-month-ties').value});save(current);location.reload()};
}

function enhanceYear(){
  if(document.querySelector('#tide-v2-year-details'))return;
  const title=root.querySelector('.page-head h1')?.textContent||'';const m=title.match(/^(20\d{2})\s*·\s*Year in Review/);if(!m)return;
  const year=Number(m[1]),state=load();if(!state)return;const review=state.yearlyReviews?.[year]||{},legacy=review.legacyFields||{},monty=montyRecord(state,{year}),scores=dailyChallengeScoreStats(state,{year}),dc=dailyChallengeStreaks(state);
  const section=document.createElement('div');section.id='tide-v2-year-details';section.innerHTML=`
    <div class="section-title">T.I.D.E. DETAIL RECORDS</div>
    <section class="card">
      <div class="card-header"><div><h2>Full Year-Review Detail</h2><div class="small muted">The Monty record is calculated from the monthly W-L records, not the stale typed year total.</div></div><span class="chip accent">LIVE</span></div>
      <div class="records-grid">
        ${card('Google Car Casualties',trackerTotal(state,'google-car',{year}))}
        ${card('Collision Count',trackerTotal(state,'collision-count',{year}))}
        ${card('Daily Challenge vs Monty',`${monty.wins}-${monty.losses}`,monty.ties?`${monty.ties} ties`:'Monthly records summed')}
        ${card('Current DC Streak',dc.active?`${dc.current} days`:'Inactive',dc.active?`Began ${shortDate(dc.currentStart)}`:'')}
        ${card('AVG DC Score · Me',fmt(scores.myAverage))}
        ${card('AVG DC Score · Monty',fmt(scores.opponentAverage))}
        ${card('Highest DC Score · Me',scores.myHigh?fmt(scores.myHigh.score):'—',scores.myHigh?shortDate(scores.myHigh.date):'')}
        ${card('Highest DC Score · Monty',scores.opponentHigh?fmt(scores.opponentHigh.score):'—',scores.opponentHigh?shortDate(scores.opponentHigh.date):'')}
      </div>
      <div class="section-title">MUSIC DETAIL</div>
      <div class="filter-row"><label class="label" style="flex:1">Final Song of ${year}<input id="v2-final-song" class="input" style="width:100%" value="${esc(review.finalSong||legacy[`FINAL SONG OF ${year}`]||'')}" placeholder="Save the final song of the year"></label><button id="v2-save-final" class="button primary">Save Final Song</button></div>
      ${Object.keys(legacy).length?`<div class="section-title">PRESERVED FROM ORIGINAL YEAR IN REVIEW</div><div class="tracker-table">${Object.entries(legacy).map(([k,v])=>`<div class="detected-item"><span>${esc(k)}</span><b>${esc(v||'—')}</b></div>`).join('')}</div>`:''}
    </section>`;
  const musicHeading=[...root.querySelectorAll('.section-title')].find(x=>/MUSIC YEAR IN REVIEW/i.test(x.textContent));if(musicHeading)musicHeading.before(section);else root.append(section);
  section.querySelector('#v2-save-final').onclick=()=>{const current=load();if(!current)return;current.yearlyReviews||={};current.yearlyReviews[year]={...(current.yearlyReviews[year]||{}),finalSong:section.querySelector('#v2-final-song').value.trim(),updatedAt:new Date().toISOString()};save(current);const b=section.querySelector('#v2-save-final');b.textContent='Saved ✓';setTimeout(()=>b.textContent='Save Final Song',1400)};
}

function enhanceTrackers(){
  if(document.querySelector('#tide-v2-dc-log'))return;
  const title=root.querySelector('.page-head h1')?.textContent||'';if(title!=='Trackers')return;const state=load();if(!state)return;const dc=dailyChallengeStreaks(state),record=montyRecord(state,{year:Number(isoToday().slice(0,4))});
  const section=document.createElement('section');section.id='tide-v2-dc-log';section.className='card';section.style.marginBottom='16px';section.innerHTML=`<div class="card-header"><div><h2>Detailed Daily Challenge Log</h2><div class="small muted">The same data shown on Today, with exact date and optional scores.</div></div><span class="chip accent">${dc.active?`${dc.current} DAY ACTIVE`:'INACTIVE'}</span></div><div class="grid grid-4"><label class="label">Date<input id="v2-dc-date" class="input" type="date" value="${isoToday()}"></label><label class="label">Status<select id="v2-dc-status" class="select"><option value="complete">Completed</option><option value="miss">Missed / streak lost</option><option value="clear">Clear manual log</option></select></label><label class="label">Vs Monty<select id="v2-dc-result" class="select"><option value="none">Did not play</option><option value="win">Win</option><option value="loss">Loss</option><option value="tie">Tie</option></select></label><div><div class="stat-label">This year vs Monty</div><div class="big-stat" style="font-size:26px">${record.wins}-${record.losses}</div></div></div><div class="grid grid-2" style="margin-top:10px"><label class="label">My score<input id="v2-dc-me" class="input" type="number" min="0" max="25000" placeholder="Optional"></label><label class="label">Monty score<input id="v2-dc-monty" class="input" type="number" min="0" max="25000" placeholder="Optional"></label></div><button id="v2-dc-save" class="button primary" style="margin-top:13px">Save Daily Challenge</button>`;
  const firstCard=root.querySelector(':scope > .card');if(firstCard)firstCard.before(section);else root.append(section);
  section.querySelector('#v2-dc-status').onchange=()=>{if(section.querySelector('#v2-dc-status').value==='miss')section.querySelector('#v2-dc-result').value='none'};
  section.querySelector('#v2-dc-save').onclick=()=>{const current=load();if(!current)return;setDailyChallengeLog(current,{date:section.querySelector('#v2-dc-date').value,status:section.querySelector('#v2-dc-status').value,versus:section.querySelector('#v2-dc-result').value,myScore:section.querySelector('#v2-dc-me').value,opponentScore:section.querySelector('#v2-dc-monty').value});save(current);location.reload()};
}

let pending=false;const run=()=>{pending=false;enhanceToday();enhanceMonthly();enhanceYear();enhanceTrackers()};new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(run)}).observe(root,{childList:true,subtree:true});run();
