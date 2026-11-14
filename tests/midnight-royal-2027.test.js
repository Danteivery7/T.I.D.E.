import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ERA_THEMES,themeForDate} from '../theme-engine.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const css=read('midnight-royal.css');
const eras=read('themes.css');
const html=read('index.html');
const sw=read('sw.js');
const build=read('build.mjs');

test('2027 Midnight Royal Wealth has champagne gold, royal blue, icy blue and money green on cool-black surfaces',()=>{
 assert.equal(ERA_THEMES[2027].name,'Midnight Royal Wealth');
 assert.equal(ERA_THEMES[2027].main,'#e7c57a');
 assert.equal(ERA_THEMES[2027].secondary,'#4e7bff');
 assert.equal(ERA_THEMES[2027].dark,'#070a12');
 const root=eras.split('body[data-tide-era="2027"]{')[1]?.split('}')[0]||'';
 for(const part of ['--bg:#070a12','--panel:#101726','--accent:#e7c57a','--accent-2:#4e7bff','--good:#49c97b','--royal-ice:#8fd6ff','--royal-platinum:#dde5ef'])assert.ok(root.includes(part),part);
 for(const brown of ['--panel:#15140f','--panel-2:#211d12','--line:#5a4828'])assert.ok(!root.includes(brown),'remove old brown 2027 tint: '+brown);
 assert.ok(css.includes('background:radial-gradient')||css.includes('radial-gradient'));
});
test('2024 Forest, 2025 Amber and 2026 Vice City still have their original theme identities',()=>{
 assert.equal(ERA_THEMES[2024].name,'Forest Night');
 assert.equal(ERA_THEMES[2025].name,'Amber Era');
 assert.equal(ERA_THEMES[2026].name,'Vice City');
 assert.equal(ERA_THEMES[2024].main,'#3b976f');
 assert.equal(ERA_THEMES[2025].main,'#ed8e47');
 assert.equal(ERA_THEMES[2026].main,'#ff74c6');
 assert.equal(themeForDate('2026-11-19').viceCity,true);
 assert.equal(themeForDate('2027-02-06').viceCity,false);
 for(const piece of css.split('}').filter(s=>s.includes('{'))){
   const selector=piece.split('{')[0].trim();
   if(selector.startsWith('@keyframes')||selector.startsWith('from')||selector.startsWith('to')||selector.startsWith('@media')||selector.includes('0%')||selector.includes('100%'))continue;
   if(selector.startsWith('body')||selector.startsWith('/*'))assert.ok(selector.includes('data-tide-era="2027"')||selector.startsWith('/*'),'unscoped body rule: '+selector.slice(0,110));
 }
});
test('year awards have nine differentiated 2027 category color accents and readable cards',()=>{
 const tones=['day','month','activity','song','artist','game','steps','sleep','income'];
 const body='body[data-tide-era="2027"]:not([data-tide-occasion]):not(.vice-city-season) .year-award--';
 for(const tone of tones){
   const where=css.indexOf(body+tone+'{');
   assert.ok(where!==-1,'2027 award missing '+tone);
   const block=css.slice(where,css.indexOf('}',where));
   assert.ok(block.includes('--year-bright:'),'separate accent for '+tone);
   assert.ok(block.includes('background:linear-gradient'),'separate panel for '+tone);
 }
 const colors=tones.map(t=>{
   const i=css.indexOf(body+t+'{');
   return css.slice(i,css.indexOf('}',i)).match(/--year-bright:(#[a-f0-9]{6})/)?.[1];
 });
 assert.equal(colors.length,9);
 assert.ok(new Set(colors).size>=8,'award cards need at least eight individually tuned accent colors');
 for(const marker of ['.year-awards-intro','.year-award-vector','.year-personal-pick','.year-award--income','.record-hall-card'])assert.ok(css.includes(marker));
});
test('2027 health, money, music, charts and navigation each use meaningful colored accents',()=>{
 for(const marker of [
  '.nav-item.active','.tide-topbar .tide-topbar-ask','.brand-mark',
  '.music-explorer-hero','.music-explorer-category:nth-child(3)',
  '.insight-hub--finances .insight-line','.insight-hub--health .insight-line',
  '.insight-bar-row:nth-child(3n+3) i','.insight-stat--good',
  '.today-dashboard>.today-finance-panel','.today-dashboard>.today-health-panel--steps',
  '.yrk-row','.trk-dashboard-stat','.tide-otd-date-main','.tide-cal-agenda',
  '.sleep-coach-tile:last-child strong','.diary-signal--money'
 ])assert.ok(css.includes(marker),'missing theme treatment '+marker);
 assert.ok(css.includes('var(--royal-green)'),'money green should appear');
 assert.ok(css.includes('var(--royal-ice)'),'ice-blue should appear');
 assert.ok(css.includes('var(--royal-gold)'),'champagne gold should appear');
 assert.ok(css.includes('var(--royal-blue)'),'royal blue should appear');
});
test('2027 New Year fireworks have champagne/gold/blue/ice bursts and reduced-motion behavior',()=>{
 assert.equal(themeForDate('2027-01-01').occasion,'new-year');
 assert.equal(themeForDate('2027-12-31').occasion,'new-year');
 assert.equal(themeForDate('2026-12-31').era,2026);
 assert.ok(css.includes('body[data-tide-era="2027"][data-tide-occasion="new-year"]'));
 const bursts=css.slice(css.indexOf('body[data-tide-era="2027"][data-tide-occasion="new-year"] .topbar::before'));
 assert.ok(bursts.includes('rgba(231,197,122,.8)'),'champagne sparks');
 assert.ok(bursts.includes('rgba(143,214,255,.62)'),'ice sparks');
 assert.ok(bursts.includes('rgba(78,123,255,.75)'),'royal blue sparks');
 assert.ok(css.includes('royal-newyear-sparkles'));
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
});
test('2027 theme is deployed in desktop, mobile and offline shell',()=>{
 assert.ok(html.includes('<link rel="stylesheet" href="midnight-royal.css">'));
 assert.ok(html.indexOf('href="midnight-royal.css"')>html.indexOf('href="date-jump.css"'),'2027 override loads last');
 assert.ok(build.includes("'midnight-royal.css'"));
 assert.ok(sw.includes("'/midnight-royal.css'"));
 assert.match(sw,/tide-shell-v\d+/);
});
test('2027 theme CSS has balanced braces, parentheses, strings and comments',()=>{
 let quote='',esc=false,comment=false,brace=0,paren=0;
 for(let i=0;i<css.length;i++){
   const ch=css[i],next=css[i+1];
   if(comment){if(ch==='*'&&next==='/'){comment=false;i++;}continue;}
   if(quote){if(ch==='\\'&&!esc){esc=true;continue;}if(ch===quote&&!esc)quote='';esc=false;continue;}
   if(ch==='/'&&next==='*'){comment=true;i++;continue;}
   if(ch==='"'||ch==="'"){quote=ch;continue;}
   if(ch==='{')brace++;if(ch==='}')brace--;
   if(ch==='(')paren++;if(ch===')')paren--;
   assert.ok(brace>=0,'closing brace near '+i);
   assert.ok(paren>=0,'closing parenthesis near '+i);
 }
 assert.equal(brace,0);
 assert.equal(paren,0);
 assert.equal(quote,'');
 assert.equal(comment,false);
});
