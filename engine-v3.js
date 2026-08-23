import * as v2 from './engine-v2.js';
export * from './engine-v2.js';

const nowIso=()=>new Date().toISOString();
const asNumber=v=>Number.isFinite(Number(v))?Number(v):null;
const validResult=v=>['win','loss','tie'].includes(v)?v:'none';

function uniqueMontyRows(rows){
  const byDate=new Map();
  for(const row of rows.filter(x=>['win','loss','tie'].includes(x.result))){
    const prev=byDate.get(row.date);
    if(!prev || row.logType==='dc-quick' || prev.logType!=='dc-quick') byDate.set(row.date,row);
  }
  return [...byDate.values()];
}

function countResults(rows){
  const unique=uniqueMontyRows(rows);
  return {
    wins:unique.filter(x=>x.result==='win').length,
    losses:unique.filter(x=>x.result==='loss').length,
    ties:unique.filter(x=>x.result==='tie').length,
  };
}

function monthBaseline(state,month){
  const saved=state.monthlyReviews?.[month]?.versusTotals?.['monty-dc'];
  if(!saved) return null;
  return {
    wins:Number(saved.wins)||0,
    losses:Number(saved.losses)||0,
    ties:Number(saved.ties)||0,
    baselineUpdatedAt:saved.baselineUpdatedAt||null,
  };
}

function quickRowsAfterBaseline(state,month,baseline){
  let rows=v2.occurrencesFor(state,'monty-dc',{month}).filter(x=>x.logType==='dc-quick');
  if(baseline?.baselineUpdatedAt){
    rows=rows.filter(x=>x.createdAt && x.createdAt>baseline.baselineUpdatedAt);
  }
  return uniqueMontyRows(rows);
}

export function montyMonthRecord(state,month){
  const baseline=monthBaseline(state,month);
  if(baseline){
    const extra=countResults(quickRowsAfterBaseline(state,month,baseline));
    return {
      wins:baseline.wins+extra.wins,
      losses:baseline.losses+extra.losses,
      ties:baseline.ties+extra.ties,
      source:'monthly-baseline',
    };
  }
  return {...countResults(v2.occurrencesFor(state,'monty-dc',{month})),source:'dated-results'};
}

export function montyBreakdown(state,scope={}){
  const months=new Set();
  for(const [month,review] of Object.entries(state.monthlyReviews||{})){
    if(review?.versusTotals?.['monty-dc']) months.add(month);
  }
  for(const row of v2.occurrencesFor(state,'monty-dc')) months.add(row.date.slice(0,7));
  return [...months].sort().filter(month=>{
    if(scope.month && month!==scope.month) return false;
    if(scope.year && !month.startsWith(`${scope.year}-`)) return false;
    return true;
  }).map(month=>({month,...montyMonthRecord(state,month)}));
}

export function montyRecord(state,scope={}){
  const rows=montyBreakdown(state,scope);
  return rows.reduce((out,row)=>({
    wins:out.wins+row.wins,
    losses:out.losses+row.losses,
    ties:out.ties+row.ties,
  }),{wins:0,losses:0,ties:0});
}

export function setMonthlyMontyBaseline(state,month,{wins=0,losses=0,ties=0}={}){
  const stamp=nowIso();
  v2.saveMonthlyReview(state,month,{
    versusTotals:{'monty-dc':{
      wins:Math.max(0,Number(wins)||0),
      losses:Math.max(0,Number(losses)||0),
      ties:Math.max(0,Number(ties)||0),
      baselineUpdatedAt:stamp,
    }},
  });
  state.updatedAt=stamp;
}

