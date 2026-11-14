// Browser-independent date and month picker for T.I.D.E.'s filter and jump
// controls. The actual T.I.D.E. calendar grid is not modified.
export const DATE_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad=value=>String(value).padStart(2,'0');
export const isoDate=(year,month,day)=>String(year)+'-'+pad(month)+'-'+pad(day);
export const isoMonth=(year,month)=>String(year)+'-'+pad(month);
export const validDate=value=>{
  if(!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(String(value||'')))return false;
  const [year,month,day]=value.split('-').map(Number);
  return day<=new Date(Date.UTC(year,month,0)).getUTCDate();
};
export const validMonth=value=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(value||''));
export const inDateRange=(value,{min='',max='',mode='date'}={})=>{
  if(!(mode==='month'?validMonth(value):validDate(value)))return false;
  return (!min||value>=min)&&(!max||value<=max);
};
export function monthGrid(year,month,{min='',max=''}={}){
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  const offset=new Date(Date.UTC(year,month-1,1)).getUTCDay();
  const days=Array.from({length:offset},()=>null);
  for(let day=1;day<=count;day++){
    const date=isoDate(year,month,day);
    days.push({date,day,enabled:inDateRange(date,{min,max})});
  }
  while(days.length%7)days.push(null);
  return days;
}
export function pickerYears({min='',max='',mode='date'}={},activeYear=new Date().getFullYear()){
  const low=min?Number(min.slice(0,4)):2018;
  const high=max?Number(max.slice(0,4)):Math.max(2100,Number(activeYear)+2);
  if(low>high)return [];
  return Array.from({length:high-low+1},(_,i)=>low+i);
}
const todayISO=()=>{const x=new Date();return isoDate(x.getFullYear(),x.getMonth()+1,x.getDate())};
const cleanLabel=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,90);
const asLabel=(value,mode)=>{
  if(!inDateRange(value,{mode}))return mode==='month'?'Select month':'Select date';
  const year=Number(value.slice(0,4)),month=Number(value.slice(5,7));
  return mode==='month'?DATE_MONTHS[month-1]+' '+year:
    DATE_MONTHS[month-1].slice(0,3)+' '+Number(value.slice(8,10))+', '+year;
};

