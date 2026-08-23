import test from 'node:test';
import assert from 'node:assert/strict';
import { askTide, dailyChallengeStreaks, freshState, geoguessr10kRecord, montyRecord, parseNotesImport, trackerTotal } from '../engine-v2.js';

test('v2 imports authoritative current snapshots',()=>{const s=freshState();parseNotesImport(`**2026**\n**AUGUST**\nAugust 23rd- Woke up, edited\nHong Kong Spawns (All Time): 11\nGeoguessr 10K Streak: 708\nCurrent Daily Challenge Streak: 118\nAugust Daily Challenge Record vs Monty: 0-3`,s);assert.equal(trackerTotal(s,'hong-kong'),11);assert.equal(geoguessr10kRecord(s).value,708);assert.equal(dailyChallengeStreaks(s).current,118);assert.equal(montyRecord(s,{month:'2026-08'}).losses,3)});

test('v2 preserves year review detail',()=>{const s=freshState();parseNotesImport(`**2026 - YEAR IN REVIEW**\n2026 Collision Count:\n**12**\n2026 Migraines:\n**8**\n2026 Daily Challenge Record vs Monty:\n**17-53**\nAVG DC Score - ME\n**17,716**`,s);assert.equal(trackerTotal(s,'collision-count',{year:2026}),12);assert.equal(trackerTotal(s,'migraines',{year:2026}),8);assert.deepEqual(montyRecord(s,{year:2026}),{wins:17,losses:53,ties:0});assert.equal(s.yearlyReviews[2026].legacyFields['AVG DC Score - ME'],'17,716')});

test('v2 granular Ask does not invent missing dates',()=>{const s=freshState();parseNotesImport(`**2026**\n**JUNE**\nJune 1st- spawned in Hong Kong twice\nHong Kong Spawns (All Time): 11`,s);const a=askTide(s,'What days did I spawn in Hong Kong in 2026?');assert.equal(a.items.length,1);assert.match(a.detail,/will not invent dates/)});
