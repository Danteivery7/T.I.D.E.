import {
  MONTHS, allTrackerDefinitions, askTide, activityStats, addManualOccurrence, buildStory, dailyChallengeStreaks,
  dateLabel, daySummary, daysInMonth, geoguessr10kRecord, isoToday, legacyTrackerTotal, loggingStreak,
  monthBounds, monthLabel, montyRecord, mostActivityDay, occurrencesFor, parseNotesImport, saveEntry, saveMonthlyReview,
  saveYearlyReview, shiftDay, splitEvents, trackerDefinition, trackerTotal, yearOf
} from './engine.js';
import {
  clearDraft, cloudLogin, cloudLogout, cloudPull, cloudPush, cloudStatus, exportState, importStateObject,
  loadDraft, loadLocal, mergeStates, saveDraft, saveLocal
} from './storage.js';
import { fetchPeriodMusic } from './spotify.js';
import { activityRange, gamingRecordHighlights, hours as gamingHours } from './gaming-data.js';

const root=document.querySelector('#view-root');
const nav=document.querySelector('#primary-nav');
const sidebar=document.querySelector('#sidebar');
const scrim=document.querySelector('#sidebar-scrim');
const modal=document.querySelector('#modal');
const toastRegion=document.querySelector('#toast-region');
let state=loadLocal();
let view='today';
let selectedDate=isoToday();
let selectedMonth=selectedDate.slice(0,7);
let selectedYear=Number(selectedDate.slice(0,4));
let musicPeriod='month',musicCategory='songs',musicMonth=selectedMonth,musicYear=selectedYear;
let musicCustomStart=shiftDay(isoToday(),-29),musicCustomEnd=isoToday(),musicRequestId=0;
let cloud={configured:false,authenticated:false,etag:null,checked:false};
let askAnswer=null;
let draftTimer=null;

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US').format(Number(n)||0);
const shortDate=d=>d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`)):'—';

function toast(message,type='good'){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastRegion.append(el);setTimeout(()=>el.remove(),3200)}
function setView(next){view=next;document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.querySelector('#view-eyebrow').textContent=view==='ask'?'ASK T.I.D.E.':view.replaceAll('-',' ').toUpperCase();closeSidebar();render()}
function openSidebar(){sidebar.classList.add('open');scrim.classList.add('show')}
function closeSidebar(){sidebar.classList.remove('open');scrim.classList.remove('show')}
function openModal(title,body,eyebrow='T.I.D.E.'){document.querySelector('#modal-title').textContent=title;document.querySelector('#modal-eyebrow').textContent=eyebrow;document.querySelector('#modal-body').innerHTML=body;modal.showModal()}
function closeModal(){modal.close()}
function persist(){saveLocal(state)}

nav.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)});
document.querySelector('.sidebar-bottom').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)});
document.querySelector('#mobile-menu').onclick=openSidebar;document.querySelector('#mobile-close').onclick=closeSidebar;scrim.onclick=closeSidebar;
document.querySelector('#quick-ask').onclick=()=>setView('ask');document.querySelector('#jump-today').onclick=()=>{selectedDate=isoToday();selectedMonth=selectedDate.slice(0,7);selectedYear=yearOf(selectedDate);setView('today')};
document.querySelector('#modal-close').onclick=closeModal;

function pageHead(title,sub='',actions=''){return `<div class="page-head"><div><div class="eyebrow">T.I.D.E.</div><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</div>${actions}</div>`}
function button(label,id,cls=''){return `<button class="button ${cls}" id="${id}">${label}</button>`}
function entryText(date){return state.entries?.[date]?.text||''}
function entryExists(date){return Boolean(entryText(date).trim())}
function eventCount(date){return splitEvents(entryText(date)).length}
function relevantDetections(date){return (state.occurrences||[]).filter(x=>x.date===date&&x.source==='detected')}
function monthReview(key=selectedMonth){return state.monthlyReviews?.[key]||{}}

function todayView(){
  const date=selectedDate;const saved=entryText(date);const draft=loadDraft(date);const text=draft!==null?draft:saved;const isToday=date===isoToday();const det=relevantDetections(date);const review=monthReview(date.slice(0,7));const otd=onThisDayRows(date).filter(x=>x.date!==date).slice(0,3);const streak=dailyChallengeStreaks(state);const geo=geoguessr10kRecord(state);
  root.innerHTML=`${pageHead(isToday?'Today':dateLabel(date,{weekday:false}),isToday?'Your day is the focus. Type naturally, use commas, and save whenever you want.':'Historical days stay fully editable and keep revision history.')}
    <div class="hero-day">
      <section class="card day-card">
        <div class="day-nav"><button class="icon-button" id="prev-day">‹</button><div class="day-nav-center"><div class="eyebrow">${isToday?'CURRENT DAY':'DIARY ENTRY'}</div><h1>${esc(dateLabel(date))}</h1><div class="day-status"><span class="status-dot"></span>${saved?`Saved · ${eventCount(date)} events`:(isToday?'In progress':'No saved entry')}</div></div><button class="icon-button" id="next-day">›</button></div>
        <div class="editor-wrap"><textarea id="day-editor" class="editor" spellcheck="true" placeholder="Woke up, got up, edited, showered and got dressed, ...">${esc(text)}</textarea><div class="editor-meta" id="editor-meta">${splitEvents(text).length} recognized chunks · draft saves locally</div></div>
        <div class="editor-actions"><div class="small muted" id="save-note">Typing never calls Netlify. Save writes locally first.</div><div class="chip-row"><button class="button ghost" id="versions">Version history</button><button class="button primary" id="save-day">Save Day</button></div></div>
        <div class="section-title">T.I.D.E. NOTICED</div><div class="detected-list" id="detected-list">${det.length?det.map(d=>`<div class="detected-item"><span>${esc(trackerDefinition(state,d.trackerId).name)}</span><b>${d.value!=null?fmt(d.value):d.result?esc(d.result):`+${d.count}`}</b></div>`).join(''):`<div class="muted small">Save the day and detected trackers will appear here. You can correct anything from Trackers.</div>`}</div>
      </section>
      <aside class="right-stack">
        <section class="card"><div class="card-header"><h3>On This Day</h3><button class="button ghost" id="open-otd">View all</button></div>${otd.length?otd.map(r=>`<div class="otd-item" data-date="${r.date}"><div class="otd-year">${r.year}</div><div class="otd-summary">${esc(r.summary)}</div></div>`).join(''):`<div class="muted small">As T.I.D.E. grows, this will show what happened on this date in earlier years.</div>`}</section>
        <section class="card"><div class="card-header"><h3>This Month</h3><button class="button ghost" id="open-month">Review</button></div><div class="grid grid-2"><div><div class="stat-label">Best Day</div><div class="big-stat" style="font-size:23px">${review.bestDay?shortDate(review.bestDay):'—'}</div></div><div><div class="stat-label">Worst Day</div><div class="big-stat" style="font-size:23px">${review.worstDay?shortDate(review.worstDay):'—'}</div></div></div></section>
        <section class="card"><div class="card-header"><h3>Live Records</h3><button class="button ghost" id="open-records">Records</button></div><div class="grid grid-2"><div><div class="stat-label">DC Streak</div><div class="big-stat" style="font-size:26px">${streak.active?streak.current:0}</div><div class="tiny subtle">${streak.active?'ACTIVE':'INACTIVE'}</div></div><div><div class="stat-label">Geoguessr 10K</div><div class="big-stat" style="font-size:26px">${geo?fmt(geo.value):'—'}</div><div class="tiny subtle">${geo?shortDate(geo.date):'NO DATA'}</div></div></div></section>
      </aside>
    </div>`;
  root.querySelector('#prev-day').onclick=()=>{selectedDate=shiftDay(date,-1);selectedMonth=selectedDate.slice(0,7);selectedYear=yearOf(selectedDate);render()};
  root.querySelector('#next-day').onclick=()=>{selectedDate=shiftDay(date,1);selectedMonth=selectedDate.slice(0,7);selectedYear=yearOf(selectedDate);render()};
  const editor=root.querySelector('#day-editor');editor.addEventListener('input',()=>{clearTimeout(draftTimer);root.querySelector('#editor-meta').textContent=`${splitEvents(editor.value).length} recognized chunks · local draft`;draftTimer=setTimeout(()=>saveDraft(date,editor.value),450)});
  root.querySelector('#save-day').onclick=()=>saveCurrentDay(date,editor.value);root.querySelector('#versions').onclick=()=>showVersions(date);root.querySelector('#open-otd').onclick=()=>setView('on-this-day');root.querySelector('#open-month').onclick=()=>{selectedMonth=date.slice(0,7);setView('monthly')};root.querySelector('#open-records').onclick=()=>setView('records');root.querySelectorAll('.otd-item').forEach(x=>x.onclick=()=>openDay(x.dataset.date));
}
async function saveCurrentDay(date,text){saveEntry(state,date,text);persist();clearDraft(date);toast('Day saved locally.');render();if(state.settings.autoCloudSync&&cloud.authenticated){try{const r=await cloudPush(state,cloud.etag);cloud.etag=r.etag||cloud.etag;toast('Cloud sync complete.')}catch(e){toast(`Saved locally; cloud sync failed: ${e.message}`,'bad')}}}
function showVersions(date){const revisions=state.entries?.[date]?.revisions||[];openModal('Version History',revisions.length?revisions.map((r,i)=>`<div class="result-row"><b>${new Date(r.savedAt).toLocaleString()}</b><div class="small muted" style="margin-top:7px">${esc(r.text).slice(0,500)}</div><button class="button" data-restore="${i}" style="margin-top:10px">Restore</button></div>`).join(''):`<div class="muted">No earlier saved versions yet.</div>`,'SAFE HISTORY');modal.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{const r=revisions[Number(b.dataset.restore)];if(r){saveEntry(state,date,r.text);persist();closeModal();render();toast('Earlier version restored.')}})}

function calendarView(){const [y,m]=selectedMonth.split('-').map(Number);const first=new Date(y,m-1,1).getDay();const days=daysInMonth(selectedMonth);const review=monthReview();const cells=[];for(let i=0;i<first;i++)cells.push('<div class="cal-day empty"></div>');for(let d=1;d<=days;d++){const date=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const cls=['cal-day',entryExists(date)?'has-entry':'',date===isoToday()?'today':'',review.bestDay===date?'best':'',review.worstDay===date?'worst':''].join(' ');cells.push(`<button class="${cls}" data-date="${date}"><span class="cal-num">${d}</span><span class="cal-preview">${esc(daySummary(entryText(date)))}</span></button>`)}root.innerHTML=`${pageHead(monthLabel(selectedMonth),'Every day exists automatically. No placeholder dates needed.',`<div class="calendar-toolbar">${button('‹','cal-prev')}${button('Today','cal-today')}${button('›','cal-next')}</div>`)}<section class="card"><div class="calendar"><div class="weekday">SUN</div><div class="weekday">MON</div><div class="weekday">TUE</div><div class="weekday">WED</div><div class="weekday">THU</div><div class="weekday">FRI</div><div class="weekday">SAT</div>${cells.join('')}</div></section>`;root.querySelector('#cal-prev').onclick=()=>changeMonth(-1);root.querySelector('#cal-next').onclick=()=>changeMonth(1);root.querySelector('#cal-today').onclick=()=>{selectedMonth=isoToday().slice(0,7);render()};root.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>openDay(b.dataset.date))}
function changeMonth(delta){let[y,m]=selectedMonth.split('-').map(Number);m+=delta;if(m<1){m=12;y--}if(m>12){m=1;y++}selectedMonth=`${y}-${String(m).padStart(2,'0')}`;selectedYear=y;render()}
function openDay(date){selectedDate=date;selectedMonth=date.slice(0,7);selectedYear=yearOf(date);setView('today')}

function onThisDayRows(date=isoToday()){const md=date.slice(5);return Object.entries(state.entries||{}).filter(([d,e])=>d.slice(5)===md&&e.text?.trim()).sort((a,b)=>b[0].localeCompare(a[0])).map(([d,e])=>({date:d,year:d.slice(0,4),summary:daySummary(e.text),story:buildStory(e.text,{maxEvents:12})}))}
function onThisDayView(){const rows=onThisDayRows();root.innerHTML=`${pageHead('On This Day',`What happened on ${dateLabel(isoToday(),{weekday:false}).replace(/, \d{4}$/,'')} across your T.I.D.E. history.`)}<div class="grid grid-2">${rows.length?rows.map(r=>`<section class="card"><div class="eyebrow">${r.year}</div><h2 style="margin:7px 0">${esc(dateLabel(r.date,{weekday:false}))}</h2><p class="muted small" style="line-height:1.65">${esc(r.story)}</p><button class="button" data-date="${r.date}">Open full day</button></section>`).join(''):`<section class="card"><h2>Your timeline starts here.</h2><p class="muted">Once another year contains this same date, T.I.D.E. will build the comparison automatically.</p></section>`}</div>`;root.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>openDay(b.dataset.date))}

function monthOptions(current){const years=[...new Set([2024,2025,2026,Number(isoToday().slice(0,4)),...Object.keys(state.entries||{}).map(d=>Number(d.slice(0,4)))])].sort();return years.flatMap(y=>MONTHS.map((m,i)=>{const k=`${y}-${String(i+1).padStart(2,'0')}`;return `<option value="${k}" ${k===current?'selected':''}>${m} ${y}</option>`})).join('')}
function activeMonthTrackers(month){return allTrackerDefinitions(state).filter(t=>t.kind==='event'&&(t.status!=='retired'||trackerTotal(state,t.id,{month})>0||legacyTrackerTotal(state,t.id,month)!=null))}
function monthPickDisplay(date,tone){
  const best=tone==="best",kind=best?"Best Day":"Worst Day",chosen=Boolean(date),dayNum=chosen?String(Number(date.slice(-2))):"–";
  const title=chosen?shortDate(date):"Not selected yet";
  const note=chosen&&entryExists(date)?daySummary(entryText(date)):chosen?"No diary entry is saved for this date yet.":"Pick a date and save it to feature your choice here.";
  const month=chosen?MONTHS[Number(date.slice(5,7))-1]?.slice(0,3).toUpperCase():"DAY";
  return `<article class="month-pick-card month-pick--${tone}">
    <div class="month-pick-top"><span class="month-pick-kicker">${best?"✦ YOUR HIGHLIGHT":"◇ YOUR CHOICE"}</span><span class="month-pick-pill">${esc(kind.toUpperCase())}</span></div>
    <div class="month-pick-main"><div class="month-pick-calendar" aria-hidden="true"><span>${esc(month||"DAY")}</span><b>${esc(dayNum)}</b></div>
      <div class="month-pick-content"><div class="month-pick-label">${esc(kind)} of the Month</div><h3>${esc(title)}</h3><p>${esc(note)}</p></div>
    </div>
    <div class="month-pick-bottom"><span>${chosen?"Selected by you, not an algorithm":"Your story, your choice"}</span>${chosen?`<button class="month-open-day" type="button" data-month-day="${esc(date)}">Open this day <span aria-hidden="true">↗</span></button>`:""}</div>
  </article>`;
}

function monthlyView(){
  const month=selectedMonth,review=monthReview(month),{start,end}=monthBounds(month),cached=musicCached(start,end);
  const trackers=activeMonthTrackers(month),activities=activityStats(state,{month}).counts.slice(0,5);
  const days=Object.entries(state.entries||{}).filter(([date,entry])=>date.startsWith(`${month}-`)&&entry?.text?.trim());
  const busiest=days.map(([date,entry])=>({date,events:splitEvents(entry.text).length})).sort((a,b)=>b.events-a.events||a.date.localeCompare(b.date))[0];
  const dc=dailyChallengeStreaks(state),monty=montyRecord(state,{month});
  const topActivity=activities[0],period=monthLabel(month);
  root.innerHTML=`${pageHead("Monthly Review","Your month at a glance: the days you chose, what you played, listened to, and accomplished.",`<select id="month-select" class="select" aria-label="Select review month">${monthOptions(month)}</select>`)}
    <div class="month-review">
      <div class="month-review-hero"><div class="month-review-hero-text"><div class="month-hero-kicker">✦ YOUR MONTHLY HIGHLIGHTS ✦</div><h2>${esc(period)}</h2><p>A month of memories, daily challenges, music and your personal favorites.</p></div><div class="month-hero-art" aria-hidden="true"><span>✧</span><span>✦</span></div></div>
      <div class="section-title">THE DAYS YOU CHOSE</div>
      <div class="month-pick-grid" id="month-pick-grid">${monthPickDisplay(review.bestDay||"","best")}${monthPickDisplay(review.worstDay||"","worst")}</div>
      <details class="month-picks-editor" id="month-picks-editor">
        <summary><span>✎ Edit and save your personal picks</span><span class="month-editor-hint">Best / worst day <span aria-hidden="true">⌄</span></span></summary>
        <div class="month-picks-form">
          <label class="label">Best day<input id="best-day" class="input" type="date" min="${start}" max="${end}" value="${esc(review.bestDay||"")}"></label>
          <label class="label">Worst day<input id="worst-day" class="input" type="date" min="${start}" max="${end}" value="${esc(review.worstDay||"")}"></label>
          <div class="month-pick-save">${button("Save Month Picks","save-review","primary")}</div>
        </div>
      </details>
      <div class="section-title">YOUR MONTH AT A GLANCE</div>
      <div class="month-pulse-grid">
        <div class="month-pulse-card month-pulse--activity"><span class="month-pulse-icon" aria-hidden="true">✦</span><div class="stat-label">Top activity</div><div class="month-pulse-value">${esc(topActivity?.[0]||"No activity yet")}</div><div class="month-pulse-note">${topActivity?`${fmt(topActivity[1])} diary events recognized`:"Your diary will build this automatically"}</div></div>
        <div class="month-pulse-card month-pulse--diary"><span class="month-pulse-icon" aria-hidden="true">▤</span><div class="stat-label">Days with diary entries</div><div class="month-pulse-value">${fmt(days.length)}</div><div class="month-pulse-note">Saved during ${esc(period)}</div></div>
        <div class="month-pulse-card month-pulse--busiest"><span class="month-pulse-icon" aria-hidden="true">↗</span><div class="stat-label">Busiest diary day</div><div class="month-pulse-value">${busiest?esc(shortDate(busiest.date)):"No entries yet"}</div><div class="month-pulse-note">${busiest?`${fmt(busiest.events)} recorded events`:"Add diary entries to see this highlight"}</div></div>
      </div>
      <div id="gaming-month-review"><div class="section-title">GAMING · ${esc(period)}</div><section class="card"><div class="muted small">Loading monthly gaming recap…</div></section></div>
      <div class="section-title">MUSIC · MONTHLY RANKINGS</div>
      <section class="card month-music-section"><div class="card-header"><div><h2>Top songs, artists & albums</h2><div class="small muted">Actual stats.fm streams for ${esc(period)}. Ties are preserved.</div></div>${button("Refresh music","refresh-music")}</div><div id="monthly-music">${cached?renderMusicSections(cached):'<div class="muted small">Loading music…</div>'}</div></section>
      <div class="section-title">DAILY CHALLENGE · MONTHLY SCORECARD</div>
      <section class="card month-challenge-section"><div class="card-header"><div><h2>Your GeoGuessr daily challenge</h2><div class="small muted">Monty results are for this month. Streaks are live, all-time counters.</div></div><span class="chip accent">TRACKED</span></div>
        <div class="month-challenge-grid">
          <div class="month-challenge-stat"><span>Wins vs Monty · ${esc(period)}</span><b>${fmt(monty.wins)}</b><small>Monthly wins</small></div>
          <div class="month-challenge-stat"><span>Losses vs Monty · ${esc(period)}</span><b>${fmt(monty.losses)}</b><small>Monthly losses</small></div>
          <div class="month-challenge-stat"><span>Current DC streak</span><b>${fmt(dc.active?dc.current:0)}</b><small>Live streak · days</small></div>
          <div class="month-challenge-stat"><span>Longest DC streak</span><b>${fmt(dc.longest)}</b><small>All-time best · days</small></div>
        </div>
      </section>
      <div class="section-title">TOP ACTIVITIES · ${esc(period.toUpperCase())}</div>
      <section class="card month-activities-section">${activities.length?activities.map(([a,n],i)=>`<div class="month-activity-row"><span class="month-activity-rank">${String(i+1).padStart(2,"0")}</span><div class="month-activity-info"><b>${esc(a)}</b><div class="month-activity-bar"><div style="width:${Math.max(4,Math.round(n/activities[0][1]*100))}%"></div></div></div><span class="month-activity-count">${fmt(n)}</span></div>`).join(""):'<div class="muted small">Once diary entries are saved for this month, the most common activities will appear here.</div>'}</section>
      <div class="section-title">MONTHLY TRACKERS</div>
      <div class="month-trackers-grid">${trackers.length?trackers.map(t=>{const v=trackerTotal(state,t.id,{month});return`<div class="month-tracker-card"><div class="stat-label">${esc(t.name)}</div><div class="month-tracker-value">${fmt(v)}</div><div class="month-tracker-detail">${legacyTrackerTotal(state,t.id,month)!=null?"Includes your imported monthly total.":"Dated occurrences"}</div></div>`}).join(""):'<div class="card muted small">No tracked events have been recorded for this month.</div>'}</div>
    </div>`;
  root.querySelector("#month-select").onchange=e=>{selectedMonth=e.target.value;selectedYear=Number(selectedMonth.slice(0,4));render()};
  root.querySelector("#save-review").onclick=()=>{
    const bestDay=root.querySelector("#best-day").value,worstDay=root.querySelector("#worst-day").value;
    saveMonthlyReview(state,month,{bestDay,worstDay});
    persist();toast("Monthly best and worst days saved.");
    const saved=monthReview(month);
    root.querySelector("#month-pick-grid").innerHTML=monthPickDisplay(saved.bestDay||"","best")+monthPickDisplay(saved.worstDay||"","worst");
    root.querySelectorAll("[data-month-day]").forEach(b=>b.onclick=()=>openDay(b.dataset.monthDay));
    root.querySelector("#month-picks-editor").open=false;
  };
  root.querySelectorAll("[data-month-day]").forEach(b=>b.onclick=()=>openDay(b.dataset.monthDay));
  root.querySelector("#refresh-music").onclick=()=>loadMusicFor(start,end,true,"#monthly-music");
  if(!cached)loadMusicFor(start,end,false,"#monthly-music");
}

// Inline award vectors ensure icons display even when a static host omits /awards assets.
const YEAR_AWARD_VECTORS={
  "/awards/best-day.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" role=\"img\" aria-label=\"Best day award\">\n<defs><linearGradient id=\"year-best-day-bg\" x1=\"0\" x2=\"1\" y1=\"1\" y2=\"0\"><stop stop-color=\"#2e2259\"/><stop offset=\"1\" stop-color=\"#6c3058\"/></linearGradient><linearGradient id=\"year-best-day-gold\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop stop-color=\"#fff8db\"/><stop offset=\".43\" stop-color=\"#ffd99a\"/><stop offset=\"1\" stop-color=\"#fc9f7c\"/></linearGradient><radialGradient id=\"year-best-day-halo\"><stop stop-color=\"#ffda9a\" stop-opacity=\".34\"/><stop offset=\"1\" stop-color=\"#ffda9a\" stop-opacity=\"0\"/></radialGradient></defs>\n<rect width=\"256\" height=\"256\" rx=\"43\" fill=\"url(#year-best-day-bg)\"/><circle cx=\"128\" cy=\"121\" r=\"105\" fill=\"url(#year-best-day-halo)\"/>\n<circle cx=\"128\" cy=\"119\" r=\"84\" fill=\"none\" stroke=\"#ffd6b0\" stroke-opacity=\".28\" stroke-width=\"2\"/><circle cx=\"128\" cy=\"119\" r=\"69\" fill=\"#291c4c\" fill-opacity=\".46\" stroke=\"url(#year-best-day-gold)\" stroke-width=\"5\"/>\n<g fill=\"none\" stroke=\"url(#year-best-day-gold)\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".94\"><path d=\"M63 168c-20-19-27-47-18-71\"/><path d=\"M193 168c20-19 27-47 18-71\"/><path d=\"M60 150c-13-2-21-10-25-20M52 128c-11-7-16-17-15-29M56 104c-7-12-7-22-2-32M196 150c13-2 21-10 25-20M204 128c11-7 16-17 15-29M200 104c7-12 7-22 2-32\"/></g>\n<path d=\"m128 69 15.7 31.8 35.1 5.1-25.4 24.7 6 35-31.4-16.5-31.4 16.5 6-35-25.4-24.7 35.1-5.1Z\" fill=\"url(#year-best-day-gold)\" stroke=\"#fff2d0\" stroke-width=\"3\" stroke-linejoin=\"round\"/>\n<g fill=\"#ffe3c0\"><circle cx=\"49\" cy=\"60\" r=\"3\"/><circle cx=\"210\" cy=\"59\" r=\"3\"/><circle cx=\"211\" cy=\"188\" r=\"2.5\"/><circle cx=\"40\" cy=\"194\" r=\"2\"/></g>\n<path d=\"M99 189h58\" stroke=\"#ffd7bd\" stroke-opacity=\".76\" stroke-width=\"3\" stroke-linecap=\"round\"/></svg>",
  "/awards/best-month.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" role=\"img\" aria-label=\"Best month calendar\">\n<defs><linearGradient id=\"year-best-month-bg\" x1=\"0\" y1=\"1\" x2=\"1\" y2=\"0\"><stop stop-color=\"#38225d\"/><stop offset=\"1\" stop-color=\"#603273\"/></linearGradient><linearGradient id=\"year-best-month-glass\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#fdf5ff\"/><stop offset=\"1\" stop-color=\"#dabcfb\"/></linearGradient><linearGradient id=\"year-best-month-header\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#f692db\"/><stop offset=\"1\" stop-color=\"#ad9aff\"/></linearGradient></defs>\n<rect width=\"256\" height=\"256\" rx=\"43\" fill=\"url(#year-best-month-bg)\"/><circle cx=\"209\" cy=\"41\" r=\"83\" fill=\"#f0a4ff\" fill-opacity=\".09\"/><circle cx=\"45\" cy=\"206\" r=\"75\" fill=\"#8ce0fc\" fill-opacity=\".07\"/>\n<rect x=\"48\" y=\"47\" width=\"160\" height=\"163\" rx=\"19\" fill=\"#140d37\" fill-opacity=\".27\" transform=\"translate(0 6)\"/><rect x=\"48\" y=\"47\" width=\"160\" height=\"163\" rx=\"19\" fill=\"url(#year-best-month-glass)\"/>\n<path d=\"M48 66q0-19 19-19h122q19 0 19 19v31H48Z\" fill=\"url(#year-best-month-header)\"/><g stroke=\"#fbddff\" stroke-width=\"9\" stroke-linecap=\"round\"><path d=\"M90 37v27M166 37v27\"/></g>\n<g fill=\"#805b9c\" fill-opacity=\".44\"><rect x=\"67\" y=\"111\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"99\" y=\"111\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"131\" y=\"111\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"163\" y=\"111\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"67\" y=\"140\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"99\" y=\"140\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"131\" y=\"140\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"163\" y=\"140\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"67\" y=\"169\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"99\" y=\"169\" width=\"23\" height=\"19\" rx=\"5\"/><rect x=\"163\" y=\"169\" width=\"23\" height=\"19\" rx=\"5\"/></g>\n<rect x=\"128\" y=\"164\" width=\"31\" height=\"30\" rx=\"8\" fill=\"#c65bcd\"/><path d=\"m144 168 3.5 7.3 8 1.1-5.8 5.6 1.4 7.9-7.1-3.7-7.1 3.7 1.4-7.9-5.8-5.6 8-1.1Z\" fill=\"#fff3ff\"/>\n<rect x=\"48\" y=\"47\" width=\"160\" height=\"163\" rx=\"19\" fill=\"none\" stroke=\"#fce9ff\" stroke-opacity=\".7\" stroke-width=\"3\"/></svg>",
  "/awards/gaming-controller.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" role=\"img\" aria-label=\"Gaming controller\">\n<defs><linearGradient id=\"year-gaming-controller-bg\" x1=\"0\" y1=\"1\" x2=\"1\" y2=\"0\"><stop stop-color=\"#133f59\"/><stop offset=\"1\" stop-color=\"#3d2863\"/></linearGradient><linearGradient id=\"year-gaming-controller-pad\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#fdfaff\"/><stop offset=\".51\" stop-color=\"#c6e7f8\"/><stop offset=\"1\" stop-color=\"#a995e4\"/></linearGradient><linearGradient id=\"year-gaming-controller-shine\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop stop-color=\"#8cf9e3\"/><stop offset=\"1\" stop-color=\"#ff9bdc\"/></linearGradient></defs>\n<rect width=\"256\" height=\"256\" rx=\"43\" fill=\"url(#year-gaming-controller-bg)\"/><circle cx=\"212\" cy=\"45\" r=\"80\" fill=\"#ff83d3\" opacity=\".10\"/><circle cx=\"46\" cy=\"198\" r=\"88\" fill=\"#74dffe\" opacity=\".10\"/>\n<path d=\"M68 94c18-12 102-12 120 0 20 14 32 59 29 83-2 16-15 25-29 19-10-4-21-19-35-28h-50c-14 9-25 24-35 28-14 6-27-3-29-19-3-24 9-69 29-83Z\" fill=\"#112d4e\" opacity=\".35\" transform=\"translate(0 8)\"/>\n<path d=\"M68 94c18-12 102-12 120 0 20 14 32 59 29 83-2 16-15 25-29 19-10-4-21-19-35-28h-50c-14 9-25 24-35 28-14 6-27-3-29-19-3-24 9-69 29-83Z\" fill=\"url(#year-gaming-controller-pad)\" stroke=\"#f9fdff\" stroke-width=\"3.5\"/>\n<path d=\"M73 99c27-9 83-9 110 0\" stroke=\"url(#year-gaming-controller-shine)\" stroke-width=\"7\" stroke-linecap=\"round\" opacity=\".85\"/>\n<g fill=\"#394673\"><rect x=\"73\" y=\"120\" width=\"14\" height=\"45\" rx=\"4\"/><rect x=\"58\" y=\"135\" width=\"44\" height=\"15\" rx=\"4\"/></g>\n<circle cx=\"119\" cy=\"153\" r=\"13\" fill=\"#37446c\" stroke=\"#8cc9f4\" stroke-width=\"4\"/><circle cx=\"151\" cy=\"153\" r=\"13\" fill=\"#37446c\" stroke=\"#8cc9f4\" stroke-width=\"4\"/>\n<g><circle cx=\"180\" cy=\"119\" r=\"9\" fill=\"#ff8bc9\"/><circle cx=\"198\" cy=\"137\" r=\"9\" fill=\"#74d9ff\"/><circle cx=\"162\" cy=\"137\" r=\"9\" fill=\"#9e8cff\"/><circle cx=\"180\" cy=\"155\" r=\"9\" fill=\"#86efd1\"/></g><path d=\"M118 111h18\" stroke=\"#786f9f\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n<path d=\"m40 70 4 8 9 2-9 3-4 8-4-8-9-3 9-2Zm170 12 3 7 7 2-7 2-3 7-3-7-7-2 7-2Z\" fill=\"#a3f3ec\"/></svg>",
  "/awards/activity-trophy.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" role=\"img\" aria-label=\"Top activity trophy\">\n<defs><linearGradient id=\"year-activity-trophy-bg\" x1=\"0\" y1=\"1\" x2=\"1\" y2=\"0\"><stop stop-color=\"#154256\"/><stop offset=\"1\" stop-color=\"#2a4167\"/></linearGradient><linearGradient id=\"year-activity-trophy-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#c8fff1\"/><stop offset=\".6\" stop-color=\"#75d8ed\"/><stop offset=\"1\" stop-color=\"#a4a5ff\"/></linearGradient></defs>\n<rect width=\"256\" height=\"256\" rx=\"43\" fill=\"url(#year-activity-trophy-bg)\"/><circle cx=\"127\" cy=\"112\" r=\"95\" fill=\"#7fe4ef\" fill-opacity=\".07\"/>\n<path d=\"M84 68h88v58c0 31-20 51-44 51s-44-20-44-51Z\" fill=\"url(#year-activity-trophy-metal)\" stroke=\"#e9fffe\" stroke-width=\"3\"/><path d=\"M84 84H57v22c0 26 17 42 41 41M172 84h27v22c0 26-17 42-41 41\" fill=\"none\" stroke=\"#9deaf3\" stroke-width=\"11\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>\n<path d=\"m128 89 11 22 24 3-17.5 17.5 4.5 25-22-12-22 12 4.5-25L93 114l24-3Z\" fill=\"#1d5674\" opacity=\".72\"/>\n<path d=\"M128 177v19m-29 12h58\" stroke=\"#b5f6fa\" stroke-width=\"11\" stroke-linecap=\"round\"/><path d=\"M83 219h90\" stroke=\"#a5b4fd\" stroke-width=\"10\" stroke-linecap=\"round\"/><circle cx=\"208\" cy=\"58\" r=\"4\" fill=\"#95f9ef\"/><circle cx=\"45\" cy=\"185\" r=\"4\" fill=\"#f9b3df\"/></svg>"
};

function yearAwardCard(theme,label,name,details,image,glyph,footnote=""){
  const vector=YEAR_AWARD_VECTORS[image];
  const picture=vector?`<div class="year-award-glyph year-award-vector">${vector}</div>`:/^(https?:\/\/|\/awards\/crew-motorfest\.jpg$)/i.test(String(image||""))?`<img class="year-award-image" src="${esc(image)}" alt="${esc(label)} artwork" loading="lazy" referrerpolicy="no-referrer">`:`<div class="year-award-glyph" aria-hidden="true">${esc(glyph)}</div>`;
  return `<article class="year-award year-award--${theme}"><div class="year-award-top"><span class="year-award-category">${esc(label)}</span><span class="year-award-sparkle" aria-hidden="true">✦</span></div><div class="year-award-center">${picture}<div class="year-award-copy"><div class="year-award-winner">${esc(name)}</div><div class="year-award-detail">${esc(details)}</div></div></div>${footnote?`<div class="year-award-foot">${esc(footnote)}</div>`:""}</article>`;
}

function yearAwardMarkup(y,music,failed=false){
  const review=state.yearlyReviews?.[y]||{};
  const bestDay=review.bestDay||"";
  const bestMonth=Number(review.bestMonth)||0;
  const topActivity=activityStats(state,{year:y}).counts[0];
  const gameData=activityRange(`${y}-01-01`,`${y}-12-31`,"all");
  const game=gameData.games.filter(g=>Number(g.minutes)>0).sort((a,b)=>b.minutes-a.minutes||a.title.localeCompare(b.title))[0];
  const gamePartial=!gameData.coverageStart||`${y}-01-01`<gameData.coverageStart;
  const song=music?.songs?.[0],artist=music?.artists?.[0];
  const musicStatus=failed?"Could not load; refresh below.":"Loading year-end rankings…";
  const gameHours=game?`${Math.floor(game.minutes/60).toLocaleString("en-US")}h ${Math.round(game.minutes%60)}m recorded`:"Waiting for dated gaming data";
  return `<div class="year-awards-grid">
    ${yearAwardCard("day","Best day of the year",bestDay?shortDate(bestDay):"Awaiting your pick",bestDay&&entryExists(bestDay)?daySummary(entryText(bestDay)):"Your personal highlight of the year","/awards/best-day.svg","✷","Chosen by you")}
    ${yearAwardCard("month","Best month of the year",bestMonth>=1&&bestMonth<=12?MONTHS[bestMonth-1]:"Awaiting your pick",bestMonth>=1&&bestMonth<=12?`${y} · Your favorite chapter`:"Choose your best month below","/awards/best-month.svg","✦","Chosen by you")}
    ${yearAwardCard("activity","Top activity",topActivity?.[0]||"No activity yet",topActivity?`${fmt(topActivity[1])} recognized events`:"Save diary entries to build rankings",topActivity?.[0]==="Gaming"?"/awards/gaming-controller.svg":"/awards/activity-trophy.svg","◇","From your diary")}
    ${yearAwardCard("song","Song of the year",song?.name||(failed?"Music unavailable":musicStatus),song?`${song.artist||"Artist unavailable"} · ${fmt(song.streams)} streams`:musicStatus,song?.image,"♫","stats.fm · actual streams")}
    ${yearAwardCard("artist","Artist of the year",artist?.name||(failed?"Music unavailable":musicStatus),artist?`${fmt(artist.streams)} streams`:musicStatus,artist?.image,"♬","stats.fm · actual streams")}
    ${yearAwardCard("game","Video game of the year",game?.title||"No yearly leader yet",gameHours,game?.title?.trim().toLowerCase()==="the crew motorfest"?"/awards/crew-motorfest.jpg":game?.image,"🎮",gamePartial?"Known playtime · partial coverage":"Most played · yearly hours")}
  </div>`;
}

function yearPersonalPick(label,value,note,tone){
  return `<div class="year-personal-pick year-personal-pick--${tone}"><div class="year-personal-label">${esc(label)}</div><div class="year-personal-value">${esc(value||"Not selected")}</div><div class="year-personal-note">${esc(note)}</div></div>`;
}

async function loadYearMusic(start,end,force,y){
  const list=root.querySelector("#year-music");
  if(!list)return;
  if(force)list.innerHTML='<div class="muted small">Refreshing stats.fm rankings…</div>';
  try{
    const data=await fetchPeriodMusic(start,end,state,{force});
    persist();
    if(view!=="yearly"||selectedYear!==y)return;
    const awards=root.querySelector("#year-awards");
    const rankings=root.querySelector("#year-music");
    if(awards)awards.innerHTML=yearAwardMarkup(y,data);
    if(rankings)rankings.innerHTML=renderMusicSections(data);
  }catch(e){
    if(view!=="yearly"||selectedYear!==y)return;
    const awards=root.querySelector("#year-awards"),rankings=root.querySelector("#year-music");
    if(awards&&!musicCached(start,end))awards.innerHTML=yearAwardMarkup(y,null,true);
    if(rankings)rankings.innerHTML=`<div class="callout danger-callout">Could not load stats.fm data: ${esc(e.message)}</div>`;
  }
}

function yearlyView(){
  const y=selectedYear;
  const review=state.yearlyReviews?.[y]||{};
  const start=`${y}-01-01`,end=`${y}-12-31`;
  const cached=musicCached(start,end);
  const dc=dailyChallengeStreaks(state),geo=geoguessr10kRecord(state);
  const acts=activityStats(state,{year:y}).counts.slice(0,5);
  const bestDay=review.bestDay||"",worstDay=review.worstDay||"";
  const bestMonth=Number(review.bestMonth)||0,worstMonth=Number(review.worstMonth)||0;
  const dateChoice=(d)=>d?shortDate(d):"Not selected";
  const monthChoice=(m)=>m>=1&&m<=12?`${MONTHS[m-1]} ${y}`:"Not selected";
  const dayNote=(d)=>d&&entryExists(d)?daySummary(entryText(d)):"You choose this. Your pick remains yours, not an algorithm.";
  const monthNote=(m)=>m>=1&&m<=12?`A chapter of ${y}, selected by you.`:"Choose a month to complete your year.";
  root.innerHTML=`${pageHead(`${y} · Year in Review`,"The year's standout moments, music, gaming, and memories, presented like a personal awards night.",`<select id="year-select" class="select" aria-label="Select year">${[2024,2025,2026,...Object.keys(state.entries||{}).map(d=>yearOf(d))].filter((x,i,a)=>a.indexOf(x)===i).sort().map(x=>`<option ${x===y?"selected":""}>${x}</option>`).join("")}</select>`)}
    <div class="year-awards-intro"><div><div class="year-awards-eyebrow">✦ THE ${y} HONORS ✦</div><h2>The highlights that defined your year</h2><p>Six headline awards, selected from your saved picks and real activity.</p></div><span class="year-awards-trophy" aria-hidden="true">✧</span></div>
    <div id="year-awards">${yearAwardMarkup(y,cached)}</div>
    <div class="section-title">THE YEAR'S PERSONAL PICKS</div>
    <div class="year-personal-grid">
      ${yearPersonalPick("Best day",dateChoice(bestDay),dayNote(bestDay),"best")}
      ${yearPersonalPick("Worst day",dateChoice(worstDay),dayNote(worstDay),"worst")}
      ${yearPersonalPick("Best month",monthChoice(bestMonth),monthNote(bestMonth),"best")}
      ${yearPersonalPick("Worst month",monthChoice(worstMonth),monthNote(worstMonth),"worst")}
    </div>
    <details class="year-picks-editor"><summary><span>✎ Edit and save your personal picks</span><span class="year-editor-hint">Best / worst days and months <span aria-hidden="true">⌄</span></span></summary>
      <div class="year-picks-form"><label class="label">Best day<input id="year-best-day" type="date" class="input" min="${start}" max="${end}" value="${esc(bestDay)}"></label>
      <label class="label">Worst day<input id="year-worst-day" type="date" class="input" min="${start}" max="${end}" value="${esc(worstDay)}"></label>
      <label class="label">Best month<select id="year-best-month" class="select"><option value="">—</option>${MONTHS.map((m,i)=>`<option value="${i+1}" ${bestMonth===i+1?"selected":""}>${m}</option>`).join("")}</select></label>
      <label class="label">Worst month<select id="year-worst-month" class="select"><option value="">—</option>${MONTHS.map((m,i)=>`<option value="${i+1}" ${worstMonth===i+1?"selected":""}>${m}</option>`).join("")}</select></label>
      <div class="year-picks-save">${button("Save Year Picks","save-year","primary")}</div></div>
    </details>
    <div class="section-title">YEARLY QUICK STATS</div>
    <div class="year-side-stats"><div class="year-side-stat"><div class="stat-label">Migraines · ${y}</div><b>${fmt(trackerTotal(state,"migraines",{year:y}))}</b></div><div class="year-side-stat"><div class="stat-label">Hong Kong Spawns · ${y}</div><b>${fmt(trackerTotal(state,"hong-kong",{year:y}))}</b></div></div>
    <div class="section-title">GEOGUESSR · RECORD BOOK</div>
    <div class="records-grid year-geo-records">
      <div class="record-card"><div class="stat-label">All-Time Hong Kong Spawns</div><div class="record-value">${fmt(trackerTotal(state,"hong-kong"))}</div></div>
      <div class="record-card"><div class="stat-label">Longest Daily Challenge Streak</div><div class="record-value">${dc.longest} days</div><div class="record-detail">${dc.longestStart?`${shortDate(dc.longestStart)} → ${shortDate(dc.longestEnd)}`:"No streak data yet."}</div></div>
      <div class="record-card"><div class="stat-label">Current Daily Challenge</div><div class="record-value">${dc.active?dc.current:0}</div><div class="record-detail">${dc.active?"Active":"Inactive"}</div></div>
      <div class="record-card"><div class="stat-label">Geoguessr 10K Record</div><div class="record-value">${geo?fmt(geo.value):"—"}</div><div class="record-detail">${geo?shortDate(geo.date):"No data yet."}</div></div>
    </div>
    <div class="section-title">TOP FIVE ACTIVITIES</div>
    <section class="card year-detail-list">${acts.length?acts.map(([a,n],i)=>`<div class="detected-item"><span><span class="year-rank-num">${String(i+1).padStart(2,"0")}</span> ${esc(a)}</span><b>${fmt(n)}</b></div>`).join(""):'<div class="muted">Import or save diary days to build activity stats.</div>'}</section>
    <div class="section-title">YOUR YEAR IN MUSIC</div>
    <section class="card year-music-detail"><div class="card-header"><div><h2>Top Songs, Artists & Albums</h2><div class="small muted">Real stats.fm streams and original artwork. Your award winners appear above.</div></div>${button("Refresh music","refresh-year-music")}</div><div id="year-music">${cached?renderMusicSections(cached):'<div class="muted small">Loading music…</div>'}</div></section>`;
  root.querySelector("#year-select").onchange=e=>{selectedYear=Number(e.target.value);render()};
  root.querySelector("#save-year").onclick=()=>{
    saveYearlyReview(state,y,{bestDay:root.querySelector("#year-best-day").value,worstDay:root.querySelector("#year-worst-day").value,bestMonth:root.querySelector("#year-best-month").value,worstMonth:root.querySelector("#year-worst-month").value});
    persist();toast("Year picks saved.");
    const updated=state.yearlyReviews?.[y]||{};
    const bd=updated.bestDay||"",wd=updated.worstDay||"";
    const bm=Number(updated.bestMonth)||0,wm=Number(updated.worstMonth)||0;
    const personal=root.querySelector(".year-personal-grid");
    if(personal)personal.innerHTML=[
      yearPersonalPick("Best day",dateChoice(bd),dayNote(bd),"best"),
      yearPersonalPick("Worst day",dateChoice(wd),dayNote(wd),"worst"),
      yearPersonalPick("Best month",monthChoice(bm),monthNote(bm),"best"),
      yearPersonalPick("Worst month",monthChoice(wm),monthNote(wm),"worst")
    ].join("");
    const awards=root.querySelector("#year-awards");
    if(awards)awards.innerHTML=yearAwardMarkup(y,musicCached(start,end));
    root.querySelector(".year-picks-editor").open=false;
  };
  root.querySelector("#refresh-year-music").onclick=()=>loadYearMusic(start,end,true,y);
  if(!cached)loadYearMusic(start,end,false,y);
}

function trackersView(){const defs=allTrackerDefinitions(state);root.innerHTML=`${pageHead('Trackers','Retired trackers stay historical. Intermittent events only count when they happen. Lifetime records keep every dated occurrence.')}<section class="card"><div class="tracker-table">${defs.map(t=>{const month=trackerTotal(state,t.id,{month:selectedMonth}),year=trackerTotal(state,t.id,{year:selectedYear}),all=trackerTotal(state,t.id);return `<div class="tracker-row"><div class="tracker-name"><b>${esc(t.name)}</b><span class="tracker-status">${esc(t.status)} · ${esc(t.kind)}</span></div><div><div class="stat-label">Month</div><b>${fmt(month)}</b></div><div><div class="stat-label">${selectedYear}</div><b>${fmt(year)}</b></div><div><div class="stat-label">All Time</div><b>${fmt(all)}</b></div><button class="button" data-tracker="${t.id}">View / Add</button></div>`}).join('')}</div></section>`;root.querySelectorAll('[data-tracker]').forEach(b=>b.onclick=()=>showTracker(b.dataset.tracker))}
function showTracker(id){const t=trackerDefinition(state,id);const rows=occurrencesFor(state,id).slice().reverse();const gtaEnded=['mors-mutual','google-car'].includes(id);openModal(t.name,`<div class="grid grid-3"><div class="record-card"><div class="stat-label">This Month</div><div class="record-value">${trackerTotal(state,id,{month:selectedMonth})}</div></div><div class="record-card"><div class="stat-label">${selectedYear}</div><div class="record-value">${trackerTotal(state,id,{year:selectedYear})}</div></div><div class="record-card"><div class="stat-label">All Time</div><div class="record-value">${trackerTotal(state,id)}</div></div></div><div class="section-title">MANUAL OCCURRENCE</div><div class="grid grid-3"><label class="label">Date<input id="manual-date" class="input" type="date" value="${gtaEnded&&isoToday()>='2026-11-19'?'2026-11-18':isoToday()}" ${gtaEnded?'max="2026-11-18"':''}></label><label class="label">Count<input id="manual-count" class="input" type="number" min="0" value="1"></label><label class="label">Note<input id="manual-note" class="input" value="Manual ${esc(t.name)}"></label></div><button class="button primary" id="manual-add" style="margin-top:12px">Add occurrence</button><div class="section-title">DATED HISTORY</div><div class="history-list">${rows.length?rows.slice(0,100).map(r=>`<div class="history-row"><div class="history-date">${shortDate(r.date)}</div><div class="history-text">${esc(r.snippet||'Occurrence')}</div><b>${r.value!=null?fmt(r.value):r.result?esc(r.result):`+${r.count}`}</b></div>`).join(''):'<div class="muted">No dated occurrences yet.</div>'}</div>`,'TRACKER');modal.querySelector('#manual-add').onclick=()=>{if(gtaEnded&&modal.querySelector('#manual-date').value>='2026-11-19'){toast('This GTA Online tracker retired on November 19. Historical dates remain editable.','bad');return;}addManualOccurrence(state,{trackerId:id,date:modal.querySelector('#manual-date').value,count:modal.querySelector('#manual-count').value,snippet:modal.querySelector('#manual-note').value});persist();closeModal();render();toast('Tracker occurrence added.')}}

function musicCached(start,end){for(const category of ['songs','artists','albums'])if(!state.musicCache?.[`${category}:${start}:${end}`])return null;return Object.fromEntries(['songs','artists','albums'].map(c=>[c,state.musicCache[`${c}:${start}:${end}`].items]))}
function renderMusicList(items){return `<div class="music-grid">${items?.length?items.map(x=>`<div class="music-item"><div class="music-rank">${x.rank===5&&items.filter(y=>y.rank===5).length>1?'T-':''}${x.rank}</div>${x.image?`<img class="music-cover" src="${esc(x.image)}" alt="">`:'<div class="music-cover"></div>'}<div><div class="music-title">${esc(x.name)}</div><div class="music-meta">${esc(x.artist||x.album||'')}</div></div><div class="music-count">${fmt(x.streams)}<div class="tiny subtle">STREAMS</div></div></div>`).join(''):'<div class="muted small">No listening data returned.</div>'}</div>`}
function renderMusicSections(data){return `<div class="grid grid-3"><div><div class="section-title" style="margin-top:0">SONGS</div>${renderMusicList(data.songs)}</div><div><div class="section-title" style="margin-top:0">ARTISTS</div>${renderMusicList(data.artists)}</div><div><div class="section-title" style="margin-top:0">ALBUMS</div>${renderMusicList(data.albums)}</div></div>`}
async function loadMusicFor(start,end,force,target){const el=root.querySelector(target);if(!el)return;el.innerHTML='<div class="muted small">Loading from stats.fm…</div>';try{const data=await fetchPeriodMusic(start,end,state,{force});persist();if(root.querySelector(target))root.querySelector(target).innerHTML=renderMusicSections(data)}catch(e){if(root.querySelector(target))root.querySelector(target).innerHTML=`<div class="callout danger-callout">Could not load stats.fm data: ${esc(e.message)}</div>`}}
function musicExplorerRange(){
  const today=isoToday(),first="2020-11-01";
  if(musicPeriod==="all")return{start:first,end:today,label:"All Time",note:`November 1, 2020 – ${shortDate(today)}`};
  if(musicPeriod==="year"){
    if(!Number.isInteger(musicYear)||musicYear<2020||musicYear>Number(today.slice(0,4)))return{error:"Choose a valid year."};
    const start=musicYear===2020?first:`${musicYear}-01-01`,end=String(musicYear)===today.slice(0,4)?today:`${musicYear}-12-31`;
    return{start,end,label:`${musicYear}`,note:musicYear===2020?"November 1 – December 31, 2020":`${shortDate(start)} – ${shortDate(end)}`};
  }
  if(musicPeriod==="custom"){
    const start=musicCustomStart,end=musicCustomEnd,date=/^\d{4}-\d{2}-\d{2}$/;
    if(!date.test(start)||!date.test(end)||Number.isNaN(Date.parse(start))||Number.isNaN(Date.parse(end)))return{error:"Choose a valid start and end date."};
    if(start>end)return{error:"The start date must be before or equal to the end date."};
    if(start<first||end>today)return{error:`Choose dates between November 1, 2020 and ${shortDate(today)}.`};
    return{start,end,label:"Custom Range",note:`${shortDate(start)} – ${shortDate(end)}`};
  }
  const parts=musicMonth.split("-");
  if(parts.length!==2||!monthOptions(musicMonth))return{error:"Choose a valid month."};
  const {start,end}=monthBounds(musicMonth);
  if(start>today||start<first)return{error:"Choose a month between November 2020 and today."};
  return{start,end:end>today?today:end,label:monthLabel(musicMonth),note:`${shortDate(start)} – ${shortDate(end>today?today:end)}`};
}

function musicExplorerFresh(start,end){
  return["songs","artists","albums"].every(category=>{
    const rec=state.musicCache?.[`${category}:${start}:${end}`];
    return rec?.items&&rec?.fetchedAt&&Number.isFinite(new Date(rec.fetchedAt).getTime())&&Date.now()-new Date(rec.fetchedAt).getTime()<6*60*60*1000;
  });
}

function musicExplorerArtwork(item,category,extra=""){
  const src=item?.image;
  return /^https?:\/\//i.test(String(src||""))?`<img class="music-explorer-art ${extra} ${category==="artists"?"music-explorer-artist-art":""}" src="${esc(src)}" alt="Artwork for ${esc(item.name)}" loading="lazy" decoding="async">`:`<div class="music-explorer-art music-explorer-art-fallback ${extra}" aria-hidden="true">${category==="artists"?"◉":category==="albums"?"▣":"♫"}</div>`;
}

function musicExplorerCard(item,category){
  return `<article class="music-explorer-runner"><span class="music-explorer-runner-rank">#${fmt(item.rank)}</span>${musicExplorerArtwork(item,category,"music-explorer-runner-image")}<div class="music-explorer-runner-info"><div class="music-explorer-runner-title">${esc(item.name)}</div><div class="music-explorer-runner-sub">${esc(item.artist||item.album||(category==="artists"?"Artist":""))}</div></div><div class="music-explorer-runner-streams">${fmt(item.streams)}<span>STREAMS</span></div></article>`;
}

