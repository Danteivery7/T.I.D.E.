import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const storage=new Map();
globalThis.localStorage={
 getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),
 removeItem:k=>storage.delete(k)
};
const rules=await import('../game-release-rules.js');
const {gamingSessionsFromEntry,diaryGamingSessions}=await import('../gaming-diary-sessions.js');
const {derivedTrackerTotal,derivedTrackerRows}=await import('../life-trackers.js');
const {saveGaming,keyTitle,mergeReportedSessions,activityRange,aggregateAllTime}=await import('../gaming-data.js');
const {reportedSessionEvents}=await import('../gaming-live.js');
const {answerAsk}=await import('../ask-intelligence.js');
const {askTide}=await import('../engine-v4.js');
const state={entries:{
 '2024-04-05':{text:'Watched the GTA VI trailer, played GTA V'},
 '2025-08-01':{text:'Planned to play GTA VI, played GTA 6, played Rocket League'},
 '2026-11-18':{text:'Played GTA VI, played GTA V, played Grand Theft Auto 6, watched a GTA VI video'},
 '2026-11-19':{text:'Played GTA VI, kept playing GTA VI, played GTA 6 again, played GTA V'},
 '2026-11-20':{text:'Played Grand Theft Auto VI'},
 '2027-01-07':{text:'Played GTA 6, played GTA VI again'}
},occurrences:[],monthlyReviews:{},yearlyReviews:{},trackerOverrides:{},tideCounters:{},settings:{}};
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GTA VI is uniquely recognized and its earliest possible play date is November 19, 2026',()=>{
 assert.equal(rules.GTA_VI_FIRST_PLAY_DATE,'2026-11-19');
 for(const name of ['GTA VI','GTA 6','GTA6','GTAVI','Grand Theft Auto VI','Grand Theft Auto 6'])
  assert.equal(rules.isGtaViGame(name),true,name);
 for(const name of ['GTA V','GTA 5','Grand Theft Auto V','The Crew Motorfest'])
  assert.equal(rules.isGtaViGame(name),false,name);
 assert.equal(rules.permitsDatedGamePlay('2026-11-18','GTA VI'),false);
 assert.equal(rules.permitsDatedGamePlay('2026-11-19','GTA VI'),true);
 assert.equal(rules.permitsDatedGamePlay('2027-01-01','GTA 6'),true);
 assert.equal(rules.permitsDatedGamePlay('2026-11-18','GTA V'),true);
});

test('prelaunch diary play references never create GTA VI sessions, while GTA V still counts',()=>{
 for(const date of ['2024-04-05','2025-08-01','2026-11-18']){
  const rows=gamingSessionsFromEntry(date,state.entries[date].text);
  assert.ok(rows.every(row=>!rules.isGtaViGame(row.title)),date);
 }
 assert.deepEqual(gamingSessionsFromEntry('2026-11-18',state.entries['2026-11-18'].text).map(x=>x.title),['Grand Theft Auto V']);
 const day1=gamingSessionsFromEntry('2026-11-19',state.entries['2026-11-19'].text);
 assert.equal(day1.filter(x=>rules.isGtaViGame(x.title)).length,2,'distinct GTA VI play starts count, continued play does not');
 assert.equal(day1.filter(x=>x.title==='Grand Theft Auto V').length,1);
});

test('per-year, month, date and all-time GTA VI sessions exclude every day before November 19',()=>{
 const forGame=scope=>diaryGamingSessions(state,scope).filter(row=>rules.isGtaViGame(row.title));
 assert.equal(forGame({year:2024}).length,0);
 assert.equal(forGame({year:2025}).length,0);
 assert.equal(forGame({month:'2026-10'}).length,0);
 assert.equal(forGame({start:'2026-11-01',end:'2026-11-18'}).length,0);
 assert.equal(forGame({start:'2026-11-19',end:'2026-11-19'}).length,2);
 assert.equal(forGame({month:'2026-11'}).length,3);
 assert.equal(forGame({year:2026}).length,3);
 assert.equal(forGame({year:2027}).length,2);
 assert.equal(forGame().length,5);
 assert.equal(forGame()[0].date,'2026-11-19');
 assert.ok(derivedTrackerRows(state,'gaming-sessions').some(row=>row.title==='Grand Theft Auto V'));
 assert.equal(derivedTrackerTotal(state,'gaming-sessions',{year:2025}),1,'other games remain counted');
});

