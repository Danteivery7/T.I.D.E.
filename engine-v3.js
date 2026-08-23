import * as v2 from './engine-v2.js';
export * from './engine-v2.js';

const MIGRATION='simple-counters-v1';
const INITIAL_DC=118;
const INITIAL_MONTY_OVERALL={wins:28,losses:103};
const INITIAL_MONTY_YEAR={year:2026,wins:28,losses:103};
const INITIAL_MONTY_MONTH={month:'2026-08',wins:0,losses:3};
const nowIso=()=>new Date().toISOString();
const cleanRecord=r=>({wins:Math.max(0,Number(r?.wins)||0),losses:Math.max(0,Number(r?.losses)||0),ties:0});

export function ensureSimpleCounters(state){
  if(!state||typeof state!=='object') return state;
  state.settings||={};state.settings.migrations||={};state.tideCounters||={};state.monthlyReviews||={};
  if(!state.settings.migrations[MIGRATION]){
    state.tideCounters.dailyChallenge={current:INITIAL_DC,longest:INITIAL_DC,updatedAt:nowIso()};
    state.tideCounters.montyOverall={...INITIAL_MONTY_OVERALL,updatedAt:nowIso()};
    state.tideCounters.montyYears={...(state.tideCounters.montyYears||{}),[INITIAL_MONTY_YEAR.year]:{wins:INITIAL_MONTY_YEAR.wins,losses:INITIAL_MONTY_YEAR.losses,updatedAt:nowIso()}};
    const review=state.monthlyReviews[INITIAL_MONTY_MONTH.month]||{};
    state.monthlyReviews[INITIAL_MONTY_MONTH.month]={...review,versusTotals:{...(review.versusTotals||{}),'monty-dc':{wins:0,losses:3,ties:0}},updatedAt:nowIso()};
    state.occurrences=(state.occurrences||[]).filter(row=>!(row.trackerId==='monty-dc'&&row.result==='tie'));
    state.settings.migrations[MIGRATION]=true;state.updatedAt=nowIso();
  }
  const dc=state.tideCounters.dailyChallenge||{};dc.current=Math.max(0,Number(dc.current)||0);dc.longest=Math.max(dc.current,Number(dc.longest)||0);state.tideCounters.dailyChallenge=dc;
  state.tideCounters.montyOverall=cleanRecord(state.tideCounters.montyOverall||INITIAL_MONTY_OVERALL);state.tideCounters.montyYears||={};return state;
}

export function dailyChallengeCounter(state){ensureSimpleCounters(state);const dc=state.tideCounters.dailyChallenge;return{value:dc.current,longest:dc.longest,active:dc.current>0}}
export function incrementDailyChallenge(state){ensureSimpleCounters(state);const dc=state.tideCounters.dailyChallenge;dc.current+=1;dc.longest=Math.max(dc.longest,dc.current);dc.updatedAt=nowIso();state.updatedAt=dc.updatedAt;return dailyChallengeCounter(state)}
export function markDailyChallengePlayed(state){return incrementDailyChallenge(state)}
export function markDailyChallengeMissed(state){ensureSimpleCounters(state);const dc=state.tideCounters.dailyChallenge;dc.current=0;dc.updatedAt=nowIso();state.updatedAt=dc.updatedAt;return dailyChallengeCounter(state)}
export function setDailyChallengeStreak(state,value){ensureSimpleCounters(state);const dc=state.tideCounters.dailyChallenge;dc.current=Math.max(0,Number(value)||0);dc.longest=Math.max(dc.longest,dc.current);dc.updatedAt=nowIso();state.updatedAt=dc.updatedAt;return dailyChallengeCounter(state)}
export function dailyChallengeStreaks(state){const c=dailyChallengeCounter(state);return{current:c.value,longest:c.longest,currentStart:null,longestStart:null,longestEnd:null,active:c.active,lastCompleted:null}}