function musicExplorerContent(data){
  const choices=[["songs","Songs","♫"],["artists","Artists","◉"],["albums","Albums","▣"]];
  const entries=data?.[musicCategory]||[],winner=entries[0],remaining=entries.slice(1);
  const categoryLabel=musicCategory==="songs"?"Song":musicCategory==="artists"?"Artist":"Album";
  const overview=choices.map(([id,label,symbol])=>{
    const top=data?.[id]?.[0];
    return `<button type="button" class="music-explorer-category ${id===musicCategory?"is-selected":""}" data-music-category="${id}" aria-pressed="${id===musicCategory}">
      <span class="music-explorer-category-overline"><span aria-hidden="true">${symbol}</span> ${label.toUpperCase()}</span>
      <span class="music-explorer-category-art">${top?musicExplorerArtwork(top,id):`<span class="music-explorer-empty-icon" aria-hidden="true">${symbol}</span>`}</span>
      <span class="music-explorer-category-copy"><strong>${esc(top?.name||"No results yet")}</strong><small>${top?`${fmt(top.streams)} streams`:"Select to explore"}</small></span>
    </button>`;
  }).join("");
  return `<div class="music-explorer-category-grid">${overview}</div>
    <div class="music-explorer-list-header"><div><div class="music-explorer-section-eyebrow">THE LEADERBOARD</div><h2>Top ${musicCategory}</h2><p>Ranked by actual plays, with tied ranks preserved.</p></div><span class="music-explorer-top-tag">TOP 5 + TIES</span></div>
    ${winner?`<section class="music-explorer-winner music-explorer-winner--${musicCategory}">
      <div class="music-explorer-winner-rank"><span>YOUR #1 ${categoryLabel.toUpperCase()}</span><span aria-hidden="true">✦</span></div>
      <div class="music-explorer-winner-layout">${musicExplorerArtwork(winner,musicCategory,"music-explorer-winner-art")}
        <div class="music-explorer-winner-body"><span class="music-explorer-winner-number">#${fmt(winner.rank)} · ${esc(categoryLabel)} of the period</span>
          <h3>${esc(winner.name)}</h3>
          ${winner.artist||winner.album?`<p>${esc(winner.artist||winner.album)}</p>`:""}
          <div class="music-explorer-winner-count"><b>${fmt(winner.streams)}</b><span>ACTUAL STREAMS</span></div>
        </div>
      </div>
    </section>
    ${remaining.length?`<div class="music-explorer-runners">${remaining.map(item=>musicExplorerCard(item,musicCategory)).join("")}</div>`:""}`:`<section class="music-explorer-empty"><span aria-hidden="true">♫</span><h3>No ${musicCategory} returned</h3><p>There are no recorded streams for this category during the selected period.</p></section>`}`;
}

