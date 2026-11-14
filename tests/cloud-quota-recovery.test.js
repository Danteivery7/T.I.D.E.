import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeCloudState,decodeCloudState,isCompressedCloudState} from '../functions/_lib/state-codec.js';
import {readCloud,mergeAndWrite} from '../functions/_lib/state.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const minimal=()=>({version:1,entries:{'2026-11-14':{text:"Today's diary",updatedAt:'2026-11-14T12:00:00Z'}},
 occurrences:[],monthlyReviews:{},yearlyReviews:{},healthActivity:{days:{}},
 finances:{accounts:{},transactions:{},recurring:{},manualEvents:{}}});

test('small preexisting plain JSON records stay readable without migrating or deleting data',async()=>{
 const state=minimal(),old=JSON.stringify(state);
 assert.equal(await encodeCloudState(state),old);
 assert.equal(isCompressedCloudState(old),false);
 assert.deepEqual(await decodeCloudState(old),state);
});

test('multi-megabyte diary, 3,200 Health days and financial records fit in compressed D1 row',async()=>{
 const state=minimal();
 for(let year=2018;year<=2026;year++)for(let day=1;day<=360;day++){
  const date=new Date(Date.UTC(year,0,day)).toISOString().slice(0,10);
  state.healthActivity.days[date]={date,steps:5500+day,sleepHours:7.2,distanceMiles:3.12,exerciseMinutes:35,
   source:'Apple Watch',updatedAt:'2026-11-14T12:10:00Z'};
 }
 for(let day=1;day<=1550;day++){
  const date=new Date(Date.UTC(2021,0,day)).toISOString().slice(0,10);
  state.entries[date]={text:'Recorded an ordinary day and edited some footage, exercised, walked the same route. '.repeat(9),
   updatedAt:'2026-11-14T12:10:00Z'};
 }
 for(let i=0;i<790;i++){
  state.finances.transactions['test-'+i]={id:'test-'+i,date:'2025-04-01',amount:i*1.25,
   merchant:'Illustrative Transaction '+i,category:'Transport',accountId:'test'};
 }
 const raw=JSON.stringify(state);
 assert.ok(new TextEncoder().encode(raw).length>2_000_000,'original single D1 row would violate its 2 MB cap');
 const encoded=await encodeCloudState(state);
 assert.equal(isCompressedCloudState(encoded),true);
 assert.ok(new TextEncoder().encode(encoded).length<1_850_000,'gzip saves substantial storage');
 const restored=await decodeCloudState(encoded);
 assert.deepEqual(restored,state,'all original diary, medical, finance and occurrence fields must survive round trip');
});

test('D1 merge transparently migrates a legacy snapshot on a large write and preserves remote edits',async()=>{
 const remote=minimal();
 remote.entries['2026-10-25']={text:'Past day remains untouched',updatedAt:'2026-10-25T12:00:00Z'};
 let stored=JSON.stringify(remote),version=4;
 const db={prepare(sql){
  const query={params:[],bind(...args){this.params=args;return this;},
   async first(){
    if(sql.includes('SELECT version, json'))return{version,json:stored};
    return null;
   },
   async run(){
    if(sql.includes('UPDATE tide_state SET')){
      if(this.params[3]!==version)return{meta:{changes:0}};
      stored=this.params[0];version++;return{meta:{changes:1}};
    }
    return{meta:{changes:0}};
   }};return query;
 }};
 const env={TIDE_DB:db};
 const incoming=minimal();
 incoming.entries['2026-11-14'].text='Updated diary entry';
 // Force compressed storage without touching real user data.
 for(let i=0;i<700;i++){
  incoming.healthActivity.days['2024-'+String((i%12)+1).padStart(2,'0')+'-'+String((i%28)+1).padStart(2,'0')]={
   steps:8000+i,notes:'Daily health sample '+String(i).repeat(65)};
 }
 const result=await mergeAndWrite(env,incoming);
 assert.equal(result.etag,'5');
 assert.equal(version,5);
 assert.equal(result.state.entries['2026-11-14'].text,'Updated diary entry');
 assert.equal(result.state.entries['2026-10-25'].text,'Past day remains untouched');
 const latest=await readCloud(env);
 assert.equal(latest.state.entries['2026-10-25'].text,'Past day remains untouched');
 assert.equal(latest.state.entries['2026-11-14'].text,'Updated diary entry');
 assert.ok(Object.keys(latest.state.healthActivity.days).length>100);
});

test('browser sync queue stores only a pointer instead of another full local health/finance history',()=>{
 const src=read('storage.js');
 assert.ok(src.includes("stateRef:'local'"));
 assert.ok(src.includes("latest=localStorage.getItem(LOCAL_KEY)"));
 assert.ok(src.includes('function compactLegacyOutbox()'),'preserve and migrate pending old-format saves');
 assert.ok(src.includes('const merged=mergeStates(readLocalRaw(),pending)'),'merge before compacting');
 assert.ok(src.includes("if(current?.id===id)rawRemove(OUTBOX_KEY)"),'old writes cannot clear later pending edits');
 assert.ok(src.includes("pending?.stateRef==='local'?local"),'no redundant self-merge');
 assert.ok(!src.includes('queuedAt:new Date().toISOString(),state:migrate(state)'),'new pending queue must not duplicate the entire state');
});