export function installDatePicker(host=document){
  if(!host?.querySelector||!host?.createElement)return;
  if(host.querySelector('#tide-date-picker-dialog'))return; // once per document

  const dialog=host.createElement('dialog');
  dialog.id='tide-date-picker-dialog';
  dialog.className='tide-date-picker-dialog';
  dialog.setAttribute('aria-labelledby','tide-date-picker-title');
  host.body.append(dialog);
  let current=null;
  const rangeOf=input=>({min:input.getAttribute('min')||'',max:input.getAttribute('max')||'',mode:input.dataset.tidePickerKind||'date'});
  const allowed=(date)=>inDateRange(date,rangeOf(current.input));
  const choose=date=>{
    if(!current||date&&!allowed(date))return;
    const {input,button,mode}=current;
    input.value=date;
    button.querySelector('.tide-date-trigger-label').textContent=asLabel(date,mode);
    button.classList.toggle('tide-date-trigger--empty',!date);
    dialog.close();
    // Preserve existing onchange handlers and form/diary save logic.
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const redraw=()=>{
    if(!current)return;
    const {year,month,mode,input}=current;
    const grid=dialog.querySelector('[data-date-grid]');
    const prev=dialog.querySelector('[data-date-prev]');
    const next=dialog.querySelector('[data-date-next]');
    const ySel=dialog.querySelector('[data-date-year]');
    const mSel=dialog.querySelector('[data-date-month]');
    ySel.value=String(year);
    mSel.value=String(month);
    const months=pickerYears(rangeOf(input),year);
    const before=month===1?isoMonth(year-1,12):isoMonth(year,month-1);
    const after=month===12?isoMonth(year+1,1):isoMonth(year,month+1);
    // Allow neighboring months when their respective month intersects the min/max.
    const range=rangeOf(input),monthAvailable=m=>inDateRange(m,{min:range.min.slice(0,7),max:range.max.slice(0,7),mode:'month'});
    prev.disabled=!monthAvailable(before);
    next.disabled=!monthAvailable(after);
    if(mode==='month'){
      const tiles=DATE_MONTHS.map((label,index)=>{
        const key=isoMonth(year,index+1),enabled=monthAvailable(key);
        const selected=input.value===key;
        return '<button type="button" class="tide-date-month-tile'+(selected?' is-selected':'')+'" data-choose="'+key+'"'+
          (enabled?'':' disabled')+' aria-pressed="'+selected+'">'+label.slice(0,3)+'</button>';
      }).join('');
      grid.className='tide-date-month-grid';
      grid.innerHTML=tiles;
    }else{
      const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>'<span class="tide-date-weekday">'+day+'</span>').join('');
      const today=todayISO();
      grid.className='tide-date-day-grid';
      grid.innerHTML=weekdays+monthGrid(year,month,range).map(item=>{
        if(!item)return '<span class="tide-date-day-gap" aria-hidden="true"></span>';
        const selected=item.date===input.value,actual=item.date===today;
        return '<button class="tide-date-day'+(selected?' is-selected':'')+(actual?' is-today':'')+'" type="button"'+
          ' data-choose="'+item.date+'" aria-label="'+asLabel(item.date,'date')+'" aria-pressed="'+selected+'"'+
          (actual?' aria-current="date"':'')+(item.enabled?'':' disabled')+'>'+item.day+'</button>';
      }).join('');
    }
    dialog.querySelector('[data-date-today]').disabled=!allowed(mode==='month'?todayISO().slice(0,7):todayISO());
  };
  const open=(input,button)=>{
    const mode=input.dataset.tidePickerKind||'date',range=rangeOf(input),today=todayISO();
    const candidate=mode==='month'?today.slice(0,7):today;
    const initial=inDateRange(input.value,range)?input.value:
      inDateRange(candidate,range)?candidate:range.min||range.max||candidate;
    const year=Number(initial.slice(0,4)),month=Number(initial.slice(5,7));
    current={input,button,mode,year,month};
    const yrOptions=pickerYears(range,year).map(y=>'<option value="'+y+'"'+(y===year?' selected':'')+'>'+y+'</option>').join('');
    const moOptions=DATE_MONTHS.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
    const title=cleanLabel(input.getAttribute('aria-label')||input.closest('label')?.textContent||'')||'Jump to date';
    const canClear=!input.required&&!['otd-date-picker','today-date-jump','cal-jump','health-month'].includes(input.id);
    dialog.innerHTML='<div class="tide-date-picker-frame">'+
      '<div class="tide-date-picker-head"><div><div class="tide-date-picker-eyebrow">✦ T.I.D.E. · DATE NAVIGATOR</div>'+
      '<h2 id="tide-date-picker-title">'+(mode==='month'?'Choose a month':'Choose a date')+'</h2>'+
      '<p class="tide-date-picker-subtitle">Jump straight to any year or month. No endless scrolling.</p></div>'+
      '<button type="button" class="tide-date-picker-close" data-date-close aria-label="Close date picker">×</button></div>'+
      '<div class="tide-date-picker-controls"><button class="tide-date-picker-arrow" type="button" data-date-prev aria-label="Previous month">‹</button>'+
      '<label class="tide-date-picker-select-label">Month<select data-date-month aria-label="Choose month">'+moOptions+'</select></label>'+
      '<label class="tide-date-picker-select-label">Year<select data-date-year aria-label="Choose year">'+yrOptions+'</select></label>'+
      '<button class="tide-date-picker-arrow" type="button" data-date-next aria-label="Next month">›</button></div>'+
      '<div class="tide-date-picker-grid" data-date-grid></div>'+
      '<div class="tide-date-picker-bottom"><span class="tide-date-picker-hint">'+
      (mode==='month'?'Select a month to jump there.':'Choose a day above. Change year directly using the dropdown.')+'</span>'+
      '<div class="tide-date-picker-bottom-actions">'+
      (canClear?'<button type="button" data-date-clear>Clear</button>':'')+
      '<button type="button" data-date-today>Today</button>'+
      '<button type="button" class="tide-date-picker-done" data-date-close>Cancel</button>'+
      '</div></div></div>';
    // The dialog is a top-layer modal, so it is never clipped by a card,
    // sidebar, mobile dock or a nested scroll container.
    if(!dialog.open)dialog.showModal();
    redraw();
    dialog.querySelector('[data-date-year]')?.focus({preventScroll:true});
  };
  const enhance=container=>{
    if(!container?.querySelectorAll)return;
    for(const input of container.querySelectorAll('input[type="date"],input[type="month"]')){
      if(input.dataset.tidePickerEnhanced==='yes'||input.disabled)continue;
      const mode=input.type;
      input.dataset.tidePickerEnhanced='yes';
      input.dataset.tidePickerKind=mode;
      const description=cleanLabel(input.getAttribute('aria-label')||input.closest('label')?.textContent||'')||
        (mode==='month'?'Select month':'Select date');
      // Use a hidden original control: existing id, value, min/max and event
      // handlers remain in place; Edge has no native date popup to launch.
      input.type='hidden';
      input.tabIndex=-1;
      const button=host.createElement('button');
      button.type='button';
      button.className='tide-date-trigger'+(input.value?'':' tide-date-trigger--empty');
      button.dataset.tideDateFor=input.id||'';
      button.setAttribute('aria-haspopup','dialog');
      button.setAttribute('aria-label',description);
      const label=host.createElement('span');
      label.className='tide-date-trigger-label';
      label.textContent=asLabel(input.value,mode);
      const icon=host.createElement('span');
      icon.className='tide-date-trigger-icon';icon.setAttribute('aria-hidden','true');icon.textContent='▦';
      button.append(label,icon);
      input.insertAdjacentElement('afterend',button);
      button.addEventListener('click',()=>open(input,button));
    }
  };
  dialog.addEventListener('click',e=>{
    const chosen=e.target.closest('[data-choose]');
    if(chosen){choose(chosen.dataset.choose);return;}
    if(e.target.closest('[data-date-close]')){dialog.close();return;}
    if(e.target.closest('[data-date-clear]')){choose('');return;}
    if(e.target.closest('[data-date-today]')){
      const today=todayISO();choose(current.mode==='month'?today.slice(0,7):today);return;
    }
    const move=e.target.closest('[data-date-prev],[data-date-next]');
    if(move){
      const step=move.hasAttribute('data-date-next')?1:-1;
      const d=new Date(Date.UTC(current.year,current.month-1+step,1));
      current.year=d.getUTCFullYear();current.month=d.getUTCMonth()+1;redraw();
    }
  });
  dialog.addEventListener('change',e=>{
    if(!current)return;
    if(e.target.matches('[data-date-year]'))current.year=Number(e.target.value);
    else if(e.target.matches('[data-date-month]'))current.month=Number(e.target.value);
    else return;
    redraw();
  });
  dialog.addEventListener('close',()=>{
    const button=current?.button;
    current=null;
    if(button?.isConnected)button.focus({preventScroll:true});
  });
  const root=host.querySelector('#view-root'),modalBody=host.querySelector('#modal-body');
  // Re-rendered pages and modal forms get the same picker automatically.
  const observer=new MutationObserver(()=>{
    enhance(root);enhance(modalBody);
  });
  if(root)observer.observe(root,{childList:true,subtree:true});
  if(modalBody)observer.observe(modalBody,{childList:true,subtree:true});
  host.addEventListener('tide:view-rendered',()=>enhance(root));
  enhance(root);enhance(modalBody);
}
if(typeof document!=='undefined')installDatePicker(document);