function musicExplorerRenderData(data){
  const container=root.querySelector("#music-explorer-content");
  if(!container)return;
  container.innerHTML=musicExplorerContent(data);
  container.querySelectorAll("[data-music-category]").forEach(el=>el.onclick=()=>{
    musicCategory=el.dataset.musicCategory;
    musicExplorerRenderData(data);
  });
}

async function musicExplorerLoad(start,end,force=false){
  const id=++musicRequestId;
  const status=root.querySelector("#music-explorer-status"),refresh=root.querySelector("#music-explorer-refresh");
  const previous=musicCached(start,end);
  if(refresh){refresh.disabled=true;refresh.textContent=force?"Refreshing…":"Loading…";}
  if(status)status.textContent=force?"Refreshing listening data…":"Getting real stream counts from stats.fm…";
  try{
    const data=await fetchPeriodMusic(start,end,state,{force});
    persist();
    if(id!==musicRequestId||view!=="music")return;
    musicExplorerRenderData(data);
    const note=root.querySelector("#music-explorer-status");
    if(note)note.textContent=`Updated ${new Date().toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} · Powered by stats.fm`;
  }catch(error){
    if(id!==musicRequestId||view!=="music")return;
    const note=root.querySelector("#music-explorer-status");
    if(note)note.textContent="Unable to refresh music rankings.";
    if(!previous){const holder=root.querySelector("#music-explorer-content");if(holder)holder.innerHTML=`<section class="callout danger-callout">Could not load stats.fm rankings: ${esc(error.message)}</section>`;}
    else musicExplorerRenderData(previous);
  }finally{
    if(id===musicRequestId&&view==="music"){
      const btn=root.querySelector("#music-explorer-refresh");
      if(btn){btn.disabled=false;btn.textContent="Refresh rankings";}
    }
  }
}

