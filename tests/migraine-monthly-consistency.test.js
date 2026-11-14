import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migraineSummary,healthAnswers} from '../health-insights.js';
import {healthLifetimeMarkup,healthHubMarkup,healthReviewMarkup} from '../health-ui.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function fixture({datedEvents=16,recordedMonthly=16}={}){
  const s={version:1,entries:{},occurrences:[],monthlyReviews:{},yearlyReviews:{},healthActivity:{days:{}}};
  // Twelve distinct symptom days; one date may have multiple episodes.
  for(let day=1;day<=12;day++){
    const date='2026-09-'+String(day).padStart(2,'0');
    s.entries[date]={text:'Had a migraine today'};
    s.occurrences.push({id:'mig-'+day,trackerId:'migraines',date,count:day===1?datedEvents-11:1,source:'manual',snippet:'Had a migraine'});
  }
  s.monthlyReviews['2026-09']={trackerTotals:{migraines:recordedMonthly}};
  return s;
}
test('a 16-event month and 12 distinct symptom days are separate consistent facts',()=>{
 const s=fixture();
 const month=migraineSummary(s,{month:'2026-09'}),year=migraineSummary(s,{year:2026}),all=migraineSummary(s);
 for(const r of [month,year,all]){
   assert.equal(r.events,16);
   assert.equal(r.days,16,'backward-compatible tracker total is event count');
   assert.equal(r.datedDays,12,'unique symptom dates');
   assert.equal(r.datedEvents,16,'all events have dates in this fixture');
   assert.equal(r.missingDateCount,0);
   assert.equal(r.topMonths[0].month,'2026-09');
   assert.equal(r.topMonths[0].count,16);
   assert.equal(r.topMonths[0].days,12);
 }
 const healthRecord=healthLifetimeMarkup(s);
 assert.ok(healthRecord.includes('Most migraine/headache events in one month'));
 assert.ok(healthRecord.includes('16 occurrences'));
 assert.ok(healthRecord.includes('September 2026 · 12 dated symptom days'));
 const health=healthHubMarkup(s,{tab:'migraines',year:2026,period:'year'});
 assert.ok(health.includes('16'));
 assert.ok(health.includes('16 occurrences on 12 recorded dates'));
 assert.ok(health.includes('Migraine/headache occurrences by month'));
 const review=healthReviewMarkup(s,{year:2026});
 assert.ok(review.includes('16'));
 assert.ok(review.includes('16 dated events across 12 symptom days'));
 assert.equal((review.match(/class="insight-stat /g)||[]).length,6,'do not change the six review cards');
});
test('legacy monthly totals without enough dated records still use same 16-event peak',()=>{
 const s=fixture({datedEvents:12,recordedMonthly:16}),m=migraineSummary(s);
 assert.equal(m.events,16);
 assert.equal(m.datedDays,12);
 assert.equal(m.datedEvents,12);
 assert.equal(m.missingDateCount,4);
 assert.equal(m.topMonths[0].eventsWithoutVerifiedDates,4);
 const health=healthHubMarkup(s,{tab:'migraines',year:2026,period:'year'});
 assert.ok(health.includes('4 additional event records cannot be assigned'));
 const lifetime=healthLifetimeMarkup(s);
 assert.ok(lifetime.includes('16 occurrences'));
 assert.ok(lifetime.includes('12 dated symptom days'));
});
test('Personal Records uses exactly Health canonical monthly peak rather than an independent total path',()=>{
 assert.ok(app.includes("const migrainePeak=migraineSummary(state).topMonths[0]||null;"));
 assert.ok(app.includes('Most migraine/headache events in one month'));
 assert.ok(app.includes('migrainePeak.days'));
 assert.ok(!app.includes('const migraineMonths=new Set('));
});
test('Ask T.I.D.E. reports migraine events and dates using same monthly source',()=>{
 const s=fixture();
 const answer=healthAnswers(s,'How many migraines did I have in September 2026?',{today:'2026-11-13'});
 assert.equal(answer.kind,'health');
 assert.ok(answer.primary.includes('16 recorded events on 12 dated symptom days'),answer.primary);
});
