import * as v2 from './engine-v2.js';
export * from './engine-v2.js';

const nowIso=()=>new Date().toISOString();
const asNumber=v=>{
  if(v===null||v===undefined||String(v).trim()==='') return null;
  const number=Number(v);
  return Number.isFinite(number)?number:null;
};
const validResult=v=>['win','loss'].includes(v)?v:'none';

function uniqueMontyRows(rows){
  const byDate=new Map();
  for(const row of rows.filter(x=>['win','loss'].includes(x.result))){
    const prev=byDate.get(row.date);
    if(!prev || row.logType==='dc-quick' || prev.logType!=='dc-quick') byDate.set(row.date,row);
  }
  return [...byDate.values()];
}
function countResults(rows){
  const unique=uniqueMontyRows(rows);
  return {wins:unique.filter(x=>x.result==='win').length,losses:unique.filter(x=>x.result==='loss').length,ties:0};
}
function monthBaseline(state,month){
  const review=state.monthlyReviews?.[month];
  const saved=review?.versusTotals?.['monty-dc'];
  if(!saved) return null;
  return {wins:Number(saved.wins)||0,losses:Number(saved.losses)||0,ties:0,baselineUpdatedAt:saved.baselineUpdatedAt||review.updatedAt||null};
}
function quickRowsAfterBaseline(state,month,baseline){
  let rows=v2.occurrencesFor(state,'monty-dc',{month}).filter(x=>x.logType==='dc-quick');
  if(baseline?.baselineUpdatedAt) rows=rows.filter(x=>x.createdAt && x.createdAt>baseline.baselineUpdatedAt);
  return uniqueMontyRows(rows);
}
export function montyMonthRecord(state,month){
  const baseline=monthBaseline(state,month);
  if(baseline){
    const extra=countResults(quickRowsAfterBaseline(state,month,baseline));
    return {wins:baseline.wins+extra.wins,losses:baseline.losses+extra.losses,ties:0,source:'monthly-baseline'};
  }
  return {...countResults(v2.occurrencesFor(state,'monty-dc',{month})),source:'dated-results'};
}
export function montyBreakdown(state,scope={}){
  const months=new Set();
  for(const [month,review] of Object.entries(state.monthlyReviews||{})) if(review?.versusTotals?.['monty-dc']) months.add(month);
  for(const row of v2.occurrencesFor(state,'monty-dc')) months.add(row.date.slice(0,7));
  return [...months].sort().filter(month=>(!scope.month||month===scope.month)&&(!scope.year||month.startsWith(`${scope.year}-`))).map(month=>({month,...montyMonthRecord(state,month)}));
}
export function montyRecord(state,scope={}){
  return montyBreakdown(state,scope).reduce((out,row)=>({wins:out.wins+row.wins,losses:out.losses+row.losses,ties:0}),{wins:0,losses:0,ties:0});
}
export function setMonthlyMontyBaseline(state,month,{wins=0,losses=0}={}){
  const stamp=nowIso();
  v2.saveMonthlyReview(state,month,{versusTotals:{'monty-dc':{wins:Math.max(0,Number(wins)||0),losses:Math.max(0,Number(losses)||0),ties:0,baselineUpdatedAt:stamp}}});
  state.updatedAt=stamp;
}