function musicExplorerView(){
  ++musicRequestId;
  const today=isoToday(),range=musicExplorerRange(),first="2020-11-01",currentYear=Number(today.slice(0,4));
  const opts=[["month","Monthly"],["year","Yearly"],["all","All Time"],["custom","Custom Range"]];
  const controls=musicPeriod==="month"?`<label class="music-explorer-picker"><span>Choose month</span><select id="music-explorer-month" class="select" aria-label="Choose month">${Array.from({length:(currentYear-2020)*12+Number(today.slice(5,7))-10},(_,i)=>{const d=new Date(2020,10+i,1),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;return `<option value="${key}" ${musicMonth===key?"selected":""}>${MONTHS[d.getMonth()]} ${d.getFullYear()}</option>`}).reverse().join("")}</select></label>`:
    musicPeriod==="year"?`<label class="music-explorer-picker"><span>Choose year</span><select id="music-explorer-year" class="select" aria-label="Choose year">${Array.from({length:currentYear-2019},(_,i)=>currentYear-i).map(y=>`<option value="${y}" ${y===musicYear?"selected":""}>${y}${y===2020?" (Nov–Dec)":""}</option>`).join("")}</select></label>`:
    musicPeriod==="custom"?`<div class="music-explorer-custom"><label class="music-explorer-picker"><span>From</span><input id="music-explorer-start" class="input" type="date" min="${first}" max="${today}" value="${esc(musicCustomStart)}"></label><label class="music-explorer-picker"><span>To (inclusive)</span><input id="music-explorer-end" class="input" type="date" min="${first}" max="${today}" value="${esc(musicCustomEnd)}"></label><button id="music-explorer-apply" type="button" class="button primary">Apply dates</button></div>`:
    `<div class="music-explorer-alltime"><b>Lifetime listening window</b><span>Nov 1, 2020 → today</span></div>`;
  const cached=!range.error?musicCached(range.start,range.end):null;
  root.innerHTML=`${pageHead("Music","Your listening history, turned into personal charts and standout winners.")}
  <div class="music-explorer">
    <div class="music-explorer-hero"><div class="music-explorer-hero-content"><span class="music-explorer-hero-eyebrow">✦ YOUR MUSIC UNIVERSE</span><h2>Power Rankings<span>.</span></h2><p>Explore your top songs, artists, and albums across any period of your listening history.</p></div><span class="music-explorer-hero-graphic" aria-hidden="true">♫</span></div>
    <div class="music-explorer-toolbar"><div class="music-explorer-period-tabs" role="group" aria-label="Music ranking time period">${opts.map(([id,label])=>`<button type="button" data-music-period="${id}" class="music-explorer-period ${musicPeriod===id?"is-current":""}" aria-pressed="${musicPeriod===id}">${label}</button>`).join("")}</div>
      <div class="music-explorer-controls">${controls}</div>
    </div>
    <div class="music-explorer-meta"><div><span class="music-explorer-section-eyebrow">CURRENT CHART</span><h3>${esc(range.label||"Choose a period")}</h3><p>${esc(range.note||range.error||"Choose dates to see rankings")}</p></div>${button("Refresh rankings","music-explorer-refresh","primary")}</div>
    <div id="music-explorer-status" class="music-explorer-status" role="status" aria-live="polite">${range.error?esc(range.error):cached?"Loaded from your saved music rankings.":"Getting listening data…"}</div>
    <div id="music-explorer-content">${range.error?"":cached?musicExplorerContent(cached):'<div class="music-explorer-loading"><div class="music-explorer-spinner"></div><span>Building your music charts…</span></div>'}</div>
  </div>`;
  root.querySelectorAll("[data-music-period]").forEach(btn=>btn.onclick=()=>{
    const next=btn.dataset.musicPeriod;
    if(next===musicPeriod)return;
    musicPeriod=next;musicExplorerView();
  });
  const mo=root.querySelector("#music-explorer-month");
  if(mo)mo.onchange=e=>{musicMonth=e.target.value;musicExplorerView()};
  const yr=root.querySelector("#music-explorer-year");
  if(yr)yr.onchange=e=>{musicYear=Number(e.target.value);musicExplorerView()};
  const apply=root.querySelector("#music-explorer-apply");
  if(apply)apply.onclick=()=>{
    const from=root.querySelector("#music-explorer-start").value,to=root.querySelector("#music-explorer-end").value;
    const note=root.querySelector("#music-explorer-status");
    if(!from||!to||from>to||from<first||to>today){if(note)note.textContent=`Choose a valid range between Nov 1, 2020 and ${shortDate(today)} (start before end).`;return;}
    musicCustomStart=from;musicCustomEnd=to;musicExplorerView();
  };
  const refresh=root.querySelector("#music-explorer-refresh");
  if(range.error){refresh.disabled=true;return;}
  refresh.onclick=()=>musicExplorerLoad(range.start,range.end,true);
  if(cached)musicExplorerRenderData(cached);
  if(!cached||!musicExplorerFresh(range.start,range.end))musicExplorerLoad(range.start,range.end,false);
}

