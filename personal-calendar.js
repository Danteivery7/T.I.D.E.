import { holidaysOnDate, holidaysForMonth } from './calendar-data.js';
const DAY=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const titleCase=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,110);
export const KNOWN_BIRTHDAYS=[
  ['01-21',"Mom's Birthday"],['04-06',"Grandpa Mike's Birthday"],['04-08',"Dad's Birthday"],
  ['05-09',"T's Birthday"],['06-29',"Bema's Birthday"],['07-11',"Carter's Birthday"],
  ['07-21',"Rocco's Birthday"],['07-27',"Smitty's Birthday"],['07-31',"My Birthday"],
  ['08-05',"Dylan's Birthday"]
];
export const LANDMARK_DATES=[
  {date:'2026-06-13',name:'KNICKS NBA CHAMPIONSHIP',kind:'personal',theme:'knicks',prefill:true,id:'landmark-knicks-2026'},
  {date:'2026-06-18',name:'KNICKS CHAMPIONSHIP PARADE',kind:'personal',theme:'knicks',prefill:true,id:'landmark-knicks-parade-2026'}
];
const pad=n=>String(n).padStart(2,'0');
const validDate=date=>DAY.test(date)&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
export function personalCalendarEvents(state,date){
  if(!validDate(String(date)))return [];
  const md=date.slice(5),result=[];
  for(const [day,name] of KNOWN_BIRTHDAYS)if(day===md)result.push({id:'birthday-'+day,date,name,kind:'birthday',repeat:'yearly',source:'diary-confirmed'});
  for(const item of LANDMARK_DATES)if(item.date===date)result.push({...item,source:'diary-confirmed'});
  for(const row of Object.values(state?.calendarEvents||{})){
    if(!row||row.deleted||!row.name||!validDate(String(row.date||'')))continue;
    if(row.date===date||(row.repeat==='yearly'&&row.date.slice(5)===md))result.push({...row,date,kind:row.kind||'personal',source:'user'});
  }
  return result.sort((a,b)=>(a.source==='user'?-1:0)-(b.source==='user'?-1:0)||a.name.localeCompare(b.name));
}
export function calendarEventsOnDate(state,date){
  const personal=personalCalendarEvents(state,date);
  const system=holidaysOnDate(date).map(h=>({...h,id:'holiday:'+h.date+':'+h.name,source:'calendar',theme:'none'}));
  return [...personal,...system];
}
export function calendarEventsForMonth(state,month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
  const days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate(),list=[];
  for(let d=1;d<=days;d++)list.push(...calendarEventsOnDate(state,month+'-'+pad(d)));
  return list.sort((a,b)=>a.date.localeCompare(b.date)||(a.source==='user'?-1:1));
}
export function writeCalendarEvent(state,raw){
  const date=String(raw?.date||''),name=titleCase(raw?.name);
  if(!validDate(date)||!name)throw new Error('Choose a valid date and event name.');
  const kind=['personal','birthday','release','sports','celebration'].includes(raw.kind)?raw.kind:'personal';
  const theme=['none','knicks','birthday','gold','thanksgiving','christmas','st-patrick','independence','halloween','new-year','easter'].includes(raw.theme)?raw.theme:'none';
  state.calendarEvents||={};
  const id=raw.id&&state.calendarEvents[raw.id]?raw.id:globalThis.crypto?.randomUUID?.()||'event-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  state.calendarEvents[id]={id,date,name,kind,theme,repeat:raw.repeat==='yearly'?'yearly':'once',prefill:raw.prefill!==false,updatedAt:new Date().toISOString()};
  return state.calendarEvents[id];
}
export function removeCalendarEvent(state,id){
  if(!state.calendarEvents?.[id])return false;
  state.calendarEvents[id]={...state.calendarEvents[id],deleted:true,updatedAt:new Date().toISOString()};
  return true;
}
const HEADING_HOLIDAYS=new Set(['Christmas Day','Christmas Eve',"New Year's Day","New Year's Eve",'Thanksgiving',"St. Patrick's Day",'Easter Sunday','Halloween',"Independence Day","Valentine's Day","Veterans Day",'Memorial Day']);
const headingName=event=>event.name==='Grand Theft Auto VI release'?'GTA VI RELEASE DAY':event.name==="New Year's Day"?"NEW YEAR'S DAY":event.name.toUpperCase();
export function proposedDiaryHeading(state,date){
  const events=calendarEventsOnDate(state,date);
  const personal=events.find(e=>e.source==='user'&&e.prefill!==false)||events.find(e=>e.kind==='birthday')||events.find(e=>e.kind==='personal'&&e.prefill)||events.find(e=>e.kind==='special');
  const holiday=events.find(e=>HEADING_HOLIDAYS.has(e.name)&&e.kind!=='observed');
  const chosen=personal||holiday;
  return chosen?headingName(chosen)+', ':'';
}
export function birthdaySuggestions(state){
  const known=new Set(KNOWN_BIRTHDAYS.map(([md])=>md));
  for(const event of Object.values(state?.calendarEvents||{}))if(!event.deleted&&event.kind==='birthday')known.add(String(event.date||'').slice(5));
  const found=new Map();
  for(const [date,row] of Object.entries(state?.entries||{})){
    if(!validDate(date)||known.has(date.slice(5)))continue;
    const first=String(row?.text||'').split(/[,;\n]/)[0].trim();
    const match=first.match(/(?:^|\b)([\w'’.-]+(?:\s+[\w'’.-]+){0,2})[’']?s?\s+(?:birthday|b[- ]day)\b/i);
    if(!match)continue;
    const person=titleCase(match[1]);
    if(!person||/^(happy|woke|today|my|someone|birthday)$/i.test(person))continue;
    const key=date.slice(5)+':'+person.toLowerCase();
    if(!found.has(key))found.set(key,{date,name:person.replace(/\s*'s$/i,'')+"'s Birthday",kind:'birthday',repeat:'yearly',source:'suggested'});
  }
  return [...found.values()].slice(0,30);
}
