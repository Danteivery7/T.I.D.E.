import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {themeForDate} from '../theme-engine.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app.js'),theme=read('theme-engine.js'),css=read('insights.css'),gaming=read('gaming-view.js');

test('2026 uses Vice City across the year while keeping the special launch-card dates',()=>{
  for(const date of ['2026-01-02','2026-03-18','2026-06-15','2026-08-15','2026-11-19','2026-12-30']){
    const result=themeForDate(date);
    assert.equal(result.era,2026,date);
    assert.equal(result.viceCity,true,date);
    assert.equal(result.occasion,'',date);
  }
  assert.equal(themeForDate('2026-08-15').launchWindow,false);
  assert.equal(themeForDate('2026-11-19').launchWindow,true);
  for(const year of ['2024','2025','2027'])assert.equal(themeForDate(year+'-08-15').viceCity,false,year);
  assert.ok(theme.includes("root?.classList.toggle('vice-city-nov19',theme.viceCity&&theme.launchWindow&&!options.period)"));
});

test('period reports ignore holidays but individual diary dates retain them',()=>{
  assert.equal(themeForDate('2025-06-15').occasion,'family','Father’s Day must remain on its own date');
  assert.equal(themeForDate('2025-06-15',[],{period:true}).occasion,'','Year 2025 stays amber');
  assert.equal(themeForDate('2026-12-25').occasion,'christmas');
  assert.equal(themeForDate('2026-12-25',[],{period:true}).viceCity,true);
  assert.equal(themeForDate('2027-01-01',[],{period:true}).occasion,'');
  assert.ok(app.includes("period=!['today','on-this-day'].includes(view)"));
  assert.ok(app.includes('setThemeForDate(root,date,period?[]:personalCalendarEvents(state,date),{period})'));
});

test('On This Day carries its chosen date into and out of past years',()=>{
  assert.ok(app.includes("if(next==='on-this-day'&&view!=='on-this-day')onThisDayDate=contextualDay()"));
  assert.ok(app.includes("if(view==='today')return selectedDate"));
  assert.ok(app.includes("if(view==='calendar'||view==='monthly')return periodDay(selectedMonth)"));
  assert.ok(app.includes("selectedYear=yearOf(onThisDayDate)"));
  assert.ok(app.includes("function openDay(date){onThisDayDate=date;selectedDate=date;selectedMonth=date.slice(0,7);selectedYear=yearOf(date);setView('today')}"));
});

test('Music follows the browsed calendar year, not the current month',()=>{
  assert.ok(app.includes("if(next==='music'&&view!=='music')"));
  assert.ok(app.includes("musicYear=selectedYear;"));
  assert.ok(app.includes("musicPeriod='year';"));
  assert.ok(app.includes("const start=musicYear===2020?first:"));
  assert.ok(app.includes("musicYear}-12-31"));
  assert.ok(app.includes("if(yr)yr.onchange=e=>{musicYear=Number(e.target.value);render()}"));
  assert.ok(app.includes("if(mo)mo.onchange=e=>{musicMonth=e.target.value;render()}"));
  assert.ok(app.includes("No music listening history exists for"));
});

test('Gaming inherits the selected year and reapplies colors after year changes',()=>{
  assert.ok(gaming.includes("setThemeForDate(root,String(activeYear)+'-08-15',[],{period:true})"));
  assert.ok(gaming.includes("document.addEventListener('tide:gaming-context'"));
  assert.ok(gaming.includes("mode='year'"));
  assert.ok(gaming.includes("tide:gaming-period"));
  assert.ok(app.includes("tide:gaming-context"));
  assert.ok(app.includes("document.addEventListener('tide:gaming-period'"));
});

test('Non-2026 stripes use era colors and hero titles do not show gradient rectangles',()=>{
  assert.ok(css.includes('Year-color continuity: visual-only finishing rules'));
  assert.ok(css.includes('--today-panel-accent:var(--accent) !important'));
  assert.ok(css.includes('background:linear-gradient(90deg,var(--accent),var(--accent-2)) !important'));
  assert.ok(css.includes('#view-root .yrk-hero h2 em,'));
  assert.ok(css.includes('#view-root .trk-hero h2 em{'));
  assert.ok(css.includes('background:none !important'));
  assert.ok(css.includes('-webkit-text-fill-color:var(--accent-2)'));
});