// U.S. calendar dates: federal holidays, observances, and special events.
// Local-only calculations; no network or private-data access.
export const CALENDAR_MONTHS=[
  {name:'January',tagline:'A new chapter begins',motif:'01'},
  {name:'February',tagline:'The season of connection',motif:'02'},
  {name:'March',tagline:'Fresh energy, fresh ideas',motif:'03'},
  {name:'April',tagline:'Everything comes alive',motif:'04'},
  {name:'May',tagline:'Make the most of it',motif:'05'},
  {name:'June',tagline:'Long days. Bigger memories.',motif:'06'},
  {name:'July',tagline:'The heart of summer',motif:'07'},
  {name:'August',tagline:'Keep the momentum',motif:'08'},
  {name:'September',tagline:'A season of progress',motif:'09'},
  {name:'October',tagline:'Stories after dark',motif:'10'},
  {name:'November',tagline:'The days worth remembering',motif:'11'},
  {name:'December',tagline:'A year to remember',motif:'12'}
];
const dayUTC=(y,m,d)=>new Date(Date.UTC(y,m-1,d));
const dateISO=d=>d.toISOString().slice(0,10);
const addDays=(d,n)=>new Date(d.getTime()+n*86400000);
const nthWeekday=(y,m,w,n)=>{const first=dayUTC(y,m,1).getUTCDay();return dayUTC(y,m,1+(w-first+7)%7+7*(n-1))};
const lastWeekday=(y,m,w)=>{const last=dayUTC(y,m+1,0);return addDays(last,-((last.getUTCDay()-w+7)%7))};
function easterSunday(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k+49)%7,m=Math.floor((a+11*h+22*l)/451);
  return dayUTC(y,Math.floor((h+l-7*m+114)/31),(h+l-7*m+114)%31+1);
}
function federalDays(y){
  const fixed=(m,d,name)=>({date:dateISO(dayUTC(y,m,d)),name,kind:'federal'});
  const moving=(day,name)=>({date:dateISO(day),name,kind:'federal'});
  return [
    fixed(1,1,"New Year's Day"),
    moving(nthWeekday(y,1,1,3),'Martin Luther King Jr. Day'),
    moving(nthWeekday(y,2,1,3),"Presidents Day (Washington's Birthday)"),
    moving(lastWeekday(y,5,1),'Memorial Day'),
    fixed(6,19,'Juneteenth'),
    fixed(7,4,'Independence Day'),
    moving(nthWeekday(y,9,1,1),'Labor Day'),
    moving(nthWeekday(y,10,1,2),'Columbus Day'),
    fixed(11,11,'Veterans Day'),
    moving(nthWeekday(y,11,4,4),'Thanksgiving'),
    fixed(12,25,'Christmas Day')
  ];
}
function culturalDays(y){
  const fixed=(m,d,name)=>({date:dateISO(dayUTC(y,m,d)),name,kind:'observance'});
  const moving=(day,name)=>({date:dateISO(day),name,kind:'observance'});
  return [
    fixed(2,14,"Valentine's Day"),
    fixed(3,17,"St. Patrick's Day"),
    moving(addDays(easterSunday(y),-2),'Good Friday'),
    moving(easterSunday(y),'Easter Sunday'),
    fixed(4,22,'Earth Day'),
    moving(nthWeekday(y,5,0,2),"Mother's Day"),
    fixed(6,14,'Flag Day'),
    moving(nthWeekday(y,6,0,3),"Father's Day"),
    fixed(10,31,'Halloween'),
    moving(nthWeekday(y,10,1,2),"Indigenous Peoples' Day"),
    moving(addDays(nthWeekday(y,11,4,4),1),'Black Friday'),
    fixed(12,24,'Christmas Eve'),
    fixed(12,31,"New Year's Eve")
  ];
}
function observedDay(day){
  const d=dayUTC(...day.date.split('-').map(Number)),weekday=d.getUTCDay();
  if(weekday!==0&&weekday!==6)return null;
  return {...day,date:dateISO(addDays(d,weekday===6?-1:1)),kind:'observed',name:day.name+' (observed)'};
}
export function holidaysForYear(year){
  const y=Number(year);
  if(!Number.isInteger(y)||y<1900||y>2200)return [];
  const records=[...federalDays(y),...culturalDays(y)];
  // A Jan 1 Saturday can be observed on December 31 of the previous year.
  for(const base of [y-1,y,y+1])for(const h of federalDays(base)){
    const observed=observedDay(h);
    if(observed&&observed.date.startsWith(String(y)+'-'))records.push(observed);
  }
  if(y===2026)records.push({date:'2026-11-19',name:'Grand Theft Auto VI release',kind:'special'});
  const order={special:0,federal:1,observed:2,observance:3};
  return records.filter(h=>h.date.startsWith(String(y)+'-')).sort((a,b)=>a.date.localeCompare(b.date)||(order[a.kind]-order[b.kind])||a.name.localeCompare(b.name));
}
export function holidaysForMonth(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))return [];
  return holidaysForYear(Number(month.slice(0,4))).filter(x=>x.date.startsWith(month+'-'));
}
export function holidaysOnDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return [];
  return holidaysForYear(Number(date.slice(0,4))).filter(x=>x.date===date);
}
export function monthIdentity(month){return CALENDAR_MONTHS[Number(String(month).slice(5,7))-1]||CALENDAR_MONTHS[0]}
