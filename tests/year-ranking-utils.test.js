import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {yearRankStatus,yearRankSummary,repositionYear,YEAR_RANKING_STATUS_LABELS} from '../year-ranking-utils.js';

const decade=[2027,2029,2026,2024,2028,2020,2022,2023,2025,2021];

test('rankings clearly distinguish completed, in-progress and projected years',()=>{
  assert.equal(yearRankStatus(2024,2026),'completed');
  assert.equal(yearRankStatus(2026,2026),'in-progress');
  assert.equal(yearRankStatus(2027,2026),'projected');
  assert.equal(yearRankStatus(2027,2028),'completed');
  assert.equal(YEAR_RANKING_STATUS_LABELS.projected,'Future year');
});

test('summary reports exact curated order without claiming a computed score',()=>{
  const result=yearRankSummary(decade,2026);
  assert.deepEqual(result,{total:10,completed:6,inProgress:1,projected:3,leader:2027});
  assert.deepEqual(decade,[2027,2029,2026,2024,2028,2020,2022,2023,2025,2021]);
  assert.deepEqual(yearRankSummary([],2026),{total:0,completed:0,inProgress:0,projected:0,leader:null});
});

test('reordering keeps the original list intact and does not change year membership',()=>{
  const before=decade.slice();
  const next=repositionYear(decade,3,0);
  assert.equal(next[0],2024);
  assert.equal(next[1],2027);
  assert.equal(next.length,10);
  assert.deepEqual(next.slice().sort(),decade.slice().sort());
  assert.deepEqual(decade,before);
});

test('invalid reorder requests do not alter any ranking',()=>{
  for(const [from,to] of [[-1,0],[0,10],[1,1],[null,2],[1,2.5],['nonsense',0]]){
    assert.equal(repositionYear(decade,from,to),null);
  }
  assert.deepEqual(decade,[2027,2029,2026,2024,2028,2020,2022,2023,2025,2021]);
});

test('all-time single and empty lists can be reordered or summarized safely',()=>{
  assert.deepEqual(repositionYear([2021],0,0),null);
  assert.deepEqual(repositionYear([],0,0),null);
  assert.deepEqual(yearRankSummary([2016,2026,2027],2026),{total:3,completed:1,inProgress:1,projected:1,leader:2016});
});

test('ranking page keeps all edit controls and renders the podium in each mode',()=>{
  const page=readFileSync(new URL('../year-rankings.js',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
  for(const x of ["function rankedPodium(", "function rankingsLineup(", "yrk-podium", "yrk-row", "rank-mode-decade","rank-mode-all","year-position","rank-up","rank-down","rank-remove","add-ranked-year","dragstart","drop"])assert.ok(page.includes(x),x);
  for(const x of [".yrk-hero",".yrk-podium--1",".yrk-podium--2",".yrk-podium--3",".yrk-row",".yrk-add-button","@media(max-width:480px)"])assert.ok(styles.includes(x),x);
  assert.ok(build.includes("'year-ranking-utils.js'"));
});
