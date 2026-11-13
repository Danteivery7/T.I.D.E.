import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const store=new Map();
globalThis.localStorage={
  getItem:k=>store.get(k)||null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};
const {saveGaming,mergeGaming,mergeReportedSessions}=await import('../gaming-data.js');
const {reportedSessionEvents}=await import('../gaming-live.js');
const {derivedTrackerRows,derivedTrackerTotal,topTrackerMonth,topTrackerDay,LIFE_TRACKER_IDS,ARCHIVED_GTA_IDS}=await import('../life-trackers.js');
const engine=await import('../engine-v4.js');

const blank=()=>({entries:{},occurrences:[],monthlyReviews:{},yearlyReviews:{},trackerOverrides:{},tideCounters:{},settings:{}});
const source=(title,sourceKey,minutes,platform='ps5')=>({title,sourceKey,minutes,platform,countMinutes:true});
const delta=(name,platform,minutes)=>({[name.toLowerCase()]:{title:name,platformMinutes:{[platform]:minutes}}});

test('one reported session per game per actual positive refresh; retry does not create a new ID',()=>{
  const d=delta('Rocket League','ps5',40),sources=[source('Rocket League','ps5:rocket',440)];
  const first=reportedSessionEvents(d,sources,'2026-11-13T13:00:00Z','2026-11-13');
  const same=reportedSessionEvents(d,sources,'2026-11-13T14:00:00Z','2026-11-13');
  const next=reportedSessionEvents(d,[source('Rocket League','ps5:rocket',500)],'2026-11-13T15:00:00Z','2026-11-13');
  assert.equal(first.length,1);
  assert.equal(first[0].minutes,40);
  assert.equal(first[0].date,'2026-11-13');
  assert.equal(first[0].id,same[0].id,'same cumulative reading must dedupe across refreshes and devices');
  assert.notEqual(first[0].id,next[0].id,'later increase creates a new session report');
  const another=reportedSessionEvents({rocket:{title:'Rocket League',platformMinutes:{ps5:20}},'the crew motorfest':{title:'The Crew Motorfest',platformMinutes:{ps5:15,nintendo:20}}},[
    source('Rocket League','ps5:rocket',520),
    source('The Crew Motorfest','ps5:crew',150),
    source('The Crew Motorfest','nintendo:crew',200,'nintendo')
  ],'2026-11-13T18:00:00Z','2026-11-13');
  assert.equal(another.length,2,'multi-platform increase to one title is one game report');
  assert.equal(another.find(x=>x.gameKey==='the crew motorfest').minutes,35);
});

test('independent gaming saves merge events by unique snapshot ID, preserving old hours',()=>{
  const a={updatedAt:'2026-11-13T14:00:00Z',activity:{'2026-11-13':{games:{rocket:{title:'Rocket League',platformMinutes:{ps5:60}}}}},sessions:[{id:'report-A',date:'2026-11-13',title:'Rocket League',minutes:30}]};
  const b={updatedAt:'2026-11-13T15:00:00Z',activity:{'2026-11-13':{games:{rocket:{title:'Rocket League',platformMinutes:{ps5:60}}}}},sessions:[{id:'report-A',date:'2026-11-13',title:'Rocket League',minutes:30},{id:'report-B',date:'2026-11-13',title:'The Crew Motorfest',minutes:20}]};
  assert.equal(mergeReportedSessions(a.sessions,b.sessions).length,2);
  const both=mergeGaming(a,b);
  assert.equal(both.sessions.length,2);
  assert.equal(both.activity['2026-11-13'].games.rocket.platformMinutes.ps5,60);
});

test('session tracker ignores diary mentions, counts multiple updates on the same day, and scopes totals',()=>{
  const state=blank();state.entries['2026-11-13']={text:'Played The Crew Motorfest, played Rocket League'};
  saveGaming({sessions:[{id:'S1',date:'2026-11-13',title:'Rocket League',minutes:40},{id:'S2',date:'2026-11-13',title:'Rocket League',minutes:25},{id:'S3',date:'2026-10-01',title:'Motorfest',minutes:50}]},{sync:false});
  assert.equal(engine.trackerTotal(state,'gaming-sessions',{month:'2026-11'}),2);
  assert.equal(engine.trackerTotal(state,'gaming-sessions',{year:2026}),3);
  assert.equal(engine.trackerTotal(state,'gaming-sessions'),3);
  assert.equal(derivedTrackerRows(state,'gaming-sessions',{month:'2026-11'}).length,2);
  state.entries['2026-11-14']={text:'I played Adventure Capitalist 10 times'};
  assert.equal(engine.trackerTotal(state,'gaming-sessions',{month:'2026-11'}),2);
  assert.deepEqual(topTrackerMonth(state,'gaming-sessions'),{month:'2026-11',count:2});
});

