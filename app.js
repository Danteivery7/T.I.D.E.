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
import { activityRange, gamingRecordHighlights, hours as gamingHours, platformLabel } from './gaming-data.js';
import { diarySignals } from './diary-insights.js';
import { LIFE_TRACKER_IDS, ARCHIVED_GTA_IDS, AUTO_TRACKER_IDS, topTrackerMonth, topTrackerDay, derivedTrackerRows } from './life-trackers.js';
import { holidaysForMonth, holidaysOnDate, monthIdentity } from './calendar-data.js';
import { setThemeForDate } from './theme-engine.js';
import { personalCalendarEvents, calendarEventsOnDate, calendarEventsForMonth, writeCalendarEvent, removeCalendarEvent, proposedDiaryHeading, birthdaySuggestions } from './personal-calendar.js';
import { favoriteDays, saveFavoriteDays, yearsWithFavoriteDays, favoriteDaysSuggestion } from './favorite-days.js';
import { HEALTH_FIELDS, healthRows, healthPeriod, yearlyHealthOverview, mergeHealthImport, readHealthImportFile, formatHealth, metricLabel } from './health-activity.js';
import { answerAsk, askScope, askMusicIntent } from './ask-intelligence.js';
import { importFinances, ensureFinances, upsertFinanceSchedule, deleteFinanceSchedule, askFinance, financePeriod, moneyText } from './finance-engine.js';
import { financeHubMarkup, financeReviewMarkup, financeRecordsMarkup, financeTodayMarkup } from './finances-ui.js';
import { healthHubMarkup, healthReviewMarkup, healthLifetimeMarkup, healthDailyCard } from './health-ui.js';
import { healthAnswers, migraineSummary } from './health-insights.js';

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
let onThisDayDate=isoToday();
let showCalendarHolidays=true;
let musicPeriod='month',musicCategory='songs',musicMonth=selectedMonth,musicYear=selectedYear;
let musicCustomStart=shiftDay(isoToday(),-29),musicCustomEnd=isoToday(),musicRequestId=0;
let cloud={configured:false,authenticated:false,etag:null,checked:false};
let askAnswer=null;
let askLastQuestion='';
let askRequestToken=0;
let draftTimer=null;
let financeTab='overview',financeGroup='all',financeYear=selectedYear,financeSearch='',financeWhatIf=0;
let healthTab='overview',healthRange='month',healthMonth=selectedMonth,healthYear=selectedYear;

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US').format(Number(n)||0);
const shortDate=d=>d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`)):'—';

function toast(message,type='good'){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastRegion.append(el);setTimeout(()=>el.remove(),3200)}
// One date context for every link into the time capsule, including past years.
function periodDay(month,reference=selectedDate){
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));
  const max=new Date(Date.UTC(y,m,0)).getUTCDate();
  const dd=String(Math.min(Math.max(1,Number(reference.slice(8,10))||1),max)).padStart(2,'0');
  return month+'-'+dd;
}
function contextualDay(){
  if(view==='today')return selectedDate;
  if(view==='on-this-day')return onThisDayDate;
  if(view==='calendar'||view==='monthly')return periodDay(selectedMonth);
  if(view==='finances')return periodDay(String(financeYear)+selectedMonth.slice(4));
  if(view==='health')return periodDay(healthRange==='year'?String(healthYear)+healthMonth.slice(4):healthMonth);
  if(view==='music')return periodDay(musicPeriod==='month'?musicMonth:musicPeriod==='year'?String(musicYear)+selectedMonth.slice(4):selectedMonth);
  return periodDay(selectedMonth);
}
function setView(next){
  // A sidebar/dock jump must keep the date and palette of the selected year.
  if(next==='on-this-day'&&view!=='on-this-day')onThisDayDate=contextualDay();
  if(view==='on-this-day'){
    selectedDate=onThisDayDate;
    selectedYear=yearOf(onThisDayDate);
    selectedMonth=onThisDayDate.slice(0,7);
  }
  if(view==='finances'){selectedYear=financeYear;selectedMonth=String(financeYear)+selectedMonth.slice(4);}
  if(view==='health'){selectedYear=healthRange==='year'?healthYear:Number(healthMonth.slice(0,4));selectedMonth=healthRange==='year'?String(healthYear)+selectedMonth.slice(4):healthMonth;}
  if(next==='finances')financeYear=selectedYear;
  if(next==='health'){healthYear=selectedYear;healthMonth=selectedMonth;}
  if(next==='music'&&view!=='music'){
    musicYear=selectedYear;
    musicMonth=selectedMonth;
    musicPeriod='year'; // Historical years must show January 1–December 31 by default.
  }
  if(next==='gaming'&&view!=='gaming'){
    document.dispatchEvent(new CustomEvent('tide:gaming-context',{detail:{year:selectedYear,month:selectedMonth}}));
  }
  const changed=view!==next;
  view=next;
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.querySelectorAll('[data-mobile-view]').forEach(b=>{
    const active=b.dataset.mobileView===view;
    b.classList.toggle('is-active',active);
    if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  const more=document.querySelector('[data-mobile-more]');
  if(more)more.classList.toggle('is-active',!['today','calendar','monthly','trackers'].includes(view));
  document.querySelector('#view-eyebrow').textContent=view==='ask'?'ASK T.I.D.E.':view.replaceAll('-',' ').toUpperCase();
  closeSidebar();render();
  if(changed&&window.matchMedia('(max-width:980px)').matches)window.scrollTo(0,0);
}
function openSidebar(){
  sidebar.classList.add('open');scrim.classList.add('show');
  document.body.classList.add('tide-nav-open');
  document.querySelector('#mobile-menu')?.setAttribute('aria-expanded','true');
}
function closeSidebar(){
  sidebar.classList.remove('open');scrim.classList.remove('show');
  document.body.classList.remove('tide-nav-open');
  document.querySelector('#mobile-menu')?.setAttribute('aria-expanded','false');
}
function openModal(title,body,eyebrow='T.I.D.E.'){document.querySelector('#modal-title').textContent=title;document.querySelector('#modal-eyebrow').textContent=eyebrow;document.querySelector('#modal-body').innerHTML=body;modal.showModal()}
function closeModal(){modal.close()}
function persist(){saveLocal(state)}
// Reuse the same authenticated private importer from Health, Finances and Settings.
// There is deliberately no public source file or uncredentialed API backdoor.
async function activatePrivateData(file){
  try{
    if(!file||file.size>80*1024*1024)throw new Error('Select your prepared T.I.D.E. private setup file (up to 80 MB).');
    const payload=JSON.parse(await file.text());
    if(payload?.format!=='tide-private-bootstrap-v1'||!payload.health||!payload.finances)
      throw new Error('Choose the combined T.I.D.E. Health + Finances file provided in ChatGPT.');
    // Either import must succeed before any diary or tracker data is replaced.
    const draft=structuredClone(state);
    const healthCount=mergeHealthImport(draft,payload.health);
    const financeCount=importFinances(draft,payload.finances);
    state=draft;persist();render();
    toast('Activated '+fmt(healthCount)+' Health days and '+fmt(financeCount)+' financial transactions.');
    if(cloud.authenticated){
      try{
        const result=await cloudPush(state,cloud.etag);
        cloud.etag=result?.etag||cloud.etag;
        toast('Health and Finances are saved in your private T.I.D.E. cloud.');
      }catch(error){
        toast('Imported here, but cloud sync failed: '+error.message,'bad');
      }
    }else toast('Imported on this device. Connect T.I.D.E. cloud in Settings for other devices.');
    return true;
  }catch(error){toast('Health + Finances activation failed: '+error.message,'bad');return false;}
}
const quickPrivateInput=document.querySelector('#tide-private-activation-file');
root.addEventListener('click',event=>{
  if(event.target.closest('[data-tide-private-activate]'))quickPrivateInput?.click();
});
quickPrivateInput?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  if(file)await activatePrivateData(file);
  event.target.value='';
});

root.addEventListener('click',event=>{const button=event.target.closest('[data-insight-day]');if(button)openDay(button.dataset.insightDay)});
root.addEventListener('click',event=>{
  const open=event.target.closest('[data-personal-day]');if(open)return openDay(open.dataset.personalDay);
  const edit=event.target.closest('[data-edit-favorites]');if(edit)return openFavoriteDaysEditor(Number(edit.dataset.editFavorites));
});
root.addEventListener('click',event=>{
  const day=event.target.closest('[data-health-day]');if(day)return openDay(day.dataset.healthDay);
  const setup=event.target.closest('[data-health-settings]');if(setup)return setView('settings');
});
root.addEventListener('click',event=>{
  const day=event.target.closest('[data-insight-open-day]');if(day)return openDay(day.dataset.insightOpenDay);
  const link=event.target.closest('[data-insight-hub]');if(link)return setView(link.dataset.insightHub);
  const fin=event.target.closest('[data-fin-import]');if(fin)return setView('settings');
  const health=event.target.closest('[data-health-import]');if(health)return setView('settings');
});
nav.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)});
document.querySelector('.sidebar-bottom').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)});
document.querySelector('#mobile-menu').onclick=openSidebar;document.querySelector('#mobile-close').onclick=closeSidebar;scrim.onclick=closeSidebar;
document.querySelector('#mobile-dock')?.addEventListener('click',event=>{
  const jump=event.target.closest('[data-mobile-view]');
  if(jump){setView(jump.dataset.mobileView);return;}
  if(event.target.closest('[data-mobile-more]'))openSidebar();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sidebar.classList.contains('open')){closeSidebar();document.querySelector('#mobile-menu')?.focus();}});
document.querySelector('#quick-ask').onclick=()=>setView('ask');document.querySelector('#jump-today').onclick=()=>{selectedDate=isoToday();selectedMonth=selectedDate.slice(0,7);selectedYear=yearOf(selectedDate);setView('today')};
document.querySelector('#modal-close').onclick=closeModal;
document.addEventListener('tide:gaming-period',event=>{
  if(view!=='gaming')return;
  const y=Number(event.detail?.year),m=String(event.detail?.month||'');
  if(Number.isInteger(y)&&y>=2020&&y<=2099){
    selectedYear=y;
    if(/^\d{4}-\d{2}$/.test(m)&&Number(m.slice(0,4))===y)selectedMonth=m;
    else selectedMonth=String(y)+selectedMonth.slice(4);
  }
});


function pageHead(title,sub='',actions=''){return `<div class="page-head"><div><div class="eyebrow">T.I.D.E.</div><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</div>${actions}</div>`}
function button(label,id,cls=''){return `<button class="button ${cls}" id="${id}">${label}</button>`}
function entryText(date){return state.entries?.[date]?.text||''}
function entryExists(date){return Boolean(entryText(date).trim())}
// An annual/monthly report represents an entire period, not New Year's Day.
 // Use holiday-free anchor dates for reports so Jan 1 never paints a whole year gold.
const annualThemeDate=year=>String(year)+'-08-15';
function presentationDate(){
  if(view==='today')return selectedDate;
  if(view==='on-this-day')return onThisDayDate;
  if(view==='calendar'||view==='monthly')return selectedMonth+'-15';
  if(view==='yearly'||view==='trackers'||view==='records')return annualThemeDate(selectedYear);
  if(view==='finances')return annualThemeDate(financeYear);
  if(view==='health')return healthRange==='year'?annualThemeDate(healthYear):healthMonth+'-15';
  if(view==='music')return musicPeriod==='year'?annualThemeDate(musicYear):musicPeriod==='month'?musicMonth+'-15':musicPeriod==='custom'?musicCustomStart:annualThemeDate(selectedYear);
  return annualThemeDate(selectedYear);
}
function specialDateBanner(date){
  const events=personalCalendarEvents(state,date),holiday=holidaysOnDate(date).find(h=>/Christmas|Thanksgiving|New Year's|St. Patrick|Halloween|Easter|Independence/.test(h.name));
  const chosen=events.find(e=>e.kind==='personal')||events.find(e=>e.kind==='birthday')||holiday;
  if(!chosen)return '';
  const icon=chosen.kind==='birthday'?'🎉':chosen.theme==='knicks'?'🏆':'✦';
  return `<div class="tide-theme-banner"><span class="tide-theme-banner-icon" aria-hidden="true">${icon}</span><b>${esc(chosen.name)}</b><span>${chosen.kind==='birthday'?'A day worth celebrating':'A moment on your timeline'}</span></div>`;
}
function eventCount(date){return splitEvents(entryText(date)).length}
function relevantDetections(date){return (state.occurrences||[]).filter(x=>x.date===date&&x.source==='detected')}
function monthReview(key=selectedMonth){return state.monthlyReviews?.[key]||{}}

function todayView(){
  const date=selectedDate;const saved=entryText(date);const draft=loadDraft(date);const suggested=!saved&&!draft&&date>=isoToday()&&!localStorage.getItem('tide:preamble-dismissed:'+date)?proposedDiaryHeading(state,date):'';const text=draft!==null?draft:(saved||suggested);const isToday=date===isoToday();const det=relevantDetections(date);const review=monthReview(date.slice(0,7));const otd=onThisDayRows(date).filter(x=>x.date!==date).slice(0,3);const streak=dailyChallengeStreaks(state);const geo=geoguessr10kRecord(state);
  root.innerHTML=`${pageHead(isToday?'Today':dateLabel(date,{weekday:false}),isToday?'Your day is the focus. Type naturally, use commas, and save whenever you want.':'Historical days stay fully editable and keep revision history.')}
    <div class="today-date-jump-bar"><label class="today-date-jump">Jump to a different date <input id="today-date-jump" type="date" value="${esc(date)}" min="2020-01-01" max="2100-12-31" aria-label="Jump to any diary date"></label></div>
    <div class="hero-day today-home">
      <section class="card day-card">
        <div class="day-nav"><button class="icon-button" id="prev-day">‹</button><div class="day-nav-center"><div class="eyebrow">${isToday?'CURRENT DAY':'DIARY ENTRY'}</div><h1>${esc(dateLabel(date))}</h1><div class="day-status"><span class="status-dot"></span>${saved?`Saved · ${eventCount(date)} events`:(isToday?'In progress':'No saved entry')}</div></div><button class="icon-button" id="next-day">›</button></div>
        <div class="editor-wrap"><textarea id="day-editor" class="editor" spellcheck="true" placeholder="Woke up, got up, edited, showered and got dressed, ...">${esc(text)}</textarea><div class="editor-meta" id="editor-meta">${splitEvents(text).length} recognized chunks · draft saves locally</div></div>
        <div class="editor-actions"><div class="small muted" id="save-note">Typing never calls Netlify. Save writes locally first.</div><div class="chip-row"><button class="button ghost" id="versions">Version history</button><button class="button primary" id="save-day">Save Day</button></div></div>
        <div class="section-title">T.I.D.E. NOTICED</div><div class="detected-list" id="detected-list">${det.length?det.map(d=>`<div class="detected-item"><span>${esc(trackerDefinition(state,d.trackerId).name)}</span><b>${d.value!=null?fmt(d.value):d.result?esc(d.result):`+${d.count}`}</b></div>`).join(''):`<div class="muted small">Save the day and detected trackers will appear here. You can correct anything from Trackers.</div>`}</div>
      </section>
      <div class="today-home-overview">
        <div class="today-home-overview-title"><span class="today-home-overview-eyebrow">✦ YOUR DAILY DASHBOARD</span><h2>Life at a glance</h2><p>The highlights, personal picks, and records around your diary. Your writing stays front and center.</p></div>
        <span class="today-home-current-month">${esc(monthLabel(date.slice(0,7)))}</span>
      </div>
      <aside class="right-stack today-dashboard" aria-label="Daily highlights and tracking panels">
        <section class="card today-otd-panel"><div class="card-header today-panel-header"><div><div class="today-panel-eyebrow">✧ TIME CAPSULE</div><h3>On This Day</h3><p class="today-panel-description">Memories from this date in previous years.</p></div><button class="button ghost" id="open-otd">View all</button></div>${otd.length?otd.map(r=>`<div class="otd-item today-otd-item" data-date="${r.date}"><div class="otd-year">${r.year}</div><div class="otd-summary">${esc(r.summary)}</div></div>`).join(''):`<div class="today-otd-empty"><span aria-hidden="true">✧</span><b>Your time capsule is growing.</b><p>When you have diary entries for this date in earlier years, they’ll appear here.</p></div>`}</section>
        <section class="card today-month-panel"><div class="card-header today-panel-header"><div><div class="today-panel-eyebrow">✦ MONTHLY HIGHLIGHTS</div><h3>This Month</h3><p class="today-panel-description">The days you personally chose.</p></div><button class="button ghost" id="open-month">Review</button></div><div class="grid grid-2 today-metrics-grid"><div class="today-month-pick today-month-pick--best"><div class="stat-label">Best Day</div><div class="big-stat" style="font-size:23px">${review.bestDay?shortDate(review.bestDay):'—'}</div></div><div class="today-month-pick today-month-pick--worst"><div class="stat-label">Worst Day</div><div class="big-stat" style="font-size:23px">${review.worstDay?shortDate(review.worstDay):'—'}</div></div></div></section>
        <section class="card today-records-panel"><div class="card-header today-panel-header"><div><div class="today-panel-eyebrow">↗ ACTIVE RECORDS</div><h3>Live Records</h3><p class="today-panel-description">A quick snapshot of your tracked milestones.</p></div><button class="button ghost" id="open-records">Records</button></div><div class="grid grid-2 today-metrics-grid"><div class="today-record-tile today-record-tile--dc"><div class="stat-label">DC Streak</div><div class="big-stat" style="font-size:26px">${streak.active?streak.current:0}</div><div class="tiny subtle">${streak.active?'ACTIVE':'INACTIVE'}</div></div><div class="today-record-tile today-record-tile--geo"><div class="stat-label">Geoguessr 10K</div><div class="big-stat" style="font-size:26px">${geo?fmt(geo.value):'—'}</div><div class="tiny subtle">${geo?shortDate(geo.date):'NO DATA'}</div></div></div></section>
        ${healthDailyCard(state,date,'sleepHours')}
        ${healthDailyCard(state,date,'steps')}
        ${financeTodayMarkup(state,date)}
      </aside>
    </div>`;
  if(specialDateBanner(date))root.insertAdjacentHTML('afterbegin',specialDateBanner(date));
  root.querySelector('#prev-day').onclick=()=>{selectedDate=shiftDay(date,-1);selectedMonth=selectedDate.slice(0,7);selectedYear=yearOf(selectedDate);render()};
  root.querySelector('#next-day').onclick=()=>{selectedDate=shiftDay(date,1);selectedMonth=selectedDate.slice(0,7);selectedYear=yearOf(selectedDate);render()};
  root.querySelector('#today-date-jump').onchange=e=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))return;selectedDate=e.target.value;selectedMonth=selectedDate.slice(0,7);selectedYear=yearOf(selectedDate);render()};
  const editor=root.querySelector('#day-editor');editor.addEventListener('input',()=>{clearTimeout(draftTimer);root.querySelector('#editor-meta').textContent=`${splitEvents(editor.value).length} recognized chunks · local draft`;draftTimer=setTimeout(()=>saveDraft(date,editor.value),450)});
  if(suggested)editor.addEventListener('change',()=>{if(!editor.value.startsWith(suggested))localStorage.setItem('tide:preamble-dismissed:'+date,'1')});
  root.querySelector('#save-day').onclick=()=>saveCurrentDay(date,editor.value);root.querySelector('#versions').onclick=()=>showVersions(date);root.querySelector('#open-otd').onclick=()=>{onThisDayDate=date;setView('on-this-day')};root.querySelector('#open-month').onclick=()=>{selectedMonth=date.slice(0,7);setView('monthly')};root.querySelector('#open-records').onclick=()=>setView('records');root.querySelectorAll('.otd-item').forEach(x=>x.onclick=()=>openDay(x.dataset.date));
}
async function saveCurrentDay(date,text){saveEntry(state,date,text);persist();clearDraft(date);toast('Day saved locally.');render();if(state.settings.autoCloudSync&&cloud.authenticated){try{const r=await cloudPush(state,cloud.etag);cloud.etag=r.etag||cloud.etag;toast('Cloud sync complete.')}catch(e){toast(`Saved locally; cloud sync failed: ${e.message}`,'bad')}}}
function showVersions(date){const revisions=state.entries?.[date]?.revisions||[];openModal('Version History',revisions.length?revisions.map((r,i)=>`<div class="result-row"><b>${new Date(r.savedAt).toLocaleString()}</b><div class="small muted" style="margin-top:7px">${esc(r.text).slice(0,500)}</div><button class="button" data-restore="${i}" style="margin-top:10px">Restore</button></div>`).join(''):`<div class="muted">No earlier saved versions yet.</div>`,'SAFE HISTORY');modal.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{const r=revisions[Number(b.dataset.restore)];if(r){saveEntry(state,date,r.text);persist();closeModal();render();toast('Earlier version restored.')}})}

function tideCalendarCell(date,isCurrentMonth,holidays,review){
  const entry=entryExists(date),day=Number(date.slice(-2)),today=date===isoToday(),best=review?.bestDay===date,worst=review?.worstDay===date;
  const special=holidays.find(h=>['special','personal','birthday','release','sports','celebration'].includes(h.kind));
  const primary=special||holidays.find(h=>h.kind==='federal')||holidays.find(h=>h.kind==='observed')||holidays[0];
  const ranked=favoriteDays(state,date.slice(0,4)).includes(date);
  const classes=['tide-cal-day',isCurrentMonth?'':'is-adjacent',entry?'has-diary':'',today?'is-today':'',best?'is-best':'',worst?'is-worst':'',primary?'has-holiday':'',special?'is-special':'',special?'has-personal':'',ranked?'is-ranked':''].filter(Boolean).join(' ');
  const count=entry?eventCount(date):0,note=entry?daySummary(entryText(date)).slice(0,110):'';
  const markers=[best?'BEST DAY':'',worst?'WORST DAY':''].filter(Boolean);
  const label=`${shortDate(date)}${today?', today':''}${holidays.length?', '+holidays.map(h=>h.name).join(', '):''}${entry?`, ${count} diary event${count===1?'':'s'}`:', no diary entry'}${best?', monthly best day':''}${worst?', monthly worst day':''}`;
  return `<button type="button" class="${classes}" data-date="${esc(date)}" title="${esc(label)}" aria-label="${esc(label)}">
    <span class="tide-cal-day-top"><span class="tide-cal-day-num">${day}</span>${today?'<span class="tide-cal-today-label">TODAY</span>':''}${ranked?'<span class="tide-cal-rank-star" title="Yearly favorite day">★</span>':''}</span>
    <span class="tide-cal-day-body">
      ${primary?`<span class="tide-cal-holiday tide-cal-holiday--${primary.kind}">${primary.kind==='birthday'?'🎂 ':''}${esc(primary.name)}</span>`:''}
      ${entry?`<span class="tide-cal-note">${esc(note)}</span>`:''}
    </span>
    <span class="tide-cal-day-bottom">${entry?`<span class="tide-cal-diary-dot"></span><span class="tide-cal-diary-label">${count} ${count===1?'EVENT':'EVENTS'}</span>`:''}${markers.length?`<span class="tide-cal-pick-label">${markers.join(' · ')}</span>`:''}${primary?'<span class="tide-cal-holiday-dot" aria-hidden="true"></span>':''}</span>
  </button>`;
}

function calendarView(){
  const [year,month]=selectedMonth.split('-').map(Number),first=new Date(Date.UTC(year,month-1,1)).getUTCDay();
  const days=daysInMonth(selectedMonth),totalCells=Math.ceil((first+days)/7)*7;
  const theme=monthIdentity(selectedMonth),monthNum=String(month).padStart(2,'0'),review=monthReview(selectedMonth);
  const everyHoliday=calendarEventsForMonth(state,selectedMonth);
  const holidays=showCalendarHolidays?everyHoliday:everyHoliday.filter(x=>x.source!=='calendar'||x.kind==='special');
  const byDate=new Map();
  for(const h of holidays){if(!byDate.has(h.date))byDate.set(h.date,[]);byDate.get(h.date).push(h);}
  let recordedDays=0,recordedEvents=0;
  for(let d=1;d<=days;d++){const date=selectedMonth+'-'+String(d).padStart(2,'0');if(entryExists(date)){recordedDays++;recordedEvents+=eventCount(date);}}
  const cells=Array.from({length:totalCells},(_,i)=>{
    const date=new Date(Date.UTC(year,month-1,1-first+i)).toISOString().slice(0,10);
    const isCurrent=date.startsWith(selectedMonth+'-');
    const events=isCurrent?byDate.get(date)||[]:showCalendarHolidays?calendarEventsOnDate(state,date):calendarEventsOnDate(state,date).filter(h=>h.source!=='calendar'||h.kind==='special');
    return tideCalendarCell(date,isCurrent,events,isCurrent?review:null);
  });
  const weekDays=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const holidayList=holidays.map(h=>`<button type="button" class="tide-cal-agenda-event tide-cal-agenda--${h.kind}" data-date="${esc(h.date)}">
    <span class="tide-cal-agenda-day"><span>${MONTHS[month-1].slice(0,3).toUpperCase()}</span><b>${Number(h.date.slice(-2))}</b></span>
    <span class="tide-cal-agenda-info"><b>${esc(h.name)}</b><span>${h.kind==='birthday'?'🎂 Recurring birthday':h.source==='user'?'Your calendar event':h.kind==='personal'?'Personal milestone':h.kind==='special'?'Featured event':h.kind==='federal'?'U.S. federal holiday':h.kind==='observed'?'Federal holiday observed':'Cultural observance'}</span></span>
    <span class="tide-cal-agenda-arrow" aria-hidden="true">↗</span>
  </button>`).join('');
  root.innerHTML=`${pageHead('Calendar','A clearer view of every day, diary memory, and U.S. holiday.')}
    <div class="tide-calendar-stage theme-${monthNum}">
      <header class="tide-cal-hero">
        <div class="tide-cal-hero-copy"><div class="tide-cal-kicker">YOUR PERSONAL CALENDAR · ${year}</div><h2>${esc(theme.name)}<span>${year}</span></h2><p>${esc(theme.tagline)}</p></div>
        <div class="tide-cal-hero-number" aria-hidden="true">${theme.motif}</div>
      </header>
      <div class="tide-cal-toolbar">
        <div class="tide-cal-month-navigation"><button type="button" id="cal-prev" class="tide-cal-nav" aria-label="Previous month">‹</button>
          <div class="tide-cal-current"><b>${esc(monthLabel(selectedMonth))}</b><small>Sunday through Saturday</small></div>
          <button type="button" id="cal-next" class="tide-cal-nav" aria-label="Next month">›</button></div>
        <div class="tide-cal-controls"><label class="tide-cal-month-chooser">Jump to <input id="cal-jump" type="month" value="${selectedMonth}" min="2020-01" max="2100-12" aria-label="Choose calendar month"></label>
          <button type="button" id="cal-today" class="tide-cal-action">Today</button><button type="button" id="cal-to-otd" class="tide-cal-action tide-cal-action--soft">On This Day</button><button type="button" id="cal-edit-event" class="tide-cal-action tide-cal-action--edit" aria-label="Edit personal calendar events" title="Add or edit calendar events">✎ Events</button></div>
      </div>
      <div class="tide-cal-stat-strip">
        <div><span class="tide-cal-stat-number">${recordedDays}</span><span>DAYS LOGGED</span></div>
        <div><span class="tide-cal-stat-number">${recordedEvents}</span><span>DIARY EVENTS</span></div>
        <div><span class="tide-cal-stat-number">${holidays.length}</span><span>HOLIDAYS & EVENTS</span></div>
        <label class="tide-cal-holidays-toggle"><input id="cal-holidays-toggle" type="checkbox" ${showCalendarHolidays?'checked':''}><span>Show U.S. holidays</span></label>
      </div>
      <div class="tide-cal-grid-wrap"><div class="tide-cal-grid">
        ${weekDays.map((name,i)=>`<div class="tide-cal-weekday ${i===0||i===6?'is-weekend':''}"><span>${name.slice(0,3)}</span><span class="tide-cal-weekday-full">${name.slice(3)}</span></div>`).join('')}
        ${cells.join('')}
      </div></div>
      <div class="tide-cal-legend"><span><i class="legend-today"></i>Today</span><span><i class="legend-diary"></i>Diary entry</span><span><i class="legend-holiday"></i>Holiday / event</span><span><i class="legend-best"></i>Best day</span><span><i class="legend-worst"></i>Worst day</span></div>
      <div class="tide-cal-agenda">
        <div class="tide-cal-agenda-head"><div><span class="tide-cal-eyebrow">DATES WORTH NOTICING</span><h3>On the calendar this month</h3></div><span class="tide-cal-agenda-total">${holidays.length} ${holidays.length===1?'date':'dates'}</span></div>
        ${holidays.length?`<div class="tide-cal-agenda-list">${holidayList}</div>`:'<div class="tide-cal-agenda-empty">No listed holidays or featured events this month. Your diary days are still visible above.</div>'}
        <p class="tide-cal-disclaimer">U.S. federal holidays, federal observed dates, and selected cultural observances are labeled separately. Holiday names do not imply that offices or businesses are closed.</p>
      </div>
    </div>`;
  root.querySelector('#cal-edit-event').onclick=()=>openPersonalCalendarEditor();
  root.querySelector('#cal-prev').onclick=()=>changeMonth(-1);
  root.querySelector('#cal-next').onclick=()=>changeMonth(1);
  root.querySelector('#cal-today').onclick=()=>{selectedMonth=isoToday().slice(0,7);selectedYear=Number(selectedMonth.slice(0,4));render()};
  root.querySelector('#cal-to-otd').onclick=()=>{onThisDayDate=isoToday();setView('on-this-day')};
  root.querySelector('#cal-jump').onchange=e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){selectedMonth=e.target.value;selectedYear=Number(selectedMonth.slice(0,4));render();}};
  root.querySelector('#cal-holidays-toggle').onchange=e=>{showCalendarHolidays=e.target.checked;render()};
  root.querySelectorAll('.tide-calendar-stage [data-date]').forEach(b=>b.onclick=()=>openDay(b.dataset.date));
}
function openPersonalCalendarEditor(editId=''){
  const userEvents=Object.values(state.calendarEvents||{}).filter(e=>!e.deleted).sort((a,b)=>a.date.localeCompare(b.date));
  const editing=state.calendarEvents?.[editId]||null;
  const defaultDate=selectedMonth===isoToday().slice(0,7)?isoToday():selectedMonth+'-01';
  const suggestions=birthdaySuggestions(state);
  if(modal.open)closeModal();
  openModal('Personal Calendar',`
    <p class="small muted">Add birthdays, releases, trips, celebrations or personal milestones. Events save privately and synchronize using your existing T.I.D.E. setup.</p>
    <div class="tide-calendar-event-form">
      <label class="tide-wide">Event name <input id="tide-event-name" class="input" maxlength="110" placeholder="CHAMPIONSHIP CELEBRATION" value="${esc(editing?.name||'')}"></label>
      <label>Date <input id="tide-event-date" type="date" class="input" value="${esc(editing?.date||defaultDate)}"></label>
      <label>Repeat <select id="tide-event-repeat" class="select"><option value="once" ${editing?.repeat!=='yearly'?'selected':''}>One time</option><option value="yearly" ${editing?.repeat==='yearly'?'selected':''}>Every year</option></select></label>
      <label>Category <select id="tide-event-kind" class="select">${['personal','birthday','release','sports','celebration'].map(k=>`<option value="${k}" ${(editing?.kind||'personal')===k?'selected':''}>${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select></label>
      <label>Day theme <select id="tide-event-theme" class="select">${['none','knicks','gold','birthday','thanksgiving','christmas','st-patrick','independence','halloween','new-year','easter'].map(k=>`<option value="${k}" ${(editing?.theme||'none')===k?'selected':''}>${k==='none'?'Yearly default':k.replaceAll('-',' ')}</option>`).join('')}</select></label>
      <label class="tide-wide"><span><input id="tide-event-prefill" type="checkbox" ${editing?.prefill===false?'':'checked'}> Suggest an UPPERCASE diary heading on an empty day</span></label>
      <button type="button" class="button primary tide-wide" id="tide-event-save">${editing?'Save Changes':'Add Calendar Event'}</button>
    </div>
    <div class="section-title">YOUR SAVED EVENTS</div>
    <div class="tide-personal-events">${userEvents.length?userEvents.map(e=>`<div class="tide-personal-event-row"><span><b>${esc(e.name)}</b><small class="muted"> · ${esc(e.date)}${e.repeat==='yearly'?' · yearly':''}</small></span><button type="button" class="button" data-edit-event="${esc(e.id)}">Edit</button><button type="button" class="button" data-delete-event="${esc(e.id)}">Remove</button></div>`).join(''):'<p class="muted small">No custom events yet. Confirmed diary birthdays and milestones are already shown automatically.</p>'}</div>
    ${suggestions.length?`<details class="tide-birthday-suggestions"><summary>Birthday mentions to review (${suggestions.length})</summary><p class="muted small">These are unconfirmed candidates from your diary. Choose one to review before saving.</p>${suggestions.map((e,i)=>`<button type="button" class="button" data-birthday-suggestion="${i}">${esc(e.name)} · ${esc(e.date.slice(5))}</button>`).join('')}</details>`:''}
  `,'PERSONAL DATES · PRIVATE');
  const body=modal.querySelector('#modal-body');
  body.querySelector('#tide-event-save').onclick=()=>{
    try{
      writeCalendarEvent(state,{id:editId||undefined,name:body.querySelector('#tide-event-name').value,date:body.querySelector('#tide-event-date').value,repeat:body.querySelector('#tide-event-repeat').value,kind:body.querySelector('#tide-event-kind').value,theme:body.querySelector('#tide-event-theme').value,prefill:body.querySelector('#tide-event-prefill').checked});
      persist();closeModal();render();toast('Personal calendar event saved.');
    }catch(e){toast(e.message,'bad')}
  };
  body.querySelectorAll('[data-edit-event]').forEach(b=>b.onclick=()=>openPersonalCalendarEditor(b.dataset.editEvent));
  body.querySelectorAll('[data-delete-event]').forEach(b=>b.onclick=()=>{removeCalendarEvent(state,b.dataset.deleteEvent);persist();openPersonalCalendarEditor();toast('Event removed.')});
  body.querySelectorAll('[data-birthday-suggestion]').forEach(b=>b.onclick=()=>{
    const e=suggestions[Number(b.dataset.birthdaySuggestion)];if(!e)return;
    body.querySelector('#tide-event-name').value=e.name;
    body.querySelector('#tide-event-date').value=e.date;
    body.querySelector('#tide-event-repeat').value='yearly';
    body.querySelector('#tide-event-kind').value='birthday';
    body.querySelector('#tide-event-theme').value='none';
  });
}

