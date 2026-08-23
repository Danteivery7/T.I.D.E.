import { addManualOccurrence, dailyChallengeScoreStats, dailyChallengeStreaks, isoToday, montyRecord, trackerTotal } from './engine-v2.js';
const KEY='tide_state_v1';
const root=document.querySelector('#view-root');
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=n=>n==null?'—':new Intl.NumberFormat('en-US').format(Number(n)||0);
const shortDate=d=>d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`)):'—';
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
const save=state=>{state.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(state))};
function card(label,value,detail=''){return `<div class="record-card"><div class="stat-label">${esc(label)}</div><div class="record-value">${esc(value)}</div>${detail?`<div class="record-detail">${esc(detail)}</div>`:''}</div>`}

function enhanceYear(){
  if(document.querySelector('#tide-v2-year-details'))return;
  const title=root.querySelector('.page-head h1')?.textContent||'';const m=title.match(/^(20\d{2})\s*·\s*Year in Review/);if(!m)return;
  const year=Number(m[1]),state=load();if(!state)return;const review=state.yearlyReviews?.[year]||{},legacy=review.legacyFields||{},monty=montyRecord(state,{year}),scores=dailyChallengeScoreStats(state,{year}),dc=dailyChallengeStreaks(state);
  const section=document.createElement('div');section.id='tide-v2-year-details';section.innerHTML=`
    <div class="section-title">T.I.D.E. 2026 DETAIL RECORDS</div>
    <section class="card">
      <div class="card-header"><div><h2>Full Year-Review Detail</h2><div class="small muted">Preserves the detailed fields from the newest T.I.D.E. format while automatic records update around them.</div></div><span class="chip accent">V2</span></div>
      <div class="records-grid">
        ${card('Google Car Casualties',trackerTotal(state,'google-car',{year}))}
        ${card('Collision Count',trackerTotal(state,'collision-count',{year}))}
        ${card('Daily Challenge vs Monty',`${monty.wins}-${monty.losses}`,monty.ties?`${monty.ties} ties`:'')}
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
  const title=root.querySelector('.page-head h1')?.textContent||'';if(title!=='Trackers')return;const state=load();if(!state)return;const dc=dailyChallengeStreaks(state);
  const section=document.createElement('section');section.id='tide-v2-dc-log';section.className='card';section.style.marginBottom='16px';section.innerHTML=`<div class="card-header"><div><h2>Daily Challenge Quick Log</h2><div class="small muted">Exact streak + score entry. This saves locally and does not call Netlify.</div></div><span class="chip accent">${dc.active?`${dc.current} DAY ACTIVE`:'INACTIVE'}</span></div><div class="grid grid-4"><label class="label">Date<input id="v2-dc-date" class="input" type="date" value="${isoToday()}"></label><label class="label">Status<select id="v2-dc-status" class="select"><option value="complete">Completed</option><option value="miss">Missed / streak lost</option></select></label><label class="label">My score<input id="v2-dc-me" class="input" type="number" min="0" max="25000" placeholder="Optional"></label><label class="label">Monty score<input id="v2-dc-monty" class="input" type="number" min="0" max="25000" placeholder="Optional"></label></div><button id="v2-dc-save" class="button primary" style="margin-top:13px">Save Daily Challenge</button>`;
  const firstCard=root.querySelector(':scope > .card');if(firstCard)firstCard.before(section);else root.append(section);
  section.querySelector('#v2-dc-save').onclick=()=>{const current=load();if(!current)return;const date=section.querySelector('#v2-dc-date').value,status=section.querySelector('#v2-dc-status').value,my=section.querySelector('#v2-dc-me').value,monty=section.querySelector('#v2-dc-monty').value;if(!date)return;addManualOccurrence(current,{trackerId:'daily-challenge',date,count:status==='complete'?1:0,result:status,myScore:my,snippet:status==='complete'?'Daily Challenge completed':'Daily Challenge missed / streak lost'});if(my!==''&&monty!==''){const a=Number(my),b=Number(monty),result=a>b?'win':a<b?'loss':'tie';addManualOccurrence(current,{trackerId:'monty-dc',date,count:1,result,myScore:my,opponentScore:monty,snippet:`Daily Challenge vs Monty: ${a}-${b}`})}save(current);location.reload()};
}

let pending=false;const run=()=>{pending=false;enhanceYear();enhanceTrackers()};new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(run)}).observe(root,{childList:true,subtree:true});run();
