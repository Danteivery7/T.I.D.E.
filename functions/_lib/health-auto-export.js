// Health Auto Export (HealthyApps) JSON -> private T.I.D.E. daily Health rows.
// Official format: {"data":{"metrics":[{"name":"step_count","units":"count",
// "data":[{"date":"2026-11-13 00:00:00 -0500","qty":8000}]}],"workouts":[]}}.
// This is deliberately a pure normalizer: no network, credentials, or patient data.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const allowedDay=value=>{
 const date=String(value||'').slice(0,10);
 if(!DAY.test(date))return null;
 const stamp=new Date(date+'T12:00:00Z');
 if(Number.isNaN(stamp.getTime())||stamp.toISOString().slice(0,10)!==date)return null;
 return date>='2018-01-01'&&date<='2100-12-31'?date:null;
};
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const round=(value,precision=3)=>Math.round(value*10**precision)/10**precision;
const clock=value=>{
 const raw=String(value||'');
 const match=raw.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}):\d{2}/);
 return match?match[1]:null;
};
const metricKey=name=>String(name||'').replace(/([a-z])([A-Z])/g,'$1_$2').toLowerCase();
const converter={
 step_count:['steps',()=>1],
 walking_running_distance:['distanceMiles',units=>/^km|kilomet/i.test(units)?0.621371:/^m$|metre|meter/i.test(units)?0.000621371:1],
 apple_exercise_time:['exerciseMinutes',units=>/^h$|hours?|hr$/i.test(units)?60:1],
 apple_stand_time:['standMinutes',units=>/^h$|hours?|hr$/i.test(units)?60:1],
 active_energy:['activeCalories',units=>/^kj|kiloj/i.test(units)?0.239006:1],
 active_energy_burned:['activeCalories',units=>/^kj|kiloj/i.test(units)?0.239006:1]
};
export function parseHealthAutoExport(payload){
 const data=payload?.data;
 if(!data||(!Array.isArray(data.metrics)&&!Array.isArray(data.workouts)))
   throw new Error('Expected Health Auto Export JSON with data.metrics or data.workouts.');
 const days=new Map(),buckets=new Map();
 const row=date=>{if(!days.has(date))days.set(date,{date});return days.get(date)};
 const metrics=Array.isArray(data.metrics)?data.metrics:[];
 if(metrics.length>100)throw new Error('Too many health metrics in one upload.');
 let records=0;
 for(const metric of metrics){
   const name=metricKey(metric?.name),units=String(metric?.units||'').trim();
   const entries=Array.isArray(metric?.data)?metric.data:[];
   if(entries.length>20000)throw new Error('Health metric batch is too large. Reduce export date range.');
   if(name==='sleep_analysis'){
     for(const x of entries){
       const date=allowedDay(x?.sleepEnd||x?.date);
       const total=finite(x?.totalSleep);
       // Summarized daily sleep includes the source-provided totalSleep.
       // Raw sleep segments must be summarized by the exporting app first.
       if(!date||total===null||total<=0||total>18)continue;
       const next=row(date),previous=finite(next.sleepHours)||0;
       // Multiple watch/phone sources can describe the same night: keep the
       // most comprehensive measurement, never sum duplicate source totals.
       if(total>=previous){
         next.sleepHours=round(total);
         const start=clock(x.sleepStart),wake=clock(x.sleepEnd);
         if(start)next.sleepStartTime=start;
         if(wake)next.sleepWakeTime=wake;
         next.sleepSessions=1;
       }
       records++;
     }
     continue;
   }
   if(!converter[name])continue;
   const [field,convert]=converter[name],multiplier=convert(units);
   for(const x of entries){
     const date=allowedDay(x?.date),quantity=finite(x?.qty);
     if(!date||quantity===null||quantity<0||quantity>1e8)continue;
     const amount=quantity*multiplier;
     // For summarized daily groups, duplicate source rows share a bucket:
     // choose the largest instead of double-counting overlapping devices.
     // Distinct time-group buckets are combined once per export.
     const timestamp=String(x.date).trim().slice(0,30);
     const id=date+'|'+field,bucket=buckets.get(id)||new Map();
     bucket.set(timestamp,Math.max(bucket.get(timestamp)||0,amount));
     buckets.set(id,bucket);
     records++;
   }
 }
 for(const [key,bucket] of buckets){
   const ix=key.indexOf('|'),date=key.slice(0,ix),field=key.slice(ix+1);
   const total=[...bucket.values()].reduce((sum,n)=>sum+n,0);
   if(total>=0&&total<=1e8)row(date)[field]=round(total);
 }
 const workouts=Array.isArray(data.workouts)?data.workouts:[];
 if(workouts.length>10000)throw new Error('Workout batch is too large.');
 const workoutsByDate=new Map(),seenWorkouts=new Set();
 for(const workout of workouts){
   const date=allowedDay(workout?.end||workout?.start),id=String(workout?.id||'');
   if(!date||!id||seenWorkouts.has(id))continue;
   seenWorkouts.add(id);
   const duration=finite(workout.duration);
   const kind=String(workout.name||'Other').replace(/[^A-Za-z]/g,'').slice(0,45)||'Other';
   const o=workoutsByDate.get(date)||{workouts:0,workoutMinutes:0,workoutTypes:{}};
   o.workouts++;
   if(duration!==null&&duration>=0&&duration<=86400)o.workoutMinutes+=duration/60;
   o.workoutTypes[kind]=(o.workoutTypes[kind]||0)+1;
   workoutsByDate.set(date,o);records++;
 }
 for(const [date,workout] of workoutsByDate)Object.assign(row(date),{
   ...workout,workoutMinutes:round(workout.workoutMinutes)
 });
 if(!days.size)throw new Error('No supported daily steps, distance, activity, summarized sleep, or workouts found. Choose daily JSON Health Metrics and turn Summarize Data on.');
 return {days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),samplesAccepted:records,
   metricNames:metrics.map(m=>String(m.name||'')).filter(Boolean).slice(0,100),
   format:'health-auto-export'};
}
