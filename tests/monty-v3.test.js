import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyChallengeCounter,ensureSimpleCounters,freshState,incrementDailyChallenge,montyRecord,recordMontyResult} from '../engine-v3.js';

test('one-time migration repairs the live counters to the known August 23 baseline',()=>{
  const state=freshState();
  state.tideCounters={dailyChallenge:{current:1},montyOverall:{wins:0,losses:0}};
  state.monthlyReviews['2026-08']={versusTotals:{'monty-dc':{wins:0,losses:0}}};
  ensureSimpleCounters(state);
  assert.equal(dailyChallengeCounter(state).value,118);
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:0,losses:3,ties:0});
  assert.deepEqual(montyRecord(state),{wins:28,losses:103,ties:0});
  assert.deepEqual(montyRecord(state,{year:2026}),{wins:28,losses:103,ties:0});
});

test('Daily Challenge is a literal manual ticker',()=>{
  const state=freshState();ensureSimpleCounters(state);
  incrementDailyChallenge(state);assert.equal(dailyChallengeCounter(state).value,119);
  incrementDailyChallenge(state);assert.equal(dailyChallengeCounter(state).value,120);
});

test('Monty win increments month, year and all-time with no tie or score logic',()=>{
  const state=freshState();ensureSimpleCounters(state);
  recordMontyResult(state,'win');
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:1,losses:3,ties:0});
  assert.deepEqual(montyRecord(state,{year:2026}),{wins:29,losses:103,ties:0});
  assert.deepEqual(montyRecord(state),{wins:29,losses:103,ties:0});
});

test('Monty loss increments month, year and all-time',()=>{
  const state=freshState();ensureSimpleCounters(state);
  recordMontyResult(state,'loss');
  assert.deepEqual(montyRecord(state,{month:'2026-08'}),{wins:0,losses:4,ties:0});
  assert.deepEqual(montyRecord(state),{wins:28,losses:104,ties:0});
});

test('new month is automatically 0-0 while all-time continues',()=>{
  const state=freshState();ensureSimpleCounters(state);
  assert.deepEqual(montyRecord(state,{month:'2026-09'}),{wins:0,losses:0,ties:0});
  assert.deepEqual(montyRecord(state),{wins:28,losses:103,ties:0});
});
