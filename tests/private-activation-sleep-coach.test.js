import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeHealthImport,normalizeHealthRow} from '../health-activity.js';
import {sleepCoachingStats,sleepCoachingMarkup} from '../sleep-coach.js';
import {healthHubMarkup} from '../health-ui.js';
import {financeHubMarkup} from '../finances-ui.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const blank=()=>({version:1,entries:{},occurrences:[],healthActivity:{days:{}},finances:{accounts:{},transactions:{},recurring:{}}});
const clock=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function fixture(){
  const state=blank();
  const rows=[];
  for(let i=0;i<21;i++){
    const date=new Date('2026-10-24T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);
    rows.push({date:date.toISOString().slice(0,10),sleepHours:6.1+(i%5)*.3,
      sleepStartTime:clock(130+(i%4)*12),sleepWakeTime:clock(540+(i%4)*8),steps:3000+i*150});
  }
  mergeHealthImport(state,{source:'Apple Watch',days:rows});
  return state;
}
test('private Apple Watch import preserves first-asleep and wake times with daily metrics',()=>{
  const s=fixture(),rows=Object.values(s.healthActivity.days);
  assert.equal(rows.length,21);
  assert.equal(rows[0].sleepStartTime,'02:10');
  assert.equal(rows[0].sleepWakeTime,'09:00');
  assert.equal(normalizeHealthRow({date:'2026-11-12',steps:4000,sleepStartTime:'29:31',sleepWakeTime:'07:30'}).sleepStartTime,undefined);
  assert.equal(normalizeHealthRow({date:'2026-11-12',steps:4000,sleepStartTime:'02:31',sleepWakeTime:'07:30'}).sleepWakeTime,'07:30');
});
test('sleep coach uses median watch sleep clock times and a target based on measured wake time',()=>{
  const s=fixture(),coach=sleepCoachingStats(s,{year:2026});
  assert.ok(coach.ready);
  assert.equal(coach.nights,21);
  assert.equal(coach.typicalStart,'02:22');
  assert.equal(coach.typicalWake,'09:08');
  assert.equal(coach.suggestedAsleep,'01:08');
  assert.ok(coach.averageHours>6&&coach.averageHours<8);
  assert.equal(coach.weekly.reduce((a,w)=>a+w.nights,0),21);
  assert.ok(coach.latest7Hours!=null&&coach.previous7Hours!=null);
  assert.equal(sleepCoachingStats(s,{year:2025}).ready,false);
});
test('health sleep and overview tabs display watch guidance, preserving historical period limits',()=>{
  const s=fixture();
  const sleep=healthHubMarkup(s,{tab:'sleep',period:'year',year:2026,month:'2026-11'});
  const overview=healthHubMarkup(s,{tab:'overview',period:'year',year:2026,month:'2026-11'});
  assert.ok(sleep.includes('A bedtime based on your actual nights'));
  assert.ok(overview.includes('Watch-based')||overview.includes('WATCH-BASED'));
  assert.ok(sleep.includes('Week of'));
  assert.ok(sleep.includes('Suggested asleep by'));
  assert.ok(sleep.includes('around'));
  const old=healthHubMarkup(s,{tab:'sleep',period:'year',year:2024,month:'2024-01'});
  assert.ok(old.includes('Apple Watch sleep timing has not been imported for this period.'));
});
test('empty private Health/Finances dashboards offer the same single activation action',()=>{
  const s=blank();
  const health=healthHubMarkup(s,{tab:'overview',period:'year',year:2026,month:'2026-11'});
  const finance=financeHubMarkup(s,{tab:'overview',year:2026});
  assert.ok(health.includes('data-tide-private-activate'));
  assert.ok(finance.includes('data-tide-private-activate'));
  assert.ok(read('index.html').includes('id="tide-private-activation-file"'));
  const app=read('app.js');
  assert.ok(app.includes('async function activatePrivateData(file)'));
  assert.ok(app.includes("root.addEventListener('click',event=>{"));
  assert.ok(app.includes("if(event.target.closest('[data-tide-private-activate]'))quickPrivateInput?.click()"));
  assert.ok(app.includes('await cloudPush(state,cloud.etag)'));
  assert.ok(app.includes("payload?.format!=='tide-private-bootstrap-v1'"));
  assert.ok(!read('index.html').includes('612099'),'private account data must not be embedded in public shell');
});
test('updated private importer and personal sleep coach are in the Cloudflare build and offline shell',()=>{
  assert.ok(read('build.mjs').includes("'sleep-coach.js'"));
  assert.ok(read('sw.js').includes("'sleep-coach.js'"));
  assert.ok(read('insights.css').includes('.sleep-coach-tile'));
  assert.ok(read('insights.css').includes('--accent'));
});
