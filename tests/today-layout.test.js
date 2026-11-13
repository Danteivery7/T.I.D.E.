import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const dictation=readFileSync(new URL('../voice-dictation.js',import.meta.url),'utf8');
const saving=readFileSync(new URL('../shared-save.js',import.meta.url),'utf8');
const enhancements=readFileSync(new URL('../enhancements.js',import.meta.url),'utf8');
function fingerprint(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return(h>>>0).toString(16).padStart(8,'0');
}
function diaryCard(){
  const start=source.indexOf('      <section class="card day-card">');
  assert.ok(start>=0,'original day card is still present');
  const end=source.indexOf('      </section>',start);
  assert.ok(end>start,'original day card closes');
  return source.slice(start,end+'      </section>'.length);
}
const criticalHandlers=()=>source.split('\n').filter(line=>/root\.querySelector\('#(save-day|prev-day|next-day)'\)\.onclick=|editor\.addEventListener\('input'/.test(line)).join('\n');

test('the complete diary card remains exactly unchanged from the pre-redesign version',()=>{
  assert.equal(fingerprint(diaryCard()),'b633b330');
  const text=diaryCard();
  for(const part of ['day-nav-center','dateLabel(date)','id="prev-day"','id="next-day"','id="day-editor"','id="editor-meta"','id="save-day"','id="versions"','id="detected-list"'])assert.ok(text.includes(part),part);
});

test('the date arrows, autosaved draft, and Save Day handlers have not been edited',()=>{
  assert.equal(fingerprint(criticalHandlers()),'385cbcdc');
  assert.match(source,/root\.querySelector\('#save-day'\)\.onclick=\(\)=>saveCurrentDay\(date,editor\.value\)/);
  assert.match(source,/saveEntry\(state,date,text\);persist\(\);clearDraft\(date\)/);
});

test('dictation, cloud saving and GeoGuessr controls keep their original hooks',()=>{
  assert.ok(dictation.includes("editor.closest('.day-card')?.querySelector('.editor-actions .chip-row')"));
  assert.ok(dictation.includes("actions.insertBefore(button,save||null)"));
  assert.ok(saving.includes("event.target.closest('#save-day')"));
  assert.ok(saving.includes("root?.querySelector('#day-editor')"));
  assert.ok(enhancements.includes("(root.querySelector('.right-stack')||root).prepend(x)"));
  assert.ok(source.includes('class="right-stack today-dashboard"'));
});

test('the clean supporting-card layout is separate from the full-width diary editor',()=>{
  assert.ok(source.includes('class="hero-day today-home"'));
  assert.ok(source.includes('class="today-home-overview"'));
  for(const marker of ['today-month-panel','today-records-panel','today-otd-panel','today-month-pick--best','today-month-pick--worst','today-record-tile--dc','today-record-tile--geo'])assert.ok(source.includes(marker),marker);
  for(const marker of ['.today-home>.day-card','.today-dashboard>.today-month-panel{order:1}', '.today-dashboard>.today-records-panel{order:2}', '.today-dashboard>#geo-controls{order:3}', '.today-dashboard>.today-otd-panel{order:4}'])assert.ok(styles.includes(marker),marker);
});

test('special November 19 through December 31 styling and navigation remain in place',()=>{
  const theme=readFileSync(new URL('../theme-engine.js',import.meta.url),'utf8');
  assert.ok(theme.includes("d>='2026-11-19'&&d<='2026-12-31'"));
  assert.ok(source.includes('setThemeForDate(root,presentationDate(),personalCalendarEvents(state,presentationDate()))'));
  assert.ok(styles.includes('#view-root.vice-city-nov19 .hero-day .day-card'));
  assert.ok(styles.includes('#view-root.vice-city-nov19 .hero-day .right-stack>.card:nth-child(1)'));
  assert.ok(styles.includes('#view-root.vice-city-nov19 .hero-day .right-stack>.card:nth-child(2)'));
  assert.ok(styles.includes('#view-root.vice-city-nov19 .hero-day .right-stack>.card:nth-child(3)'));
  assert.ok(styles.includes('#view-root:not(.vice-city-nov19) .today-dashboard>.today-month-panel'));
  assert.ok(styles.includes('#view-root:not(.vice-city-nov19) .today-dashboard>.today-records-panel'));
});