function monthRecord(state,month){ensureSimpleCounters(state);return cleanRecord(state.monthlyReviews?.[month]?.versusTotals?.['monty-dc'])}
function yearRecord(state,year){ensureSimpleCounters(state);const saved=state.tideCounters.montyYears?.[year];return saved?cleanRecord(saved):{wins:0,losses:0,ties:0}}
export function montyRecord(state,scope={}){ensureSimpleCounters(state);if(scope.month)return monthRecord(state,scope.month);if(scope.year)return yearRecord(state,Number(scope.year));return cleanRecord(state.tideCounters.montyOverall)}
export function setMonthlyMontyBaseline(state,month,{wins=0,losses=0}={}){ensureSimpleCounters(state);const review=state.monthlyReviews[month]||{};state.monthlyReviews[month]={...review,versusTotals:{...(review.versusTotals||{}),'monty-dc':{wins:Math.max(0,Number(wins)||0),losses:Math.max(0,Number(losses)||0),ties:0}},updatedAt:nowIso()};state.updatedAt=nowIso();return monthRecord(state,month)}
export function setMontyOverall(state,{wins=0,losses=0}={}){ensureSimpleCounters(state);state.tideCounters.montyOverall={wins:Math.max(0,Number(wins)||0),losses:Math.max(0,Number(losses)||0),ties:0,updatedAt:nowIso()};state.updatedAt=nowIso();return montyRecord(state)}
export function recordMontyResult(state,result,{month=null,year=null}={}){
  ensureSimpleCounters(state);if(!['win','loss'].includes(result))throw new Error('Monty result must be win or loss.');
  const today=v2.isoToday(),monthKey=month||today.slice(0,7),yearKey=Number(year||monthKey.slice(0,4));
  const m=monthRecord(state,monthKey);if(result==='win')m.wins+=1;else m.losses+=1;setMonthlyMontyBaseline(state,monthKey,m);
  const overall=cleanRecord(state.tideCounters.montyOverall);if(result==='win')overall.wins+=1;else overall.losses+=1;state.tideCounters.montyOverall={...overall,updatedAt:nowIso()};
  const yr=yearRecord(state,yearKey);if(result==='win')yr.wins+=1;else yr.losses+=1;state.tideCounters.montyYears[yearKey]={...yr,updatedAt:nowIso()};
  state.occurrences||=[];state.occurrences.push({id:`monty-simple:${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}`,trackerId:'monty-dc',date:today,count:1,result,source:'manual',logType:'monty-simple',snippet:`Daily Challenge vs Monty: ${result.toUpperCase()}`});state.updatedAt=nowIso();
  return{month:monthRecord(state,monthKey),year:yearRecord(state,yearKey),overall:montyRecord(state)};
}
export function setDailyChallengeLog(state,{versus='none'}={}){if(versus==='win'||versus==='loss')return recordMontyResult(state,versus);return null}
export function dailyChallengeLogForDate(){return{status:null,versus:'none',myScore:null,opponentScore:null}}
export function montyBreakdown(state,{year=null}={}){ensureSimpleCounters(state);return Object.keys(state.monthlyReviews||{}).sort().filter(month=>!year||month.startsWith(`${year}-`)).map(month=>({month,...monthRecord(state,month)})).filter(row=>row.wins||row.losses)}

function questionScope(question){const lower=String(question||'').toLowerCase(),today=v2.isoToday(),currentYear=Number(today.slice(0,4));if(/\bthis month\b/.test(lower))return{month:today.slice(0,7)};const mi=v2.MONTHS.findIndex(m=>lower.includes(m.toLowerCase())),explicitYear=Number(lower.match(/\b(20\d{2})\b/)?.[1]||0)||null;if(mi>=0){const y=explicitYear||currentYear;return{month:`${y}-${String(mi+1).padStart(2,'0')}`}}if(/\bthis year\b/.test(lower))return{year:currentYear};if(/\blast year\b/.test(lower))return{year:currentYear-1};if(explicitYear)return{year:explicitYear};return{}}
export function askTide(state,question){
  const q=String(question||'').trim(),lower=q.toLowerCase();
  if(/daily challenge/.test(lower)&&/streak/.test(lower)&&!/monty/.test(lower)){const c=dailyChallengeCounter(state);return{type:'count',primary:String(c.value),detail:'Current GeoGuessr Daily Challenge streak.'}}
  if(/monty/.test(lower)&&/(record|wins?|loss(?:es)?|versus|\bvs\b)/.test(lower)){const scope=questionScope(q),record=montyRecord(state,scope),where=scope.month?v2.monthLabel(scope.month):scope.year?String(scope.year):'all time';if(/how many wins|wins have i|number of wins/.test(lower))return{type:'count',primary:String(record.wins),detail:`Wins versus Monty ${where}.`};if(/how many losses|losses have i|number of losses/.test(lower))return{type:'count',primary:String(record.losses),detail:`Losses versus Monty ${where}.`};return{type:'record',primary:`${record.wins}-${record.losses}`,detail:`Daily Challenge record versus Monty ${where}.`}}
  return v2.askTide(state,q);
}
