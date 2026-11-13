/* Personalized sleep guidance based on actual dated Apple Watch sleep timing.
   All calculations run on imported private T.I.D.E. records in the browser. */
import {healthRows} from './health-activity.js';

const hhmm=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const num=x=>Number.isFinite(Number(x))?Number(x):null;
const mins=s=>hhmm.test(String(s||''))?Number(s.slice(0,2))*60+Number(s.slice(3,5)):null;
const time=n=>{const v=((Math.round(n)%1440)+1440)%1440;return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')};
const mean=list=>list.length?list.reduce((a,b)=>a+b,0)/list.length:null;
const median=list=>{
  if(!list.length)return null;
  const a=[...list].sort((x,y)=>x-y),mid=Math.floor(a.length/2);
  return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;
};
const dateTime=date=>Date.parse(date+'T12:00:00Z');
const dayStart=date=>{
  const d=new Date(date+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()-d.getUTCDay());
  return d.toISOString().slice(0,10);
};
const shortDate=date=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function sleepCoachingStats(state,scope={}){
  const all=healthRows(state);
  const start=scope.year?String(scope.year)+'-01-01':scope.month?scope.month+'-01':'0000-01-01';
  const end=scope.year?String(scope.year)+'-12-31':scope.month?scope.month+'-31':'9999-12-31';
  const eligible=all.filter(r=>r.date>=start&&r.date<=end&&mins(r.sleepStartTime)!=null&&mins(r.sleepWakeTime)!=null&&num(r.sleepHours)>0);
  if(!eligible.length)return{ready:false,reason:'Apple Watch sleep timing has not been imported for this period.',nights:0};
  const anchor=eligible.at(-1).date;
  // For a current month's recommendation, allow the previous month's nights
  // to complete a reliable rolling sample, but never cross a selected year.
  const prior=dateTime(anchor)-44*86400000;
  const recent=all.filter(r=>r.date<=anchor&&dateTime(r.date)>=prior&&r.date>=String(anchor.slice(0,4))+'-01-01'
    &&mins(r.sleepStartTime)!=null&&mins(r.sleepWakeTime)!=null&&num(r.sleepHours)>0).slice(-21);
  if(recent.length<7)return{ready:false,reason:'At least seven measured nights are needed for a personalized bedtime recommendation.',nights:recent.length};
  const bed=median(recent.map(r=>(mins(r.sleepStartTime)-720+1440)%1440));
  const wake=median(recent.map(r=>mins(r.sleepWakeTime)));
  const typicalStart=time(bed+720),typicalWake=time(wake),suggestedAsleep=time(wake-480);
  const avg=mean(recent.map(r=>Number(r.sleepHours)));
  const latest7=recent.slice(-7),previous7=recent.slice(-14,-7);
  const latestMean=mean(latest7.map(r=>Number(r.sleepHours)));
  const previousMean=previous7.length>=4?mean(previous7.map(r=>Number(r.sleepHours))):null;
  const weekly=new Map();
  for(const r of recent){
    const key=dayStart(r.date),g=weekly.get(key)||{weekStart:key,dates:[],sum:0,nights:0,atLeast7:0};
    g.dates.push(r.date);g.sum+=Number(r.sleepHours);g.nights++;if(Number(r.sleepHours)>=7)g.atLeast7++;
    weekly.set(key,g);
  }
  const weeks=[...weekly.values()].sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).slice(-6).map(g=>({
    ...g,average:g.sum/g.nights,label:'Week of '+shortDate(g.weekStart)
  }));
  return{ready:true,anchor,nights:recent.length,typicalStart,typicalWake,suggestedAsleep,averageHours:avg,
    sevenHourNights:recent.filter(r=>Number(r.sleepHours)>=7).length,
    latest7Hours:latestMean,previous7Hours:previousMean,
    weekly:weeks,source:'Apple Watch asleep stages'};
}

export function sleepCoachingMarkup(state,scope={}){
  const d=sleepCoachingStats(state,scope);
  if(!d.ready)return '<section class="insight-surface sleep-coach"><span class="insight-kicker">☾ WATCH-BASED SLEEP PLAN</span>'+
    '<h3>Build your personal bedtime plan</h3><p class="insight-subcopy">'+esc(d.reason)+
    ' General adult sleep guidance is around 7–9 hours, but a bedtime cannot be personalized from total sleep hours alone.</p></section>';
  const diff=d.previous7Hours==null?'Not enough earlier nights to compare':
    (d.latest7Hours-d.previous7Hours>=0?'+':'')+(d.latest7Hours-d.previous7Hours).toFixed(2)+
    ' h versus the previous 7 recorded nights';
  const tile=(label,value,detail)=>'<div class="sleep-coach-tile"><span>'+esc(label)+'</span><strong>'+esc(value)+
    '</strong><small>'+esc(detail)+'</small></div>';
  const weeks=d.weekly.map(w=>'<div class="sleep-coach-week"><span>'+esc(w.label)+'</span><strong>'+
    w.average.toFixed(2)+' h</strong><small>'+w.nights+' measured night'+(w.nights===1?'':'s')+
    ' · '+w.atLeast7+' at least 7 h</small></div>').join('');
  return '<section class="insight-surface sleep-coach" aria-label="Personalized Apple Watch sleep schedule">'+
    '<span class="insight-kicker">☾ WATCH-BASED SLEEP PLAN</span><h3>A bedtime based on your actual nights</h3>'+
    '<p class="insight-subcopy">Calculated from your latest '+d.nights+' recorded nights ending '+esc(d.anchor)+
    '. Clock times come from when your watch detected sleep, not simply when you got into bed.</p>'+
    '<div class="sleep-coach-tiles">'+
      tile('Typical sleep begins',d.typicalStart,'Median first-asleep time')+
      tile('Typical waking time',d.typicalWake,'Median final wake time')+
      tile('Average sleep',d.averageHours.toFixed(2)+' h',d.sevenHourNights+' of '+d.nights+' nights reached 7 h')+
      tile('Suggested asleep by',d.suggestedAsleep,'8 hours before your typical wake time')+
    '</div>'+
    '<p class="sleep-coach-advice">Your watch suggests a practical target of being asleep around <b>'+esc(d.suggestedAsleep)+
    '</b> if you want to keep waking near <b>'+esc(d.typicalWake)+
    '</b>. That is earlier than your usual <b>'+esc(d.typicalStart)+
    '</b> sleep onset, so shift gradually rather than forcing a sudden bedtime. Allow additional time to fall asleep.</p>'+
    '<div class="sleep-coach-progress"><h4>Recent sleep progress</h4><p class="insight-subcopy">Latest seven recorded nights: '+
      d.latest7Hours.toFixed(2)+' h/night. '+esc(diff)+'.</p>'+
      '<div class="sleep-coach-weeks">'+weeks+'</div></div>'+
    '<p class="insight-disclaimer">General adult target: 7–9 hours nightly; 8 hours is a planning midpoint, not a medical requirement. Missing nights are excluded. Source: imported Apple Watch sleep-stage timing. The plan updates as new private data is imported.</p></section>';
}
