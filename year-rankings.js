import { cloudPull, cloudStatus, loadLocal, mergeStates, saveLocal } from './storage.js';

const root=document.querySelector('#view-root');
const DEFAULT_DECADE_2020=[2027,2029,2026,2024,2028,2020,2022,2023,2025,2021];
const DEFAULT_ALL_TIME=[2027,2016,2029,2026,2015,2024,2019,2013,2028,2012];
let mode='decade';
let selectedDecade=null;
let dragged=null;

const now=()=>new Date().toISOString();
const currentYear=()=>Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric'}).format(new Date()));
const currentDecade=()=>Math.floor(currentYear()/10)*10;
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const projected=year=>Number(year)>=currentYear();
const decadeYears=start=>Array.from({length:10},(_,i)=>start+i);

async function pullSharedFirst(){
  try{
    const status=await cloudStatus();
    if(!status?.authenticated)return;
    const pulled=await cloudPull();
    if(!pulled?.state)return;
    const merged=mergeStates(loadLocal(),pulled.state);
    saveLocal(merged);
  }catch{}
}

function ensureRankings(){
  const state=loadLocal();
  const decade=currentDecade();
  const existing=state.yearRankings&&typeof state.yearRankings==='object'?state.yearRankings:null;
  const rankings=existing?{
    ...existing,
    decades:{...(existing.decades||{})},
    allTime:Array.isArray(existing.allTime)?existing.allTime.map(Number):DEFAULT_ALL_TIME.slice(),
  }:{decades:{},allTime:DEFAULT_ALL_TIME.slice(),updatedAt:now()};
  let changed=!existing;
  if(!Array.isArray(rankings.decades['2020'])||rankings.decades['2020'].length!==10){rankings.decades['2020']=DEFAULT_DECADE_2020.slice();changed=true;}
  for(let start=2020;start<=decade;start+=10){
    const key=String(start);
    if(!Array.isArray(rankings.decades[key])||rankings.decades[key].length!==10){rankings.decades[key]=decadeYears(start);changed=true;}
  }
  if(changed){rankings.updatedAt=now();state.yearRankings=rankings;saveLocal(state);}
  selectedDecade=selectedDecade??decade;
  if(!rankings.decades[String(selectedDecade)])selectedDecade=decade;
  return rankings;
}

function saveRankings(rankings){
  const state=loadLocal();
  rankings.updatedAt=now();
  state.yearRankings=rankings;
  saveLocal(state);
  showToast('Year rankings saved and syncing across devices.');
}

function showToast(text){
  const region=document.querySelector('#toast-region');if(!region)return;
  const el=document.createElement('div');el.className='toast good';el.textContent=text;region.append(el);setTimeout(()=>el.remove(),2600);
}