test('Ask T.I.D.E. answers GTA VI session counts from diary only, for any scope',()=>{
 // Simulate querying after launch, so future-dated fixture sessions are historical.
 const ctxt={today:'2027-01-10',selectedDate:'2027-01-10'};
 const pairs=[
  ['How many GTA VI sessions in 2024?','0 sessions'],
  ['How many GTA VI sessions in 2025?','0 sessions'],
  ['How many times did I play GTA VI in 2026?','3 sessions'],
  ['How many times did I play GTA VI in 2027?','2 sessions'],
  ['How many GTA VI sessions all time?','5 sessions'],
  ['How many times have I played GTA 6?','5 sessions'],
  ['How many GTA VI sessions in November 2026?','3 sessions']
 ];
 for(const [question,want] of pairs){
  const answer=answerAsk(state,question,ctxt);
  assert.equal(answer.kind,'game',question);
  assert.equal(answer.primary,want,question);
  assert.match(answer.detail,/2026-11-19/,question);
 }
 const first=answerAsk(state,'When did I first play GTA VI?',ctxt);
 assert.equal(first.primary,'2026-11-19');
 const last=answerAsk(state,'When did I last play GTA VI?',ctxt);
 assert.equal(last.primary,'2027-01-07');
 const byDate=answerAsk(state,'How many GTA VI sessions on November 18, 2026?',ctxt);
 assert.equal(byDate.primary,'0 sessions');
 const diary=answerAsk(state,'When did I mention playing GTA VI in my diary?',ctxt);
 assert.ok(diary.items.every(x=>x.date>='2026-11-19'));
 assert.ok(diary.items.length>0);
});

test('legacy Ask T.I.D.E. tracker answers cannot mix other games into GTA VI session counts',()=>{
 const before=askTide(state,'How many GTA VI gaming sessions in 2025?');
 assert.equal(before.primary,'0');
 const all=askTide(state,'How many GTA VI gaming sessions all time?');
 assert.equal(all.primary,'5');
 const regular=askTide(state,'How many gaming sessions in 2025?');
 assert.equal(regular.primary,'1','generic gaming sessions still include other games normally');
});

test('gaming snapshots before the launch cannot manufacture GTA VI play sessions or dated playtime',()=>{
 const gameKey=keyTitle('GTA VI');
 const sample={ [gameKey]:{title:'GTA VI',platformMinutes:{ps5:80}} };
 assert.equal(reportedSessionEvents(sample,[],'2026-11-18T20:00:00Z','2026-11-18').length,0);
 assert.equal(reportedSessionEvents(sample,[],'2026-11-19T20:00:00Z','2026-11-19').length,1);
 assert.equal(mergeReportedSessions([{id:'early',date:'2026-11-18',title:'GTA VI',minutes:12}],[{id:'valid',date:'2026-11-19',title:'GTA VI',minutes:12}]).length,1);
 saveGaming({baselineDate:'2026-10-01',
  latestSources:[{sourceKey:'fake-early',title:'GTA VI',platform:'ps5',countMinutes:true,minutes:42,lastPlayed:'2026-11-18'}],
  activity:{
   '2026-11-18':{games:{gta:{title:'GTA VI',platformMinutes:{ps5:42}}}},
   '2026-11-19':{games:{gta:{title:'GTA VI',platformMinutes:{ps5:23}}}}
  },
  recoveredMonths:{'2026-10':{games:{gta:{title:'GTA VI',platformMinutes:{ps5:99}}}}}
 },{sync:false});
 assert.equal(activityRange('2026-01-01','2026-11-18').games.some(x=>rules.isGtaViGame(x.title)),false);
 assert.equal(activityRange('2026-11-19','2026-11-19').games.find(x=>rules.isGtaViGame(x.title))?.minutes,23);
 assert.equal(aggregateAllTime('all').some(x=>rules.isGtaViGame(x.title)),false,'unverified prelaunch lifetime sources excluded');
});

test('new release policy file is available to production and offline and cache is bumped',()=>{
 assert.ok(read('build.mjs').includes("'game-release-rules.js'"));
 assert.ok(read('sw.js').includes("'game-release-rules.js'"));
 assert.ok(read('package.json').includes('node --check game-release-rules.js'));
 assert.ok(read('sw.js').includes('tide-shell-v51'));
 assert.ok(read('gaming-ask.js').includes('if(mentionsGtaVi(q))return null'),'legacy gaming questions cannot override new counts');
});
