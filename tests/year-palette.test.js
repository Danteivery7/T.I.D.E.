import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=read('insights.css');
const eras=read('themes.css');
const base=read('styles.css');
const marker='/* T.I.D.E. COMPLETE YEAR PALETTE: year-scoped chromatic surface overrides.';
const layer=css.slice(css.indexOf(marker));

test('2024 forest, 2025 amber and 2027 midnight royal remain separate palettes',()=>{
 for(const [year,accent,bg] of [['2024','#75c394','#08120e'],['2025','#f2a05b','#160e0b'],['2027','#e7c57a','#070a12']]){
  const start=eras.indexOf('body[data-tide-era="'+year+'"]{');
  assert.ok(start>=0,'missing '+year+' root');
  const block=eras.slice(start,eras.indexOf('}',start));
  assert.ok(block.includes('--accent:'+accent),'incorrect '+year+' accent');
  assert.ok(block.includes('--bg:'+bg),'incorrect '+year+' background');
 }
 assert.ok(css.includes(marker),'missing full-component chromatic override layer');
 const theme2027=eras.split('body[data-tide-era="2027"]{')[1].split('}')[0];
 assert.ok(theme2027.includes('--accent-2:#4e7bff'),'2027 secondary accent is royal blue');
 assert.ok(theme2027.includes('--good:#49c97b'),'2027 positive state is money green');
});
test('color overrides stay limited to non-2026 base years while honoring holiday themes and dates',()=>{
 assert.match(layer,/body:is\(\[data-tide-era="2024"\],\[data-tide-era="2025"\],\[data-tide-era="2027"\]/);
 assert.match(layer,/:not\(\[data-tide-occasion\]\)/);
 assert.match(layer,/:not\(\.vice-city-season\)/);
 assert.ok(!layer.includes(':has(:is(#g-year'),'Year palette must come from theme-engine, not hidden input values');
 assert.ok(!layer.includes(':has(.yrk-row'),'Year palette must not guess from ranking rows');
 for(const year of ['2024','2025','2027']){
  assert.ok(layer.includes('[data-tide-era="'+year+'"]'),'missing '+year+' scope');
 }
 assert.ok(!layer.includes('option[value^="2026"]'),'old selected-option heuristic can suppress historic themes');
 assert.ok(!layer.includes('body[data-tide-era="2026"]:not([data-tide-occasion]){--bg:'),'2026 background must remain controlled by its original theme');
});
test('every major explorer has palette-specific text, gradients, borders and component-color rules',()=>{
 const parts=[
  '.today-home-overview-eyebrow','.today-dashboard','.today-month-pick--best','.today-record-tile',
  '.month-review-hero','.month-pick-card','.year-award','.year-awards-intro',
  '.yrk-hero','.yrk-podium-card','.yrk-row',
  '.tide-calendar-stage','.tide-cal-day','.tide-cal-hero',
  '.tide-otd-stage','.tide-otd-hero','.tide-otd-memory',
  '.trk-hero','.trk-page','.record-hall-hero','.record-hall-card',
  '.ask-explorer','.insight-hub','.insight-hero','.health-sleep-highlight',
  '.tide-calendar-birthday','.tide-favorite-row','.tide-cal-rank-star',
  '.select','.editor','.chip.accent'
 ];
 for(const part of parts)assert.ok(layer.includes(part),'missing year-color override for '+part);
 assert.match(layer,/\.year-award-vector svg\{filter:var\(--era-vector-filter/);
 assert.ok(layer.includes('--c-primary:var(--accent)'),'calendar month colors must use annual palette');
 assert.ok(layer.includes('--yrk-rose:var(--accent)'),'year rankings accents must use annual palette');
 assert.ok(layer.includes('--ask-pink:var(--accent)'),'Ask UI accents must use annual palette');
});
test('original component styling and 2026 GTA visual behavior are retained',()=>{
 for(const selector of ['#view-root.vice-city-nov19','.year-awards-intro','.tide-calendar-stage.theme-01','.yrk-hero','.trk-hero','.ask-explorer'])
  assert.ok(base.includes(selector),'original component missing '+selector);
 assert.ok(eras.includes('body[data-tide-occasion]'),'holiday themes must still work');
 assert.ok(!layer.includes('#view-root.vice-city-nov19 .hero-day'),'year palette must not modify the 2026 launch diary card');
});
test('CSS comments, strings, parentheses and braces are structurally balanced',()=>{
 let quote='',esc=false,comment=false,braces=0,paren=0;
 for(let i=0;i<css.length;i++){
  const c=css[i],next=css[i+1];
  if(comment){if(c==='*'&&next==='/'){comment=false;i++}continue}
  if(quote){if(c==='\\'&&!esc){esc=true;continue}if(c===quote&&!esc)quote='';esc=false;continue}
  if(c==='/'&&next==='*'){comment=true;i++;continue}
  if(c==='"'||c==="'"){quote=c;continue}
  if(c==='{')braces++;else if(c==='}')braces--;
  if(c==='(')paren++;else if(c===')')paren--;
  assert.ok(braces>=0,'premature closing brace near byte '+i);
  assert.ok(paren>=0,'premature closing parenthesis near byte '+i);
 }
 assert.equal(quote,'','unterminated string');
 assert.equal(comment,false,'unterminated comment');
 assert.equal(braces,0,'unbalanced braces');
 assert.equal(paren,0,'unbalanced parentheses');
});
