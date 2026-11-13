import test from 'node:test';
import assert from 'node:assert/strict';

const store=new Map();
globalThis.localStorage={
  getItem:k=>store.get(k)||null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};
const {gamingSessionsFromEntry,diaryGamingSessions}=await import('../gaming-diary-sessions.js');
const {derivedTrackerTotal,topTrackerDay}=await import('../life-trackers.js');

const day='2026-11-13';
const sessions=text=>gamingSessionsFromEntry(day,text);

test('continued playing never creates an additional session even during other work',()=>{
  const rows=sessions('Played Adventure Capitalist, continued playing Adventure Capitalist while working, continued playing it, played while continuing to work');
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,'AdVenture Capitalist');
  assert.equal(sessions('Continued playing Adventure Capitalist').length,0);
  assert.equal(sessions('Kept playing GTA, still playing GTA').length,0);
});
test('repeated starts of the same game on one day count separately',()=>{
  const rows=sessions('Played The Crew, ate lunch, played The Crew again, continued playing The Crew, played The Crew later');
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(x=>x.title),['The Crew Motorfest','The Crew Motorfest','The Crew Motorfest']);
  assert.equal(new Set(rows.map(x=>x.id)).size,3);
  assert.equal(sessions('Played GTA, played again').length,2,'an explicit repeat inherits last known game');
  assert.equal(sessions('Played GTA, played GTA').length,2);
});
test('multiple distinct games on the same date each count a session',()=>{
  const rows=sessions('Played GeoGuessr, played The Crew Motorfest and Rocket League, played GTA Online, played The Crew 2');
  assert.equal(rows.length,5);
  assert.deepEqual(rows.map(x=>x.title),['GeoGuessr','The Crew Motorfest','Rocket League','Grand Theft Auto V','The Crew 2']);
});
test('one uninterrupted game is not double counted by a running "playing" description',()=>{
  assert.equal(sessions('Was playing Roblox while working; still playing Roblox; played Roblox again').length,2);
  assert.equal(sessions('Playing Roblox, playing Roblox while I work').length,1);
  assert.equal(sessions('Played GTA for 3 hours, continued to play GTA').length,1);
});
test('negations, watched games, friends playing and non-video-game activities do not count',()=>{
  assert.equal(sessions("I didn't play GTA, watched my friend play Roblox, my brother played Rocket League").length,0);
  assert.equal(sessions('Played basketball, played the guitar, played with my friends, played soccer').length,0);
  assert.equal(sessions("Wasn't playing The Crew; I played GeoGuessr instead").length,1);
});
test('unconnected/unsupported games can be identified from the diary',()=>{
  assert.equal(sessions('Played a game called Space Bakery').length,1);
  assert.equal(sessions('Played a game called Space Bakery')[0].title,'Space Bakery');
  assert.equal(sessions('Played "Original Indie Adventure"')[0].title,'Original Indie Adventure');
  assert.equal(sessions('Played Adventure Capitalist')[0].gameKey,'adventure capitalist');
});
test('sessions from all years are independently scoped and backfilled from diary',()=>{
  const state={entries:{
    '2024-01-02':{text:'Played GeoGuessr'},
    '2025-04-05':{text:'Played The Crew, played The Crew again'},
    '2026-11-12':{text:'Played Adventure Capitalist, continued playing Adventure Capitalist'},
    '2026-11-13':{text:'Played GTA, played Rocket League'}
  }};
  assert.equal(derivedTrackerTotal(state,'gaming-sessions',{year:2024}),1);
  assert.equal(derivedTrackerTotal(state,'gaming-sessions',{year:2025}),2);
  assert.equal(derivedTrackerTotal(state,'gaming-sessions',{year:2026}),3);
  assert.equal(diaryGamingSessions(state).length,6);
  assert.deepEqual(topTrackerDay(state,'gaming-sessions'),{date:'2026-11-13',count:2});
  state.entries['2025-04-05'].text='Continued playing The Crew';
  assert.equal(derivedTrackerTotal(state,'gaming-sessions',{year:2025}),0);
  assert.equal(derivedTrackerTotal(state,'gaming-sessions'),4);
});
test('gameplay reports cannot fabricate diary sessions',async()=>{
 const {saveGaming}=await import('../gaming-data.js');
 saveGaming({sessions:[{id:'old-snapshot',date:day,title:'GTA V',minutes:100}]},{sync:false});
 assert.equal(derivedTrackerTotal({entries:{}},'gaming-sessions'),0);
});
test('existing Gaming and tracker views keep separated counts and playtime',async()=>{
 const fs=await import('node:fs');
 const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
 assert.ok(read('app.js').includes('Dated diary play starts'));
 assert.ok(read('gaming-view.js').includes('GAMING SESSIONS · YEAR BY YEAR'));
 assert.ok(read('gaming-live.js').includes('They must not'));
 assert.ok(read('sw.js').includes('gaming-diary-sessions.js'));
 assert.ok(read('build.mjs').includes('gaming-diary-sessions.js'));
});