function changeMonth(delta){let[y,m]=selectedMonth.split('-').map(Number);m+=delta;if(m<1){m=12;y--}if(m>12){m=1;y++}selectedMonth=`${y}-${String(m).padStart(2,'0')}`;selectedYear=y;render()}
function openDay(date){onThisDayDate=date;selectedDate=date;selectedMonth=date.slice(0,7);selectedYear=yearOf(date);setView('today')}

function onThisDayRows(date=isoToday()){const md=date.slice(5);return Object.entries(state.entries||{}).filter(([d,e])=>d.slice(5)===md&&e.text?.trim()).sort((a,b)=>b[0].localeCompare(a[0])).map(([d,e])=>({date:d,year:d.slice(0,4),summary:daySummary(e.text),story:buildStory(e.text,{maxEvents:12})}))}
function otdNearbyRows(date){
  const target=new Date(Date.UTC(2000,Number(date.slice(5,7))-1,Number(date.slice(8,10)))).getTime();
  const year=Number(isoToday().slice(0,4));
  return Object.entries(state.entries||{}).filter(([d,e])=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&e?.text?.trim()&&Number(d.slice(0,4))<=year).map(([d,e])=>{
    const ms=new Date(Date.UTC(2000,Number(d.slice(5,7))-1,Number(d.slice(8,10)))).getTime();
    const delta=Math.round(Math.abs(ms-target)/86400000),distance=Math.min(delta,366-delta);
    return{date:d,distance,summary:daySummary(e.text)};
  }).filter(x=>x.distance>0&&x.distance<=3).sort((a,b)=>a.distance-b.distance||b.date.localeCompare(a.date)).slice(0,4);
}

