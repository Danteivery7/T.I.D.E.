import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askTide,dailyChallengeCounter,freshState,markDailyChallengePlayed,montyRecord,parseNotesImport,
  saveMonthlyReview,setDailyChallengeLog,shiftDay,isoToday
} from '../engine-v3.js';

test('2026 Monty record is summed from monthly W-L records',()=>{
  const state=freshState();
  const rows={
    '2026-01':[1,6],'2026-02':[5,7],'2026-03':[5,22],'2026-04':[6,18],
    '2026-05':[3,17],'2026-06':[7,20],'2026-07':[1,10],'2026-08':[0,3],
  };
  for(const [month,[wins,losses]] of Object.entries(rows)) saveMonthlyReview(state,month,{versusTotals:{'monty-dc':{wins,losses}}});
  state.yearlyReviews[2026]={versusTotals:{'monty-dc':{wins:17,losses:53,ties:99}}};
  assert.deepEqual(montyRecord(state,{year:2026}),{wins:28,losses:103,ties:0});
  assert.equal(askTide(state,'What is my record versus Monty this year?').primary,'28-103');
});

test('blank scores do not override an explicit Monty loss',()=>{
  const state=freshState();
  setDailyChallengeLog(state,{date:'2026-08-23',status:'none',versus:'loss',myScore:'',opponentScore:''});
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:0,losses:1,ties:0});
});

test('same Monty date replaces win with loss instead of double counting',()=>{
  const state=freshState();
  setDailyChallengeLog(state,{date:'2026-08-23',status:'none',versus:'win'});
  setDailyChallengeLog(state,{date:'2026-08-23',status:'none',versus:'loss'});
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:0,losses:1,ties:0});
});

test('imported 118 snapshot is authoritative over old detected completions',()=>{
  const state=freshState();
  const today=isoToday();
  saveMonthlyReview(state,today.slice(0,7),{trackerSnapshots:{'daily-challenge':{value:118,date:today}}});
  for(let i=0;i<133;i++) state.occurrences.push({id:`old-${i}`,trackerId:'daily-challenge',date:shiftDay(today,-i),count:1,result:'complete',source:'detected'});
  assert.equal(dailyChallengeCounter(state).value,118);
});

test('explicit played-day button increments snapshot exactly once on next day',()=>{
  const state=freshState();
  const today=isoToday(),yesterday=shiftDay(today,-1);
  saveMonthlyReview(state,yesterday.slice(0,7),{trackerSnapshots:{'daily-challenge':{value:118,date:yesterday}}});
  markDailyChallengePlayed(state,today);
  markDailyChallengePlayed(state,today);
  assert.equal(dailyChallengeCounter(state).value,119);
});

test('2026 note import restores August Monty baseline 0-3',()=>{
  const state=freshState();
  parseNotesImport('**2026**\n**AUGUST**\nAugust 22nd- played geoguessr\nAugust Daily Challenge Record vs Monty: 0-3',state);
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:0,losses:3,ties:0});
});