test('editing counts distinct explicit diary activities and re-evaluates all historical months',()=>{
  const state=blank();
  state.entries['2026-10-06']={text:'Edited a video, exported the video, edited a thumbnail, did not edit another video'};
  state.entries['2026-11-13']={text:'Did an editing session; re-edited the VGC thumbnail; I talked to Carter'};
  state.entries['2026-11-14']={text:'Watched a video, uploaded it, played a game'};
  state.entries['2026-11-15']={text:'Did not edit a video, but edited a clip and edited a second clip'};
  assert.equal(derivedTrackerTotal(state,'editing-events',{month:'2026-10'}),2);
  assert.equal(derivedTrackerTotal(state,'editing-events',{month:'2026-11'}),4);
  assert.equal(engine.trackerTotal(state,'editing-events',{year:2026}),6);
  assert.deepEqual(topTrackerDay(state,'editing-events'),{date:'2026-11-15',count:2});
  state.entries['2026-11-13'].text='Played a game, took a walk';
  assert.equal(engine.trackerTotal(state,'editing-events',{month:'2026-11'}),2,'editing history updates when diary is corrected');
});

test('social days count dates, not the number of conversations on a date',()=>{
  const state=blank();
  state.entries['2026-11-13']={text:'Talked to Carter, FaceTimed Dylan, called my mom'};
  state.entries['2026-11-14']={text:'Did not hang out with friends'};
  state.entries['2026-10-02']={text:'Hung out with friends'};
  assert.equal(engine.trackerTotal(state,'social-days',{month:'2026-11'}),1);
  assert.equal(engine.trackerTotal(state,'social-days',{year:2026}),2);
  assert.equal(engine.trackerTotal(state,'social-days'),2);
  assert.equal(derivedTrackerRows(state,'social-days').length,2);
});

test('exactly five main trackers and three retired GTA records remain available',()=>{
  assert.deepEqual(LIFE_TRACKER_IDS,['gaming-sessions','editing-events','social-days','migraines','hong-kong']);
  assert.deepEqual(ARCHIVED_GTA_IDS,['mors-mutual','google-car','apartment-collisions']);
  const state=blank();
  const defs=engine.allTrackerDefinitions(state);
  for(const id of LIFE_TRACKER_IDS)assert.notEqual(defs.find(x=>x.id===id)?.status,'retired',id);
  for(const id of ARCHIVED_GTA_IDS)assert.equal(defs.find(x=>x.id===id)?.status,'retired',id);
  assert.equal(defs.some(x=>x.id==='collision-count'),false,'duplicate imported collision ID remains hidden');
  assert.throws(()=>engine.addManualOccurrence(state,{trackerId:'gaming-sessions',date:'2026-11-13',count:1}),/automatically/);
  assert.throws(()=>engine.addManualOccurrence(state,{trackerId:'apartment-collisions',date:'2026-11-19',count:1}),/ended on November 19/);
});

test('Hong Kong monthly, yearly and all-time authoritative records never overwrite one another',()=>{
  const state=blank();
  state.tideCounters.authoritativeTrackerTotals={'hong-kong':{allTime:11,years:{2025:6,2026:5},months:{},updatedAt:'2026-11-13'}};
  assert.equal(engine.trackerTotal(state,'hong-kong',{month:'2026-11'}),0);
  assert.equal(engine.trackerTotal(state,'hong-kong',{year:2026}),5);
  assert.equal(engine.trackerTotal(state,'hong-kong'),11);
});

test('post-November-19 diary references do not resurrect retired GTA counters',()=>{
  const state=blank();
  state.occurrences.push({id:'old',trackerId:'mors-mutual',date:'2026-11-18',count:1,source:'manual'});
  engine.saveEntry(state,'2026-11-20','Called Mors Mutual, destroyed the Google car, walked into a wall');
  assert.equal(engine.trackerTotal(state,'mors-mutual',{month:'2026-11'}),1);
  assert.equal(engine.occurrencesFor(state,'google-car',{month:'2026-11'}).length,0);
  assert.equal(engine.occurrencesFor(state,'apartment-collisions',{month:'2026-11'}).length,0);
  assert.equal(engine.occurrencesFor(state,'mors-mutual',{month:'2026-11'}).length,1);
});

test('monthly, yearly, personal records and cloud files use new shared source data',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const backend=readFileSync(new URL('../functions/api/gaming/state.js',import.meta.url),'utf8');
  const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
  for(const marker of ['LIFE_TRACKER_IDS','topTrackerMonth(state,"gaming-sessions")','topTrackerDay(state,"editing-events")','showReadOnlyTracker','tide:gaming-updated'])assert.ok(app.includes(marker),marker);
  assert.ok(backend.includes('sessions=[...sessions.values()]'));
  assert.ok(build.includes("'life-trackers.js'"));
});
