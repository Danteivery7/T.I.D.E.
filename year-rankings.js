import { cloudPull, cloudStatus, loadLocal, mergeStates, saveLocal } from './storage.js';
import { yearRankStatus, yearRankSummary, repositionYear, YEAR_RANKING_STATUS_LABELS } from './year-ranking-utils.js';

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
  showToast('Your year rankings were saved.');
}

function showToast(text){
  const region=document.querySelector('#toast-region');if(!region)return;
  const el=document.createElement('div');el.className='toast good';el.textContent=text;region.append(el);setTimeout(()=>el.remove(),2600);
}

function rankRow(year,index,total,{removable=false}={}){
  const position=index+1,status=yearRankStatus(year,currentYear()),statusText=YEAR_RANKING_STATUS_LABELS[status],featured=position<=3;
  return `<article class="yrk-row ${featured?'yrk-row--featured':''} yrk-row--${status}" draggable="true" data-year="${year}" data-index="${index}" aria-label="Rank ${position}: ${year}, ${statusText}. Use the position selector or move buttons to reorder.">
    <div class="yrk-row-rank"><small>RANK</small><strong>${String(position).padStart(2,'0')}</strong></div>
    <div class="yrk-row-name"><span class="yrk-row-handle" aria-hidden="true">⠿</span><div class="yrk-row-year"><b>${year}</b><span class="yrk-status yrk-status--${status}">${esc(statusText)}</span></div></div>
    <label class="yrk-row-position"><span>Move to</span><select class="year-position" data-index="${index}" aria-label="Move ${year} to rank position">${Array.from({length:total},(_,i)=>`<option value="${i}" ${i===index?'selected':''}>#${i+1}</option>`).join('')}</select></label>
    <div class="yrk-row-actions"><button type="button" class="yrk-row-action rank-up" data-index="${index}" title="Move ${year} up" aria-label="Move ${year} up" ${index===0?'disabled':''}>↑</button>
      <button type="button" class="yrk-row-action rank-down" data-index="${index}" title="Move ${year} down" aria-label="Move ${year} down" ${index===total-1?'disabled':''}>↓</button>
      ${removable?`<button type="button" class="yrk-row-remove rank-remove" data-index="${index}" aria-label="Remove ${year} from all-time ranking">Remove</button>`:''}</div>
  </article>`;
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

function rankedPodium(list){
  if(!list.length)return `<div class="yrk-podium-empty"><span aria-hidden="true">✦</span><h3>Your podium is waiting.</h3><p>Add a year to build your all-time rankings.</p></div>`;
  const titles=["Your #1 Year","Second Place","Third Place"],symbols=["✦","◆","✧"];
  return `<section class="yrk-podium-section"><div class="yrk-section-heading"><div><span class="yrk-section-eyebrow">THE TOP THREE</span><h3>Your year podium</h3><p>These are your personal picks, not calculated scores.</p></div><span class="yrk-section-mini">THE YEARS YOU CHOSE</span></div>
    <div class="yrk-podium">${list.slice(0,3).map((year,index)=>{
      const status=yearRankStatus(year,currentYear());
      return `<article class="yrk-podium-card yrk-podium--${index+1}"><div class="yrk-podium-sheen" aria-hidden="true"></div>
        <div class="yrk-podium-top"><span>#${index+1} · ${esc(titles[index])}</span><span aria-hidden="true">${symbols[index]}</span></div>
        <div class="yrk-podium-main"><div class="yrk-podium-number">${year}</div><div class="yrk-podium-medal" aria-hidden="true">${String(index+1).padStart(2,'0')}</div></div>
        <div class="yrk-podium-footer"><span class="yrk-status yrk-status--${status}">${esc(YEAR_RANKING_STATUS_LABELS[status])}</span><span>YOUR RANK #${index+1}</span></div></article>`;
    }).join('')}</div>
  </section>`;
}

function rankingsLineup(list,{removable=false}={}){
  return `<section class="yrk-lineup-section"><div class="yrk-section-heading"><div><span class="yrk-section-eyebrow">YOUR COMPLETE ORDER</span><h3>Ranked lineup</h3><p>Drag to rearrange on desktop, or use the arrows and position picker on any device.</p></div><span class="yrk-section-mini">${list.length} RANKED ${list.length===1?'YEAR':'YEARS'}</span></div>
    ${list.length?`<div id="year-rank-list" class="yrk-list">${list.map((y,i)=>rankRow(y,i,list.length,{removable})).join('')}</div>`:'<div id="year-rank-list" class="yrk-list-empty">No years added yet. Choose a year above to start ranking.</div>'}
    <div class="yrk-edit-hint"><span aria-hidden="true">✧</span> Every change saves automatically. Rankings are your personal preferences, including any future years you choose to place.</div></section>`;
}

function shell(title,subtitle,body,list){
  const count=yearRankSummary(list,currentYear()),scope=mode==='decade'?'DECADE VIEW':'ALL-TIME VIEW';
  root.innerHTML=`<div class="page-head yrk-page-head"><div><div class="eyebrow">T.I.D.E. · THE YEARS YOU RANK</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></div>
    <div class="yrk-explorer">
      <div class="yrk-hero"><div class="yrk-hero-copy"><span class="yrk-hero-eyebrow">✦ YOUR PERSONAL HALL OF YEARS</span><h2>The years that<br><em>shaped your story.</em></h2><p>A ranking only you can make. Put the memories, milestones and eras of your life in your own order.</p>
        <div class="yrk-hero-note"><span aria-hidden="true">✷</span> Personal rankings, not algorithmic predictions</div></div>
        <div class="yrk-hero-art" aria-hidden="true"><div class="yrk-hero-ring"></div><div class="yrk-hero-medal">#1</div><span class="yrk-hero-sparkle">✦</span></div>
      </div>
      <div class="yrk-toolbar"><div class="yrk-mode-buttons" role="group" aria-label="Choose ranking view">
        <button type="button" id="rank-mode-decade" class="yrk-mode-button ${mode==='decade'?'is-active':''}" aria-pressed="${mode==='decade'}">Decade Rankings</button>
        <button type="button" id="rank-mode-all" class="yrk-mode-button ${mode==='all-time'?'is-active':''}" aria-pressed="${mode==='all-time'}">All-Time Years</button></div>
        <span class="yrk-mode-caption">${scope} · YOUR OWN ORDER</span>
      </div>
      <div class="yrk-stats"><div class="yrk-stat yrk-stat--leader"><span>TOP-RANKED YEAR</span><b>${count.leader??'—'}</b><small>${count.leader!==null?esc(YEAR_RANKING_STATUS_LABELS[yearRankStatus(count.leader,currentYear())]):'No year selected'}</small></div>
        <div class="yrk-stat"><span>YEARS RANKED</span><b>${count.total}</b><small>In this leaderboard</small></div>
        <div class="yrk-stat"><span>COMPLETED YEARS</span><b>${count.completed}</b><small>Years already finished</small></div>
        <div class="yrk-stat yrk-stat--future"><span>IN PROGRESS / FUTURE</span><b>${count.inProgress+count.projected}</b><small>${count.inProgress} current · ${count.projected} future</small></div></div>
      ${body}
    </div>`;
  root.querySelector('#rank-mode-decade').onclick=()=>{mode='decade';render()};
  root.querySelector('#rank-mode-all').onclick=()=>{mode='all-time';render()};
}

function renderDecade(rankings){
  const starts=availableDecades();
  if(!starts.includes(selectedDecade))selectedDecade=starts.at(-1);
  const list=rankings.decades[String(selectedDecade)];
  const selector=starts.length>1?`<label class="yrk-decade-picker">Choose decade <select id="decade-select" aria-label="Choose decade">${starts.map(d=>`<option value="${d}" ${d===selectedDecade?'selected':''}>${d}s</option>`).join('')}</select></label>`:`<span class="yrk-decade-single">${selectedDecade}s</span>`;
  shell('Year & Decade Rankings','Your personal ranking of each year, with a separate all-time leaderboard.',`
    <div class="yrk-scope-panel"><div><span class="yrk-section-eyebrow">THE DECADE COLLECTION</span><h3>${selectedDecade}s · Your ranking</h3><p>All ten years stay in your chosen order. Current and future years are identified clearly.</p></div>${selector}</div>
    ${rankedPodium(list)}
    ${rankingsLineup(list)}`,list);
  const select=root.querySelector('#decade-select');if(select)select.onchange=()=>{selectedDecade=Number(select.value);render()};
  wireList('decade',String(selectedDecade));
}

function renderAllTime(rankings){
  const list=rankings.allTime,choices=availableAllTimeYears(list),max=currentDecade()+9;
  shell('Year & Decade Rankings','Your favorite years from 2006 onward, in an order that only you decide.',`
    <div class="yrk-scope-panel"><div><span class="yrk-section-eyebrow">YOUR ALL-TIME COLLECTION</span><h3>Every year that matters</h3><p>Build your personal top years list starting in 2006. Only years you add appear here.</p></div><span class="yrk-decade-single">2006 → ${max}</span></div>
    ${rankedPodium(list)}
    <section class="yrk-add-panel"><div class="yrk-add-intro"><div class="yrk-section-eyebrow">BUILD YOUR RANKING</div><h3>Add another year</h3><p>Choose a year and where you want it to enter the leaderboard.</p></div>
      <div class="yrk-add-controls"><label class="yrk-add-field">Year<input id="add-year" type="number" min="2006" max="${max}" list="available-years" placeholder="2006 – ${max}" inputmode="numeric"><datalist id="available-years">${choices.map(y=>`<option value="${y}"></option>`).join('')}</datalist></label>
      <label class="yrk-add-field">Starting position<select id="add-position">${Array.from({length:list.length+1},(_,i)=>`<option value="${i}" ${i===list.length?'selected':''}>#${i+1}</option>`).join('')}</select></label>
      <button id="add-ranked-year" type="button" class="yrk-add-button"><span>Add Year</span><span aria-hidden="true">↗</span></button></div>
      <p class="yrk-add-help">Year choices include future placeholders. Adding a year changes only your manual ranking, not your diary history.</p></section>
    ${rankingsLineup(list,{removable:true})}`,list);
  root.querySelector('#add-ranked-year').onclick=()=>{
    const input=root.querySelector('#add-year').value.trim(),year=Number(input),position=Number(root.querySelector('#add-position').value);
    if(!/^\d{4}$/.test(input)||!Number.isInteger(year)||year<2006||year>max)return showToast(`Choose a year from 2006 through ${max}.`);
    if(list.includes(year))return showToast(`${year} is already ranked.`);
    const next=ensureRankings();next.allTime.splice(position,0,year);saveRankings(next);render();
  };
  wireList('all-time','allTime');
}

function move(type,key,from,to){
  const rankings=ensureRankings(),list=type==='decade'?rankings.decades[key]:rankings.allTime;
  const moved=repositionYear(list,from,to);
  if(!moved)return;
  if(type==='decade')rankings.decades[key]=moved;else rankings.allTime=moved;
  saveRankings(rankings);render();
}

function wireList(type,key){
  const listEl=root.querySelector('#year-rank-list');if(!listEl)return;
  listEl.querySelectorAll('.rank-up').forEach(b=>b.onclick=()=>move(type,key,Number(b.dataset.index),Number(b.dataset.index)-1));
  listEl.querySelectorAll('.rank-down').forEach(b=>b.onclick=()=>move(type,key,Number(b.dataset.index),Number(b.dataset.index)+1));
  listEl.querySelectorAll('.year-position').forEach(sel=>sel.onchange=()=>move(type,key,Number(sel.dataset.index),Number(sel.value)));
  listEl.querySelectorAll('.rank-remove').forEach(b=>b.onclick=()=>{
    const n=ensureRankings(),index=Number(b.dataset.index);
    if(!Number.isInteger(index)||index<0||index>=n.allTime.length)return;
    n.allTime=n.allTime.filter((_,i)=>i!==index);saveRankings(n);render();
  });
  const clearHighlights=()=>listEl.querySelectorAll('.yrk-row.is-drag-over').forEach(row=>row.classList.remove('is-drag-over'));
  listEl.querySelectorAll('.yrk-row').forEach(row=>{
    row.addEventListener('dragstart',e=>{
      dragged={type,key,index:Number(row.dataset.index)};
      if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',row.dataset.year)}
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend',()=>{dragged=null;row.classList.remove('is-dragging');clearHighlights()});
    row.addEventListener('dragover',e=>{
      if(!dragged||dragged.type!==type||dragged.key!==key)return;
      e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
      clearHighlights();row.classList.add('is-drag-over');
    });
    row.addEventListener('dragleave',()=>row.classList.remove('is-drag-over'));
    row.addEventListener('drop',e=>{
      e.preventDefault();clearHighlights();
      if(!dragged||dragged.type!==type||dragged.key!==key)return;
      const from=dragged.index,to=Number(row.dataset.index);
      dragged=null;move(type,key,from,to);
    });
  });
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-view="year-rankings"]');
  if(!button)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();render();
},true);

await pullSharedFirst();
ensureRankings();