function latestStreakSnapshot(state){
  const rows=[];
  for(const [month,review] of Object.entries(state.monthlyReviews||{})){
    const snap=review?.trackerSnapshots?.['daily-challenge'];
    if(!snap||asNumber(snap.value)==null) continue;
    rows.push({value:Number(snap.value),date:snap.date||v2.monthBounds(month).end,month});
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;
}
function explicitStreakRows(state,afterDate=null){
  const rows=v2.occurrencesFor(state,'daily-challenge').filter(x=>x.source==='manual'&&['dc-counter','dc-quick'].includes(x.logType));
  const byDate=new Map();
  for(const row of rows){
    if(afterDate&&row.date<=afterDate) continue;
    const prev=byDate.get(row.date);
    if(!prev||String(row.createdAt||'')>=String(prev.createdAt||'')) byDate.set(row.date,row);
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function dailyChallengeCounter(state){
  const snapshot=latestStreakSnapshot(state);
  let value=snapshot?.value||0;
  let lastDate=snapshot?.date||null;
  let active=value>0;
  for(const row of explicitStreakRows(state,snapshot?.date||null)){
    if(row.result==='miss') { value=0; active=false; lastDate=row.date; continue; }
    if(row.result==='complete') { value+=1; active=true; lastDate=row.date; }
  }
  return {value,lastDate,active,baselineValue:snapshot?.value||0,baselineDate:snapshot?.date||null};
}
export function markDailyChallengePlayed(state,date=v2.isoToday()){
  const counter=dailyChallengeCounter(state);
  if(counter.baselineDate&&date<=counter.baselineDate) return counter;
  state.occurrences||=[];
  const existing=state.occurrences.find(x=>x.trackerId==='daily-challenge'&&x.date===date&&x.source==='manual'&&['dc-counter','dc-quick'].includes(x.logType)&&x.result==='complete');
  if(existing) return dailyChallengeCounter(state);
  state.occurrences=state.occurrences.filter(x=>!(x.trackerId==='daily-challenge'&&x.date===date&&x.source==='manual'&&['dc-counter','dc-quick'].includes(x.logType)));
  v2.addManualOccurrence(state,{trackerId:'daily-challenge',date,count:1,result:'complete',snippet:'Daily Challenge completed',metadata:{logType:'dc-counter',createdAt:nowIso()}});
  state.updatedAt=nowIso();
  return dailyChallengeCounter(state);
}
export function markDailyChallengeMissed(state,date=v2.isoToday()){
  state.occurrences||=[];
  state.occurrences=state.occurrences.filter(x=>!(x.trackerId==='daily-challenge'&&x.date===date&&x.source==='manual'&&['dc-counter','dc-quick'].includes(x.logType)));
  v2.addManualOccurrence(state,{trackerId:'daily-challenge',date,count:0,result:'miss',snippet:'Daily Challenge streak lost',metadata:{logType:'dc-counter',createdAt:nowIso()}});
  state.updatedAt=nowIso();
  return dailyChallengeCounter(state);
}
export function setDailyChallengeStreak(state,value,date=v2.isoToday()){
  const n=Math.max(0,Number(value)||0),month=date.slice(0,7);
  v2.saveMonthlyReview(state,month,{trackerSnapshots:{'daily-challenge':{value:n,date}}});
  state.occurrences=(state.occurrences||[]).filter(x=>!(x.trackerId==='daily-challenge'&&x.source==='manual'&&['dc-counter','dc-quick'].includes(x.logType)&&x.date<=date));
  state.updatedAt=nowIso();
  return dailyChallengeCounter(state);
}

export function setDailyChallengeLog(state,{date,status='none',versus='none',myScore=null,opponentScore=null}={}){
  if(!date) throw new Error('A date is required.');
  if(status==='complete') markDailyChallengePlayed(state,date);
  else if(status==='miss') markDailyChallengeMissed(state,date);
  else if(status==='clear'){
    state.occurrences=(state.occurrences||[]).filter(row=>!(row.date===date&&row.source==='manual'&&['dc-counter','dc-quick'].includes(row.logType)&&row.trackerId==='daily-challenge'));
  }
  state.occurrences=(state.occurrences||[]).filter(row=>!(row.date===date&&row.source==='manual'&&row.logType==='dc-quick'&&row.trackerId==='monty-dc'));
  const stamp=nowIso(),mine=asNumber(myScore),opp=asNumber(opponentScore);
  let finalVersus=validResult(versus);
  if(mine!=null&&opp!=null&&mine!==opp) finalVersus=mine>opp?'win':'loss';
  if(finalVersus!=='none'){
    v2.addManualOccurrence(state,{trackerId:'monty-dc',date,count:1,result:finalVersus,myScore:mine,opponentScore:opp,snippet:`Daily Challenge vs Monty: ${finalVersus.toUpperCase()}`,metadata:{logType:'dc-quick',createdAt:stamp}});
  }
  state.updatedAt=stamp;
}
export function dailyChallengeLogForDate(state,date){
  const dc=explicitStreakRows(state).filter(x=>x.date===date).at(-1)||null;
  const monty=v2.occurrencesFor(state,'monty-dc',{start:date,end:date}).filter(x=>x.logType==='dc-quick').at(-1)||null;
  return {status:dc?.result||null,versus:['win','loss'].includes(monty?.result)?monty.result:'none',myScore:dc?.myScore??monty?.myScore??null,opponentScore:monty?.opponentScore??null};
}
export function dailyChallengeStreaks(state){
  const counter=dailyChallengeCounter(state);
  return {current:counter.active?counter.value:0,longest:Math.max(counter.value,counter.baselineValue),currentStart:null,longestStart:null,longestEnd:counter.lastDate,active:counter.active,lastCompleted:counter.lastDate};
}

function questionScope(question){
  const lower=question.toLowerCase(),today=v2.isoToday(),currentYear=Number(today.slice(0,4));
  if(/\bthis month\b/.test(lower)) return {month:today.slice(0,7),year:currentYear};
  const monthIndex=v2.MONTHS.findIndex(m=>lower.includes(m.toLowerCase()));
  const explicitYear=Number(lower.match(/\b(20\d{2})\b/)?.[1]||0)||null;
  if(monthIndex>=0){const year=explicitYear||currentYear;return {month:`${year}-${String(monthIndex+1).padStart(2,'0')}`,year};}
  if(/\blast year\b/.test(lower)) return {year:currentYear-1};
  if(/\bthis year\b/.test(lower)) return {year:currentYear};
  if(explicitYear) return {year:explicitYear};
  return {};
}
export function askTide(state,question){
  const q=String(question||'').trim(),lower=q.toLowerCase();
  if(/daily challenge/.test(lower)&&/streak/.test(lower)&&!(/monty/.test(lower))){const c=dailyChallengeCounter(state);return{type:'count',primary:String(c.value),detail:`Current Daily Challenge streak${c.lastDate?` as of ${v2.dateLabel(c.lastDate,{weekday:false})}`:''}.`};}
  if(/monty/.test(lower)&&/(record|wins?|loss(?:es)?|versus|\bvs\b)/.test(lower)){
    const scope=questionScope(q),record=montyRecord(state,scope.month?{month:scope.month}:scope.year?{year:scope.year}:{}),where=scope.month?v2.monthLabel(scope.month):scope.year?String(scope.year):'all time';
    if(/how many wins|wins have i|number of wins/.test(lower)) return {type:'count',primary:String(record.wins),detail:`Wins versus Monty ${where}.`};
    if(/how many losses|losses have i|number of losses/.test(lower)) return {type:'count',primary:String(record.losses),detail:`Losses versus Monty ${where}.`};
    const answer={type:'record',primary:`${record.wins}-${record.losses}`,detail:`Daily Challenge record versus Monty ${where}.`};
    if(/by month|monthly|each month|breakdown/.test(lower)) answer.items=montyBreakdown(state,scope.year?{year:scope.year}:scope.month?{month:scope.month}:{}).map(row=>({label:v2.monthLabel(row.month),meta:`${row.wins}-${row.losses}`}));
    return answer;
  }
  return v2.askTide(state,q);
}