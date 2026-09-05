import { loadLocal, saveLocal } from './storage.js';
import { trackerTotal } from './engine-v4.js';

const ID='migraines';
const COLLISIONS='apartment-collisions';
const COLLISION_SPLIT_MIGRATION='collision-month-split-v1';
const root=document.querySelector('#view-root');

function otherYears(state){
  const years=new Set([2026]);
  for(const row of state.occurrences||[]){
    if(row.trackerId===ID&&/^20\d{2}-/.test(String(row.date||'')))years.add(Number(String(row.date).slice(0,4)));
  }
  for(const month of Object.keys(state.monthlyReviews||{}))if(/^20\d{2}-\d{2}$/.test(month))years.add(Number(month.slice(0,4)));
  for(const year of Object.keys(state.yearlyReviews||{}))if(/^20\d{2}$/.test(year))years.add(Number(year));
  years.delete(2024);years.delete(2025);
  return [...years].sort();
}

function sameRecord(a,b){
  if(!a)return false;
  return Number(a.allTime)===Number(b.allTime)&&
    Number(a.years?.[2024])===130&&Number(a.years?.[2025])===50&&
    Number(a.months?.['2024-10'])===20&&Number(a.months?.['2024-11'])===20&&
    Number(a.months?.['2025-09'])===15;
}

function applyMigraineHistory(){
  const state=loadLocal();
  state.tideCounters||={};state.tideCounters.authoritativeTrackerTotals||={};
  const previous=state.tideCounters.authoritativeTrackerTotals[ID]||{};
  let allTime=180;
  for(const year of otherYears(state))allTime+=trackerTotal(state,ID,{year});
  const next={
    ...previous,
    allTime,
    years:{...(previous.years||{}),2024:130,2025:50},
    months:{...(previous.months||{}),'2024-10':20,'2024-11':20,'2025-09':15},
    note:'Authoritative migraine history: 2024=130 (Oct 20, Nov 20); 2025=50 (Sep 15). Other years remain live from recorded data.'
  };
  if(sameRecord(previous,next))return;
  next.updatedAt=new Date().toISOString();
  state.tideCounters.authoritativeTrackerTotals[ID]=next;
  saveLocal(state);
}

function applyCollisionSplit(){
  const state=loadLocal();
  state.settings||={};state.settings.migrations||={};state.tideCounters||={};state.tideCounters.authoritativeTrackerTotals||={};
  if(state.settings.migrations[COLLISION_SPLIT_MIGRATION])return;
  const rec=state.tideCounters.authoritativeTrackerTotals[COLLISIONS];
  if(!rec)return;
  rec.months={...(rec.months||{}),'2026-07':6,'2026-08':6};
  rec.updatedAt=new Date().toISOString();
  state.tideCounters.authoritativeTrackerTotals[COLLISIONS]=rec;
  state.settings.migrations[COLLISION_SPLIT_MIGRATION]=true;
  saveLocal(state);
}

function migraineDayTotal(state,date){
  return (state.occurrences||[]).filter(row=>row.trackerId===ID&&row.date===date).reduce((sum,row)=>sum+(Number(row.count)||0),0);
}
function toast(text,type='good'){
  const region=document.querySelector('#toast-region');if(!region)return;
  const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=text;region.append(el);setTimeout(()=>el.remove(),3400);
}
function correctMigraineDay(date,target){
  if(!date)return;
  const state=loadLocal(),current=migraineDayTotal(state,date),desired=Math.max(0,Math.floor(Number(target)||0)),delta=desired-current;
  if(delta===0){toast(`${date} is already at ${desired} migraine${desired===1?'':'s'}.`);return;}
  const stamp=new Date().toISOString();
  state.occurrences||=[];
  state.occurrences.push({
    id:`manual:migraine-correction:${globalThis.crypto?.randomUUID?.()||Date.now()}`,
    trackerId:ID,date,count:delta,value:desired,source:'manual',createdAt:stamp,
    snippet:`Migraine day corrected from ${current} to ${desired}`
  });
  saveLocal(state);
  applyMigraineHistory();
  toast(`Migraines on ${date} corrected from ${current} to ${desired}.`);
  setTimeout(()=>location.reload(),220);
}
function decorateMigraineModal(){
  const modal=document.querySelector('#modal');if(!modal?.open)return;
  if(document.querySelector('#modal-title')?.textContent?.trim()!=='Migraines')return;
  const body=document.querySelector('#modal-body');if(!body||body.querySelector('#migraine-day-correction'))return;
  const section=document.createElement('div');section.id='migraine-day-correction';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
  section.innerHTML=`<div class="section-title">CORRECT A MIGRAINE DAY</div>
    <div class="small muted" style="margin-bottom:10px">Set the exact number that should count on a date. Use 0 to remove a mistaken migraine or change 5 to 1 when auto-tracking overcounted.</div>
    <div class="grid grid-3">
      <label class="label">Date<input id="migraine-correct-date" class="input" type="date" value="${today}"></label>
      <label class="label">Current on date<input id="migraine-current-count" class="input" type="number" value="0" readonly></label>
      <label class="label">Set day total to<input id="migraine-target-count" class="input" type="number" min="0" value="0"></label>
    </div>
    <button id="migraine-correct-save" class="button primary" style="margin-top:12px">Set Migraine Day Total</button>`;
  const dated=[...body.querySelectorAll('.section-title')].find(el=>el.textContent?.trim()==='DATED HISTORY');
  if(dated)body.insertBefore(section,dated);else body.append(section);
  const date=section.querySelector('#migraine-correct-date'),current=section.querySelector('#migraine-current-count'),target=section.querySelector('#migraine-target-count');
  const update=()=>{const n=Math.max(0,migraineDayTotal(loadLocal(),date.value));current.value=String(n);target.value=String(n);};
  date.addEventListener('change',update);update();
  section.querySelector('#migraine-correct-save').onclick=()=>correctMigraineDay(date.value,target.value);
  body.querySelectorAll('.history-row b').forEach(el=>{if(/^\+\-/.test(el.textContent||''))el.textContent=(el.textContent||'').replace(/^\+\-/,'−');});
}

function fixTrackerRows(){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Trackers')return;
  root.querySelectorAll('.tracker-row').forEach(row=>{
    const name=row.querySelector('.tracker-name b')?.textContent?.trim();
    if(name==='Geoguessr 10K Streak')row.style.display='none';
    if(['Collisions','Walked into an object (Apartment)'].includes(name))row.style.display='';
  });
  const collisionInput=root.querySelector('#authoritative-collisions');
  if(collisionInput){
    const filter=collisionInput.closest('.filter-row'),title=filter?.previousElementSibling;
    if(title?.classList.contains('section-title')&&title.textContent?.trim()==='COLLISIONS')title.remove();
    filter?.remove();
  }
}

function refresh(){
  applyMigraineHistory();
  applyCollisionSplit();
  setTimeout(fixTrackerRows,40);
}

refresh();
document.addEventListener('click',event=>{
  if(event.target.closest('[data-view="trackers"],#save-day'))setTimeout(refresh,0);
  if(event.target.closest('[data-tracker="migraines"]'))setTimeout(decorateMigraineModal,0);
});
