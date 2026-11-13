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
  for(const id of ['dc','monty','tenk'])assert.ok(upgrades.includes("showcaseRow(") && upgrades.includes("'"+id+"'"),id);
  for(const id of ['gc-plus','gc-win','gc-loss','gc-dc-set','gc-reset','gc-ms','gc-as'])assert.ok(enhancements.includes(id),id);
  assert.ok(styles.includes('#view-root:has(#tracker-showcase) > #geo-controls{display:none}'));
});

test('Trackers has a featured area, searchable library and responsive color treatments',()=>{
  for(const marker of ['trk-hero','trk-dashboard-stats','trk-ledger-section','trk-ledger-list','data-trk-filter="in-use"','data-trk-filter="retired"','id="trk-search"','trk-library-empty'])assert.ok(source.includes(marker),marker);
  for(const marker of ['.trk-hero','.trk-dashboard-stats','#tracker-showcase .tracker-spotlight-table','#view-root .trk-ledger-list>.trk-ledger-row','@media(max-width:450px)','body.vice-city-season .trk-hero'])assert.ok(styles.includes(marker),marker);
  assert.match(sw,/tide-shell-v4\d/);
});

test('five active life trackers and historical GTA records have separate entry points',()=>{
  const view=section('function trackersView(','\nfunction showTracker(');
  for(const marker of [
    'LIFE_TRACKER_IDS','ARCHIVED_GTA_IDS','AUTO_TRACKER_IDS',
    "data-trk-filter=\"in-use\"","data-trk-filter=\"retired\"",
    'View history', 'showReadOnlyTracker', 'trk-ledger-list','apply();'
  ])assert.ok(view.includes(marker),marker);
  assert.ok(source.includes('function showReadOnlyTracker(id)'));
  assert.ok(source.includes("if(['trackers','monthly','yearly','records'].includes(view))render()"));
});