function onThisDayView(){
  const target=onThisDayDate,rows=onThisDayRows(target),month=target.slice(0,7),theme=monthIdentity(month),monthNum=target.slice(5,7);
  const memories=rows.length,distinctYears=new Set(rows.map(x=>x.year)).size,events=rows.reduce((n,x)=>n+eventCount(x.date),0);
  const featured=rows[0],historical=rows.slice().reverse(),holiday=holidaysOnDate(target),nearby=rows.length?[]:otdNearbyRows(target);
  const fullMonth=MONTHS[Number(monthNum)-1],day=Number(target.slice(-2));
  const timeline=historical.map((row,i)=>{
    const count=eventCount(row.date),parts=splitEvents(entryText(row.date)),yearDistance=Number(isoToday().slice(0,4))-Number(row.year);
    const yearLabel=yearDistance===0?'THIS YEAR':yearDistance>0?`${yearDistance} ${yearDistance===1?'YEAR':'YEARS'} AGO`:'FUTURE ENTRY';
    return `<article class="tide-otd-memory ${row.date===featured?.date?'is-featured':''}">
      <span class="tide-otd-connector" aria-hidden="true"></span><div class="tide-otd-memory-mark"><span>${esc(row.year)}</span></div>
      <div class="tide-otd-memory-body"><div class="tide-otd-memory-top"><span>${esc(yearLabel)}</span><span>${count} ${count===1?'EVENT':'EVENTS'}</span></div>
        <h3>${esc(shortDate(row.date))}</h3>
        <p class="tide-otd-memory-summary">${esc(row.summary)}</p>
        <div class="tide-otd-memory-events">${parts.slice(0,4).map(text=>`<span>${esc(text.slice(0,140))}</span>`).join('')}</div>
        <button type="button" data-otd-date="${esc(row.date)}" class="tide-otd-open">Open this day in your diary <span aria-hidden="true">↗</span></button>
      </div>
    </article>`;
  }).join('');
  const nearMarkup=nearby.map(row=>`<button class="tide-otd-nearby-item" type="button" data-otd-date="${esc(row.date)}"><span>${esc(shortDate(row.date))}</span><b>${esc(row.summary)}</b><span>↗</span></button>`).join('');
  root.innerHTML=`${pageHead('On This Day','Your personal time capsule: compare what happened on the same date across different years.')}
    <div class="tide-otd-stage theme-${monthNum}">
      <div class="tide-otd-hero">
        <div class="tide-otd-hero-copy"><div class="tide-otd-kicker">✦ YOUR TIME CAPSULE</div><p class="tide-otd-hero-month">${esc(fullMonth.toUpperCase())} <span>${target.slice(0,4)}</span></p>
          <div class="tide-otd-date-main"><strong>${day}</strong><span><b>${esc(fullMonth)}</b><small>What were you doing on this date?</small></span></div>
          <p>One day on the calendar. A whole collection of years, moments and memories.</p>
          ${holiday.length?`<div class="tide-otd-holidays">${holiday.map(h=>`<span>${esc(h.name)}</span>`).join('')}</div>`:''}
        </div><div class="tide-otd-art" aria-hidden="true"><span class="tide-otd-art-orbit"></span><span class="tide-otd-art-year">${esc(target.slice(0,4))}</span><span class="tide-otd-art-star">✦</span></div>
      </div>
      <div class="tide-otd-toolbar"><div class="tide-otd-navigation">
        <button class="tide-otd-nav" type="button" id="otd-prev" aria-label="Previous date">‹</button>
        <div class="tide-otd-nav-title"><b>${esc(shortDate(target))}</b><span>Same date, different years</span></div>
        <button class="tide-otd-nav" type="button" id="otd-next" aria-label="Next date">›</button>
        </div><div class="tide-otd-toolbar-actions"><label>Jump to date <input id="otd-date-picker" type="date" value="${esc(target)}" aria-label="Choose a date for On This Day"></label><button id="otd-today" type="button">Today's date</button></div></div>
      <div class="tide-otd-stats"><div><b>${memories}</b><span>MEMORIES</span></div><div><b>${distinctYears}</b><span>YEARS FEATURED</span></div><div><b>${events}</b><span>RECORDED EVENTS</span></div></div>
      <div class="tide-otd-main">
        <div class="tide-otd-section-heading"><div><span>THROUGH THE YEARS</span><h2>${memories?'Your personal timeline':'A blank page in your timeline'}</h2></div><small>${memories?`${memories} saved ${memories===1?'entry':'entries'} for ${esc(fullMonth)} ${day}`:'Explore another date or start a memory'}</small></div>
        ${memories?`<div class="tide-otd-timeline">${timeline}</div>`:`<section class="tide-otd-empty">
          <div class="tide-otd-empty-symbol" aria-hidden="true">✧</div><h3>No diary memories on this exact date yet</h3>
          <p>That's part of the story, too. Save a memory for this date, or travel to another day to discover more.</p>
          <button type="button" id="otd-open-target">Open ${esc(shortDate(target))} in my diary ↗</button>
        </section>
        ${nearby.length?`<section class="tide-otd-nearby"><div class="tide-otd-nearby-head"><h3>Close to this day</h3><p>Real diary notes within three calendar days, clearly separated from exact-date matches.</p></div>${nearMarkup}</section>`:''}`}
      </div>
      <div class="tide-otd-footnote">Each timeline card comes from an actual saved diary entry. Changing the date explores the same month and day across years; nothing here is generated or invented.</div>
    </div>`;
  root.querySelector('#otd-prev').onclick=()=>{onThisDayDate=shiftDay(target,-1);render()};
  root.querySelector('#otd-next').onclick=()=>{onThisDayDate=shiftDay(target,1);render()};
  root.querySelector('#otd-today').onclick=()=>{onThisDayDate=isoToday();render()};
  root.querySelector('#otd-date-picker').onchange=e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){onThisDayDate=e.target.value;render();}};
  const open=root.querySelector('#otd-open-target');if(open)open.onclick=()=>openDay(target);
  root.querySelectorAll('.tide-otd-stage [data-otd-date]').forEach(b=>b.onclick=()=>openDay(b.dataset.otdDate));
}

function monthOptions(current){const years=[...new Set([2024,2025,2026,Number(isoToday().slice(0,4)),...Object.keys(state.entries||{}).map(d=>Number(d.slice(0,4)))])].sort();return years.flatMap(y=>MONTHS.map((m,i)=>{const k=`${y}-${String(i+1).padStart(2,'0')}`;return `<option value="${k}" ${k===current?'selected':''}>${m} ${y}</option>`})).join('')}
function activeMonthTrackers(month){return LIFE_TRACKER_IDS.map(id=>trackerDefinition(state,id))}
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

function healthReportMarkup(scope={},title='Health & Activity'){
  const report=healthPeriod(state,scope),metrics=report.metrics,sleep=metrics.sleepHours;
  const source=state.healthActivity?.source||'Private import';
  const dayLink=(item,key)=>item?`<button type="button" class="health-date-link" data-health-day="${esc(item.date)}">${esc(shortDate(item.date))} · ${esc(formatHealth(key,item.value))} ↗</button>`:'<span class="muted">No dated record</span>';
  const monthText=(item,key)=>item?`${monthLabel(item.month)} · ${formatHealth(key,key==='sleepHours'?item.average:item.total)}${key==='sleepHours'?` · ${item.days} recorded nights`:''}`:'No qualifying month';
  const cards=['steps','distanceMiles','exerciseMinutes','activeCalories','standMinutes','workouts'].map(key=>{
    const metric=metrics[key],value=metric.days?formatHealth(key,metric.total):'—';
    return `<article class="health-metric-card"><div class="health-metric-label">${esc(metricLabel(key))}</div><strong>${esc(value)}</strong><small>${metric.days} recorded ${metric.days===1?'day':'days'}</small>
      <div class="health-record-detail"><span>BEST DAY</span>${dayLink(metric.best,key)}</div>
      <div class="health-record-detail"><span>BEST MONTH · TOTAL</span><b>${esc(monthText(metric.bestMonth,key))}</b></div></article>`;
  }).join('');
  return `<section class="card health-section">
    <div class="health-section-head"><div><span class="health-eyebrow">PRIVATE APPLE HEALTH DATA</span><h2>${esc(title)}</h2><p>Imported daily records are kept private. Activity and sleep coverage can differ between years.</p></div><button type="button" class="button health-manage" data-health-settings>Import / Sync</button></div>
    <div class="health-sleep-feature"><div class="health-sleep-highlight"><span class="health-eyebrow">AVERAGE SLEEP PER RECORDED NIGHT</span><strong>${sleep.days?formatHealth('sleepHours',sleep.average):'—'}</strong><small>${sleep.days} nights with recorded sleep · not hours divided by calendar days</small></div>
      <div class="health-sleep-highs"><div><span>LONGEST RECORDED NIGHT</span>${dayLink(sleep.best,'sleepHours')}</div><div><span>BEST SLEEP MONTH · HIGHEST NIGHTLY AVERAGE</span><b>${esc(monthText(sleep.bestMonth,'sleepHours'))}</b></div></div></div>
    <div class="health-metric-grid">${cards}</div>
    <p class="health-footnote">Sleep averages use nights with data only. Best sleep month requires at least 7 recorded nights. Missing Health data is shown as —, never as zero. Source: ${esc(source)}. ${report.lastDate?'Most recent imported day: '+esc(shortDate(report.lastDate))+'.':''}</p>
  </section>`;
}

function healthYearComparisonMarkup(selectedYear=Number(isoToday().slice(0,4))){
  // Year reviews must never include years later than the chosen year.
  const from=2024,to=Math.max(from,Number(selectedYear)||from),years=Array.from({length:to-from+1},(_,i)=>from+i);
  const reports=yearlyHealthOverview(state,years);
  return `<section class="health-year-comparison"><div class="health-eyebrow">SLEEP BY YEAR · HOURS PER RECORDED NIGHT</div><div class="health-year-comparison-grid">${reports.map(x=>`<div class="health-year-avg"><span>${x.year}</span><strong>${x.metrics.sleepHours.days?formatHealth('sleepHours',x.metrics.sleepHours.average):'—'}</strong><small>${x.metrics.sleepHours.days} recorded nights</small></div>`).join('')}</div></section>`;
}

function financeView(){
 root.innerHTML=pageHead('Finances','A private view of your bank history, scheduled charges, cash-flow records and what-if projections.')+financeHubMarkup(state,{tab:financeTab,group:financeGroup,year:financeYear,search:financeSearch,whatIf:financeWhatIf});
 root.querySelectorAll('[data-fin-tab]').forEach(b=>b.onclick=()=>{financeTab=b.dataset.finTab;render()});
 root.querySelectorAll('[data-fin-group]').forEach(b=>b.onclick=()=>{financeGroup=b.dataset.finGroup;render()});
 const year=root.querySelector('#fin-year');if(year)year.onchange=()=>{financeYear=Number(year.value);render()};
 const purchase=root.querySelector('#fin-whatif-form');if(purchase)purchase.onsubmit=e=>{e.preventDefault();financeWhatIf=Math.max(0,Number(root.querySelector('#fin-whatif-value').value)||0);render()};
 const filtering=root.querySelector('#fin-transactions-form');if(filtering)filtering.onsubmit=e=>{e.preventDefault();financeSearch=root.querySelector('#fin-transactions-search').value;render()};
 root.querySelectorAll('[data-fin-add-schedule]').forEach(b=>b.onclick=()=>openFinanceScheduleEditor());
 root.querySelectorAll('[data-fin-del-schedule]').forEach(b=>b.onclick=()=>{deleteFinanceSchedule(state,b.dataset.finDelSchedule);persist();render();toast('Scheduled item removed.')});
 const form=root.querySelector('#fin-ask-form'),output=root.querySelector('#fin-ask-output'),input=root.querySelector('#fin-ask-question');
 const search=q=>{
  const answer=askFinance(state,q,{today:isoToday()});
  if(!answer||!output)return;
  output.innerHTML=`<div class="insight-search-answer"><span>${esc(answer.heading||'FINANCIAL RECORD')}</span><strong>${esc(answer.primary)}</strong><p>${esc(answer.detail||'')}</p>${answer.date?`<button class="insight-open-day" type="button" data-insight-open-day="${esc(answer.date)}">Open ${esc(shortDate(answer.date))} ↗</button>`:''}</div>`;
 };
 if(form)form.onsubmit=e=>{e.preventDefault();search(input.value.trim())};
 root.querySelectorAll('[data-fin-suggest]').forEach(b=>b.onclick=()=>{input.value=b.dataset.finSuggest;search(input.value)});
}