function recordHallIcon(name){
  const shapes={
    gamepad:'<path d="M6 12h12a4 4 0 0 1 3.9 3.1l.9 4a2.5 2.5 0 0 1-3.9 2.6L16 19H8l-2.9 2.7a2.5 2.5 0 0 1-3.9-2.6l.9-4A4 4 0 0 1 6 12Z"/><path d="M8 14v5M5.5 16.5h5"/><circle cx="16.5" cy="15.5" r=".7" fill="currentColor"/><circle cx="19" cy="18" r=".7" fill="currentColor"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 15l2.5 2.5L16 13"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trophy:'<path d="M8 3h8v9a4 4 0 0 1-8 0V3ZM8 5H4v3a5 5 0 0 0 5 5M16 5h4v3a5 5 0 0 1-5 5M12 16v4M8 21h8"/>',
    sparkle:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/>',
    diary:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 3v18M12 8h5m-5 4h5m-5 4h3"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    flag:'<path d="M4 22V3m0 1c6-4 10 4 16 0v11c-6 4-10-4-16 0"/>',
    bars:'<path d="M4 20v-7h4v7M10 20V6h4v14M16 20v-10h4v10"/>',
    fire:'<path d="M12 22a8 8 0 0 0 8-8c0-4.5-3-7.5-5-9-1 4-4 5-4 5 0-4-1-5-3-7-.3 4-4 7-4 11a8 8 0 0 0 8 8Z"/><path d="M12 22a3.5 3.5 0 0 0 3.5-3.5C15.5 16 13 15 12 13c-1 3-3.5 3-3.5 5.5A3.5 3.5 0 0 0 12 22Z"/>',
    edit:'<path d="M4 18v3h3l12-12-3-3L4 18ZM14.5 7.5l3 3M14 4l3-3 4 4-3 3M4 4h7"/>',
    lightning:'<path d="m13 2-9 11h7l-1 9 10-12h-7V2Z"/>'
  };
  return `<svg class="record-hall-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||shapes.sparkle}</svg>`;
}

