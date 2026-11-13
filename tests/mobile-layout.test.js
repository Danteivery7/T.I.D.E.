import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),mobile=read('mobile.css'),app=read('app.js');
const build=read('build.mjs'),sw=read('sw.js');

test('mobile CSS is last; deploy and offline shell include it',()=>{
  assert.ok(html.includes('<link rel="stylesheet" href="mobile.css">'));
  assert.ok(html.indexOf('href="mobile.css"')>html.indexOf('href="insights.css"'));
  assert.ok(build.includes("'mobile.css'"));
  assert.ok(sw.includes("'/mobile.css'"));
  assert.ok(mobile.startsWith('.mobile-dock{display:none;}'));
});
test('mobile dock offers five accessible actions and binds all four destinations',()=>{
  const dock=html.slice(html.indexOf('<nav class="mobile-dock"'),html.indexOf('</nav>',html.indexOf('<nav class="mobile-dock"')));
  assert.equal((dock.match(/<button /g)||[]).length,5);
  for(const view of ['today','calendar','monthly','trackers']){
    assert.ok(dock.includes('data-mobile-view="'+view+'"'),view);
    assert.ok(app.includes("b.dataset.mobileView===view"),'dock selected state');
  }
  assert.ok(dock.includes('data-mobile-more'));
  assert.ok(dock.includes('aria-label="Mobile quick navigation"'));
  assert.ok(app.includes("document.querySelector('#mobile-dock')?.addEventListener('click'"));
  assert.ok(app.includes("if(event.target.closest('[data-mobile-more]'))openSidebar()"));
});
test('responsive shell and panels preserve safe-area, phone landscape and year themes',()=>{
  for(const bp of ['max-width:980px','max-width:640px','max-width:440px','max-width:355px'])assert.ok(mobile.includes(bp),bp);
  assert.ok(mobile.includes('env(safe-area-inset-bottom)'));
  assert.ok(mobile.includes('.sidebar.open'));
  assert.ok(mobile.includes('.sidebar-scrim.show'));
  assert.ok(mobile.includes('grid-template-columns:repeat(7,minmax(0,1fr))'),'calendar must fit 7 days');
  assert.ok(mobile.includes('object-fit:contain'),'landscape artwork must remain fully visible');
  assert.ok(mobile.includes('width:100% !important'),'year award artwork must be fluid');
  assert.ok(mobile.includes('var(--accent)'),'mobile must use the selected year or occasion palette');
  assert.ok(!mobile.includes('body[data-tide-era="2024"]{'),'mobile should not redefine theme source');
  assert.ok(mobile.includes('prefers-reduced-motion:reduce'));
});
test('key mobile pages have dedicated layouts rather than desktop grid overflow',()=>{
 for(const key of [
   '.hero-day','.today-dashboard','.tide-cal-grid','.tide-otd-hero',
   '.month-pick-grid','.year-awards-grid','.trk-ledger-list',
   '.yrk-podium','.music-explorer-winner-layout','.record-music-winners',
   '.insight-stat-grid','.insight-two-col','.health-metric-grid',
   '.ask-explorer-form-row','.settings-section','.modal'
 ])assert.ok(mobile.includes(key),'missing mobile treatment '+key);
});
test('mobile navigation never removes diary or settings functionality',()=>{
  assert.ok(app.includes("document.querySelector('#mobile-menu').onclick=openSidebar"));
  assert.ok(app.includes("document.querySelector('#mobile-close').onclick=closeSidebar"));
  assert.ok(app.includes("if(event.key==='Escape'&&sidebar.classList.contains('open'))"));
  assert.ok(app.includes("id=\"save-day\""));
  assert.ok(app.includes("id=\"finance-import-file\""));
  assert.ok(app.includes("id=\"health-import-file\""));
});
test('mobile styles are structurally balanced',()=>{
  let comment=false,quote='',escape=false,brace=0,paren=0;
  for(let i=0;i<mobile.length;i++){
    const ch=mobile[i],next=mobile[i+1];
    if(comment){if(ch==='*'&&next==='/'){comment=false;i++}continue;}
    if(quote){if(ch==='\\'&&!escape){escape=true;continue;}if(ch===quote&&!escape)quote='';escape=false;continue;}
    if(ch==='/'&&next==='*'){comment=true;i++;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='{')brace++;if(ch==='}')brace--;
    if(ch==='(')paren++;if(ch===')')paren--;
    assert.ok(brace>=0&&paren>=0,'unexpected closing delimiter at '+i);
  }
  assert.equal(quote,'');assert.equal(comment,false);
  assert.equal(brace,0);assert.equal(paren,0);
});