function healthView(){
 root.innerHTML=pageHead('Health','Explore your recorded sleep, exercise, steps, workouts, activity rings and migraine patterns.')+healthHubMarkup(state,{tab:healthTab,period:healthRange,month:healthMonth,year:healthYear});
 root.querySelectorAll('[data-health-tab]').forEach(b=>b.onclick=()=>{healthTab=b.dataset.healthTab;render()});
 root.querySelectorAll('[data-health-period]').forEach(b=>b.onclick=()=>{healthRange=b.dataset.healthPeriod;render()});
 const m=root.querySelector('#health-month');if(m)m.onchange=()=>{if(/^\d{4}-\d{2}$/.test(m.value))healthMonth=m.value;render()};
 const y=root.querySelector('#health-year');if(y)y.onchange=()=>{healthYear=Number(y.value);render()};
}

function openFinanceScheduleEditor(){
 if(modal.open)closeModal();
 const f=ensureFinances(state);
 openModal('Add a financial event',`<p class="small muted">This is a planning entry, not a bank charge. It does not alter real balances. Add a confirmed future bill or expected deposit to your conditional runway.</p>
 <div class="tide-calendar-event-form" style="margin-top:16px">
 <label class="tide-wide">Description <input class="input" id="fin-schedule-name" maxlength="100" placeholder="Monthly subscription"></label>
 <label>Amount (USD) <input class="input" id="fin-schedule-amount" type="number" min="0" max="1000000" step=".01" placeholder="15.00"></label>
 <label>Next expected date <input class="input" id="fin-schedule-date" type="date" value="${isoToday()}"></label>
 <label>Repeats <select class="select" id="fin-schedule-repeat">${['once','weekly','monthly','yearly'].map(v=>`<option value="${v}" ${v==='monthly'?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>Direction <select class="select" id="fin-schedule-direction"><option value="outflow">Money going out</option><option value="inflow">Money coming in</option></select></label>
 <label class="tide-wide">Account <select class="select" id="fin-schedule-account">${Object.values(f.accounts).map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>
 <button id="fin-schedule-save" class="button primary tide-wide" type="button">Save Planning Event</button>
 </div>`,'FINANCES · PRIVATE SCHEDULE');
 const body=modal.querySelector('#modal-body');
 body.querySelector('#fin-schedule-save').onclick=()=>{
  try{
   upsertFinanceSchedule(state,{name:body.querySelector('#fin-schedule-name').value,amount:Number(body.querySelector('#fin-schedule-amount').value),nextDate:body.querySelector('#fin-schedule-date').value,frequency:body.querySelector('#fin-schedule-repeat').value,direction:body.querySelector('#fin-schedule-direction').value,accountId:body.querySelector('#fin-schedule-account')?.value||''});
   persist();closeModal();render();toast('Planning event saved.');
  }catch(e){toast(e.message,'bad')}
 };
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
      <div class="section-title">HEALTH & ACTIVITY · ${esc(period)}</div>
      ${healthReviewMarkup(state,{month})}
      <div class="section-title">YOUR MONEY · ${esc(period)}</div>
      ${financeReviewMarkup(state,{month})}
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
      <div class="section-title">DIARY INTELLIGENCE · THIS MONTH</div>
      ${diaryInsightPanel({month},"A fuller picture of this month")}
      <div class="section-title">MONTHLY TRACKERS</div>
      <div class="month-trackers-grid">${trackers.length?trackers.map(t=>{const v=trackerTotal(state,t.id,{month});return`<div class="month-tracker-card"><div class="stat-label">${esc(t.name)}</div><div class="month-tracker-value">${fmt(v)}</div><div class="month-tracker-detail">${t.id==='gaming-sessions'?'Dated diary play starts · repeated plays count; continuations do not':t.id==='editing-events'?'Explicit editing mentions in the diary':t.id==='social-days'?'Days with social diary activity':legacyTrackerTotal(state,t.id,month)!=null?'Includes imported monthly totals':'Tracked occurrences'}</div></div>`}).join(""):'<div class="card muted small">No tracked events have been recorded for this month.</div>'}</div>
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
  "/awards/activity-trophy.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" role=\"img\" aria-label=\"Top activity trophy\">\n<defs><linearGradient id=\"year-activity-trophy-bg\" x1=\"0\" y1=\"1\" x2=\"1\" y2=\"0\"><stop stop-color=\"#154256\"/><stop offset=\"1\" stop-color=\"#2a4167\"/></linearGradient><linearGradient id=\"year-activity-trophy-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#c8fff1\"/><stop offset=\".6\" stop-color=\"#75d8ed\"/><stop offset=\"1\" stop-color=\"#a4a5ff\"/></linearGradient></defs>\n<rect width=\"256\" height=\"256\" rx=\"43\" fill=\"url(#year-activity-trophy-bg)\"/><circle cx=\"127\" cy=\"112\" r=\"95\" fill=\"#7fe4ef\" fill-opacity=\".07\"/>\n<path d=\"M84 68h88v58c0 31-20 51-44 51s-44-20-44-51Z\" fill=\"url(#year-activity-trophy-metal)\" stroke=\"#e9fffe\" stroke-width=\"3\"/><path d=\"M84 84H57v22c0 26 17 42 41 41M172 84h27v22c0 26-17 42-41 41\" fill=\"none\" stroke=\"#9deaf3\" stroke-width=\"11\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>\n<path d=\"m128 89 11 22 24 3-17.5 17.5 4.5 25-22-12-22 12 4.5-25L93 114l24-3Z\" fill=\"#1d5674\" opacity=\".72\"/>\n<path d=\"M128 177v19m-29 12h58\" stroke=\"#b5f6fa\" stroke-width=\"11\" stroke-linecap=\"round\"/><path d=\"M83 219h90\" stroke=\"#a5b4fd\" stroke-width=\"10\" stroke-linecap=\"round\"/><circle cx=\"208\" cy=\"58\" r=\"4\" fill=\"#95f9ef\"/><circle cx=\"45\" cy=\"185\" r=\"4\" fill=\"#f9b3df\"/></svg>",
  "/awards/steps-record.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><defs><linearGradient id=\"stb\" x2=\"1\" y2=\"1\"><stop stop-color=\"#133d45\"/><stop offset=\"1\" stop-color=\"#41476d\"/></linearGradient><linearGradient id=\"sts\"><stop stop-color=\"#e3fff4\"/><stop offset=\"1\" stop-color=\"#7fd4dc\"/></linearGradient></defs><rect width=\"256\" height=\"256\" rx=\"42\" fill=\"url(#stb)\"/><circle cx=\"208\" cy=\"45\" r=\"72\" fill=\"#8ce9d8\" opacity=\".11\"/><path d=\"M58 178c-8-21-2-35 24-53l23-13 19 20c20 18 38 21 64 28 18 4 27 14 25 30-2 17-17 22-37 22H88c-15 0-27-10-30-34Z\" fill=\"url(#sts)\" stroke=\"#e9ffff\" stroke-width=\"3\"/><path d=\"M110 134l-18 24m34-18-19 25m35-14-17 22\" stroke=\"#427681\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M65 191h143\" stroke=\"#347785\" stroke-width=\"8\" stroke-linecap=\"round\"/><path d=\"M56 63h63M58 80h47M58 97h26\" stroke=\"#9cece5\" stroke-width=\"8\" stroke-linecap=\"round\"/></svg>",
  "/awards/sleep-record.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><defs><linearGradient id=\"slb\" x2=\"1\" y2=\"1\"><stop stop-color=\"#1d2453\"/><stop offset=\"1\" stop-color=\"#41386f\"/></linearGradient><linearGradient id=\"slm\"><stop stop-color=\"#fff7d8\"/><stop offset=\"1\" stop-color=\"#9db8ff\"/></linearGradient></defs><rect width=\"256\" height=\"256\" rx=\"42\" fill=\"url(#slb)\"/><circle cx=\"128\" cy=\"120\" r=\"95\" fill=\"#c1c5ff\" opacity=\".06\"/><path d=\"M160 38c-40 21-59 57-46 94 11 35 41 57 78 55-18 24-48 34-79 26-46-11-73-54-62-98 12-47 59-79 109-77Z\" fill=\"url(#slm)\"/><g fill=\"#bccfff\"><path d=\"m178 69 6 12 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2Z\"/><circle cx=\"205\" cy=\"147\" r=\"8\"/><circle cx=\"193\" cy=\"195\" r=\"5\"/><circle cx=\"81\" cy=\"56\" r=\"4\"/></g></svg>",
  "/awards/income-record.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\"><defs><linearGradient id=\"mb\" x2=\"1\" y2=\"1\"><stop stop-color=\"#3d2817\"/><stop offset=\"1\" stop-color=\"#245056\"/></linearGradient><linearGradient id=\"mg\"><stop stop-color=\"#fff3c1\"/><stop offset=\".55\" stop-color=\"#edbf67\"/><stop offset=\"1\" stop-color=\"#c39148\"/></linearGradient></defs><rect width=\"256\" height=\"256\" rx=\"42\" fill=\"url(#mb)\"/><circle cx=\"206\" cy=\"46\" r=\"83\" fill=\"#f5ca86\" opacity=\".08\"/><rect x=\"37\" y=\"80\" width=\"182\" height=\"117\" rx=\"19\" fill=\"#244648\" stroke=\"#d4aa6b\" stroke-width=\"4\"/><rect x=\"49\" y=\"91\" width=\"159\" height=\"94\" rx=\"12\" fill=\"url(#mg)\"/><circle cx=\"127\" cy=\"138\" r=\"37\" fill=\"#dba958\" stroke=\"#a17541\" stroke-width=\"3\"/><path d=\"M136 119c-12-9-28-6-28 8 0 16 36 7 36 22 0 15-26 21-40 6M126 105v65\" fill=\"none\" stroke=\"#fff5cb\" stroke-width=\"8\" stroke-linecap=\"round\"/><path d=\"m186 48 5 12 14 2-10 10 3 14-12-7-12 7 2-14-10-10 14-2Z\" fill=\"#ffe6aa\"/></svg>"

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
  const healthRecords=healthPeriod(state,{year:y}).metrics;
  const stepChampion=healthRecords.steps.best,sleepChampion=healthRecords.sleepHours.best;
  const financialYear=financePeriod(state,{year:y}),receiptChampion=financialYear.highestReceiptDay;
  const gameHours=game?`${Math.floor(game.minutes/60).toLocaleString("en-US")}h ${Math.round(game.minutes%60)}m recorded`:"Waiting for dated gaming data";
  return `<div class="year-awards-grid">
    ${yearAwardCard("day","Best day of the year",bestDay?shortDate(bestDay):"Awaiting your pick",bestDay&&entryExists(bestDay)?daySummary(entryText(bestDay)):"Your personal highlight of the year","/awards/best-day.svg","✷","Chosen by you")}
    ${yearAwardCard("month","Best month of the year",bestMonth>=1&&bestMonth<=12?MONTHS[bestMonth-1]:"Awaiting your pick",bestMonth>=1&&bestMonth<=12?`${y} · Your favorite chapter`:"Choose your best month below","/awards/best-month.svg","✦","Chosen by you")}
    ${yearAwardCard("activity","Top activity",topActivity?.[0]||"No activity yet",topActivity?`${fmt(topActivity[1])} recognized events`:"Save diary entries to build rankings",topActivity?.[0]==="Gaming"?"/awards/gaming-controller.svg":"/awards/activity-trophy.svg","◇","From your diary")}
    ${yearAwardCard("song","Song of the year",song?.name||(failed?"Music unavailable":musicStatus),song?`${song.artist||"Artist unavailable"} · ${fmt(song.streams)} streams`:musicStatus,song?.image,"♫","stats.fm · actual streams")}
    ${yearAwardCard("artist","Artist of the year",artist?.name||(failed?"Music unavailable":musicStatus),artist?`${fmt(artist.streams)} streams`:musicStatus,artist?.image,"♬","stats.fm · actual streams")}
    ${yearAwardCard("game","Video game of the year",game?.title||"No yearly leader yet",gameHours,game?.title?.trim().toLowerCase()==="the crew motorfest"?"/awards/crew-motorfest.jpg":game?.image,"🎮",gamePartial?"Known playtime · partial coverage":"Most played · yearly hours")}

    ${yearAwardCard("steps","Best exercise day",stepChampion?shortDate(stepChampion.date):"No step day recorded",stepChampion?`${fmt(Math.round(stepChampion.value))} steps · highest in ${y}`:"Import dated Apple Health steps","/awards/steps-record.svg","👟",stepChampion?"Highest recorded daily steps · Apple Health":"Recorded health data required")}
    ${yearAwardCard("sleep","Longest sleep night",sleepChampion?shortDate(sleepChampion.date):"No recorded sleep",sleepChampion?`${Number(sleepChampion.value).toFixed(2)} hours slept`:"Import dated Apple Health sleep","/awards/sleep-record.svg","🌙",sleepChampion?"Actual asleep stages · waking date":"No measured nights for this year")}
    ${yearAwardCard("income","Biggest money received day",receiptChampion?shortDate(receiptChampion.date):"No dated bank receipts",receiptChampion?`${moneyText(receiptChampion.receipts)} received on this date`:"Import private posted financial history","/awards/income-record.svg","💰",receiptChampion?"Posted receipts · deposits may not be earned income":"Private financial import required")}
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

function favoriteDaysPanel(year){
  const dates=favoriteDays(state,year),suggestion=favoriteDaysSuggestion(state,year);
  return `<section class="card tide-favorite-panel"><div class="card-header"><div><span class="tide-favorite-eyebrow">✦ THE FIVE DATES THAT DEFINED ${year}</span><h2>Your Favorite Days</h2><p class="small muted">Your personal ranking, not calculated scores. #1 is your favorite day of the year.</p></div><button class="button" type="button" data-edit-favorites="${year}">✎ Edit Top Five</button></div>
  ${dates.length?dates.map((date,i)=>`<div class="tide-favorite-row"><span>#${i+1}</span><div><b>${esc(shortDate(date))}</b><p class="small muted">${esc(entryExists(date)?daySummary(entryText(date)):'Your personal choice')}</p></div><button type="button" class="button tide-record-open" data-personal-day="${esc(date)}">Open diary ↗</button></div>`).join(''):`<div class="tide-favorite-empty">No ranked days yet. ${suggestion?'Your diary suggests '+shortDate(suggestion.date)+' as a candidate, but you choose.':''}</div>`}
  ${dates.length<5?`<p class="small muted">${5-dates.length} available places remain.</p>`:''}</section>`;
}

function favoriteDaysByYearPanel(){
  return `<div class="tide-favorites-history">${yearsWithFavoriteDays(state,Number(isoToday().slice(0,4))).map(year=>favoriteDaysPanel(year)).join('')}</div>`;
}

function openFavoriteDaysEditor(year){
  const dates=favoriteDays(state,year),suggestion=favoriteDaysSuggestion(state,year);
  if(modal.open)closeModal();
  openModal(`Top Five Days · ${year}`,`<p class="muted small">Select up to five unique dates from ${year}. Your first choice is your favorite day. Move dates with the arrows and save when finished.</p>
  <div id="tide-fav-inputs">${Array.from({length:5},(_,i)=>`<div class="tide-fav-editor-row"><b>#${i+1}</b><input type="date" class="input tide-fav-date" min="${year}-01-01" max="${year}-12-31" value="${esc(dates[i]||'')}" aria-label="Favorite day rank ${i+1}"><div class="tide-fav-move"><button type="button" class="button tide-fav-up" data-position="${i}" ${i===0?'disabled':''}>↑</button><button type="button" class="button tide-fav-down" data-position="${i}" ${i===4?'disabled':''}>↓</button></div></div>`).join('')}</div>
  ${suggestion?`<p class="small muted">Diary candidate: ${esc(shortDate(suggestion.date))}. ${esc(suggestion.reason)}</p><button class="button" type="button" id="tide-use-day-suggestion">Use as #1 candidate</button>`:''}
  <div class="filter-row" style="margin-top:17px"><button type="button" id="tide-save-favorites" class="button primary">Save Favorite Days</button></div>`,'YOUR PERSONAL RANKINGS');
  const body=modal.querySelector('#modal-body'),fields=[...body.querySelectorAll('.tide-fav-date')];
  const swap=(i,j)=>{const val=fields[i].value;fields[i].value=fields[j].value;fields[j].value=val};
  body.querySelectorAll('.tide-fav-up').forEach(b=>b.onclick=()=>swap(Number(b.dataset.position),Number(b.dataset.position)-1));
  body.querySelectorAll('.tide-fav-down').forEach(b=>b.onclick=()=>swap(Number(b.dataset.position),Number(b.dataset.position)+1));
  const candidate=body.querySelector('#tide-use-day-suggestion');if(candidate)candidate.onclick=()=>{fields[0].value=suggestion.date};
  body.querySelector('#tide-save-favorites').onclick=()=>{
    try{
      saveFavoriteDays(state,year,fields.map(f=>f.value).filter(Boolean));
      persist();closeModal();render();toast(`${year} favorite days saved.`);
    }catch(e){toast(e.message,'bad')}
  };
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
  root.innerHTML=`${pageHead(`${y} · Year in Review`,"The year's standout moments, music, gaming, and memories, presented like a personal awards night.",`<select id="year-select" class="select" aria-label="Select year">${[...Array.from({length:Math.max(4,Number(isoToday().slice(0,4))-2023)},(_,i)=>2024+i),...Object.keys(state.entries||{}).map(d=>yearOf(d))].filter((x,i,a)=>a.indexOf(x)===i).sort().map(x=>`<option ${x===y?"selected":""}>${x}</option>`).join("")}</select>`)}
    <div class="year-awards-intro"><div><div class="year-awards-eyebrow">✦ THE ${y} HONORS ✦</div><h2>The highlights that defined your year</h2><p>Nine headline awards: your original six, plus steps, sleep and money received.</p></div><span class="year-awards-trophy" aria-hidden="true">✧</span></div>
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
    <div class="section-title">YOUR FIVE FAVORITE DAYS · ${y}</div>
    ${favoriteDaysPanel(y)}
    <div class="section-title">YOUR FIVE TRACKERS · ${y}</div>
    <div class="year-side-stats year-current-tracker-stats">${LIFE_TRACKER_IDS.map(id=>`<div class="year-side-stat"><div class="stat-label">${esc(trackerDefinition(state,id).name)} · ${y}</div><b>${fmt(trackerTotal(state,id,{year:y}))}</b></div>`).join('')}</div>
    <div class="section-title">HEALTH & ACTIVITY · ${y}</div>
    ${healthReviewMarkup(state,{year:y})}
    <div class="section-title">FINANCIAL YEAR IN REVIEW · ${y}</div>
    ${financeReviewMarkup(state,{year:y})}
    ${healthYearComparisonMarkup(y)}
    <div class="section-title">GEOGUESSR · RECORD BOOK</div>
    <div class="records-grid year-geo-records">
      <div class="record-card"><div class="stat-label">Longest Daily Challenge Streak</div><div class="record-value">${dc.longest} days</div><div class="record-detail">${dc.longestStart?`${shortDate(dc.longestStart)} → ${shortDate(dc.longestEnd)}`:"No streak data yet."}</div></div>
      <div class="record-card"><div class="stat-label">Current Daily Challenge</div><div class="record-value">${dc.active?dc.current:0}</div><div class="record-detail">${dc.active?"Active":"Inactive"}</div></div>
      <div class="record-card"><div class="stat-label">Geoguessr 10K Record</div><div class="record-value">${geo?fmt(geo.value):"—"}</div><div class="record-detail">${geo?shortDate(geo.date):"No data yet."}</div></div>
    </div>
    <div class="section-title">TOP FIVE ACTIVITIES</div>
    <section class="card year-detail-list">${acts.length?acts.map(([a,n],i)=>`<div class="detected-item"><span><span class="year-rank-num">${String(i+1).padStart(2,"0")}</span> ${esc(a)}</span><b>${fmt(n)}</b></div>`).join(""):'<div class="muted">Import or save diary days to build activity stats.</div>'}</section>
    <div class="section-title">DIARY INTELLIGENCE · THIS YEAR</div>
    ${diaryInsightPanel({year:y},"More than just a year of gaming")}
    <div class="section-title">YOUR YEAR IN MUSIC</div>
    <section class="card year-music-detail"><div class="card-header"><div><h2>Top Songs, Artists & Albums</h2><div class="small muted">Real stats.fm streams and original artwork. Your award winners appear above.</div></div>${button("Refresh music","refresh-year-music")}</div><div id="year-music">${cached?renderMusicSections(cached):'<div class="muted small">Loading music…</div>'}</div></section>`;
  root.querySelector("#year-select").onchange=e=>{selectedYear=Number(e.target.value);selectedMonth=String(selectedYear)+selectedMonth.slice(4);render()};
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

function trackerViewIcon(kind,status){
  const shapes={
    streak:'<path d="M12 3c2 4 6 5 6 11a6 6 0 0 1-12 0c0-3.4 1.8-5.8 4-8 .1 3 1 4.4 2 5 .7-2 .6-5 0-8Z"/><path d="M12 20c-2 0-3.5-1.4-3.5-3.4 0-1.5 1.2-2.7 2.7-4 .2 1.6.8 2.2 1.8 3.2.3-.9.5-1.4.6-2.1 1 1.2 1.9 2.1 1.9 3A3.4 3.4 0 0 1 12 20Z"/>',
    versus:'<path d="M7 4h10v7a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4M12 16v5m-4 0h8"/>',
    record:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    event:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8m-4-4v8"/>',
    retired:'<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M3 6h18V3H3v3Zm6 6h6"/>'
  };
  return `<svg class="trk-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[status==='retired'?'retired':kind]||shapes.event}</svg>`;
}

function showReadOnlyTracker(id){
  const t=trackerDefinition(state,id),auto=AUTO_TRACKER_IDS.has(id),rows=(id==='apartment-collisions'?[...occurrencesFor(state,'apartment-collisions'),...occurrencesFor(state,'collision-count')]:occurrencesFor(state,id)).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const note=id==='gaming-sessions'?"Each distinct time you wrote that you played a game counts as one diary session. Played again counts another, but continued playing does not. Sessions from 2024 onward are reconstructed from saved diary entries; gaming account refreshes track hours separately.":
    id==='editing-events'?'Counts explicit diary editing activity mentions, one per separate diary segment. Existing notes are included.':
    id==='social-days'?'One date with social diary activity counts as one day, even if multiple conversations are mentioned.':
    'Historical GTA Online counter. Original totals are preserved, with tracking ending November 19, 2026.';
  const history=rows.length?rows.slice(0,120).map(r=>{
    const validTime=id!=='gaming-sessions'&&Number.isFinite(Date.parse(r.capturedAt||''));
    const time=validTime?new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/New_York'}).format(new Date(r.capturedAt)):'';
    return `<div class="history-row"><div class="history-date">${shortDate(r.date)}${time?` · ${esc(time)} detected`:''}</div><div class="history-text">${esc(r.snippet||'Recorded event')}</div><b>+${fmt(r.count||1)}</b></div>`;
  }).join(''):'<div class="muted">No exact dated events available. Imported totals may still be included above.</div>';
  const html=`<div class="grid grid-3">
    <div class="record-card"><div class="stat-label">This Month</div><div class="record-value">${fmt(trackerTotal(state,id,{month:selectedMonth}))}</div></div>
    <div class="record-card"><div class="stat-label">${selectedYear}</div><div class="record-value">${fmt(trackerTotal(state,id,{year:selectedYear}))}</div></div>
    <div class="record-card"><div class="stat-label">All Time</div><div class="record-value">${fmt(trackerTotal(state,id))}</div></div>
  </div><p class="small muted" style="margin-top:15px;line-height:1.65">${esc(note)}</p><div class="section-title">${auto?'AUTOMATIC SOURCE HISTORY':'GTA ONLINE · HISTORICAL RECORDS'}</div><div class="history-list">${history}</div>`;
  openModal(t.name,html,auto?'AUTOMATIC TRACKER':'HISTORICAL TRACKER');
}

function trackersView(){
  const defs=[...LIFE_TRACKER_IDS,...ARCHIVED_GTA_IDS].map(id=>trackerDefinition(state,id));
  const active=defs.filter(t=>t.status!=='retired'),archived=defs.filter(t=>t.status==='retired');
  const monthWithEvents=active.filter(t=>t.kind==='event'&&trackerTotal(state,t.id,{month:selectedMonth})>0).length;
  const rows=defs.map(t=>{
    const month=trackerTotal(state,t.id,{month:selectedMonth}),year=trackerTotal(state,t.id,{year:selectedYear}),all=trackerTotal(state,t.id);
    const status=t.status==='retired'?'retired':t.status==='intermittent'?'intermittent':'active';
    return `<article class="tracker-row trk-ledger-row trk-ledger-row--${status} ${AUTO_TRACKER_IDS.has(t.id)?'trk-ledger-auto':''}" data-trk-status="${status}" data-trk-name="${esc(t.name.toLowerCase())}">
      <div class="tracker-name trk-ledger-name">
        <span class="trk-ledger-icon trk-ledger-icon--${status}">${trackerViewIcon(t.kind,status)}</span>
        <span class="trk-ledger-name-text"><b>${esc(t.name)}</b><span class="tracker-status"><span class="trk-status-dot"></span>${status==='retired'?'Historical / retired':AUTO_TRACKER_IDS.has(t.id)?'Automatic · '+'diary analysis':'Active · saved occurrences'}</span></span>
      </div>
      <div class="trk-ledger-metric"><div class="stat-label">Month</div><b>${fmt(month)}</b></div>
      <div class="trk-ledger-metric"><div class="stat-label">${selectedYear}</div><b>${fmt(year)}</b></div>
      <div class="trk-ledger-metric"><div class="stat-label">All Time</div><b>${fmt(all)}</b></div>
      <button type="button" class="button trk-ledger-action" data-tracker="${esc(t.id)}">${AUTO_TRACKER_IDS.has(t.id)||status==='retired'?'View history':'View / Add'} <span aria-hidden="true">↗</span></button>
    </article>`;
  }).join('');
  root.innerHTML=`${pageHead('Trackers','Your ongoing streaks, event records, and personal history in one place.')}
  <div class="trk-page">
    <header class="trk-hero">
      <div class="trk-hero-copy"><span class="trk-eyebrow">✦ YOUR NUMBERS · YOUR HISTORY</span>
        <h2>Every milestone <em>counts.</em></h2>
        <p>Five main trackers: reported gaming sessions, editing activities, social days, migraines, and Hong Kong spawns.</p>
        <div class="trk-hero-note"><span aria-hidden="true">✧</span> Five active trackers · three preserved GTA Online archives</div>
      </div>
      <div class="trk-hero-art" aria-hidden="true">
        <span class="trk-hero-ring trk-hero-ring--one"></span><span class="trk-hero-ring trk-hero-ring--two"></span>
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m8 24 10 10 22-22"/><circle cx="24" cy="24" r="21" stroke-width="1.2" opacity=".3"/></svg>
      </div>
    </header>
    <section class="trk-dashboard-stats" aria-label="Tracker overview">
      <div class="trk-dashboard-stat trk-dashboard-stat--active"><div class="trk-stat-top"><span>IN USE</span><span class="trk-stat-mark" aria-hidden="true">↗</span></div><strong>${fmt(active.length)}</strong><small>Active and event-based trackers</small></div>
      <div class="trk-dashboard-stat trk-dashboard-stat--archive"><div class="trk-stat-top"><span>HISTORICAL</span><span class="trk-stat-mark" aria-hidden="true">◷</span></div><strong>${fmt(archived.length)}</strong><small>Retired records preserved</small></div>
      <div class="trk-dashboard-stat trk-dashboard-stat--month"><div class="trk-stat-top"><span>RECORDED THIS MONTH VIEW</span><span class="trk-stat-mark" aria-hidden="true">✦</span></div><strong>${fmt(monthWithEvents)}</strong><small>Event trackers with entries · ${esc(monthLabel(selectedMonth))}</small></div>
    </section>
    <div class="trk-collection-head">
      <div><div class="trk-section-eyebrow">THE TRACKER COLLECTION</div><h2>Browse your records</h2><p>View your five active trackers or open the three retired GTA Online records under Historical.</p></div>
      <span class="trk-collection-count">${fmt(defs.length)} TRACKERS</span>
    </div>
    <div class="section-title">HEALTH & ACTIVITY · ${esc(monthLabel(selectedMonth))}</div>
    ${healthReviewMarkup(state,{month:selectedMonth})}
    <div class="section-title">FINANCIAL TRACKING · ${esc(monthLabel(selectedMonth))}</div>
    ${financeReviewMarkup(state,{month:selectedMonth})}
    <section class="card trk-ledger-section">
      <div class="trk-ledger-heading"><div><span class="trk-section-eyebrow">EVENT TRACKER LIBRARY</span><h3 id="trk-list-title">Your five trackers</h3><p id="trk-list-description">Month, year, and lifetime figures from your source records.</p></div><span class="trk-ledger-hint">SELECT TO VIEW OR ADD</span></div>
    <div class="trk-library-tools" aria-label="Browse tracker history">
      <div class="trk-filter-tabs" role="group" aria-label="Filter trackers">
        <button type="button" class="trk-filter-tab is-selected" data-trk-filter="in-use" aria-pressed="true">Active · 5</button>
        <button type="button" class="trk-filter-tab" data-trk-filter="retired" aria-pressed="false">Historical · 3</button>
      </div>
      <label class="trk-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 5 5"/></svg><span class="trk-sr-only">Search trackers</span><input type="search" id="trk-search" placeholder="Search trackers…" autocomplete="off"></label>
    </div>
      <div class="tracker-table trk-ledger-list">${rows}</div>
      <div class="trk-library-empty" id="trk-library-empty" hidden><span aria-hidden="true">⌕</span><b>No matching trackers</b><p>Try a different name or filter. Featured GeoGuessr trackers stay in their own section above.</p></div>
      <div class="trk-ledger-footnote">Gaming sessions are detected game-playtime increases, never diary mentions. Editing counts diary activity mentions and social counts distinct days. Retired GTA records remain accessible under Historical.</div>
    </section>
  </div>`;
  root.querySelectorAll('[data-tracker]').forEach(b=>b.onclick=()=>AUTO_TRACKER_IDS.has(b.dataset.tracker)||ARCHIVED_GTA_IDS.includes(b.dataset.tracker)?showReadOnlyTracker(b.dataset.tracker):showTracker(b.dataset.tracker));
  const tabs=[...root.querySelectorAll('[data-trk-filter]')],search=root.querySelector('#trk-search');
  let filter='in-use';
  const apply=()=>{
    const heading=root.querySelector('#trk-list-title'),description=root.querySelector('#trk-list-description');
    if(heading)heading.textContent=filter==='retired'?'Historical GTA Online records':'Your five trackers';
    if(description)description.textContent=filter==='retired'?'Retired November 19, 2026. All old totals are preserved and viewable.':'Month, year, and lifetime figures from your original source records.';
    const term=search.value.trim().toLowerCase();
    let visible=0;
    root.querySelectorAll('.trk-ledger-row').forEach(row=>{
      const status=row.dataset.trkStatus;
      const statusMatches=filter==='retired'?status==='retired':status!=='retired';
      const searchMatches=!term||row.dataset.trkName.includes(term)||row.textContent.toLowerCase().includes(term);
      const allowed=statusMatches&&searchMatches;
      row.classList.toggle('trk-is-filtered',!allowed);
      if(allowed&&row.style.display!=='none')visible++;
    });
    root.querySelector('#trk-library-empty').hidden=visible>0;
  };
  tabs.forEach(tab=>tab.onclick=()=>{
    filter=tab.dataset.trkFilter;
    tabs.forEach(b=>{const active=b===tab;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active))});
    apply();
  });
  search.addEventListener('input',apply);
  apply();
}
function showTracker(id){const t=trackerDefinition(state,id);const rows=occurrencesFor(state,id).slice().reverse();const gtaEnded=['mors-mutual','google-car'].includes(id);openModal(t.name,`<div class="grid grid-3"><div class="record-card"><div class="stat-label">This Month</div><div class="record-value">${trackerTotal(state,id,{month:selectedMonth})}</div></div><div class="record-card"><div class="stat-label">${selectedYear}</div><div class="record-value">${trackerTotal(state,id,{year:selectedYear})}</div></div><div class="record-card"><div class="stat-label">All Time</div><div class="record-value">${trackerTotal(state,id)}</div></div></div><div class="section-title">MANUAL OCCURRENCE</div><div class="grid grid-3"><label class="label">Date<input id="manual-date" class="input" type="date" value="${gtaEnded&&isoToday()>='2026-11-19'?'2026-11-18':isoToday()}" ${gtaEnded?'max="2026-11-18"':''}></label><label class="label">Count<input id="manual-count" class="input" type="number" min="0" value="1"></label><label class="label">Note<input id="manual-note" class="input" value="Manual ${esc(t.name)}"></label></div><button class="button primary" id="manual-add" style="margin-top:12px">Add occurrence</button><div class="section-title">DATED HISTORY</div><div class="history-list">${rows.length?rows.slice(0,100).map(r=>`<div class="history-row"><div class="history-date">${shortDate(r.date)}</div><div class="history-text">${esc(r.snippet||'Occurrence')}</div><b>${r.value!=null?fmt(r.value):r.result?esc(r.result):`+${r.count}`}</b></div>`).join(''):'<div class="muted">No dated occurrences yet.</div>'}</div>`,'TRACKER');modal.querySelector('#manual-add').onclick=()=>{if(gtaEnded&&modal.querySelector('#manual-date').value>='2026-11-19'){toast('This GTA Online tracker retired on November 19. Historical dates remain editable.','bad');return;}addManualOccurrence(state,{trackerId:id,date:modal.querySelector('#manual-date').value,count:modal.querySelector('#manual-count').value,snippet:modal.querySelector('#manual-note').value});persist();closeModal();render();toast('Tracker occurrence added.')}}

function musicCached(start,end){for(const category of ['songs','artists','albums'])if(!state.musicCache?.[`${category}:${start}:${end}`])return null;return Object.fromEntries(['songs','artists','albums'].map(c=>[c,state.musicCache[`${c}:${start}:${end}`].items]))}
function renderMusicList(items){return `<div class="music-grid">${items?.length?items.map(x=>`<div class="music-item"><div class="music-rank">${x.rank===5&&items.filter(y=>y.rank===5).length>1?'T-':''}${x.rank}</div>${x.image?`<img class="music-cover" src="${esc(x.image)}" alt="">`:'<div class="music-cover"></div>'}<div><div class="music-title">${esc(x.name)}</div><div class="music-meta">${esc(x.artist||x.album||'')}</div></div><div class="music-count">${fmt(x.streams)}<div class="tiny subtle">STREAMS</div></div></div>`).join(''):'<div class="muted small">No listening data returned.</div>'}</div>`}
function renderMusicSections(data){return `<div class="grid grid-3"><div><div class="section-title" style="margin-top:0">SONGS</div>${renderMusicList(data.songs)}</div><div><div class="section-title" style="margin-top:0">ARTISTS</div>${renderMusicList(data.artists)}</div><div><div class="section-title" style="margin-top:0">ALBUMS</div>${renderMusicList(data.albums)}</div></div>`}
async function loadMusicFor(start,end,force,target){const el=root.querySelector(target);if(!el)return;el.innerHTML='<div class="muted small">Loading from stats.fm…</div>';try{const data=await fetchPeriodMusic(start,end,state,{force});persist();if(root.querySelector(target))root.querySelector(target).innerHTML=renderMusicSections(data)}catch(e){if(root.querySelector(target))root.querySelector(target).innerHTML=`<div class="callout danger-callout">Could not load stats.fm data: ${esc(e.message)}</div>`}}
function musicExplorerRange(){
  const today=isoToday(),first="2020-11-01";
  if(musicPeriod==="all")return{start:first,end:today,label:"All Time",note:`November 1, 2020 – ${shortDate(today)}`};
  if(musicPeriod==="year"){
    if(!Number.isInteger(musicYear)||musicYear<2020||musicYear>2027)return{error:"Choose a valid year."};
    if(musicYear>Number(today.slice(0,4)))return{error:`No music listening history exists for ${musicYear} yet.`,label:String(musicYear),note:'Future year · no listening records yet.'};
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
    musicPeriod==="year"?`<label class="music-explorer-picker"><span>Choose year</span><select id="music-explorer-year" class="select" aria-label="Choose year">${Array.from({length:Math.max(currentYear,2027)-2019},(_,i)=>Math.max(currentYear,2027)-i).map(y=>`<option value="${y}" ${y===musicYear?"selected":""}>${y}${y===2020?" (Nov–Dec)":""}</option>`).join("")}</select></label>`:
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
    musicPeriod=next;render();
  });
  const mo=root.querySelector("#music-explorer-month");
  if(mo)mo.onchange=e=>{musicMonth=e.target.value;render()};
  const yr=root.querySelector("#music-explorer-year");
  if(yr)yr.onchange=e=>{musicYear=Number(e.target.value);render()};
  const apply=root.querySelector("#music-explorer-apply");
  if(apply)apply.onclick=()=>{
    const from=root.querySelector("#music-explorer-start").value,to=root.querySelector("#music-explorer-end").value;
    const note=root.querySelector("#music-explorer-status");
    if(!from||!to||from>to||from<first||to>today){if(note)note.textContent=`Choose a valid range between Nov 1, 2020 and ${shortDate(today)} (start before end).`;return;}
    musicCustomStart=from;musicCustomEnd=to;render();
  };
  const refresh=root.querySelector("#music-explorer-refresh");
  if(range.error){refresh.disabled=true;return;}
  refresh.onclick=()=>musicExplorerLoad(range.start,range.end,true);
  if(cached)musicExplorerRenderData(cached);
  if(!cached||!musicExplorerFresh(range.start,range.end))musicExplorerLoad(range.start,range.end,false);
}

function diaryInsightPanel(scope={},title="LIFE BEYOND THE NUMBERS"){
  const data=diarySignals(state,scope),featured=data.ranked.filter(x=>x.days>0).slice(0,6);
  const milestoneText=data.milestoneCount?`${fmt(data.milestoneCount)} possible milestone${data.milestoneCount===1?"":"s"} noted`:"No major milestones identified";
  const card=c=>`<article class="diary-signal-card diary-signal--${c.id}">
    <div class="diary-signal-symbol" aria-hidden="true">${c.symbol}</div><div class="diary-signal-count">${fmt(c.days)}</div>
    <div class="diary-signal-label">${esc(c.label)}</div>
    <div class="diary-signal-hint">${c.peakMonth?`Peak: ${esc(monthLabel(c.peakMonth.month))} · ${fmt(c.peakMonth.days)} days`:"No dated notes yet"}</div></article>`;
  const focus=data.mostVaried,sports=data.topSports;
  return `<section class="diary-insights-panel">
    <div class="diary-insights-heading"><div><div class="diary-insights-eyebrow">✦ YOUR LIFE IN THE DETAILS</div><h3>${esc(title)}</h3><p>Patterns from the words you saved, counting distinct diary days once per subject.</p></div><span class="diary-insights-total">${fmt(data.loggedDays)} DIARY DAYS</span></div>
    ${featured.length?`<div class="diary-insights-grid">${featured.map(card).join("")}</div>`:'<div class="diary-insights-empty">Add diary entries with recognizable subjects to build these highlights.</div>'}
    <div class="diary-insights-highlights">
      <div><span>Most varied diary day</span><b>${focus?`${fmt(focus.count)} subjects · ${esc(shortDate(focus.date))}`:"—"}</b>${focus?`<button type="button" data-insight-day="${esc(focus.date)}">Open day ↗</button>`:""}</div>
      <div><span>Most-mentioned sports interest</span><b>${sports?`${esc(sports.name)} · ${fmt(sports.days)} days`:"—"}</b><small>Mentions, not confirmed games watched</small></div>
      <div><span>Noteworthy moments</span><b>${milestoneText}</b><small>Potential milestones found in your writing</small></div>
    </div>
    <details class="diary-insights-details">
      <summary><span>Explore every subject and notable moments</span><span class="diary-insights-chevron" aria-hidden="true">⌄</span></summary>
      <div class="diary-insights-detail-body">
        <div class="diary-insights-detail-title">ALL SUBJECTS · DISTINCT DAYS MENTIONED</div>
        <div class="diary-insights-full-grid">${data.categories.map(c=>`<div class="diary-insights-detail-item"><span>${c.symbol} ${esc(c.short)}</span><b>${fmt(c.days)}</b>${c.streak?.days>1?`<small>${fmt(c.streak.days)}-day mention streak</small>`:""}</div>`).join("")}</div>
        ${data.milestones.length?`<div class="diary-insights-detail-title">POSSIBLE LIFE MILESTONES</div><div class="diary-insights-milestones">${data.milestones.slice(0,8).map(item=>`<button type="button" data-insight-day="${esc(item.date)}" class="diary-insights-milestone"><span>${esc(shortDate(item.date))}</span><b>${esc(item.snippet)}</b><span aria-hidden="true">↗</span></button>`).join("")}</div>`:""}
        <p class="diary-insights-disclaimer">Keyword-based clues, not proof of attendance, productivity, exercise, health events, or financial transactions. Money notes count mentions only; they do not calculate balances, spending, winnings, or income.</p>
      </div>
    </details>
  </section>`;
}

function recordMusicWinners(data){
  const records=[["songs","Top Song"],["artists","Top Artist"],["albums","Top Album"]];
  if(!data)return '<div class="muted small">Loading actual all-time stats.fm leaders…</div>';
  return `<div class="record-music-winners">${records.map(([category,label])=>{
    const item=data?.[category]?.[0],image=item?.image;
    return `<div class="record-music-winner record-music-winner--${category}"><div class="record-music-label">${esc(label)}</div>
      <div class="record-music-art">${/^https?:\/\//i.test(String(image||""))?`<img loading="lazy" src="${esc(image)}" alt="${esc(item.name)} artwork">`:'<span aria-hidden="true">♫</span>'}</div>
      <div class="record-music-name">${esc(item?.name||"No stats available")}</div><div class="record-music-streams">${item?`${fmt(item.streams)} actual streams`:"—"}</div></div>`}).join("")}</div>`;
}

async function loadRecordsMusic(){
  const target=root.querySelector("#record-music-winners");if(!target)return;
  const start="2020-11-01",end=isoToday(),cached=musicCached(start,end);
  if(cached){target.innerHTML=recordMusicWinners(cached);if(musicExplorerFresh(start,end))return}
  try{
    const data=await fetchPeriodMusic(start,end,state,{force:false});persist();
    if(view==="records"&&root.querySelector("#record-music-winners"))root.querySelector("#record-music-winners").innerHTML=recordMusicWinners(data);
  }catch(error){
    const el=root.querySelector("#record-music-winners");
    if(view==="records"&&el)el.innerHTML=`<div class="muted small">Could not load stats.fm leaders: ${esc(error.message)}. Visit Music to retry.</div>`;
  }
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
  const top=activityStats(state).counts[0],editing=topTrackerDay(state,"editing-events");
  const sessionPeak=topTrackerMonth(state,"gaming-sessions"),editingPeak=topTrackerMonth(state,"editing-events"),socialPeak=topTrackerMonth(state,"social-days");
  // Personal Records and Health must use the same monthly migraine audit.
  // Occurrence count and distinct symptom dates are separate statistics.
  const migrainePeak=migraineSummary(state).topMonths[0]||null;
  const streak=loggingStreak(state),daily=dailyChallengeStreaks(state),monty=montyRecord(state);
  const geo=geoguessr10kRecord(state);
  const lifeRecords=diarySignals(state);
  const lifeCategory=id=>lifeRecords.categories.find(c=>c.id===id);
  const creative=lifeCategory("creative"),learning=lifeCategory("learning"),social=lifeCategory("social"),outings=lifeCategory("outings");
  const monthLifeRecord=(category)=>category?.peakMonth?{days:category.peakMonth.days,month:monthLabel(category.peakMonth.month)}:null;
  const creativeMonth=monthLifeRecord(creative),learningMonth=monthLifeRecord(learning),socialMonth=monthLifeRecord(social),outingsMonth=monthLifeRecord(outings);
  const monthTop=gamingRecords.topMonths;
  const maxMonthlyMinutes=monthTop[0]?.minutes||1;
  const dateHint=bestDay?shortDate(bestDay.date):"No dated playtime recorded yet";
  const monthHint=bestMonth?monthLabel(bestMonth.month):"No monthly playtime recorded yet";
  root.innerHTML=`${pageHead("Personal Records","Your hall of fame, built from real gaming minutes, daily challenges and diary highlights.")}
    <div id="personal-records-showcase" class="record-hall">
      <div class="record-hall-hero"><div><div class="record-hall-eyebrow">✦ THE HALL OF FAME ✦</div><h2>Every high score tells a story<span>.</span></h2><p>Actual recorded milestones, meaningful personal bests, and the moments that stand out.</p></div><div class="record-hall-hero-art">${recordHallIcon("trophy")}</div></div>
      <div class="section-title">THE HEADLINERS · GAMING RECORDS</div>
      <div class="record-hall-feature-grid">
        ${recordHallFeature("day","gamepad","Largest dated gaming increase",bestDay?gamingHours(bestDay.minutes):"—",dateHint,"Playtime detected between snapshots · not necessarily played on that date",bestDay?.date||"")}
        ${recordHallFeature("month","calendar","Most gaming in one month",bestMonth?gamingHours(bestMonth.minutes):"—",monthHint,bestMonth?.recoveredMinutes>0?"Includes recoverable historic monthly playtime":"Summed from tracked monthly playtime")}
      </div>
      ${bestDay? `<details class="record-hall-day-breakdown">
        <summary><span class="record-hall-breakdown-icon">${recordHallIcon("gamepad")}</span><span class="record-hall-breakdown-title"><b>Which games contributed to ${esc(gamingHours(bestDay.minutes))}?</b><small>${esc(shortDate(bestDay.date))} · ${gamingRecords.bestDayGames.length} game${gamingRecords.bestDayGames.length===1?"":"s"} recorded</small></span><span class="record-hall-breakdown-toggle">See breakdown <span aria-hidden="true">⌄</span></span></summary>
        <div class="record-hall-breakdown-body">
        ${gamingRecords.bestDayGames.length?gamingRecords.bestDayGames.map((game,i)=>`<div class="record-hall-breakdown-game"><span class="record-hall-breakdown-rank">${String(i+1).padStart(2,"0")}</span><div class="record-hall-breakdown-game-name"><strong>${esc(game.title)}</strong><small>${esc(Object.keys(game.platformMinutes||{}).map(platformLabel).join(" + ")||"Recorded gaming")}</small></div><span class="record-hall-breakdown-game-minutes">${esc(gamingHours(game.minutes))}</span></div>`).join(""):'<p class="muted small">No per-game breakdown available for this date.</p>'}
        <p class="record-hall-breakdown-caveat">These are positive changes in platform playtime detected on this date. An account that reported several days of playtime at once can make the number look larger than the hours actually played on ${esc(shortDate(bestDay.date))}.</p>
        </div>
      </details>`:""}
      <div class="section-title">GAMING · MORE PERSONAL BESTS</div>
      <div class="record-hall-card-grid">
        ${recordHallCard("total","clock","Total gaming time",totalTime,gamingRecords.lifetimeMinutes>0?"Lifetime known playtime across connected and legacy sources":"Connect gaming accounts to build this record")}
        ${recordHallCard("favorite","trophy","Most played game ever",gamingRecords.favoriteGame?.title||"—",gamingRecords.favoriteGame?`${gamingHours(gamingRecords.favoriteGame.minutes)} known playtime`:"No lifetime game hours available yet")}
        ${recordHallCard("single","gamepad","Biggest one-game daily increase",bestGameDay?gamingHours(bestGameDay.minutes):"—",bestGameDay?`${bestGameDay.title} · ${shortDate(bestGameDay.date)}`:"Dated game minutes not available yet")}
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
      <div class="section-title">LIFETIME HEALTH & ACTIVITY RECORDS</div>
      ${healthLifetimeMarkup(state)}
      <div class="section-title">FINANCIAL LIFETIME RECORDS</div>
      ${financeRecordsMarkup(state)}
      ${healthYearComparisonMarkup()}
      <div class="section-title">FAVORITE DAYS · 2024 ONWARD</div>
      ${favoriteDaysByYearPanel()}
      <div class="section-title">LIFE'S BIGGEST TRACKED MOMENTS</div>
      <div class="record-hall-card-grid">
        ${recordHallCard("total","gamepad","Most reported gaming sessions in a month",sessionPeak?`${fmt(sessionPeak.count)} sessions`:"—",sessionPeak?`${monthLabel(sessionPeak.month)} · reported game increases`:"Session reports are counted from new gaming refreshes")}
        ${recordHallCard("edit","edit","Most editing events in a month",editingPeak?`${fmt(editingPeak.count)} edits`:"—",editingPeak?`${monthLabel(editingPeak.month)} · explicit diary edits`:"No saved editing entries")}
        ${recordHallCard("activity","sparkle","Most social days in a month",socialPeak?`${fmt(socialPeak.count)} days`:"—",socialPeak?`${monthLabel(socialPeak.month)} · diary-identified social days`:"No social diary mentions")}
        ${recordHallCard("activity","diary","Most migraine/headache events in one month",migrainePeak?`${fmt(migrainePeak.count)} occurrences`:"—",migrainePeak?`${monthLabel(migrainePeak.month)} · ${fmt(migrainePeak.days)} dated symptom days${migrainePeak.eventsWithoutVerifiedDates?` · ${fmt(migrainePeak.eventsWithoutVerifiedDates)} without dated details`:''}`:"No recorded migraine occurrences")}
      </div>
      <div class="section-title">YOUR LIFE · DIARY MILESTONES</div>
      <div class="record-hall-card-grid record-hall-diary">
        ${recordHallCard("activity","sparkle","Most common activity",top?.[0]||"—",top?`${fmt(top[1])} recognized diary events`:"No activities recognized yet")}
        ${recordHallCard("writing","diary","Most events in one day",busiest?`${fmt(busiest.events)} events`:"—",busiest?shortDate(busiest.date):"No saved diary entries yet")}
        ${recordHallCard("streak","fire","Longest diary streak",`${fmt(streak.longest)} days`,streak.last?`Last saved ${shortDate(streak.last)}`:"No diary streak data yet")}
        ${recordHallCard("edit","edit","Most editing in a day",editing?`${fmt(editing.count)} edits`:"—",editing?shortDate(editing.date):"No explicit editing entries yet")}
      </div>
      <div class="section-title">LIFE RECORDS · ACTUAL DIARY PATTERNS</div>
      <div class="record-hall-card-grid">
        ${recordHallCard("activity","edit","Most creative month",creativeMonth?`${fmt(creativeMonth.days)} days`:"—",creativeMonth?`${creativeMonth.month} · creative mentions`:"No creative diary entries")}
        ${recordHallCard("streak","fire","Longest creative streak",creative?.streak?`${fmt(creative.streak.days)} days`:"—",creative?.streak?`${shortDate(creative.streak.start)} – ${shortDate(creative.streak.end)}`:"No consecutive creative diary days")}
        ${recordHallCard("writing","diary","Most learning-focused month",learningMonth?`${fmt(learningMonth.days)} days`:"—",learningMonth?`${learningMonth.month} · learning mentions`:"No school or learning diary entries")}
        ${recordHallCard("activity","sparkle","Most social month",socialMonth?`${fmt(socialMonth.days)} days`:"—",socialMonth?`${socialMonth.month} · friends/family mentions`:"No social diary entries")}
        ${recordHallCard("geoguessr","flag","Most outings in a month",outingsMonth?`${fmt(outingsMonth.days)} days`:"—",outingsMonth?`${outingsMonth.month} · outing mentions`:"No outings recorded in diary")}
      </div>
      <div class="section-title">PERSONAL MILESTONES · THE LIFE YOU LOGGED</div>
      ${diaryInsightPanel({},"Your lifetime diary highlights")}
      <div class="section-title">MUSIC · ALL-TIME FAVORITES</div>
      <section class="record-music-panel"><div class="record-music-heading"><div><h3>Your lifetime music podium</h3><p>Real stats.fm streams from November 1, 2020 to today. Rankings update as you listen.</p></div><button type="button" class="button" id="record-open-music">Explore Music</button></div><div id="record-music-winners">${recordMusicWinners(musicCached("2020-11-01",isoToday()))}</div></section>
      <div class="section-title">GEOGUESSR · CHALLENGE RECORDS</div>
      <div class="record-hall-card-grid record-hall-geoguessr">
        ${recordHallCard("challenge","flag","Longest Daily Challenge streak",`${fmt(daily.longest)} days`,"Your personal best streak")}
        ${recordHallCard("challenge","lightning","Current Daily Challenge streak",`${fmt(daily.active?daily.current:0)} days`,daily.active?"Currently active":"Currently inactive")}
        ${recordHallCard("challenge","trophy","Wins against Monty",fmt(monty.wins),`${fmt(monty.losses)} recorded losses · all time`)}
        ${recordHallCard("geoguessr","target","GeoGuessr 10K record",geo?fmt(geo.value):"—",geo?`Recorded ${shortDate(geo.date)}`:"No dated record yet")}
        ${recordHallCard("geoguessr","flag","Hong Kong spawns",fmt(trackerTotal(state,"hong-kong")),"Lifetime tracker total")}
      </div>
      <details class="record-hall-history">
        <summary><span>${recordHallIcon("diary")} Historical GTA Online counters</span><span class="record-hall-history-hint">View retired totals <span aria-hidden="true">⌄</span></span></summary>
        <div class="record-hall-history-grid">
          <div><span>Mors Mutual calls</span><b>${fmt(trackerTotal(state,"mors-mutual"))}</b></div>
          <div><span>GTA Google Car casualties</span><b>${fmt(trackerTotal(state,"google-car"))}</b></div>
          <div><span>Collisions</span><b>${fmt(trackerTotal(state,"apartment-collisions"))}</b></div>
        </div>
        <div class="record-hall-history-foot">These GTA Online totals are preserved for historical reference, with retirement effective November 19, 2026. Your five current trackers appear in the main monthly and yearly sections.</div>
      </details>
    </div>`;
  root.querySelectorAll("[data-record-day]").forEach(button=>button.onclick=()=>openDay(button.dataset.recordDay));
  root.querySelector("#record-open-music").onclick=()=>setView("music");
  loadRecordsMusic();
}

function askLoading(query){
  return `<div class="ask-loading" role="status" aria-live="polite"><div class="ask-loading-orb"><div class="ask-loading-orb-inner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.7" cy="10.7" r="6.5"/><path d="m15.5 15.5 5.5 5.5"/></svg></div></div>
    <div class="ask-loading-label">Searching your T.I.D.E. records</div><div class="ask-loading-query">${esc(query)}</div>
    <div class="ask-loading-phases"><span>Understanding your question</span><span>Checking your saved history</span><span>Building your answer</span></div>
    <div class="ask-loading-skeleton"><i></i><i></i><i></i></div></div>`;
}

function renderAnswer(a){
  if(!a)return'';
  const kind=String(a.kind||a.type||'diary').replace(/[^a-z0-9-]/gi,'').toLowerCase(),source=a.source||'T.I.D.E. saved history';
  const items=Array.isArray(a.items)?a.items:[],limit=10;
  const row=(item,i)=>{
    const obj=typeof item==='string'?{label:item}:item||{};
    const date=String(obj.date||''),hasDate=/^\d{4}-\d{2}-\d{2}$/.test(date);
    const img=/^https?:\/\//i.test(String(obj.image||''))?`<img class="ask-answer-row-image" src="${esc(obj.image)}" alt="" loading="lazy">`:'';
    return `<div class="ask-answer-row${hasDate?' ask-answer-row--clickable':''}" ${hasDate?`data-answer-date="${esc(date)}" role="button" tabindex="0" aria-label="Open diary for ${esc(date)}"`:''}>
      <span class="ask-answer-row-number">${String(i+1).padStart(2,'0')}</span>${img}
      <div class="ask-answer-row-body"><b>${esc(obj.label||date||'Recorded result')}</b>${obj.meta?`<p>${esc(obj.meta)}</p>`:''}${obj.source?`<span class="ask-answer-row-source">${esc(obj.source)}</span>`:''}</div>${hasDate?'<span class="ask-answer-row-arrow" aria-hidden="true">↗</span>':''}</div>`;
  };
  const visible=items.slice(0,limit),hidden=items.slice(limit,75);
  const suggestions=(a.followups||[]).filter(Boolean).slice(0,3);
  return `<article class="ask-answer ask-answer--${kind}">
    <div class="ask-answer-top"><span class="ask-answer-status"><span class="ask-answer-status-dot"></span> SEARCH COMPLETE</span><span class="ask-answer-origin">${esc(source)}</span></div>
    <div class="ask-answer-intro"><div class="ask-answer-eyebrow">${esc(a.heading||'YOUR ANSWER')}</div>
      <h2>${esc(a.primary??'No matching records')}</h2>${a.detail?`<p>${esc(a.detail)}</p>`:''}</div>
    ${items.length?`<div class="ask-answer-results-head"><b>FOUND IN YOUR RECORDS</b><span>${fmt(items.length)} RESULT${items.length===1?'':'S'}${items.length>75?' · FIRST 75 SHOWN':''}</span></div>
      <div class="ask-answer-rows">${visible.map(row).join('')}</div>
      ${hidden.length?`<details class="ask-answer-more"><summary>Show ${hidden.length} more results <span aria-hidden="true">⌄</span></summary><div class="ask-answer-rows">${hidden.map((x,i)=>row(x,i+limit)).join('')}</div></details>`:''}`:kind==='money'||kind==='help'||kind==='none'?'':`<div class="ask-answer-no-results">No individual entries to show for this answer.</div>`}
    ${a.date&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)?`<button type="button" class="ask-answer-open" data-answer-date="${esc(a.date)}">Open ${esc(shortDate(a.date))} in your diary ↗</button>`:''}
    ${suggestions.length?`<div class="ask-answer-next"><span>KEEP EXPLORING</span><div>${suggestions.map(q=>`<button type="button" data-ask-query="${esc(q)}">${esc(q)} <span aria-hidden="true">↗</span></button>`).join('')}</div></div>`:''}
    <div class="ask-answer-footer"><span>Grounded in saved T.I.D.E. information. Missing data stays missing.</span><span>${fmt(items.length)} matching records</span></div>
  </article>`;
}

function askView(){
  ++askRequestToken; // Cancel any in-flight response from a prior Ask view.
  const groups=[
    {icon:'🎮',name:'Gaming',accent:'gaming',examples:[["What games did I play on September 5, 2026?","Games on a date"],["When did I last play The Crew Motorfest?","Last-played date"]]},
    {icon:'📓',name:'My life',accent:'life',examples:[["What happened on October 6, 2024?","Replay a day"],["Tell me about my life in October 2026","Month in review"]]},
    {icon:'🎧',name:'Music',accent:'music',examples:[["What was my top song in 2026?","Top song"],["Who was my top artist all time?","Lifetime artist"]]},
    {icon:'💬',name:'Anything else',accent:'explore',examples:[["When did I last edit a video?","Creative history"],["What did I write about money this month?","Money diary notes"]]},
    {icon:'🌙',name:'Health',accent:'life',examples:[["What was my longest sleep night in 2026?","Best night"],["How many migraines did I report in September 2026?","Migraine history"]]},
    {icon:'💰',name:'Finances',accent:'music',examples:[["Which day did I receive the most money in 2026?","Biggest cash receipt"],["When is my next charge going to hit?","Upcoming bills"]]}
  ];
  const groupMarkup=groups.map(g=>`<div class="ask-suggestion-group ask-suggestion--${g.accent}"><div class="ask-suggestion-header"><span aria-hidden="true">${g.icon}</span><b>${g.name}</b></div><div class="ask-suggestion-items">${g.examples.map(([q,label])=>`<button type="button" class="ask-suggestion-button" data-ask-query="${esc(q)}"><span>${label}</span><span aria-hidden="true">↗</span></button>`).join('')}</div></div>`).join('');
  root.innerHTML=`${pageHead('Ask T.I.D.E.','Search the life you have recorded, from specific dates to big-picture patterns.')}
  <div class="ask-explorer">
    <div class="ask-explorer-hero"><div class="ask-explorer-hero-content"><div class="ask-explorer-eyebrow">✦ YOUR PERSONAL HISTORY, SEARCHABLE</div><h2>Curious about <em>your life?</em></h2><p>Ask naturally. Explore gaming, memories, music, achievements, people, places, and more using what T.I.D.E. actually knows.</p></div>
      <div class="ask-explorer-art" aria-hidden="true"><div class="ask-explorer-orbit orbit-one"></div><div class="ask-explorer-orbit orbit-two"></div><div class="ask-explorer-core"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 21a13 13 0 1 1 26 0c0 5.5-3 8-7 11v5H18v-5c-4-3-7-5.5-7-11Z"/><path d="M19 42h10M20 37h8M21 27l3 3 4-6"/></svg></div></div></div>
    <div class="ask-explorer-search">
      <div class="ask-explorer-search-tag"><span class="ask-explorer-live-dot"></span> T.I.D.E. INTELLIGENCE <span class="ask-explorer-local-tag">PRIVATE · SAVED HISTORY</span></div>
      <form id="ask-explorer-form" class="ask-explorer-form"><label for="ask-input" class="ask-explorer-label">What's on your mind?</label>
        <div class="ask-explorer-form-row"><textarea id="ask-input" rows="2" maxlength="600" placeholder="Example: What games did I play on September 5, 2026?">${esc(askLastQuestion)}</textarea><button type="submit" id="ask-go" class="ask-explorer-submit"><span>Search my history</span><span aria-hidden="true">↗</span></button></div>
      </form>
      <div class="ask-explorer-input-foot"><span><span class="ask-explorer-key">↵</span> Enter to search · Shift+Enter for a new line</span><span>Diary · Gaming · Music · Trackers</span></div>
    </div>
    <div class="ask-explorer-section-bar"><div><span>NEED SOME INSPIRATION?</span><h3>Explore your world</h3></div><span>Try a question below</span></div>
    <div class="ask-explorer-suggestions">${groupMarkup}</div>
    <div id="ask-results" class="ask-explorer-results" aria-live="polite">${askAnswer?renderAnswer(askAnswer):`<div class="ask-explorer-welcome"><span aria-hidden="true">✦</span><b>Your memories are one question away.</b><p>Choose an example or ask in your own words. Answers show their sources, and you can open matching diary dates.</p></div>`}</div>
    <div class="ask-explorer-trust"><span>●</span> No outside AI is reading your diary. Search runs with on-device rules and only uses your saved sources. stats.fm rankings may be fetched when you ask about music. Money and Health questions use only your private imported records; this website has no direct ChatGPT bank or Watch connection.</div>
  </div>`;
  const input=root.querySelector('#ask-input'),form=root.querySelector('#ask-explorer-form'),results=root.querySelector('#ask-results');
  const run=async raw=>{
    const query=String(raw??input.value).trim();if(!query){input.focus();return;}
    input.value=query;askLastQuestion=query;
    const contextualQuery=/\b(?:this|that) game\b/i.test(query)&&askAnswer?.kind==='game'&&askAnswer?.entity?query.replace(/\b(?:this|that) game\b/gi,askAnswer.entity):query;
    const id=++askRequestToken,submit=root.querySelector('#ask-go'),started=Date.now();
    submit.disabled=true;results.innerHTML=askLoading(query);
    let answer;
    try{
      const context={today:isoToday(),selectedDate};
      const financialQuestion=/\b(money|cash|bank|finances?|balance|bill|subscription|deposit|paycheck|income|earned|afford|purchase|run out|charge|spending on|spent on)\b|\$\d/i.test(contextualQuery);
      const healthQuestion=/\b(sleep|slept|sleeping|steps?|health|workout|exercise|calories|standing|walked|migraine|headache)\b/i.test(contextualQuery);
      if(financialQuestion&&!/\b(?:spent time|time spent|hours spent|minutes spent)\b/i.test(contextualQuery)){
        answer=askFinance(state,contextualQuery,context);
      }else if(healthQuestion&&!/\b(?:sleep playlist|sleep music)\b/i.test(contextualQuery)){
        answer=healthAnswers(state,contextualQuery,context);
      }else if(askMusicIntent(contextualQuery)){
        const scope=askScope(contextualQuery,context),start=scope.all?'2020-11-01':scope.start,end=scope.all?isoToday():scope.end;
        if(end<'2020-11-01'||start>isoToday())answer={kind:'music',heading:'Listening data unavailable for this period',primary:'Outside stats.fm history',detail:'The connected listening history starts November 1, 2020. Choose a date on or after then.',source:'stats.fm'};
        else{
          const finalEnd=end>isoToday()?isoToday():end;
          const effectiveStart=start<'2020-11-01'?'2020-11-01':start;
          const cached=musicCached(effectiveStart,finalEnd);
          const music=cached||await fetchPeriodMusic(effectiveStart,finalEnd,state,{force:false});
          if(!cached)persist();
          answer=answerAsk(state,contextualQuery,{...context,musicData:music});
        }
      }else answer=answerAsk(state,contextualQuery,context);
      const remaining=Math.max(0,580-(Date.now()-started));if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
    }catch(error){answer={kind:'none',heading:'Could not complete the search',primary:'Your records are safe',detail:`${error?.message||'This search failed.'} Try again or choose another question.`,source:'T.I.D.E. search'};}
    if(id!==askRequestToken||view!=='ask')return;
    askAnswer=answer;results.innerHTML=renderAnswer(answer);submit.disabled=false;
    results.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  };
  form.addEventListener('submit',e=>{e.preventDefault();run()});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();run()}});
  root.querySelector('.ask-explorer').addEventListener('click',e=>{
    const q=e.target.closest('[data-ask-query]');
    if(q){input.value=q.dataset.askQuery;run(input.value);return;}
    const dateEl=e.target.closest('[data-answer-date]');
    if(dateEl){const day=dateEl.dataset.answerDate;if(/^\d{4}-\d{2}-\d{2}$/.test(day))openDay(day);}
  });
  root.querySelector('.ask-explorer').addEventListener('keydown',e=>{
    const target=e.target.closest('.ask-answer-row[data-answer-date]');
    if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDay(target.dataset.answerDate)}
  });
}

