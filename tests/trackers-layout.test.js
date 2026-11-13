import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const upgrades=readFileSync(new URL('../tracker-upgrades.js',import.meta.url),'utf8');
const enhancements=readFileSync(new URL('../enhancements.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
function fingerprint(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return(h>>>0).toString(16);
}
test('existing occurrence modal and manual saving were not changed',()=>{
  const actual=section('function showTracker(','\nfunction musicCached(');
  assert.equal(fingerprint(actual),'39e80c18');
  for(const id of ['manual-date','manual-count','manual-note','manual-add'])assert.ok(actual.includes(id),id);
  assert.ok(actual.includes('addManualOccurrence(state,'));
  assert.ok(actual.includes('persist();closeModal();render()'));
});

test('special GeoGuessr record editors and existing quick handlers stay wired',()=>{
  assert.ok(upgrades.includes("section.querySelectorAll('[data-special-edit]').forEach(b=>b.onclick=()=>openShowcaseEditor(b.dataset.specialEdit))"));
  assert.ok(upgrades.includes("section.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>root.querySelector('#'+b.dataset.quick)?.click())"));
  for(const id of ['dc','monty','tenk','hk','collisions'])assert.ok(upgrades.includes("showcaseRow(") && upgrades.includes("'"+id+"'"),id);
  for(const id of ['gc-plus','gc-win','gc-loss','gc-dc-set','gc-reset','gc-ms','gc-as'])assert.ok(enhancements.includes(id),id);
  assert.ok(styles.includes('#view-root:has(#tracker-showcase) > #geo-controls{display:none}'));
});

test('Trackers has a featured area, searchable library and responsive color treatments',()=>{
  for(const marker of ['trk-hero','trk-dashboard-stats','trk-ledger-section','trk-ledger-list','data-trk-filter="in-use"','data-trk-filter="retired"','id="trk-search"','trk-library-empty'])assert.ok(source.includes(marker),marker);
  for(const marker of ['.trk-hero','.trk-dashboard-stats','#tracker-showcase .tracker-spotlight-table','#view-root .trk-ledger-list>.trk-ledger-row','@media(max-width:450px)','body.vice-city-season .trk-hero'])assert.ok(styles.includes(marker),marker);
  assert.ok(sw.includes("tide-shell-v39"));
});

test('view renders from saved definitions, preserves values and existing tracker buttons',()=>{
  const iconSource=section('function trackerViewIcon(','\n\nfunction trackersView(');
  const icon=new Function(iconSource+';return trackerViewIcon')();
  const viewSource=section('function trackersView(','\nfunction showTracker(');
  const defs=[
    {id:'daily-challenge',name:'Daily Challenge',kind:'streak',status:'active'},
    {id:'hong-kong',name:'Hong Kong Spawns',kind:'event',status:'intermittent'},
    {id:'mors-mutual',name:'Mors Mutual Calls',kind:'event',status:'retired'}
  ];
  const clicked=[],opened=[];
  const rows=defs.map(t=>({
    dataset:{trkStatus:t.status,trkName:t.name.toLowerCase()},textContent:t.name.toLowerCase(),
    style:{display:''},classes:new Set(),
    classList:{toggle(_name,_value){}}
  }));
  const tabs=['all','in-use','retired'].map(value=>({
    dataset:{trkFilter:value},selected:false,
    classList:{toggle(_name,value){this.selected=value}},
    setAttribute(){}
  }));
  const buttons=defs.map(t=>({dataset:{tracker:t.id},onclick:null}));
  const empty={hidden:true},search={value:'',listeners:{},addEventListener(name,handler){this.listeners[name]=handler}};
  const root={
    innerHTML:'',
    querySelectorAll(sel){
      if(sel==='[data-tracker]')return buttons;
      if(sel==='[data-trk-filter]')return tabs;
      if(sel==='.trk-ledger-row')return rows;
      return [];
    },
    querySelector(sel){if(sel==='#trk-search')return search;if(sel==='#trk-library-empty')return empty;return null}
  };
  // Reuse the real renderer against a minimal fake DOM; never write to storage.
  const render=new Function('allTrackerDefinitions','trackerTotal','pageHead','monthLabel','fmt','esc','root','showTracker','selectedMonth','selectedYear','trackerViewIcon','state',viewSource+';return trackersView')(
    ()=>defs,(_s,id,scope)=>scope?.month?3:scope?.year?7:42,()=>'<h1>Trackers</h1>',
    ()=> 'November 2026',String,x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
    root,id=>opened.push(id),'2026-11',2026,icon,{},);
  render();
  assert.ok(root.innerHTML.includes('Mors Mutual Calls'));
  assert.ok(root.innerHTML.includes('42'));
  assert.equal((root.innerHTML.match(/data-tracker=/g)||[]).length,3);
  buttons[0].onclick();
  assert.deepEqual(opened,['daily-challenge']);
  // Search and filters manipulate presentation classes, not saved records.
  rows.forEach(row=>row.classList.toggle=(name,hide)=>{if(hide)row.classes.add(name);else row.classes.delete(name)});
  tabs[2].onclick();
  assert.equal(rows.filter(row=>!row.classes.has('trk-is-filtered')).length,1);
  search.value='mors';
  search.listeners.input();
  assert.equal(empty.hidden,true);
  search.value='not found';
  search.listeners.input();
  assert.equal(empty.hidden,false);
  assert.deepEqual(defs.map(t=>t.id),['daily-challenge','hong-kong','mors-mutual']);
});
