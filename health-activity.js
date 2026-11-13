// Local/private wellness reporting. Never sends data to third-party scripts.
// Monthly and annual sleep are averages per RECORDED night, not total hours divided by all calendar days.
export const HEALTH_FIELDS=[
 {key:'steps',label:'Steps',unit:'steps',format:'integer'},
 {key:'distanceMiles',label:'Distance',unit:'mi',format:'decimal'},
 {key:'exerciseMinutes',label:'Exercise',unit:'min',format:'integer'},
 {key:'activeCalories',label:'Active calories',unit:'kcal',format:'integer'},
 {key:'standMinutes',label:'Stand time',unit:'min',format:'integer'},
 {key:'standHours',label:'Stand hours',unit:'hours',format:'integer'},
 {key:'workoutMinutes',label:'Workout duration',unit:'min',format:'integer'},
 {key:'sleepHours',label:'Sleep',unit:'hours/night',format:'decimal'},
 {key:'workouts',label:'Workouts',unit:'recorded',format:'integer'}
];
const FIELD_KEYS=new Set(HEALTH_FIELDS.map(x=>x.key));
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const round=(n,places=2)=>Math.round(n*10**places)/10**places;
export const metricLabel=(key)=>HEALTH_FIELDS.find(x=>x.key===key)?.label||key;
export function normalizeHealthRow(raw){
  if(!raw||!DATE.test(String(raw.date||'')))return null;
  const d=String(raw.date);
  if(new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)return null;
  const result={date:d};
  for(const key of FIELD_KEYS){
    const value=raw[key];
    if(value===null||value===undefined||value==='')continue;
    const n=Number(value);
    if(!Number.isFinite(n)||n<0||n>1e8)continue;
    if(key==='sleepHours'&&n>18)continue;
    result[key]=round(n,key==='distanceMiles'||key==='sleepHours'?3:2);
  }
  for(const extra of ['sleepSessions','napHours','standHoursGoal','exerciseGoalMinutes','moveGoalCalories'])if(raw[extra]!=null&&Number.isFinite(Number(raw[extra]))&&Number(raw[extra])>=0)result[extra]=round(Number(raw[extra]),3);
  for(const extra of ['standGoalMet','exerciseGoalMet','moveGoalMet'])if(typeof raw[extra]==='boolean')result[extra]=raw[extra];
  if(raw.workoutTypes&&typeof raw.workoutTypes==='object')result.workoutTypes=Object.fromEntries(Object.entries(raw.workoutTypes).filter(([k,v])=>/^[A-Za-z]{1,45}$/.test(k)&&Number.isInteger(Number(v))&&Number(v)>=0).slice(0,30));
  return Object.keys(result).length>1?result:null;
}
export function mergeHealthImport(state,payload){
  const records=Array.isArray(payload)?payload:Array.isArray(payload?.days)?payload.days:[];
  if(!Array.isArray(records)||!records.length)throw new Error('Import needs a nonempty array of dated activity records.');
  state.healthActivity||={days:{},updatedAt:''};
  const days=state.healthActivity.days||{},now=new Date().toISOString();
  let accepted=0;
  for(const raw of records){
    const row=normalizeHealthRow(raw);if(!row)continue;
    const old=days[row.date]||{};
    days[row.date]={...old,...row,updatedAt:now};
    accepted++;
  }
  if(!accepted)throw new Error('No valid daily metrics were found in the file.');
  state.healthActivity={...state.healthActivity,days,updatedAt:now,source:payload?.source||state.healthActivity.source||'Private import'};
  return accepted;
}
export function healthRows(state,scope={}){
  return Object.values(state?.healthActivity?.days||{}).filter(x=>x&&DATE.test(String(x.date))&&(!scope.month||x.date.startsWith(scope.month+'-'))&&(!scope.year||x.date.startsWith(String(scope.year)+'-'))).sort((a,b)=>a.date.localeCompare(b.date));
}
const sum=(arr,key)=>round(arr.reduce((s,r)=>s+(Number.isFinite(Number(r[key]))?Number(r[key]):0),0),3);
const known=(arr,key)=>arr.filter(x=>x[key]!==null&&x[key]!==undefined&&Number.isFinite(Number(x[key])));
const bestDay=(arr,key)=>known(arr,key).sort((a,b)=>Number(b[key])-Number(a[key])||a.date.localeCompare(b.date))[0]||null;
export function healthPeriod(state,scope={}){
  const rows=healthRows(state,scope),metrics={},byMonth=new Map();
  for(const row of rows)byMonth.set(row.date.slice(0,7),[...(byMonth.get(row.date.slice(0,7))||[]),row]);
  for(const {key} of HEALTH_FIELDS){
    const recorded=known(rows,key),best=bestDay(rows,key);
    const total=recorded.length?sum(recorded,key):null;
    const worstEligible=recorded.filter(x=>x.date<new Date().toLocaleDateString('en-CA'));
    const worst=worstEligible.slice().sort((a,b)=>Number(a[key])-Number(b[key])||a.date.localeCompare(b.date))[0]||null;
    metrics[key]={total,key,days:recorded.length,best:best?{date:best.date,value:best[key]}:null,worst:worst?{date:worst.date,value:worst[key]}:null};
    if(key==='sleepHours')metrics[key].average=recorded.length?round(total/recorded.length,2):null;
    else metrics[key].average=recorded.length?round(total/recorded.length,2):null;
    const months=[...byMonth].map(([month,list])=>{
      const monthRows=known(list,key),mTotal=monthRows.length?sum(monthRows,key):null;
      return{month,total:mTotal,average:monthRows.length?round(mTotal/monthRows.length,2):null,days:monthRows.length};
    }).filter(m=>m.days>0);
    const choices=key==='sleepHours'?months.filter(m=>m.days>=7):months;
    const bestMonth=choices.slice().sort((a,b)=>{
      const av=key==='sleepHours'?b.average-a.average:b.total-a.total;
      return av||a.month.localeCompare(b.month);
    })[0]||null;
    metrics[key].bestMonth=bestMonth;
    metrics[key].worstMonth=choices.slice().sort((a,b)=>{
      const av=key==='sleepHours'?a.average-b.average:a.total-b.total;
      return av||a.month.localeCompare(b.month);
    })[0]||null;
    metrics[key].months=months.sort((a,b)=>a.month.localeCompare(b.month));
  }
  const rings={};for(const k of ['standGoalMet','exerciseGoalMet','moveGoalMet']){const withGoal=rows.filter(r=>typeof r[k]==='boolean');rings[k]={recordedDays:withGoal.length,closedDays:withGoal.filter(r=>r[k]).length};}
  return{rows:rows.length,metrics,rings,firstDate:rows[0]?.date||null,lastDate:rows.at(-1)?.date||null};
}
export function yearlyHealthOverview(state,years){
  return [...years].map(year=>({year,...healthPeriod(state,{year})}));
}
export function formatHealth(key,value){
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
  if(key==='sleepHours')return round(Number(value),2).toFixed(2)+' h';
  if(key==='standHours')return Math.round(Number(value))+' h';
  if(key==='workoutMinutes')return Math.round(Number(value))+' min';
  if(key==='distanceMiles')return round(Number(value),2).toFixed(2)+' mi';
  return Math.round(Number(value)).toLocaleString('en-US');
}
export function csvHealthRows(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2)throw new Error('CSV must contain a header and at least one date.');
  const parse=line=>{const fields=[];let token='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){token+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){fields.push(token.trim());token=''}else token+=c}fields.push(token.trim());return fields};
  const fields=parse(lines.shift()).map(x=>x.toLowerCase().replace(/[\s_()-]/g,''));
  const names={date:'date',day:'date',steps:'steps',stepcount:'steps',walkingdistance:'distanceMiles',distancemi:'distanceMiles',distancemiles:'distanceMiles',distance:'distanceMiles',exercise:'exerciseMinutes',exerciseminutes:'exerciseMinutes',standtime:'standMinutes',standminutes:'standMinutes',activecalories:'activeCalories',activeenergy:'activeCalories',sleep:'sleepHours',sleephours:'sleepHours',averagesleep:'sleepHours',workouts:'workouts'};
  const keys=fields.map(x=>names[x]||null);
  const rows=lines.map(line=>{const values=parse(line),item={};keys.forEach((key,i)=>{if(key)item[key]=values[i]});return item;});
  return{format:'tide-health-daily-v1',source:'Private CSV import',days:rows};
}
export async function readHealthImportFile(file){
  const name=String(file?.name||'').toLowerCase();
  if(!file||file.size>60*1024*1024)throw new Error('Choose a JSON or CSV daily export no larger than 60 MB.');
  const text=await file.text();
  if(name.endsWith('.json')){const parsed=JSON.parse(text);if(Array.isArray(parsed)||Array.isArray(parsed?.days))return parsed;throw new Error('JSON must be a list of dated rows or have a days array.');}
  if(name.endsWith('.csv'))return csvHealthRows(text);
  throw new Error('Choose a T.I.D.E. Health JSON or CSV export. Raw Apple Health XML requires conversion to daily totals first.');
}
