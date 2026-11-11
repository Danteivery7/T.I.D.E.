import test from 'node:test';
import assert from 'node:assert/strict';
import {diarySignals} from '../diary-insights.js';

const sample={entries:{
  '2026-05-01':{text:'Edited a video, went to lecture, played with Dylan, bought lunch for $12, Yankees won'},
  '2026-05-02':{text:'Edited another video, FaceTimed Carter, went to Walmart, got refund of $5'},
  '2026-05-04':{text:'My birthday, launched a website'},
  '2026-06-01':{text:'Watched the Knicks, did homework'},
  '2025-09-10':{text:'Edited video, talked with family'}
}};

test('diary subject counts are distinct days, not word repetitions or dollars',()=>{
  const result=diarySignals(sample,{month:'2026-05'});
  const categories=Object.fromEntries(result.categories.map(c=>[c.id,c]));
  assert.equal(result.loggedDays,3);
  assert.equal(categories.creative.days,2);
  assert.equal(categories.social.days,2);
  assert.equal(categories.money.days,2);
  assert.equal(categories.money.peakMonth.month,'2026-05');
  assert.equal(categories.creative.streak.days,2);
  assert.equal(result.topSports.name,'Yankees');
});

test('monthly and yearly filters use dated notes and do not invent activity totals',()=>{
  const may=diarySignals(sample,{month:'2026-05'});
  const year=diarySignals(sample,{year:2026});
  const all=diarySignals(sample);
  assert.equal(may.loggedDays,3);
  assert.equal(year.loggedDays,4);
  assert.equal(all.loggedDays,5);
  assert.equal(year.categories.find(x=>x.id==='learning').days,2);
  assert.ok(may.milestoneCount>=1);
  assert.ok(may.milestones.some(x=>x.date==='2026-05-04'));
  assert.ok(may.mostVaried?.date==='2026-05-01');
});

test('money notes are text mentions only and cannot be interpreted as cash amounts',()=>{
  const note=diarySignals({entries:{
    '2026-07-02':{text:'Bought a game for $50, then got a refund of $50'},
    '2026-07-03':{text:'No purchases today'},
    'nonsense':{text:'Paid $999'},
  }},{month:'2026-07'});
  assert.equal(note.categories.find(x=>x.id==='money').days,2);
  assert.equal(note.loggedDays,2);
  assert.ok(!('totalSpent' in note));
  assert.ok(!('balance' in note));
});
