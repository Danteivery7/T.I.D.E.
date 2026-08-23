import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askTide,dailyChallengeStreaks,freshState,montyRecord,saveMonthlyReview,
  setDailyChallengeLog,shiftDay,isoToday
} from '../engine-v3.js';

test('2026 Monty record is summed from monthly W-L records',()=>{
  const state=freshState();
  const rows={
    '2026-01':[1,6],'2026-02':[5,7],'2026-03':[5,22],'2026-04':[6,18],
    '2026-05':[3,17],'2026-06':[7,20],'2026-07':[1,10],'2026-08':[0,3],
  };
  for(const [month,[wins,losses]] of Object.entries(rows)){
    saveMonthlyReview(state,month,{versusTotals:{'monty-dc':{wins,losses,ties:0}}});
  }
  state.yearlyReviews[2026]={versusTotals:{'monty-dc':{wins:17,losses:53,ties:0}}};
  assert.deepEqual(montyRecord(state,{year:2026}),{wins:28,losses:103,ties:0});
  const answer=askTide(state,'What is my record versus Monty this year?');
  assert.equal(answer.primary,'28-103');
});

test('new daily result increments an imported month baseline',()=>{
  const state=freshState();
  saveMonthlyReview(state,'2026-08',{versusTotals:{'monty-dc':{wins:0,losses:3,ties:0}}});
  setDailyChallengeLog(state,{date:'2026-08-23',status:'complete',versus:'win'});
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:1,losses:3,ties:0});
});

test('saving the same quick-log date twice replaces the result',()=>{
  const state=freshState();
  setDailyChallengeLog(state,{date:'2026-08-23',status:'complete',versus:'win'});
  setDailyChallengeLog(state,{date:'2026-08-23',status:'complete',versus:'loss'});
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:0,losses:1,ties:0});
});

test('an explicit miss immediately marks the streak inactive',()=>{
  const state=freshState();
  const today=isoToday();
  setDailyChallengeLog(state,{date:shiftDay(today,-1),status:'complete'});
  setDailyChallengeLog(state,{date:today,status:'miss'});
  const streak=dailyChallengeStreaks(state);
  assert.equal(streak.active,false);
  assert.equal(streak.current,0);
});