function recordHallFeature(tone,icon,label,value,subtitle,detail,date=""){
  const action=date?`<button type="button" class="record-hall-visit" data-record-day="${esc(date)}">Open day <span aria-hidden="true">↗</span></button>`:"";
  return `<article class="record-hall-feature record-hall-feature--${tone}">
    <div class="record-hall-feature-top"><span class="record-hall-feature-icon">${recordHallIcon(icon)}</span><span class="record-hall-feature-tag">PERSONAL BEST</span></div>
    <div class="record-hall-feature-label">${esc(label)}</div><div class="record-hall-feature-value">${esc(value)}</div>
    <div class="record-hall-feature-subtitle">${esc(subtitle)}</div>
    <div class="record-hall-feature-footer"><span>${esc(detail)}</span>${action}</div>
  </article>`;
}

function recordHallCard(tone,icon,label,value,meta){
  return `<article class="record-hall-card record-hall-card--${tone}">
    <div class="record-hall-card-top"><span class="record-hall-card-icon">${recordHallIcon(icon)}</span><span class="record-hall-card-accent" aria-hidden="true">✦</span></div>
    <div class="record-hall-card-label">${esc(label)}</div><div class="record-hall-card-value">${esc(value)}</div><div class="record-hall-card-detail">${esc(meta)}</div>
  </article>`;
}