function wireAnswerDates(){/* Answer date controls are delegated by the Ask explorer. */}

function historyView(){const rows=Object.entries(state.entries||{}).filter(([,e])=>e.text?.trim()).sort((a,b)=>b[0].localeCompare(a[0]));root.innerHTML=`${pageHead('History','A compact archive. Search results show only the relevant day until you open it.')}<section class="card"><div class="filter-row"><input id="history-search" class="input" style="flex:1" placeholder="Search entries…"><select id="history-year" class="select"><option value="">All years</option>${[...new Set(rows.map(([d])=>d.slice(0,4)))].map(y=>`<option>${y}</option>`).join('')}</select></div><div class="history-list" id="history-list" style="margin-top:15px">${renderHistoryRows(rows)}</div></section>`;const update=()=>{const term=root.querySelector('#history-search').value.toLowerCase(),yr=root.querySelector('#history-year').value;const filtered=rows.filter(([d,e])=>(!yr||d.startsWith(yr))&&(!term||e.text.toLowerCase().includes(term)));root.querySelector('#history-list').innerHTML=renderHistoryRows(filtered);root.querySelectorAll('[data-hdate]').forEach(x=>x.onclick=()=>openDay(x.dataset.hdate))};root.querySelector('#history-search').oninput=update;root.querySelector('#history-year').onchange=update;update()}
function renderHistoryRows(rows){return rows.length?rows.slice(0,500).map(([d,e])=>`<div class="history-row" data-hdate="${d}"><div class="history-date">${shortDate(d)}</div><div class="history-text">${esc(e.text)}</div><span class="chip">${splitEvents(e.text).length} events</span></div>`).join(''):'<div class="muted">No matching days.</div>'}

