import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('quick navigation retains the original IDs and JavaScript actions',()=>{
  for(const id of ['mobile-menu','view-eyebrow','quick-ask','jump-today']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.ok(app.includes("document.querySelector('#quick-ask').onclick=()=>setView('ask')"));
  assert.ok(app.includes("document.querySelector('#jump-today').onclick=()=>{selectedDate=isoToday()"));
  assert.ok(app.includes("document.querySelector('#mobile-menu').onclick=openSidebar"));
});

test('top bar has accessible quick navigation and scalable icon artwork',()=>{
  assert.match(html,/<header class="topbar tide-topbar">/);
  assert.match(html,/<nav class="topbar-right tide-topbar-actions" aria-label="Quick navigation">/);
  assert.match(html,/<button id="quick-ask"[^>]+aria-label="Open Ask T\.I\.D\.E\."/);
  assert.match(html,/<button id="jump-today"[^>]+aria-label="Go to today"/);
  assert.match(html,/<button id="mobile-menu"[^>]+aria-label="Open menu"/);
  assert.equal((html.match(/<svg aria-hidden="true"/g)||[]).length,3);
  assert.ok(html.includes('class="tide-topbar-label-short"'));
});

test('desktop and phone styles keep both Ask and Today visible',()=>{
  assert.ok(css.includes('.tide-topbar .tide-topbar-action{'));
  assert.ok(css.includes('.tide-topbar .tide-topbar-actions #jump-today{display:inline-flex}'));
  assert.ok(!css.includes('.topbar-right #jump-today{display:none}'));
  assert.ok(css.includes('@media(max-width:530px)'));
  assert.ok(css.includes('@media(max-width:355px)'));
  assert.ok(css.includes('env(safe-area-inset-left)'));
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
});

test('November 19 Vice City styling reuses existing theme state',()=>{
  assert.ok(app.includes("selectedDate>='2026-11-19'&&selectedDate<='2026-12-31'"));
  assert.ok(app.includes("document.body.classList.toggle('vice-city-season',viceCityActive)"));
  for(const marker of ['body.vice-city-season .tide-topbar{','body.vice-city-season .tide-topbar .tide-topbar-ask{','body.vice-city-season .tide-topbar .tide-topbar-today{','body.vice-city-season .tide-topbar .tide-topbar-menu{'])assert.ok(css.includes(marker),marker);
  assert.ok(!css.includes('body.vice-city-season body:has('));
  const version=Number(sw.match(/const CACHE='tide-shell-v(\\d+)'/)?.[1]);
  assert.ok(Number.isInteger(version)&&version>=38,'Offline cache should retain or advance the topbar version');
});

test('top bar change does not replace the app bootstrap or diary editor',()=>{
  for(const name of ['app.js','voice-dictation.js','year-rankings.js','shared-save.js'])assert.ok(html.includes("import('./"+name+"')"));
  assert.ok(app.includes('id="day-editor"'));
  assert.ok(app.includes('id="save-day"'));
  assert.ok(html.includes('<div id="view-root" class="view-root"'));
});