function recordsView(){
  const gamingRecords=gamingRecordHighlights();
  const totalTime=gamingRecords.lifetimeMinutes>0?gamingHours(gamingRecords.lifetimeMinutes):"—";
  const bestDay=gamingRecords.bestDay,bestMonth=gamingRecords.bestMonth,bestGameDay=gamingRecords.bestGameDay,bestGameMonth=gamingRecords.bestGameMonth;
  const dates=Object.entries(state.entries||{}).filter(([,entry])=>entry?.text?.trim());
  const busiest=dates.map(([date,entry])=>({date,events:splitEvents(entry.text).length})).sort((a,b)=>b.events-a.events||a.date.localeCompare(b.date))[0];
  const top=activityStats(state).counts[0],editing=mostActivityDay(state,"Editing");
  const streak=loggingStreak(state),daily=dailyChallengeStreaks(state),monty=montyRecord(state);
  const geo=geoguessr10kRecord(state);
  const monthTop=gamingRecords.topMonths;
  const maxMonthlyMinutes=monthTop[0]?.minutes||1;
  const dateHint=bestDay?shortDate(bestDay.date):"No dated playtime recorded yet";
  const monthHint=bestMonth?monthLabel(bestMonth.month):"No monthly playtime recorded yet";
  root.innerHTML=`${pageHead("Personal Records","Your hall of fame, built from real gaming minutes, daily challenges and diary highlights.")}
    <div id="personal-records-showcase" class="record-hall">
      <div class="record-hall-hero"><div><div class="record-hall-eyebrow">✦ THE HALL OF FAME ✦</div><h2>Every high score tells a story<span>.</span></h2><p>Actual recorded milestones, meaningful personal bests, and the moments that stand out.</p></div><div class="record-hall-hero-art">${recordHallIcon("trophy")}</div></div>
      <div class="section-title">THE HEADLINERS · GAMING RECORDS</div>
      <div class="record-hall-feature-grid">
        ${recordHallFeature("day","gamepad","Most gaming recorded in one day",bestDay?gamingHours(bestDay.minutes):"—",dateHint,"Measured from dated playtime changes, not a single timed session",bestDay?.date||"")}
        ${recordHallFeature("month","calendar","Most gaming in one month",bestMonth?gamingHours(bestMonth.minutes):"—",monthHint,bestMonth?.recoveredMinutes>0?"Includes recoverable historic monthly playtime":"Summed from tracked monthly playtime")}
      </div>
      <div class="section-title">GAMING · MORE PERSONAL BESTS</div>
      <div class="record-hall-card-grid">
        ${recordHallCard("total","clock","Total gaming time",totalTime,gamingRecords.lifetimeMinutes>0?"Lifetime known playtime across connected and legacy sources":"Connect gaming accounts to build this record")}
        ${recordHallCard("favorite","trophy","Most played game ever",gamingRecords.favoriteGame?.title||"—",gamingRecords.favoriteGame?`${gamingHours(gamingRecords.favoriteGame.minutes)} known playtime`:"No lifetime game hours available yet")}
        ${recordHallCard("single","gamepad","Biggest one-game day",bestGameDay?gamingHours(bestGameDay.minutes):"—",bestGameDay?`${bestGameDay.title} · ${shortDate(bestGameDay.date)}`:"Dated game minutes not available yet")}
        ${recordHallCard("single-month","calendar","Biggest game in a month",bestGameMonth?gamingHours(bestGameMonth.minutes):"—",bestGameMonth?`${bestGameMonth.title} · ${monthLabel(bestGameMonth.month)}`:"Monthly game playtime not available yet")}
        ${recordHallCard("year","bars","Biggest recorded gaming year",gamingRecords.bestYear?gamingHours(gamingRecords.bestYear.minutes):"—",gamingRecords.bestYear?`${gamingRecords.bestYear.year} · Known monthly playtime`:"Waiting for monthly gaming records")}
      </div>
      <div class="record-hall-months">
        <div class="record-hall-months-header"><div><div class="record-hall-subheading">YOUR BIGGEST GAMING MONTHS</div><h3>Top 3 on record</h3></div><span class="record-hall-label-chip">${gamingRecords.trackedMonths} MONTH${gamingRecords.trackedMonths===1?"":"S"} RECORDED</span></div>
        ${monthTop.length?monthTop.map((item,i)=>`<div class="record-hall-month-row">
          <span class="record-hall-month-position">0${i+1}</span><div class="record-hall-month-name"><b>${esc(monthLabel(item.month))}</b><div class="record-hall-progress"><div style="width:${Math.max(4,Math.round(item.minutes/maxMonthlyMinutes*100))}%"></div></div></div>
          <span class="record-hall-month-hours">${esc(gamingHours(item.minutes))}</span>
        </div>`).join(""):'<p class="muted small">As gaming data is recorded, your biggest months will appear here.</p>'}
      </div>
      <div class="record-hall-source-note">${recordHallIcon("target")}<span>Gaming day records come from changes detected between account snapshots; they are <b>not exact session timers</b>. Monthly records can also include recovered historical playtime. Older lifetime playtime without date evidence is never assigned to a specific day or month.</span></div>
      <div class="section-title">YOUR LIFE · DIARY MILESTONES</div>
      <div class="record-hall-card-grid record-hall-diary">
        ${recordHallCard("activity","sparkle","Most common activity",top?.[0]||"—",top?`${fmt(top[1])} recognized diary events`:"No activities recognized yet")}
        ${recordHallCard("writing","diary","Most events in one day",busiest?`${fmt(busiest.events)} events`:"—",busiest?shortDate(busiest.date):"No saved diary entries yet")}
        ${recordHallCard("streak","fire","Longest diary streak",`${fmt(streak.longest)} days`,streak.last?`Last saved ${shortDate(streak.last)}`:"No diary streak data yet")}
        ${recordHallCard("edit","edit","Most editing in a day",editing?`${fmt(editing.count)} events`:"—",editing?shortDate(editing.date):"No editing events recognized yet")}
      </div>
      <div class="section-title">GEOGUESSR · CHALLENGE RECORDS</div>
      <div class="record-hall-card-grid record-hall-geoguessr">
        ${recordHallCard("challenge","flag","Longest Daily Challenge streak",`${fmt(daily.longest)} days`,"Your personal best streak")}
        ${recordHallCard("challenge","lightning","Current Daily Challenge streak",`${fmt(daily.active?daily.current:0)} days`,daily.active?"Currently active":"Currently inactive")}
        ${recordHallCard("challenge","trophy","Wins against Monty",fmt(monty.wins),`${fmt(monty.losses)} recorded losses · all time`)}
        ${recordHallCard("geoguessr","target","GeoGuessr 10K record",geo?fmt(geo.value):"—",geo?`Recorded ${shortDate(geo.date)}`:"No dated record yet")}
        ${recordHallCard("geoguessr","flag","Hong Kong spawns",fmt(trackerTotal(state,"hong-kong")),"Lifetime tracker total")}
      </div>
      <details class="record-hall-history">
        <summary><span>${recordHallIcon("diary")} Other historical counters</span><span class="record-hall-history-hint">View less-used totals <span aria-hidden="true">⌄</span></span></summary>
        <div class="record-hall-history-grid">
          <div><span>Diary days saved</span><b>${fmt(dates.length)}</b></div>
          <div><span>Mors Mutual calls</span><b>${fmt(trackerTotal(state,"mors-mutual"))}</b></div>
          <div><span>Collisions</span><b>${fmt(trackerTotal(state,"apartment-collisions"))}</b></div>
          <div><span>Migraines</span><b>${fmt(trackerTotal(state,"migraines"))}</b></div>
        </div>
        <div class="record-hall-history-foot">These totals are preserved rather than deleted, but they don't take space from your main records.</div>
      </details>
    </div>`;
  root.querySelectorAll("[data-record-day]").forEach(button=>button.onclick=()=>openDay(button.dataset.recordDay));
}