function settingsView(){const defs=allTrackerDefinitions(state);root.innerHTML=`${pageHead('Settings','Privacy, import, backups, tracker lifecycle, and optional cloud sync.')}<section class="card settings-section"><div class="card-header"><div><h2>Cloud Sync</h2><div class="small muted">Typing never syncs. Cloud writes happen only on Save when enabled, or when you press Sync Now.</div></div><span class="chip ${cloud.authenticated?'accent':''}">${cloud.authenticated?'CONNECTED':cloud.configured?'LOCKED':'LOCAL ONLY'}</span></div><div class="callout">Set <b>TIDE_ACCESS_CODE</b> in Netlify to enable the private sync store. The public GitHub repository never contains your diary data.</div><div class="filter-row" style="margin-top:14px">${cloud.authenticated?`${button('Sync Now','sync-now','primary')}${button('Disconnect','cloud-logout')}`:`<input id="cloud-code" class="input" type="password" placeholder="Access code">${button('Connect','cloud-login','primary')}`}${cloud.authenticated?`<label class="chip"><input id="autosync" type="checkbox" ${state.settings.autoCloudSync?'checked':''}> sync on explicit Save</label>`:''}</div></section><section class="card settings-section"><div class="card-header"><div><h2>Import Existing T.I.D.E. Notes</h2><div class="small muted">Paste 2024, 2025, or 2026 note text. The parser keeps daily text and imports Best/Worst plus known monthly totals.</div></div></div><textarea id="notes-import" class="editor textarea-small" placeholder="Paste Things I Have Done Everyday / T.I.D.E. here…"></textarea><div class="filter-row" style="margin-top:12px">${button('Import Notes','run-import','primary')}<span class="small muted">Imports remain in your private local/cloud data, not GitHub.</span></div></section><section class="card settings-section"><div class="card-header"><div><h2>Backup & Restore</h2><div class="small muted">Keep your own copy of the entire T.I.D.E. database.</div></div></div><div class="filter-row">${button('Download JSON Backup','download-backup')}<label class="button">Restore JSON<input id="restore-file" type="file" accept="application/json" hidden></label></div></section><section class="card settings-section private-setup-section">
  <div class="card-header"><div><h2>Private Health + Finances Setup</h2><div class="small muted">Load your prepared Apple Health and connected-finance history together, in one step. Your personal records never go into the public GitHub repository.</div></div><span class="chip accent">ONE-TIME SETUP</span></div>
  <p class="small muted">Use the private setup file provided in your ChatGPT conversation. This imports your saved Health and Chase snapshots into this browser, and into your authenticated private T.I.D.E. cloud if it is connected. It does not create a live connection to ChatGPT, Apple Health or your bank.</p>
  <div class="filter-row"><label class="button primary" role="button">Load my private setup file<input id="private-setup-file" type="file" accept=".json,application/json" hidden></label>
    <span class="small muted">Health: ${fmt(healthRows(state).length)} recorded days · Finances: ${fmt(Object.keys(state.finances?.transactions||{}).length)} posted transactions</span></div>
</section><section class="card settings-section"><div class="card-header"><div><h2>Private Finances Import</h2><div class="small muted">Import the bank-history file prepared from your connected Chase records. Your account details and transactions are not embedded in public T.I.D.E. source code.</div></div><span class="chip accent">PRIVATE</span></div>
 <p class="small muted">This importer is separate from Budget Tracker. It uses posted bank transactions and recurring-charge data exported from connected financial records. This website cannot directly call ChatGPT's Finances connection, so new bank changes require a fresh import.</p>
 <div class="filter-row"><label class="button primary" role="button">Import Finances JSON <input id="finance-import-file" type="file" accept=".json,application/json" hidden></label><span class="small muted">${fmt(Object.keys(state.finances?.transactions||{}).length)} posted transactions · ${state.finances?.importedAt?'Last import '+esc(shortDate(state.finances.importedAt.slice(0,10))):'No private bank data imported'}</span></div>
 <p class="small muted">Reconstructed cash peaks, deposit categories and modeled charge dates are labeled as estimates when their actual bank snapshot dates are unknown. No account numbers, Plaid credentials or card numbers appear in the public site.</p></section><section class="card settings-section health-settings-section"><div class="card-header"><div><h2>Apple Health & Activity</h2><div class="small muted">Private daily metrics for Steps, Distance, Exercise, Standing, Calories, Workouts and Nightly Sleep. This website does not automatically access the Health connection in ChatGPT.</div></div><span class="chip accent">PRIVATE</span></div>
  <p class="small muted">Your T.I.D.E. Health import uses daily JSON or CSV values. The connected-Health export generated for you can be imported here. Data stays in your T.I.D.E. local/private synced account and is never put in GitHub.</p>
  <div class="filter-row"><label class="button primary" role="button">Import Health JSON / CSV <input type="file" id="health-import-file" accept=".json,.csv,application/json,text/csv" hidden></label><span class="small muted">${fmt(healthRows(state).length)} dates imported · ${state.healthActivity?.updatedAt?'Last import: '+esc(shortDate(state.healthActivity.updatedAt.slice(0,10))):'Not imported yet'}</span></div>
  <p class="small muted">For sleep, T.I.D.E. calculates each month and year from recorded nights only. It does not infer missing nights, and it never treats a missing reading as zero. Future Apple Watch updates require another authorized import.</p>
</section><section class="card settings-section"><div class="card-header"><div><h2>Tracker Lifecycle</h2><div class="small muted">Retired means preserved forever but no longer expected in future months.</div></div></div><div class="tracker-table">${defs.map(t=>`<div class="tracker-row"><div class="tracker-name"><b>${esc(t.name)}</b><span class="tracker-status">${esc(t.kind)}</span></div><div><span class="chip">${esc(t.status)}</span></div><div class="small muted">${trackerTotal(state,t.id)} all time</div><div></div><select class="select tracker-status-select" data-id="${t.id}"><option value="active" ${t.status==='active'?'selected':''}>Active</option><option value="intermittent" ${t.status==='intermittent'?'selected':''}>Intermittent</option><option value="retired" ${t.status==='retired'?'selected':''}>Retired</option></select></div>`).join('')}</div></section>`;
  const login=root.querySelector('#cloud-login');if(login)login.onclick=async()=>{try{await cloudLogin(root.querySelector('#cloud-code').value);cloud.authenticated=true;await pullCloud(true);toast('Cloud connected.');render()}catch(e){toast(e.message,'bad')}};const logout=root.querySelector('#cloud-logout');if(logout)logout.onclick=async()=>{try{await cloudLogout()}catch{}cloud.authenticated=false;cloud.etag=null;render()};const sync=root.querySelector('#sync-now');if(sync)sync.onclick=()=>syncCloud();const auto=root.querySelector('#autosync');if(auto)auto.onchange=e=>{state.settings.autoCloudSync=e.target.checked;persist()};
  root.querySelector('#run-import').onclick=()=>{const raw=root.querySelector('#notes-import').value;if(!raw.trim())return toast('Paste your notes first.','bad');const result=parseNotesImport(raw,state);persist();toast(`Imported ${result.entries} diary entries.`);selectedDate=isoToday();render()};
  const privateSetupInput=root.querySelector('#private-setup-file');
  if(privateSetupInput)privateSetupInput.onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    await activatePrivateData(file);
    e.target.value='';
  };
  const financeInput=root.querySelector('#finance-import-file');if(financeInput)financeInput.onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>30*1024*1024)throw new Error('Finance JSON is too large (max 30 MB).');
      const payload=JSON.parse(await file.text());
      const count=importFinances(state,payload);
      persist();toast(`Imported ${fmt(count)} posted financial records.`);render();
      if(cloud.authenticated){
        try{const result=await cloudPush(state,cloud.etag);cloud.etag=result.etag||cloud.etag;toast('Private finances synchronized through your authenticated T.I.D.E. cloud.');}
        catch(err){toast('Finance data saved locally. Cloud sync was unsuccessful: '+err.message,'bad')}
      }
    }catch(err){toast('Finance import failed: '+err.message,'bad')}
  };
  const healthInput=root.querySelector('#health-import-file');if(healthInput)healthInput.onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const payload=await readHealthImportFile(file);
      const accepted=mergeHealthImport(state,payload);
      persist();toast(`Imported ${fmt(accepted)} private Health day records.`);render();
      if(cloud.authenticated){
        try{const result=await cloudPush(state,cloud.etag);cloud.etag=result.etag||cloud.etag;toast('Private Health records synchronized across devices.');}
        catch(err){toast('Health data saved locally; cloud sync needs another attempt: '+err.message,'bad')}
      }
    }catch(err){toast('Health import failed: '+err.message,'bad')}
  };
  root.querySelector('#download-backup').onclick=()=>{const url=URL.createObjectURL(exportState(state));const a=document.createElement('a');a.href=url;a.download=`tide-backup-${isoToday()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  root.querySelector('#restore-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state=importStateObject(JSON.parse(await f.text()));persist();toast('Backup restored.');render()}catch(err){toast(`Restore failed: ${err.message}`,'bad')}};root.querySelectorAll('.tracker-status-select').forEach(s=>s.onchange=e=>{state.trackerOverrides[e.target.dataset.id]={...(state.trackerOverrides[e.target.dataset.id]||{}),status:e.target.value};persist();toast('Tracker status updated.');render()});
}

async function syncCloud(){if(!cloud.authenticated)return toast('Connect cloud sync first.','bad');try{const pulled=await cloudPull();const merged=mergeStates(state,pulled.state);state=merged;persist();const pushed=await cloudPush(state,pulled.etag);cloud.etag=pushed.etag||pulled.etag;toast('Cloud and local data synchronized.');render()}catch(e){toast(`Sync failed: ${e.message}`,'bad')}}
async function pullCloud(silent=false){try{const r=await cloudPull();state=mergeStates(state,r.state);cloud.etag=r.etag;persist();if(!silent)toast('Cloud data loaded.')}catch(e){if(!silent)toast(e.message,'bad')}}
async function bootstrapCloud(){const status=await cloudStatus();cloud={...cloud,...status,checked:true};if(status.authenticated){cloud.authenticated=true;await pullCloud(true)}updateSyncPill();render()}
function updateSyncPill(){const pill=document.querySelector('#sync-pill');pill.innerHTML=`<span class="sync-dot"></span><span>${cloud.authenticated?'Cloud ready · local-first':cloud.configured?'Cloud available · locked':'Local-first'}</span>`}
function render(){const date=presentationDate(),period=!['today','on-this-day'].includes(view);setThemeForDate(root,date,period?[]:personalCalendarEvents(state,date),{period});updateSyncPill();switch(view){case'today':todayView();break;case'calendar':calendarView();break;case'on-this-day':onThisDayView();break;case'monthly':monthlyView();break;case'yearly':yearlyView();break;case'trackers':trackersView();break;case'finances':financeView();break;case'health':healthView();break;case'music':musicExplorerView();break;case'records':recordsView();break;case'ask':askView();break;case'history':historyView();break;case'settings':settingsView();break;default:todayView()}document.dispatchEvent(new Event('tide:view-rendered'))}
render();bootstrapCloud();
// A new gaming snapshot can change session totals without changing diary entries.
// Repaint only read-only reporting pages; never interrupt the Today editor.
document.addEventListener('tide:gaming-updated',()=>{
  if(['trackers','monthly','yearly','records'].includes(view))render();
});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
