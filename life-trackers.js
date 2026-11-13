// Read-only counts for the five current-life trackers.
// No diary-to-gaming conversion. Editing counts explicit diary mentions;
// Social Days counts distinct dates; game sessions are saved by the gaming refresh pipeline.
import { DIARY_SIGNALS } from './diary-insights.js';
import { gaming } from './gaming-data.js';

export const LIFE_TRACKER_IDS=['gaming-sessions','editing-events','social-days','migraines','hong-kong'];
export const ARCHIVED_GTA_IDS=['mors-mutual','google-car','apartment-collisions'];
export const GTA_RETIREMENT_DATE='2026-11-19';
export const AUTO_TRACKER_IDS=new Set(['gaming-sessions','editing-events','social-days']);

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const EDIT=/\b(?:re[- ]?edit(?:ed|ing|s)?|edit(?:ed|ing|s)?|video[- ]editing|(?:premiere pro|adobe premiere|after effects)\s+(?:editing|session)|worked on (?:an?|the|my) edit)\b/i;
const NOT_EDIT=/\b(?:didn['’]?t|did not|haven['’]?t|not|never|without|no|plan(?:ned)? to|need(?:ed)? to|want(?:ed)? to|will|gonna|going to|should)\s+(?:(?:do|start|finish|be)\s+)?(?:re[- ]?)?edit(?:ed|ing|s)?\b/i;
const NOT_SOCIAL=/\b(?:didn['’]?t|did not|never|not|couldn['’]?t|without|no)\s+(?:hang(?:ing)? out|talk|call|facetime|socializ|speak|visit)\b/i;
const segments=text=>String(text||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
const socialPattern=DIARY_SIGNALS.find(x=>x.id==='social')?.pattern;
const inScope=(date,scope={})=>DAY.test(date)&&(!scope.month||date.startsWith(scope.month+'-'))&&(!scope.year||date.startsWith(String(scope.year)+'-'))&&(!scope.start||date>=scope.start)&&(!scope.end||date<=scope.end);

export function derivedTrackerRows(state,id,scope={}){
  const rows=[];
  if(id==='gaming-sessions'){
    for(const event of gaming().sessions||[]){
      if(!event||!event.id||!inScope(String(event.date||''),scope))continue;
      if(!(Number(event.minutes)>0))continue;
      rows.push({id:String(event.id),trackerId:id,date:event.date,count:1,source:'gaming-report',capturedAt:event.capturedAt||'',snippet:String(event.title||'Game')+' · '+Math.round(Number(event.minutes))+' reported minutes'});
    }
    // The same snapshot can arrive from two devices. Count its stable ID once.
    return [...new Map(rows.map(x=>[x.id,x])).values()].sort((a,b)=>a.date.localeCompare(b.date)||String(a.capturedAt).localeCompare(String(b.capturedAt)));
  }
  if(id!=='editing-events'&&id!=='social-days')return rows;
  for(const [date,entry] of Object.entries(state?.entries||{})){
    if(!inScope(date,scope)||!String(entry?.text||'').trim())continue;
    const pieces=segments(entry.text);
    if(id==='editing-events'){
      pieces.forEach((piece,index)=>{
        const hits=[...piece.matchAll(new RegExp(EDIT.source,'gi'))];
        hits.forEach((hit,actionIndex)=>{
          const context=piece.slice(Math.max(0,hit.index-55),hit.index+hit[0].length);
          if(NOT_EDIT.test(context))return;
          rows.push({id:'diary-edit:'+date+':'+index+':'+actionIndex,trackerId:id,date,count:1,source:'diary-derived',snippet:piece});
        });
      });
    }else{
      const first=pieces.find(piece=>socialPattern?.test(piece)&&!NOT_SOCIAL.test(piece));
      if(first)rows.push({id:'diary-social:'+date,trackerId:id,date,count:1,source:'diary-derived',snippet:first});
    }
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function derivedTrackerTotal(state,id,scope={}){return derivedTrackerRows(state,id,scope).reduce((n,x)=>n+x.count,0);}
export function topTrackerMonth(state,id){
  const totals=new Map();
  for(const row of derivedTrackerRows(state,id))totals.set(row.date.slice(0,7),(totals.get(row.date.slice(0,7))||0)+row.count);
  return [...totals].map(([month,count])=>({month,count})).sort((a,b)=>b.count-a.count||b.month.localeCompare(a.month))[0]||null;
}
export function topTrackerDay(state,id){
  const totals=new Map();
  for(const row of derivedTrackerRows(state,id))totals.set(row.date,(totals.get(row.date)||0)+row.count);
  return [...totals].map(([date,count])=>({date,count})).sort((a,b)=>b.count-a.count||b.date.localeCompare(a.date))[0]||null;
}