function askView(){root.innerHTML=`${pageHead('Ask T.I.D.E.','Ask for exactly what you want. T.I.D.E. returns the smallest useful answer and lets you drill into dates only when you choose.')}<div class="ask-box"><div class="ask-input-wrap"><input id="ask-input" class="ask-input" placeholder="What days did I spawn in Hong Kong in 2026?" autocomplete="off">${button('Ask','ask-go','primary')}</div><div class="ask-suggestions"><button class="chip" data-q="What months did I spawn in Hong Kong in 2026?">Hong Kong months</button><button class="chip" data-q="What day did I edit the most in 2026?">Most editing</button><button class="chip" data-q="How many Mors Mutual calls did I have in 2026?">Mors Mutual</button><button class="chip" data-q="Why was my best day the best?">WHYY?</button></div><div class="ask-results" id="ask-results">${askAnswer?renderAnswer(askAnswer):'<div class="callout">Ask T.I.D.E. works locally against your saved database. Simple research does not call Netlify or an external AI service.</div>'}</div></div>`;const input=root.querySelector('#ask-input');const run=()=>{askAnswer=askTide(state,input.value);root.querySelector('#ask-results').innerHTML=renderAnswer(askAnswer);wireAnswerDates()};root.querySelector('#ask-go').onclick=run;input.onkeydown=e=>{if(e.key==='Enter')run()};root.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{input.value=b.dataset.q;run()});wireAnswerDates()}
function renderAnswer(a){if(!a)return'';const items=Array.isArray(a.items)?a.items:[];return `<div class="answer-card"><div class="eyebrow">ANSWER</div><div class="answer-primary">${esc(a.primary)}</div>${a.detail?`<div class="answer-explain">${esc(a.detail)}</div>`:''}${items.length?`<div class="history-list" style="margin-top:16px">${items.map(x=>typeof x==='string'?`<div class="result-row">${esc(x)}</div>`:`<div class="result-row" ${x.date?`data-answer-date="${x.date}"`:''}><b>${esc(x.label||x.date||'')}</b>${x.meta?`<div class="small muted" style="margin-top:5px">${esc(x.meta)}</div>`:''}</div>`).join('')}</div>`:''}${a.date?`<button class="button" data-answer-date="${a.date}" style="margin-top:15px">Open full day</button>`:''}</div>`}
function wireAnswerDates(){root.querySelectorAll('[data-answer-date]').forEach(x=>x.onclick=()=>openDay(x.dataset.answerDate))}

function historyView(){const rows=Object.entries(state.entries||{}).filter(([,e])=>e.text?.trim()).sort((a,b)=>b[0].localeCompare(a[0]));root.innerHTML=`${pageHead('History','A compact archive. Search results show only the relevant day until you open it.')}<section class="card"><div class="filter-row"><input id="history-search" class="input" style="flex:1" placeholder="Search entries…"><select id="history-year" class="select"><option value="">All years</option>${[...new Set(rows.map(([d])=>d.slice(0,4)))].map(y=>`<option>${y}</option>`).join('')}</select></div><div class="history-list" id="history-list" style="margin-top:15px">${renderHistoryRows(rows)}</div></section>`;const update=()=>{const term=root.querySelector('#history-search').value.toLowerCase(),yr=root.querySelector('#history-year').value;const filtered=rows.filter(([d,e])=>(!yr||d.startsWith(yr))&&(!term||e.text.toLowerCase().includes(term)));root.querySelector('#history-list').innerHTML=renderHistoryRows(filtered);root.querySelectorAll('[data-hdate]').forEach(x=>x.onclick=()=>openDay(x.dataset.hdate))};root.querySelector('#history-search').oninput=update;root.querySelector('#history-year').onchange=update;update()}
function renderHistoryRows(rows){return rows.length?rows.slice(0,500).map(([d,e])=>`<div class="history-row" data-hdate="${d}"><div class="history-date">${shortDate(d)}</div><div class="history-text">${esc(e.text)}</div><span class="chip">${splitEvents(e.text).length} events</span></div>`).join(''):'<div class="muted">No matching days.</div>'}

function settingsView(){const defs=allTrackerDefinitions(state);root.innerHTML=`${pageHead('Settings','Privacy, import, backups, tracker lifecycle, and optional cloud sync.')}<section class="card settings-section"><div class="card-header"><div><h2>Cloud Sync</h2><div class="small muted">Typing never syncs. Cloud writes happen only on Save when enabled, or when you press Sync Now.</div></div><span class="chip ${cloud.authenticated?'accent':''}">${cloud.authenticated?'CONNECTED':cloud.configured?'LOCKED':'LOCAL ONLY'}</span></div><div class="callout">Set <b>TIDE_ACCESS_CODE</b> in Netlify to enable the private sync store. The public GitHub repository never contains your diary data.</div><div class="filter-row" style="margin-top:14px">${cloud.authenticated?`${button('Sync Now','sync-now','primary')}${button('Disconnect','cloud-logout')}`:`<input id="cloud-code" class="input" type="password" placeholder="Access code">${button('Connect','cloud-login','primary')}`}${cloud.authenticated?`<label class="chip"><input id="autosync" type="checkbox" ${state.settings.autoCloudSync?'checked':''}> sync on explicit Save</label>`:''}</div></section><section class="card settings-section"><div class="card-header"><div><h2>Import Existing T.I.D.E. Notes</h2><div class="small muted">Paste 2024, 2025, or 2026 note text. The parser keeps daily text and imports Best/Worst plus known monthly totals.</div></div></div><textarea id="notes-import" class="editor textarea-small" placeholder="Paste Things I Have Done Everyday / T.I.D.E. here…"></textarea><div class="filter-row" style="margin-top:12px">${button('Import Notes','run-import','primary')}<span class="small muted">Imports remain in your private local/cloud data, not GitHub.</span></div></section><section class="card settings-section"><div class="card-header"><div><h2>Backup & Restore</h2><div class="small muted">Keep your own copy of the entire T.I.D.E. database.</div></div></div><div class="filter-row">${button('Download JSON Backup','download-backup')}<label class="button">Restore JSON<input id="restore-file" type="file" accept="application/json" hidden></label></div></section><section class="card settings-section"><div class="card-header"><div><h2>Tracker Lifecycle</h2><div class="small muted">Retired means preserved forever but no longer expected in future months.</div></div></div><div class="tracker-table">${defs.map(t=>`<div class="tracker-row"><div class="tracker-name"><b>${esc(t.name)}</b><span class="tracker-status">${esc(t.kind)}</span></div><div><span class="chip">${esc(t.status)}</span></div><div class="small muted">${trackerTotal(state,t.id)} all time</div><div></div><select class="select tracker-status-select" data-id="${t.id}"><option value="active" ${t.status==='active'?'selected':''}>Active</option><option value="intermittent" ${t.status==='intermittent'?'selected':''}>Intermittent</option><option value="retired" ${t.status==='retired'?'selected':''}>Retired</option></select></div>`).join('')}</div></section>`;
  const login=root.querySelector('#cloud-login');if(login)login.onclick=async()=>{try{await cloudLogin(root.querySelector('#cloud-code').value);cloud.authenticated=true;await pullCloud(true);toast('Cloud connected.');render()}catch(e){toast(e.message,'bad')}};const logout=root.querySelector('#cloud-logout');if(logout)logout.onclick=async()=>{try{await cloudLogout()}catch{}cloud.authenticated=false;cloud.etag=null;render()};const sync=root.querySelector('#sync-now');if(sync)sync.onclick=()=>syncCloud();const auto=root.querySelector('#autosync');if(auto)auto.onchange=e=>{state.settings.autoCloudSync=e.target.checked;persist()};
  root.querySelector('#run-import').onclick=()=>{const raw=root.querySelector('#notes-import').value;if(!raw.trim())return toast('Paste your notes first.','bad');const result=parseNotesImport(raw,state);persist();toast(`Imported ${result.entries} diary entries.`);selectedDate=isoToday();render()};
  root.querySelector('#download-backup').onclick=()=>{const url=URL.createObjectURL(exportState(state));const a=document.createElement('a');a.href=url;a.download=`tide-backup-${isoToday()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  root.querySelector('#restore-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state=importStateObject(JSON.parse(await f.text()));persist();toast('Backup restored.');render()}catch(err){toast(`Restore failed: ${err.message}`,'bad')}};root.querySelectorAll('.tracker-status-select').forEach(s=>s.onchange=e=>{state.trackerOverrides[e.target.dataset.id]={...(state.trackerOverrides[e.target.dataset.id]||{}),status:e.target.value};persist();toast('Tracker status updated.');render()});
}

async function syncCloud(){if(!cloud.authenticated)return toast('Connect cloud sync first.','bad');try{const pulled=await cloudPull();const merged=mergeStates(state,pulled.state);state=merged;persist();const pushed=await cloudPush(state,pulled.etag);cloud.etag=pushed.etag||pulled.etag;toast('Cloud and local data synchronized.');render()}catch(e){toast(`Sync failed: ${e.message}`,'bad')}}
async function pullCloud(silent=false){try{const r=await cloudPull();state=mergeStates(state,r.state);cloud.etag=r.etag;persist();if(!silent)toast('Cloud data loaded.')}catch(e){if(!silent)toast(e.message,'bad')}}
async function bootstrapCloud(){const status=await cloudStatus();cloud={...cloud,...status,checked:true};if(status.authenticated){cloud.authenticated=true;await pullCloud(true)}updateSyncPill();render()}
function updateSyncPill(){const pill=document.querySelector('#sync-pill');pill.innerHTML=`<span class="sync-dot"></span><span>${cloud.authenticated?'Cloud ready · local-first':cloud.configured?'Cloud available · locked':'Local-first'}</span>`}
function render(){const viceCityActive=selectedDate>='2026-11-19'&&selectedDate<='2026-12-31';root.classList.toggle('vice-city-nov19',viceCityActive);document.body.classList.toggle('vice-city-season',viceCityActive);updateSyncPill();switch(view){case'today':todayView();break;case'calendar':calendarView();break;case'on-this-day':onThisDayView();break;case'monthly':monthlyView();break;case'yearly':yearlyView();break;case'trackers':trackersView();break;case'music':musicExplorerView();break;case'records':recordsView();break;case'ask':askView();break;case'history':historyView();break;case'settings':settingsView();break;default:todayView()}document.dispatchEvent(new Event('tide:view-rendered'))}
render();bootstrapCloud();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
