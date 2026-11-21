import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshState,saveEntry} from '../engine.js';
import {cloudPush,loadLocal} from '../storage.js';
import {mergeAndWrite,readCloud} from '../functions/_lib/state.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ROUTINE='Woke up, got up, got dressed, edited,                         ';
const SAVED_ROUTINE='Woke up, got up, got dressed, edited,';

function fakeD1(){
  let stored=null,version=0;
  return {prepare(sql){
    return {
      args:[],
      bind(...values){this.args=values;return this;},
      async first(){
        return sql.includes('SELECT version, json')&&version?{version,json:stored}:null;
      },
      async run(){
        if(sql.startsWith('CREATE TABLE'))return {meta:{changes:0}};
        if(sql.startsWith('INSERT OR IGNORE')){
          if(version)return {meta:{changes:0}};
          stored=this.args[2];version=1;return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE tide_state')){
          if(version!==this.args[3])return {meta:{changes:0}};
          stored=this.args[0];version++;return {meta:{changes:1}};
        }
        throw new Error('Unexpected query: '+sql);
      },
    };
  }};
}

test('November 28 and dates beyond preserve the exact routine across D1 save and reload',async()=>{
  const env={TIDE_DB:fakeD1()};
  for(const date of ['2026-11-27','2026-11-28','2026-11-29','2026-12-01','2027-01-01']){
    const next=freshState();
    saveEntry(next,date,ROUTINE);
    const written=await mergeAndWrite(env,next);
    assert.ok(Number(written.etag)>0);
    const persisted=await readCloud(env);
    assert.equal(persisted.state.entries[date].text,SAVED_ROUTINE,date);
  }
  const loaded=(await readCloud(env)).state;
  assert.equal(Object.keys(loaded.entries).filter(x=>x>='2026-11-27').length,5);
});

test('Save Day shares the existing durable outbox and reads the actual selected future date',()=>{
  const shared=read('shared-save.js'),app=read('app.js');
  assert.match(shared,/querySelector\('#today-date-jump'\)\?\.value/);
  assert.match(shared,/await flushSharedSync\(\)/);
  assert.doesNotMatch(shared,/cloudPush\(local,null\)/);
  const saveDay=app.match(/function saveCurrentDay\(date,text\)\{[^\n]+/);
  assert.ok(saveDay,'Save Day handler remains registered');
  assert.doesNotMatch(saveDay[0],/cloudPush\(/,'no second full-state POST on Save Day');
});

test('transient Cloudflare 503 retries the queued November 28 entry and confirms it',async()=>{
  const priorFetch=globalThis.fetch,priorStorage=globalThis.localStorage;
  const values=new Map();
  globalThis.localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(String(key),String(value)),
    removeItem:key=>values.delete(key),
  };
  let calls=0;
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,'/api/tide/state');
    assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);
    assert.equal(body.state.entries['2026-11-28'].text,SAVED_ROUTINE);
    calls++;
    if(calls===1)return new Response('temporary gateway failure',{status:503});
    return Response.json({ok:true,etag:'2',state:body.state});
  };
  try{
    const state=freshState();
    saveEntry(state,'2026-11-28',ROUTINE);
    const result=await cloudPush(state);
    assert.equal(result.ok,true);
    assert.equal(calls,2,'one retry succeeds instead of losing the save');
    assert.equal(loadLocal().entries['2026-11-28'].text,SAVED_ROUTINE);
    assert.equal(values.has('tide_shared_outbox_v1'),false,'outbox clears only after server confirmation');
  }finally{
    globalThis.fetch=priorFetch;
    if(priorStorage===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=priorStorage;
  }
});
