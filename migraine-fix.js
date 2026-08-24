import { loadLocal, saveLocal } from './storage.js';
import { trackerTotal } from './engine-v4.js';

const ID='migraines';
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

function hideDuplicate10k(){
  if((root?.querySelector('.page-head h1')?.textContent||'')!=='Trackers')return;
  root.querySelectorAll('.tracker-row').forEach(row=>{
    if(row.querySelector('.tracker-name b')?.textContent?.trim()==='Geoguessr 10K Streak')row.style.display='none';
  });
}

function refresh(){
  applyMigraineHistory();
  requestAnimationFrame(()=>requestAnimationFrame(hideDuplicate10k));
}

refresh();
document.addEventListener('click',event=>{
  if(event.target.closest('[data-view="trackers"],#save-day'))setTimeout(refresh,0);
});
