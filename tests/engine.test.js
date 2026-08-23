import test from 'node:test';
import assert from 'node:assert/strict';
import { askTide, detectFromEntry, freshState, parseNotesImport, saveEntry, saveMonthlyReview, trackerTotal } from '../engine.js';

test('migraine negation is not counted',()=>{
  const rows=detectFromEntry('2026-08-14','started getting a migraine, rid of headache before it became a migraine');
  assert.equal(rows.filter(x=>x.trackerId==='migraines').length,0);
});

test('Hong Kong twice counts two occurrences on one day',()=>{
  const s=freshState();saveEntry(s,'2026-06-01','played geoguessr, spawned in Hong Kong twice, got off');
  assert.equal(trackerTotal(s,'hong-kong',{year:2026}),2);
  const answer=askTide(s,'What days did I spawn in Hong Kong in 2026?');
  assert.equal(answer.items.length,1);assert.match(answer.items[0].meta,/2 occurrences/);
});

test('best day remains manual and WHYY uses saved day',()=>{
  const s=freshState();saveEntry(s,'2026-07-02','graduation, finished school for final time, celebrated with family');saveMonthlyReview(s,'2026-07',{bestDay:'2026-07-02'});
  const a=askTide(s,'Why was my best day the best?');assert.equal(a.date,'2026-07-02');assert.match(a.detail,/You selected this/);
});

test('notes import preserves day text and monthly best/worst',()=>{
  const s=freshState();
  const raw='**2026**\n**JANUARY**\nJanuary 1st- Woke up, edited, played geoguessr\nBest Day of the Month: JAN 1\nWorst Day of the Month: JAN 2\nMors Mutual Calls: 3';
  const r=parseNotesImport(raw,s);
  assert.equal(r.entries,1);
  assert.match(s.entries['2026-01-01'].text,/Woke up/);
  assert.equal(s.monthlyReviews['2026-01'].bestDay,'2026-01-01');
  assert.equal(s.monthlyReviews['2026-01'].trackerTotals['mors-mutual'],3);
});
