import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const store=new Map();
globalThis.localStorage={
 getItem:k=>store.get(k)||null,
 setItem:(k,v)=>store.set(k,String(v)),
 removeItem:k=>store.delete(k)
};

const {keyTitle,displayTitle,saveGaming,aggregateAllTime,activityRange}=await import('../gaming-data.js');
const {gamingSessionsFromEntry,diaryGamingSessions}=await import('../gaming-diary-sessions.js');
const {derivedTrackerRows,derivedTrackerTotal}=await import('../life-trackers.js');
const {answerAsk}=await import('../ask-intelligence.js');
const {askTide}=await import('../engine-v4.js');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

const state={entries:{
 '2024-09-10':{text:'Played RDR2, continued playing RDR2'},
 '2025-06-20':{text:'Played Red Dead Redemption 2, played RDR 2 again'},
 '2026-11-15':{text:'Played RDR2, played GTA V, later played rdr2 again'},
 '2026-11-16':{text:'Watched RDR2 gameplay videos, did not play RDR2'},
},occurrences:[],monthlyReviews:{},yearlyReviews:{},trackerOverrides:{},tideCounters:{},settings:{}};

test('RDR2, RDR 2, Red Dead 2, and the full name all have one canonical gaming identity',()=>{
 for(const alias of ['RDR2','rdr2','RDR 2','Red Dead 2','Red Dead Redemption 2','Red Dead Redemption II']){
  assert.equal(keyTitle(alias),'red dead redemption 2',alias);
  assert.equal(displayTitle(alias),'Red Dead Redemption 2',alias);
 }
 assert.notEqual(keyTitle('Red Dead Redemption'),keyTitle('RDR2'));
 assert.notEqual(keyTitle('RDR3'),keyTitle('RDR2'));
});

test('diary sessions recognize RDR2 in historical years and avoid counting continued play',()=>{
 const one=gamingSessionsFromEntry('2024-09-10',state.entries['2024-09-10'].text);
 assert.equal(one.length,1);
 assert.equal(one[0].title,'Red Dead Redemption 2');
 assert.equal(one[0].gameKey,'red dead redemption 2');
 const second=gamingSessionsFromEntry('2025-06-20',state.entries['2025-06-20'].text);
 assert.equal(second.length,2);
 assert.ok(second.every(row=>row.gameKey==='red dead redemption 2'));
 const later=gamingSessionsFromEntry('2026-11-15',state.entries['2026-11-15'].text);
 assert.equal(later.filter(row=>row.gameKey==='red dead redemption 2').length,2);
 assert.equal(later.filter(row=>row.title==='Grand Theft Auto V').length,1);
 assert.equal(gamingSessionsFromEntry('2026-11-16',state.entries['2026-11-16'].text).length,0);
});

test('yearly and all-time session counts include RDR2 abbreviations and full-name starts once each',()=>{
 const rdr=scope=>diaryGamingSessions(state,scope).filter(row=>row.gameKey==='red dead redemption 2');
 assert.equal(rdr({year:2024}).length,1);
 assert.equal(rdr({year:2025}).length,2);
 assert.equal(rdr({year:2026}).length,2);
 assert.equal(rdr({month:'2026-11'}).length,2);
 assert.equal(rdr().length,5);
 assert.equal(derivedTrackerTotal(state,'gaming-sessions',{year:2026}),3,'other games are still counted');
 assert.equal(derivedTrackerRows(state,'gaming-sessions').filter(row=>row.gameKey==='red dead redemption 2').length,5);
});

test('Ask T.I.D.E. understands RDR2 mentions, session totals and first/last dates by year',()=>{
 const context={today:'2026-11-16',selectedDate:'2026-11-16'};
 const queries=[
  ['How many RDR2 sessions all time?','5 sessions'],
  ['How many times have I played RDR2?','5 sessions'],
  ['How many RDR2 sessions in 2024?','1 session'],
  ['How many RDR2 sessions in 2025?','2 sessions'],
  ['How many times did I play RDR2 in 2026?','2 sessions'],
  ['How many sessions for Red Dead Redemption 2 in November 2026?','2 sessions'],
  ['When did I first play RDR2?','2024-09-10'],
  ['When did I last play RDR2?','2026-11-15']
 ];
 for(const [query,expected] of queries){
  const result=answerAsk(state,query,context);
  assert.equal(result.kind,'game',query);
  assert.equal(result.primary,expected,query);
 }
 const diary=answerAsk(state,'When did I mention playing RDR2 in my diary?',context);
 assert.match(diary.heading,/Diary mentions/);
 assert.ok(diary.items.some(x=>x.date==='2024-09-10'));
 assert.ok(diary.items.some(x=>x.date==='2025-06-20'));
 const general=askTide(state,'How many gaming sessions in 2026?');
 assert.equal(general.primary,'3');
});

test('account playtime grouped under RDR2 and Red Dead Redemption 2 does not split into different games',()=>{
 saveGaming({baselineDate:'2026-08-23',
  latestSources:[
   {sourceKey:'ps5:rdr',title:'RDR2',platform:'ps5',minutes:320,countMinutes:true,lastPlayed:'2026-11-15'},
   {sourceKey:'pc:rdr',title:'Red Dead Redemption 2',platform:'steam',minutes:90,countMinutes:true,lastPlayed:'2026-11-14'}
  ],
  activity:{
   '2026-11-15':{games:{
    one:{title:'RDR2',platformMinutes:{ps5:36}},
    two:{title:'Red Dead Redemption 2',platformMinutes:{steam:18}}
   }}
  }
 },{sync:false});
 const items=aggregateAllTime('all').filter(row=>row.key==='red dead redemption 2');
 assert.equal(items.length,1);
 assert.equal(items[0].minutes,410);
 assert.equal(items[0].title,'Red Dead Redemption 2');
 const dated=activityRange('2026-11-15','2026-11-15');
 const item=dated.games.find(row=>row.key==='red dead redemption 2');
 assert.equal(item?.minutes,54);
 assert.equal(dated.games.filter(row=>row.key==='red dead redemption 2').length,1);
 const result=answerAsk(state,'How many hours have I played RDR2?',{today:'2026-11-16'});
 assert.equal(result.kind,'game');
 assert.match(result.heading,/Red Dead Redemption 2/);
 assert.equal(result.primary,'6h 50m');
});

test('legacy gaming answer enhancement never overwrites RDR2 answers',()=>{
 const source=read('gaming-ask.js');
 assert.ok(source.includes('rdr\\s*2'));
 assert.ok(source.includes('return null;const l=q.toLowerCase()'));
});