export function setDailyChallengeLog(state,{date,status='complete',versus='none',myScore=null,opponentScore=null}={}){
  if(!date) throw new Error('A date is required.');
  state.occurrences||=[];
  state.occurrences=state.occurrences.filter(row=>!(row.date===date && row.source==='manual' && row.logType==='dc-quick' && ['daily-challenge','monty-dc'].includes(row.trackerId)));
  if(status==='clear'){
    state.updatedAt=nowIso();
    return;
  }
  const stamp=nowIso();
  const mine=asNumber(myScore),opp=asNumber(opponentScore);
  v2.addManualOccurrence(state,{
    trackerId:'daily-challenge',date,count:status==='complete'?1:0,result:status,
    myScore:mine,snippet:status==='complete'?'Daily Challenge completed':'Daily Challenge missed / streak lost',
    metadata:{logType:'dc-quick',createdAt:stamp},
  });
  let finalVersus=validResult(versus);
  if(mine!=null && opp!=null) finalVersus=mine>opp?'win':mine<opp?'loss':'tie';
  if(status==='complete' && finalVersus!=='none'){
    v2.addManualOccurrence(state,{
      trackerId:'monty-dc',date,count:1,result:finalVersus,myScore:mine,opponentScore:opp,
      snippet:`Daily Challenge vs Monty: ${finalVersus.toUpperCase()}`,
      metadata:{logType:'dc-quick',createdAt:stamp},
    });
  }
  state.updatedAt=stamp;
}

export function dailyChallengeLogForDate(state,date){
  const dc=v2.occurrencesFor(state,'daily-challenge',{start:date,end:date});
  const monty=v2.occurrencesFor(state,'monty-dc',{start:date,end:date});
  const choose=rows=>rows.findLast?.(x=>x.logType==='dc-quick')||[...rows].reverse().find(x=>x.logType==='dc-quick')||rows.at(-1)||null;
  const d=choose(dc),m=choose(monty);
  return {
    status:d?.result||null,
    versus:m?.result||'none',
    myScore:d?.myScore??m?.myScore??null,
    opponentScore:m?.opponentScore??null,
  };
}

export function dailyChallengeStreaks(state){
  const record=v2.dailyChallengeStreaks(state);
  const misses=v2.occurrencesFor(state,'daily-challenge').filter(x=>x.result==='miss').sort((a,b)=>a.date.localeCompare(b.date));
  const lastMiss=misses.at(-1)?.date||null;
  if(lastMiss && (!record.lastCompleted || lastMiss>=record.lastCompleted)){
    return {...record,current:0,currentStart:null,active:false,lastMiss};
  }
  return {...record,lastMiss};
}

function questionScope(question){
  const lower=question.toLowerCase();
  const today=v2.isoToday();
  const currentYear=Number(today.slice(0,4));
  if(/\bthis month\b/.test(lower)) return {month:today.slice(0,7),year:currentYear};
  const monthIndex=v2.MONTHS.findIndex(m=>lower.includes(m.toLowerCase()));
  const explicitYear=Number(lower.match(/\b(20\d{2})\b/)?.[1]||0)||null;
  if(monthIndex>=0){
    const year=explicitYear||currentYear;
    return {month:`${year}-${String(monthIndex+1).padStart(2,'0')}`,year};
  }
  if(/\blast year\b/.test(lower)) return {year:currentYear-1};
  if(/\bthis year\b/.test(lower)) return {year:currentYear};
  if(explicitYear) return {year:explicitYear};
  return {};
}

export function askTide(state,question){
  const q=String(question||'').trim();
  const lower=q.toLowerCase();
  if(/monty/.test(lower) && /(record|wins?|loss(?:es)?|versus|\bvs\b)/.test(lower)){
    const scope=questionScope(q);
    const record=montyRecord(state,scope.month?{month:scope.month}:scope.year?{year:scope.year}:{});
    const where=scope.month?v2.monthLabel(scope.month):scope.year?String(scope.year):'all time';
    if(/how many wins|wins have i|number of wins/.test(lower)){
      return {type:'count',primary:String(record.wins),detail:`Wins versus Monty ${where}.`};
    }
    if(/how many losses|losses have i|number of losses/.test(lower)){
      return {type:'count',primary:String(record.losses),detail:`Losses versus Monty ${where}.`};
    }
    const answer={type:'record',primary:`${record.wins}-${record.losses}`,detail:`Daily Challenge record versus Monty ${where}.${record.ties?` ${record.ties} tie${record.ties===1?'':'s'}.`:''}`};
    if(/by month|monthly|each month|breakdown/.test(lower)){
      answer.items=montyBreakdown(state,scope.year?{year:scope.year}:scope.month?{month:scope.month}:{}).map(row=>({label:v2.monthLabel(row.month),meta:`${row.wins}-${row.losses}${row.ties?`-${row.ties} ties`:''}`}));
    }
    return answer;
  }
  return v2.askTide(state,q);
}
