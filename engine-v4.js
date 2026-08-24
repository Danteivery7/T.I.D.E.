import * as v3 from './engine-v3.js';
export * from './engine-v3.js';

const CANONICAL_COLLISIONS='apartment-collisions';
const DUPLICATE_COLLISIONS='collision-count';

const num=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):null;
const canonical=id=>id===DUPLICATE_COLLISIONS?CANONICAL_COLLISIONS:id;

function manualRecord(state,id){
  return state?.tideCounters?.authoritativeTrackerTotals?.[canonical(id)]||null;
}

function manualTotal(state,id,scope={}){
  const rec=manualRecord(state,id);
  if(!rec)return null;
  if(scope.month)return num(rec.months?.[scope.month]);
  if(scope.year)return num(rec.years?.[String(scope.year)]);
  return num(rec.allTime);
}

export function trackerDefinition(state,id){
  const key=canonical(id);
  const base=v3.trackerDefinition(state,key);
  if(key===CANONICAL_COLLISIONS){
    return {...base,id:CANONICAL_COLLISIONS,name:'Collisions',kind:'event',status:'active',
      aliases:[...(base.aliases||[]),'collision','collisions','collision count','walked into an object','walked into something']};
  }
  return base;
}

export function allTrackerDefinitions(state){
  return v3.allTrackerDefinitions(state)
    .filter(t=>t.id!==DUPLICATE_COLLISIONS)
    .map(t=>t.id===CANONICAL_COLLISIONS?trackerDefinition(state,t.id):t);
}

export function trackerTotal(state,id,scope={}){
  const key=canonical(id);
  const exact=manualTotal(state,key,scope);
  if(exact!=null)return exact;
  if(key===CANONICAL_COLLISIONS){
    return v3.trackerTotal(state,CANONICAL_COLLISIONS,scope)+v3.trackerTotal(state,DUPLICATE_COLLISIONS,scope);
  }
  return v3.trackerTotal(state,key,scope);
}

function scopedQuestion(q){
  const lower=q.toLowerCase(),today=v3.isoToday();
  const explicitYear=lower.match(/\b(20\d{2})\b/)?.[1];
  if(/\bthis month\b/.test(lower))return {month:today.slice(0,7)};
  const monthIndex=v3.MONTHS.findIndex(m=>lower.includes(m.toLowerCase()));
  if(monthIndex>=0){
    const year=explicitYear||today.slice(0,4);
    return {month:`${year}-${String(monthIndex+1).padStart(2,'0')}`};
  }
  if(/\bthis year\b/.test(lower))return {year:Number(today.slice(0,4))};
  if(/\blast year\b/.test(lower))return {year:Number(today.slice(0,4))-1};
  if(explicitYear)return {year:Number(explicitYear)};
  return {};
}

function isFalseHongKongReference(row){
  const s=String(row?.snippet||'').toLowerCase();
  return /(watched back|went through|reedited|video|data with|made .*spawns|looked at .*spawns)/.test(s);
}

function dateAnswer(state,id,scope,total,name){
  const ids=id===CANONICAL_COLLISIONS?[CANONICAL_COLLISIONS,DUPLICATE_COLLISIONS]:[id];
  const rows=ids.flatMap(x=>v3.occurrencesFor(state,x,scope))
    .filter(x=>id!=='hong-kong'||!isFalseHongKongReference(x));
  const grouped=new Map();
  for(const row of rows)grouped.set(row.date,(grouped.get(row.date)||0)+(Number(row.count)||1));
  const items=[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({
    date,label:v3.dateLabel(date,{weekday:false}),meta:count>1?`${count} occurrences`:''
  }));
  const dated=[...grouped.values()].reduce((a,b)=>a+b,0),unknown=Math.max(0,total-dated);
  return {
    type:'dates',primary:`${total} ${name.toLowerCase()}`,items,
    detail:`${items.length} distinct dated record${items.length===1?'':'s'}.${unknown?` ${unknown} additional occurrence${unknown===1?'':'s'} are preserved in authoritative totals without an exact date.`:''}`
  };
}

export function askTide(state,question){
  const q=String(question||'').trim(),lower=q.toLowerCase();
  const isHong=/hong kong/.test(lower);
  const isCollision=/\bcollisions?\b|walked into (?:an object|something)|bumped into/.test(lower);
  if(isHong||isCollision){
    const id=isHong?'hong-kong':CANONICAL_COLLISIONS,name=isHong?'Hong Kong Spawns':'Collisions',scope=scopedQuestion(q);
    const total=trackerTotal(state,id,scope);
    if(/what days|which days|what dates|which dates|when did/.test(lower))return dateAnswer(state,id,scope,total,name);
    const where=scope.month?v3.monthLabel(scope.month):scope.year?String(scope.year):'all time';
    return {type:'count',primary:String(total),detail:`${name} ${where}.`};
  }
  return v3.askTide(state,q);
}