function rankRow(year,index,total,{removable=false}={}){
  return `<div class="card year-rank-row" draggable="true" data-year="${year}" data-index="${index}" style="display:grid;grid-template-columns:52px minmax(120px,1fr) auto auto;gap:12px;align-items:center;padding:14px 16px;margin-bottom:10px;cursor:grab">
    <div style="font-size:26px;font-weight:800;text-align:center">${index+1}</div>
    <div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:22px">${year}</b>${projected(year)?'<span class="chip accent">PROJECTED</span>':''}</div></div>
    <select class="select year-position" data-index="${index}" aria-label="Move year to ranking position" style="min-width:82px">${Array.from({length:total},(_,i)=>`<option value="${i}" ${i===index?'selected':''}>#${i+1}</option>`).join('')}</select>
    <div class="chip-row" style="justify-content:flex-end"><button class="button ghost rank-up" data-index="${index}" ${index===0?'disabled':''}>↑</button><button class="button ghost rank-down" data-index="${index}" ${index===total-1?'disabled':''}>↓</button>${removable?`<button class="button ghost rank-remove" data-index="${index}">Remove</button>`:''}</div>
  </div>`;
}

function availableDecades(){return Array.from({length:Math.floor((currentDecade()-2020)/10)+1},(_,i)=>2020+i*10);}
function availableAllTimeYears(list){
  const max=currentDecade()+9,set=new Set(list.map(Number)),years=[];
  for(let y=2006;y<=max;y++)if(!set.has(y))years.push(y);
  return years;
}

function render(){
  const rankings=ensureRankings();
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='year-rankings'));
  const eyebrow=document.querySelector('#view-eyebrow');if(eyebrow)eyebrow.textContent='YEAR RANKINGS';
  document.querySelector('#sidebar')?.classList.remove('open');document.querySelector('#sidebar-scrim')?.classList.remove('show');
  if(mode==='decade')renderDecade(rankings);else renderAllTime(rankings);
}

function shell(title,subtitle,body){
  root.innerHTML=`<div class="page-head"><div><div class="eyebrow">T.I.D.E.</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="chip-row"><button id="rank-mode-decade" class="button ${mode==='decade'?'primary':'ghost'}">Decade Rankings</button><button id="rank-mode-all" class="button ${mode==='all-time'?'primary':'ghost'}">All-Time Years</button></div></div>${body}`;
  root.querySelector('#rank-mode-decade').onclick=()=>{mode='decade';render();};
  root.querySelector('#rank-mode-all').onclick=()=>{mode='all-time';render();};
}

function renderDecade(rankings){
  const starts=availableDecades();
  if(!starts.includes(selectedDecade))selectedDecade=starts.at(-1);
  const list=rankings.decades[String(selectedDecade)];
  const selector=starts.length>1?`<select id="decade-select" class="select">${starts.map(d=>`<option value="${d}" ${d===selectedDecade?'selected':''}>${d}s</option>`).join('')}</select>`:`<span class="chip">${selectedDecade}s</span>`;
  shell('Decade Rankings','Rank every year within a decade. PROJECTED disappears automatically when that year has finished.',`
    <section class="card" style="margin-bottom:18px"><div class="card-header"><div><h2>${selectedDecade}s</h2><div class="small muted">Drag a year, use ↑/↓, or choose its exact ranking number.</div></div>${selector}</div></section>
    <div id="year-rank-list">${list.map((y,i)=>rankRow(y,i,list.length)).join('')}</div>`);
  const select=root.querySelector('#decade-select');if(select)select.onchange=()=>{selectedDecade=Number(select.value);render();};
  wireList('decade',String(selectedDecade));
}

function renderAllTime(rankings){
  const list=rankings.allTime;
  const choices=availableAllTimeYears(list);
  shell('All-Time Year Rankings','Your overall year ranking starts at 2006. Add years whenever you want, then drag or move them into place.',`
    <section class="card" style="margin-bottom:18px"><div class="card-header"><div><h2>All-Time Years</h2><div class="small muted">Current list has ${list.length} ranked years. Years before 2006 are intentionally excluded.</div></div></div>
      <div class="filter-row" style="margin-top:14px"><label class="label" style="min-width:150px">Year<input id="add-year" class="input" type="number" min="2006" max="${currentDecade()+9}" list="available-years" placeholder="2006+"><datalist id="available-years">${choices.map(y=>`<option value="${y}"></option>`).join('')}</datalist></label><label class="label">Add at position<select id="add-position" class="select">${Array.from({length:list.length+1},(_,i)=>`<option value="${i}">#${i+1}</option>`).join('')}</select></label><button id="add-ranked-year" class="button primary">Add Year</button></div>
    </section>
    <div id="year-rank-list">${list.map((y,i)=>rankRow(y,i,list.length,{removable:true})).join('')}</div>`);
  root.querySelector('#add-ranked-year').onclick=()=>{
    const year=Math.floor(Number(root.querySelector('#add-year').value)),position=Number(root.querySelector('#add-position').value);
    if(!Number.isFinite(year)||year<2006||year>currentDecade()+9)return showToast(`Choose a year from 2006 through ${currentDecade()+9}.`);
    if(list.includes(year))return showToast(`${year} is already ranked.`);
    const next=ensureRankings();next.allTime.splice(position,0,year);saveRankings(next);render();
  };
  wireList('all-time','allTime');
}

function move(type,key,from,to){
  const rankings=ensureRankings();
  const list=type==='decade'?rankings.decades[key]:rankings.allTime;
  if(from<0||from>=list.length||to<0||to>=list.length||from===to)return;
  const [item]=list.splice(from,1);list.splice(to,0,item);saveRankings(rankings);render();
}

function wireList(type,key){
  const listEl=root.querySelector('#year-rank-list');if(!listEl)return;
  listEl.querySelectorAll('.rank-up').forEach(b=>b.onclick=()=>move(type,key,Number(b.dataset.index),Number(b.dataset.index)-1));
  listEl.querySelectorAll('.rank-down').forEach(b=>b.onclick=()=>move(type,key,Number(b.dataset.index),Number(b.dataset.index)+1));
  listEl.querySelectorAll('.year-position').forEach(s=>s.onchange=()=>move(type,key,Number(s.dataset.index),Number(s.value)));
  listEl.querySelectorAll('.rank-remove').forEach(b=>b.onclick=()=>{
    const rankings=ensureRankings(),list=rankings.allTime;list.splice(Number(b.dataset.index),1);saveRankings(rankings);render();
  });
  listEl.querySelectorAll('.year-rank-row').forEach(row=>{
    row.addEventListener('dragstart',()=>{dragged={type,key,index:Number(row.dataset.index)};row.style.opacity='.55';});
    row.addEventListener('dragend',()=>{dragged=null;row.style.opacity='';});
    row.addEventListener('dragover',e=>e.preventDefault());
    row.addEventListener('drop',e=>{e.preventDefault();if(!dragged||dragged.type!==type||dragged.key!==key)return;move(type,key,dragged.index,Number(row.dataset.index));});
  });
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-view="year-rankings"]');
  if(!button)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();render();
},true);

await pullSharedFirst();
ensureRankings();
