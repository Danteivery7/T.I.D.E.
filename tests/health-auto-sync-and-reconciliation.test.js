import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHealthAutoExport} from '../functions/_lib/health-auto-export.js';
import {onRequestGet,onRequestPost} from '../functions/api/health/ingest.js';
import {migraineSummary} from '../health-insights.js';
import {healthDailyCard,healthHubMarkup,healthReviewMarkup} from '../health-ui.js';
import {healthPeriod} from '../health-activity.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function fixture(){
 const payload={data:{metrics:[
  {name:'step_count',units:'count',data:[
   {date:'2026-11-13 07:00:00 -0500',qty:3000,source:'Apple Watch'},
   {date:'2026-11-13 07:00:00 -0500',qty:2500,source:'iPhone'},
   {date:'2026-11-13 18:00:00 -0500',qty:5000,source:'Apple Watch'}
  ]},
  {name:'walking_running_distance',units:'km',data:[{date:'2026-11-13 00:00:00 -0500',qty:5}]},
  {name:'apple_exercise_time',units:'min',data:[{date:'2026-11-13 00:00:00 -0500',qty:30}]},
  {name:'sleep_analysis',units:'hr',data:[{
   date:'2026-11-13 00:00:00 -0500',totalSleep:6.8,
   sleepStart:'2026-11-12 02:12:00 -0500',sleepEnd:'2026-11-13 09:15:00 -0500',
   asleep:0.1,core:3.5,deep:1.1,rem:2.1
  }]}
 ],workouts:[{id:'test-1',name:'Walking',start:'2026-11-13 12:00:00 -0500',end:'2026-11-13 12:55:00 -0500',duration:3300}]}};
 return payload;
}
function blank(){
 return{version:1,entries:{'2026-01-01':{text:'Had a migraine today'}},occurrences:[],healthActivity:{days:{}},monthlyReviews:{},yearlyReviews:{}};
}
test('Health Auto Export official daily JSON upserts steps, distance, sleep and workouts',()=>{
 const parsed=parseHealthAutoExport(fixture());
 assert.equal(parsed.days.length,1);
 const d=parsed.days[0];
 assert.equal(d.date,'2026-11-13');
 assert.equal(d.steps,8000,'two time buckets sum, duplicate device at the same time does not');
 assert.equal(d.distanceMiles,3.107);
 assert.equal(d.exerciseMinutes,30);
 assert.equal(d.sleepHours,6.8);
 assert.equal(d.sleepStartTime,'02:12');
 assert.equal(d.sleepWakeTime,'09:15');
 assert.equal(d.workoutMinutes,55);
 assert.equal(d.workouts,1);
 assert.deepEqual(d.workoutTypes,{Walking:1});
});
test('Health Auto Export rejects unrelated JSON and un-summarized sleep-only JSON',()=>{
 assert.throws(()=>parseHealthAutoExport({days:[{date:'2026-11-13',steps:22}]}),/Expected Health Auto Export/);
 assert.throws(()=>parseHealthAutoExport({data:{metrics:[{
  name:'sleep_analysis',units:'hr',data:[{date:'2026-11-13 02:00:00 -0500',qty:0.6,value:'Core'}]
 }]}}),/No supported daily steps/);
});
test('private Cloudflare Health endpoint requires a separate bearer token and does not double-count uploads',async()=>{
 let version=1,current=blank();
 const db={prepare(sql){
  const obj={args:null,bind(...args){this.args=args;return this;},
    async first(){if(sql.includes('SELECT version'))return{version,json:JSON.stringify(current)};return null;},
    async run(){if(sql.includes('UPDATE tide_state')){if(this.args[3]!==version)return{meta:{changes:0}};current=JSON.parse(this.args[0]);version++;return{meta:{changes:1}}}return{meta:{changes:0}};}
  };return obj;
 }};
 const env={TIDE_DB:db,TIDE_HEALTH_INGEST_TOKEN:'1234567890-example-test-token-very-secret'};
 const request=token=>new Request('https://t-i-d-e.pages.dev/api/health/ingest',{method:'POST',
  headers:{'content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify(fixture())});
 assert.equal((await onRequestGet()).status,405);
 assert.equal((await onRequestPost({request:request('wrong'),env})).status,401);
 const first=await onRequestPost({request:request(env.TIDE_HEALTH_INGEST_TOKEN),env});
 assert.equal(first.status,200,await first.text());
 const a=current.healthActivity.days['2026-11-13'];
 assert.equal(a.steps,8000);assert.equal(a.sleepHours,6.8);
 assert.equal(current.entries['2026-01-01'].text,'Had a migraine today','preserve diary');
 assert.equal(current.healthActivity.autoSync.status,'receiving');
 assert.equal(current.healthActivity.autoSync.lastSourceDate,'2026-11-13');
 const second=await onRequestPost({request:request(env.TIDE_HEALTH_INGEST_TOKEN),env});
 assert.equal(second.status,200);
 assert.equal(current.healthActivity.days['2026-11-13'].steps,8000,'never double steps');
 assert.equal(current.healthActivity.days['2026-11-13'].workouts,1,'never double workouts');
 assert.equal(current.healthActivity.days['2026-11-13'].sleepHours,6.8,'never double sleep');
});
test('Migraine total uses tracker year authority while detailed records remain dated-only',()=>{
 const state=blank();
 for(let i=1;i<=7;i++){
  const date='2026-01-'+String(i).padStart(2,'0');
  state.entries[date]={text:'Had a migraine today'};
 }
 state.yearlyReviews['2026']={trackerTotals:{migraines:11}};
 const report=migraineSummary(state,{year:2026});
 assert.equal(report.days,11);
 assert.equal(report.datedDays,7);
 assert.equal(report.missingDateCount,4);
 assert.equal(report.rows.length,7,'no missing dates invented');
 assert.equal(report.types.migraine,7);
 assert.equal(report.loggedMonths,1);
 const markup=healthHubMarkup(state,{tab:'migraines',period:'year',year:2026});
 assert.ok(markup.includes('11'));
 assert.ok(markup.includes('7 recorded dates'));
 assert.ok(markup.includes('4 additional event records cannot be assigned'));
 const review=healthReviewMarkup(state,{year:2026});
 assert.ok(review.includes('11'));
 assert.ok(review.includes('4 undated events'));
 assert.equal((review.match(/class="insight-stat /g)||[]).length,6,'six existing review slots must remain');
});
test('Today Steps display total plus daily average and Health shows monthly/year comparisons',()=>{
 const state=blank();
 state.healthActivity.days={
  '2024-06-01':{date:'2024-06-01',steps:2000},
  '2025-06-01':{date:'2025-06-01',steps:4000},
  '2026-11-12':{date:'2026-11-12',steps:6000},
  '2026-11-13':{date:'2026-11-13',steps:8000}
 };
 const card=healthDailyCard(state,'2026-11-13','steps');
 assert.ok(card.includes('14,000'));assert.ok(card.includes('7,000'));
 assert.ok(card.includes('AVERAGE PER DAY'));
 assert.ok(card.includes('today-step-dual'));
 const health=healthHubMarkup(state,{tab:'steps',period:'year',year:2026});
 assert.ok(health.includes('Average steps per recorded day'));
 assert.ok(health.includes('Average steps per recorded day · month by month'));
 assert.ok(health.includes('Average daily steps · year by year'));
 assert.equal(healthPeriod(state,{year:2025}).metrics.sleepHours.days,0,'no invented old sleep');
 const app=read('app.js');
 assert.ok(app.includes('healthYearComparisonMarkup(y)'));
 assert.ok(app.includes('const from=2024,to=Math.max(from,Number(selectedYear)||from)'));
 assert.ok(!app.includes('Math.max(2027,Number(isoToday().slice(0,4)))'));
 assert.ok(read('insights.css').includes('today-step-measure--avg'));
});
