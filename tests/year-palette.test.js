import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=read('insights.css');
const eras=read('themes.css');
const base=read('styles.css');
const marker='/* T.I.D.E. COMPLETE YEAR PALETTE: generated chromatic surface overrides.';
const layer=css.slice(css.indexOf(marker));

test('2024 green, 2025 orange and 2027 gold remain defined with distinct dark surfaces',()=>{
 for(const [year,accent,bg] of [['2024','#75c394','#08120e'],['2025','#f2a05b','#160e0b'],['2027','#efc66b','#090a0c']]){
  const start=eras.indexOf('body[data-tide-era="'+year+'"]{');
  assert.ok(start>=0,'missing '+year+' root');
  const block=eras.slice(start,eras.indexOf('}',start));
  assert.ok(block.includes('--accent:'+accent),'incorrect '+year+' accent');
  assert.ok(block.includes('--bg:'+bg),'incorrect '+year+' background');
 }
 assert.ok(css.includes(marker),'missing full-component chromatic override layer');
});
test('color overrides stay limited to non-2026 base years while honoring holiday themes and dates',()=>{
 assert.match(layer,/body:is\(\[data-tide-era="2024"\],\[data-tide-era="2025"\],\[data-tide-era="2027"\]/);
 assert.match(layer,/:not\(\[data-tide-occasion\]\)/);
 assert.match(layer,/:not\(:has\(:is\(#g-year,#g-month,#otd-date-picker,#health-month,#music-explorer-end\)\[value\^="2026"\]/);
 assert.match(layer,/:has\(\.yrk-row\[data-index="0"\]/);
 for(const year of ['2024','2025','2027']){
  assert.ok(layer.includes('#g-year[value="'+year+'"]'));
  assert.ok(layer.includes('#g-month[value^="'+year+'-"]'));
  assert.ok(layer.includes('#otd-date-picker[value^="'+year+'-"]'));
  assert.ok(layer.includes('[data-year="'+year+'"]'));
  assert.ok(layer.includes('#health-month,#music-explorer-end'));
  assert.ok(layer.includes('#fin-year,#health-year,#music-explorer-year,#music-explorer-month'));
 }
 assert.ok(!layer.includes('body[data-tide-era="2026"]:not([data-tide-occasion])'),'2026 must retain its native GTA palette');
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
 assert.ok(!layer.includes('.vice-city-nov19') ,'year palette overrides must not rewrite GTA special-date editor');
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
