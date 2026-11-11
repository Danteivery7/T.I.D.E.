import test from 'node:test';
import assert from 'node:assert/strict';

const memory=new Map();
globalThis.localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,v)=>memory.set(key,String(v)),
  removeItem:key=>memory.delete(key)
};
const { saveGaming }=await import('../gaming-data.js');
const { answerAsk,askScope }=await import('../ask-intelligence.js');
saveGaming({
  baselineDate:'2026-08-23',
  latestSources:[
    {title:'The Crew Motorfest',sourceKey:'test:crew',platform:'ps5',countMinutes:true,minutes:2460,lastPlayed:'2026-11-09'},
    {title:'Super Mario Odyssey',sourceKey:'test:mario',platform:'nintendo',countMinutes:true,minutes:3800,lastPlayed:'2026-09-05'}
  ],
  activity:{
    '2026-09-05':{games:{
      mario:{title:'Super Mario Odyssey',platformMinutes:{nintendo:630}},
      crew:{title:'The Crew Motorfest',platformMinutes:{ps5:506}}
    }}
  },
  recoveredMonths:{}
},{sync:false});
const state={entries:{
  '2026-09-05':{text:'Played Super Mario Odyssey, played The Crew Motorfest, edited a video'},
  '2026-10-06':{text:'Watched Yankees win, talked to Dylan, went to the library'},
  '2026-11-08':{text:'Bought a game for $40, got a refund'},
  '2026-11-09':{text:'Called Carter, talked with Dylan'},
  '2026-11-10':{text:'FaceTimed Carter, edited another video'}
},monthlyReviews:{},yearlyReviews:{},occurrences:[],trackerOverrides:{},tideCounters:{}};
const context={today:'2026-11-11',selectedDate:'2026-09-05'};

test('dates accept YYYY-MM-DD, ordinary names, relative days, and selected day',()=>{
  assert.equal(askScope('What happened on Sep 5, 2026?',context).date,'2026-09-05');
  assert.equal(askScope('What happened on September 5th, 2026?',context).date,'2026-09-05');
  assert.equal(askScope('What happened on 09/05/2026?',context).date,'2026-09-05');
  assert.equal(askScope('What games did I play on this day?',context).date,'2026-09-05');
  assert.equal(askScope('What happened yesterday?',context).date,'2026-11-10');
  assert.equal(askScope('What happened last month?',context).month,'2026-10');
});
test('date gaming answers list games separately and identify source updates, not exact sessions',()=>{
  const answer=answerAsk(state,'What games did I play on September 5, 2026?',context);
  assert.equal(answer.kind,'game');
  assert.equal(answer.items.length,2);
  assert.ok(answer.items.some(x=>x.label==='Super Mario Odyssey'));
  assert.ok(answer.items.some(x=>x.label==='The Crew Motorfest'));
  assert.match(answer.detail,/delayed reporting|snapshot minutes|not hours actually played/i);
});
test('last played uses gaming source, diary mentions use the diary',()=>{
  const source=answerAsk(state,'When did I last play The Crew Motorfest?',context);
  assert.equal(source.primary,'2026-11-09');
  assert.match(source.source,/Gaming/i);
  const diary=answerAsk(state,'When did I mention playing The Crew Motorfest in my diary?',context);
  assert.match(diary.heading,/Diary mentions/i);
  assert.ok(diary.items.some(item=>item.date==='2026-09-05'));
});
test('life overviews and dated stories use saved diary evidence',()=>{
  const date=answerAsk(state,'What happened on October 6, 2026?',context);
  assert.equal(date.primary,'3 recorded events');
  assert.equal(date.date,'2026-10-06');
  const life=answerAsk(state,'Tell me about my life in October 2026',context);
  assert.equal(life.kind,'life');
  assert.match(life.primary,/1 diary day/);
});
test('money cannot invent balances and diary money requests retain snippets',()=>{
  const balance=answerAsk(state,'What is my current bank balance?',context);
  assert.match(balance.primary,/No verified financial total available/);
  const money=answerAsk(state,'What did I write about money this month?',context);
  assert.equal(money.kind,'money');
  assert.ok(money.items.some(x=>x.date==='2026-11-08'));
});
test('social questions identify named diary mentions',()=>{
  const last=answerAsk(state,'When did I last talk to Carter?',context);
  assert.equal(last.primary,'2026-11-10');
  const names=answerAsk(state,'Who did I talk to the most?',context);
  assert.equal(names.kind,'social');
  assert.ok(names.items.some(x=>x.label==='Dylan'));
});
test('music ranks actual supplied streams rather than guessing',()=>{
  const sample={songs:[{name:'Sample Song',streams:64,rank:1,image:''}],artists:[{name:'Sample Artist',streams:100,rank:1,image:''}],albums:[]};
  const music=answerAsk(state,'What was my top song in 2026?',{...context,musicData:sample});
  assert.equal(music.kind,'music');
  assert.equal(music.primary,'Sample Song');
  assert.match(music.detail,/64 streams/);
});
