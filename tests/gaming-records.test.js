import test from 'node:test';
import assert from 'node:assert/strict';

const store=new Map();
globalThis.localStorage={
  getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key)
};
const {gamingRecordHighlights,saveGaming}=await import('../gaming-data.js');

test('gaming hall of fame uses dated deltas for day records and recovery for month records',()=>{
  saveGaming({
    baselineDate:'2026-10-01',
    latestSources:[{sourceKey:'ps5:motorfest',title:'The Crew Motorfest',platform:'ps5',minutes:20_000,countMinutes:true}],
    activity:{
      '2026-11-01':{games:{motorfest:{title:'The Crew Motorfest',platformMinutes:{ps5:130}}}},
      '2026-11-02':{games:{
        motorfest:{title:'The Crew Motorfest',platformMinutes:{ps5:110}},
        rocket:{title:'Rocket League',platformMinutes:{steam:60}}
      }}
    },
    recoveredMonths:{
      '2026-10':{games:{
        motorfest:{title:'The Crew Motorfest',platformMinutes:{ps5:300}},
        rocket:{title:'Rocket League',platformMinutes:{steam:200}}
      }}
    }
  },{sync:false});

  const r=gamingRecordHighlights();
  assert.deepEqual(r.bestDay,{date:'2026-11-02',minutes:170});
  assert.equal(r.bestMonth.month,'2026-10');
  assert.equal(r.bestMonth.minutes,500);
  assert.equal(r.bestMonth.recoveredMinutes,500);
  assert.equal(r.bestGameDay.title,'The Crew Motorfest');
  assert.equal(r.bestGameDay.minutes,130);
  assert.equal(r.bestGameMonth.title,'The Crew Motorfest');
  assert.equal(r.bestGameMonth.minutes,300);
  assert.deepEqual(r.topMonths.map(m=>[m.month,m.minutes]),[['2026-10',500],['2026-11',300]]);
  assert.equal(r.bestYear.minutes,800);
  assert.equal(r.trackedDays,2);
});

test('recovered month never becomes a fabricated gaming day',()=>{
  saveGaming({
    baselineDate:'2026-08-23',
    latestSources:[],
    activity:{},
    recoveredMonths:{'2026-09':{games:{sample:{title:'Rocket League',platformMinutes:{ps5:780}}}}}
  },{sync:false});
  const r=gamingRecordHighlights();
  assert.equal(r.bestDay,null);
  assert.equal(r.bestGameDay,null);
  assert.equal(r.bestMonth.month,'2026-09');
  assert.equal(r.bestMonth.minutes,780);
  assert.ok(r.lifetimeMinutes>0,'legacy lifetime playtime remains separate from dated records');
});

test('invalid and empty dated records cannot win the most-gaming-day award',()=>{
  saveGaming({
    baselineDate:'2026-08-23',
    latestSources:[],recoveredMonths:{},
    activity:{
      invalid:{games:{fake:{title:'Rocket League',platformMinutes:{ps5:99999}}}},
      '2026-12-01':{games:{fake:{title:'Rocket League',platformMinutes:{ps5:-300}}}},
      '2026-11-03':{games:{fake:{title:'Rocket League',platformMinutes:{ps5:40}}}}
    }
  },{sync:false});
  const r=gamingRecordHighlights();
  assert.equal(r.bestDay.date,'2026-11-03');
  assert.equal(r.bestDay.minutes,40);
  assert.equal(r.bestMonth.month,'2026-11');
});
