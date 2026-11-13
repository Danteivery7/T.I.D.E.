import {healthRows,healthPeriod} from './health-activity.js';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const migrainePhrase=/\b(?:migraines?|headaches?|head\s*aches?)\b/i;
const migraineKeyword=/\bmigraines?\b/i;
const headacheKeyword=/\bheadaches?|head aches?\b/i;
const negative=/(?:\b(?:no|not|without|never|did(?:n['’]t| not)|haven['’]t|free of|avoided)\s+(?:a\s+)?(?:migraine|headache|head ache))|\b(?:migraine|headache)[- ]free\b/i;
const relevance=/(?:\b(?:had|have|got|getting|started|woke up with|suffered|experienced|developed|painful|fighting|bad|another|severe)\b.{0,75}\b(?:migraine|headache))|\b(?:migraine|headache)\b.{0,55}\b(?:happened|started|hit|came|hurt|killed|ruined|all day|today)\b/i;
const dates=(state)=>Object.entries(state.entries||{}).filter(([d,r])=>DAY.test(d)&&String(r?.text||'').trim()).sort(([a],[b])=>a.localeCompare(b));
const countDatedOccurrences=(state,date)=>{
 const occurrences=(state.occurrences||[]).filter(x=>x?.date===date&&x?.trackerId==='migraines');
 if(!occurrences.length)return null;
 const total=occurrences.reduce((n,r)=>n+(Number(r.count)||0),0);
 return Math.max(0,total);
};
export function migraineEvidence(state,{year=null,month=null}={}){
 const byDate=new Map();
 for(const [date,entry] of dates(state)){
  if(year&&!date.startsWith(String(year)+'-')||month&&!date.startsWith(month+'-'))continue;
  const text=String(entry.text||'');
  const fragments=text.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
  const evidence=fragments.filter(x=>migrainePhrase.test(x)&&!negative.test(x)&&relevance.test(x));
  if(evidence.length)byDate.set(date,{date,kind:evidence.some(x=>migraineKeyword.test(x))?'migraine':'headache',count:1,source:'diary',detail:evidence.slice(0,2).join('; ').slice(0,170)});
 }
 for(const record of state.occurrences||[]){
  const date=String(record?.date||'');
  if(record?.trackerId!=='migraines'||!DAY.test(date)||year&&!date.startsWith(String(year)+'-')||month&&!date.startsWith(month+'-'))continue;
  const qty=countDatedOccurrences(state,date);
  if(qty===0){byDate.delete(date);continue}
  if(qty>0)byDate.set(date,{date,kind:byDate.get(date)?.kind||(/headache/i.test(record.snippet||'')&&!/migraine/i.test(record.snippet||'')?'headache':'migraine'),count:qty,source:'tracked occurrence',detail:String(record.snippet||byDate.get(date)?.detail||'Tracked symptom day').slice(0,170)});
 }
 return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
const season=date=>{const mmdd=date.slice(5);return mmdd>='09-01'&&mmdd<='12-15'?'fall':'rest'};
export function migraineSummary(state,scope={}){
 const rows=migraineEvidence(state,scope),byMonth=new Map();
 for(const r of rows){const m=r.date.slice(0,7);byMonth.set(m,(byMonth.get(m)||0)+1)}
 const topMonths=[...byMonth].map(([month,count])=>({month,count})).sort((a,b)=>b.count-a.count||b.month.localeCompare(a.month));
 const diary=dates(state).filter(([d])=>(!scope.year||d.startsWith(String(scope.year)+'-'))&&(!scope.month||d.startsWith(scope.month+'-')));
 const denominators={fall:0,rest:0},symptoms={fall:0,rest:0};
 for(const [date] of diary)denominators[season(date)]++;
 for(const row of rows)if(state.entries?.[row.date]?.text?.trim())symptoms[season(row.date)]++;
 const fallRate=denominators.fall?symptoms.fall/denominators.fall:null;
 const restRate=denominators.rest?symptoms.rest/denominators.rest:null;
 const types={migraine:rows.filter(x=>x.kind==='migraine').length,headache:rows.filter(x=>x.kind==='headache').length};
 const school={classDays:0,noSchoolDays:0,classSymptomDays:0,noSchoolSymptomDays:0};
 const lone={aloneDays:0,aloneSymptomDays:0,notAloneDays:0,notAloneSymptomDays:0};
 const symptomsByDate=new Set(rows.map(x=>x.date));
 for(const [date,entry] of diary){
  const text=String(entry?.text||''),has=symptomsByDate.has(date);
  const classDay=/(?:went to (?:school|class)|in[- ]person class|attended (?:class|school)|had class)/i.test(text);
  const noSchool=/(?:no school|day off (?:school|from school)|didn['’]?t (?:have|go to) (?:class|school))/i.test(text);
  if(classDay&&!noSchool){school.classDays++;if(has)school.classSymptomDays++}
  if(noSchool&&!classDay){school.noSchoolDays++;if(has)school.noSchoolSymptomDays++}
  const alone=/(?:home alone|alone at home|by myself at home)/i.test(text);
  const social=/(?:home with|family at home|with (?:my )?(?:friends|family|mom|dad) at home)/i.test(text);
  if(alone&&!social){lone.aloneDays++;if(has)lone.aloneSymptomDays++}
  if(social&&!alone){lone.notAloneDays++;if(has)lone.notAloneSymptomDays++}
 }
 const healthByDate=new Map(healthRows(state,scope).filter(x=>Number.isFinite(x.sleepHours)).map(x=>[x.date,x]));
 const linked=rows.map(r=>({date:r.date,sleepHours:healthByDate.get(r.date)?.sleepHours})).filter(x=>Number.isFinite(x.sleepHours));
 const sleep={pairedSymptomNights:linked.length,averageSymptomNight:linked.length?Math.round(linked.reduce((n,r)=>n+r.sleepHours,0)/linked.length*100)/100:null,
  pairedOtherNights:0,averageOtherNight:null};
 const nonMigraine=healthRows(state,scope).filter(x=>Number.isFinite(x.sleepHours)&&!symptomsByDate.has(x.date));
 sleep.pairedOtherNights=nonMigraine.length;sleep.averageOtherNight=nonMigraine.length?Math.round(nonMigraine.reduce((n,r)=>n+r.sleepHours,0)/nonMigraine.length*100)/100:null;
 return{rows,days:rows.length,types,topMonths,monthly:[...byMonth].map(([month,count])=>({month,count})).sort((a,b)=>a.month.localeCompare(b.month)),
  firstDate:rows[0]?.date||null,lastDate:rows.at(-1)?.date||null,seasonal:{fallDays:symptoms.fall,fallLoggedDays:denominators.fall,restDays:symptoms.rest,restLoggedDays:denominators.rest,fallRate,restRate,ratio:restRate>0?Math.round(fallRate/restRate*100)/100:null},
  school,homeAlone:lone,sleep};
}
export function weeklyHealth(state,month,key='steps'){
 const rows=healthRows(state,{month}),byWeek=new Map();
 const startOfWeek=date=>{
  const d=new Date(date+'T12:00:00Z'),weekday=d.getUTCDay();
  d.setUTCDate(d.getUTCDate()-weekday);return d.toISOString().slice(0,10);
 };
 for(const r of rows){
  if(!Number.isFinite(Number(r[key]))||r[key]===undefined)continue;
  const week=startOfWeek(r.date);
  const current=byWeek.get(week)||{week,total:0,days:0,min:null,max:null};
  const value=Number(r[key]);current.total+=value;current.days++;
  current.min=current.min===null?value:Math.min(current.min,value);
  current.max=current.max===null?value:Math.max(current.max,value);
  byWeek.set(week,current);
 }
 return [...byWeek.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(x=>({...x,total:Math.round(x.total*100)/100,average:x.days?Math.round(x.total/x.days*100)/100:null}));
}
export function dailyHealthComparison(state,month,key){
 const rows=healthRows(state,{month}).filter(r=>Number.isFinite(Number(r[key]))&&r[key]!==undefined);
 const completed=rows.filter(x=>x.date<new Date().toLocaleDateString('en-CA'));
 const sorted=completed.slice().sort((a,b)=>Number(a[key])-Number(b[key])||a.date.localeCompare(b.date));
 return{best:sorted.at(-1)||null,worst:sorted[0]||null,rows:completed};
}
export function healthAnswers(state,question,context={}){
 const q=String(question||'').toLowerCase(),healthWords=/\b(?:sleep|slept|sleeping|steps?|walk(?:ed|ing)?|distance|exercise|workout|standing|stand hours|calories|health|migraine|headache|activity rings?)\b/;
 if(!healthWords.test(q))return null;
 const year=Number(q.match(/\b20\d{2}\b/)?.[0]),monthName=q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/)?.[1];
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 let scope=year?{year}:{};if(monthName)scope={month:String(year||Number((context.today||'').slice(0,4)))+'-'+String(months.indexOf(monthName)+1).padStart(2,'0')};
 else if(/\bthis month\b/.test(q))scope={month:(context.today||'').slice(0,7)};
 else if(/\bthis year\b/.test(q))scope={year:Number((context.today||'').slice(0,4))};
 if(/\bmigraines?|headaches?\b/.test(q)){
  const report=migraineSummary(state,scope),monthly=report.topMonths[0];
  return{kind:'health',heading:'MIGRAINES · DIARY-REPORTED SYMPTOM DAYS',primary:/\bmost|peak|worst month/.test(q)&&monthly?monthly.month+' · '+monthly.count+' days':String(report.days)+' distinct dated days',
   detail:'Based on dated diary/occurrence evidence. Estimated historical totals are not silently converted into confirmed days.',items:report.rows.slice(-30).reverse().map(x=>({date:x.date,label:x.kind==='migraine'?'Migraine mentioned':'Headache mentioned',meta:x.detail})),source:'T.I.D.E. migraine diary and manual corrections'};
 }
 const key=/sleep|slept|sleeping/.test(q)?'sleepHours':/steps?/.test(q)?'steps':/distance|walk(?:ed|ing)?/.test(q)?'distanceMiles':/stand/.test(q)?'standHours':/workout/.test(q)?'workouts':/calories/.test(q)?'activeCalories':'exerciseMinutes';
 const p=healthPeriod(state,scope),m=p.metrics[key];
 const highest=/\b(most|best|highest|longest|max|peak)\b/.test(q),lowest=/\b(least|worst|lowest|shortest|min)\b/.test(q),monthly=/\bmonth\b/.test(q);
 let detail='From imported Apple Health days. Missing days are never treated as zero. ',value,date;
 if(monthly&&(highest||lowest)){const rec=lowest?m.worstMonth:m.bestMonth;value=rec?(rec.month+' · '+(key==='sleepHours'?rec.average:rec.total)):'No qualifying month';detail+='Monthly sleep records require at least seven recorded nights.'}
 else if(highest||lowest){const rec=lowest?m.worst:m.best;value=rec?String(rec.value):'No dated record';date=rec?.date}
 else if(/average|usually|per night/.test(q)||key==='sleepHours'){value=m.average!=null?String(m.average):'No recorded nights';detail+='Sleep averages use recorded nights, not calendar days.'}
 else value=m.total!=null?String(m.total):'No imported observations';
 return{kind:'health',heading:key==='sleepHours'?'SLEEP · HOURS PER RECORDED NIGHT':key.toUpperCase(),primary:value,
  detail,source:'Private imported Apple Health export',date,items:date?[{date,label:'Open the recorded date'}]:[]};
}
