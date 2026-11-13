import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {themeForDate,ERA_THEMES} from '../theme-engine.js';
import {KNOWN_BIRTHDAYS,personalCalendarEvents,calendarEventsOnDate,calendarEventsForMonth,writeCalendarEvent,removeCalendarEvent,proposedDiaryHeading,birthdaySuggestions} from '../personal-calendar.js';
import {favoriteDays,saveFavoriteDays,yearsWithFavoriteDays,favoriteDaysSuggestion} from '../favorite-days.js';
import {mergeHealthImport,healthRows,healthPeriod,yearlyHealthOverview,csvHealthRows,readHealthImportFile,formatHealth} from '../health-activity.js';
import {mergeStates as mergeLocal} from '../storage.js';
import {mergeStates as mergeServer} from '../functions/_lib/state.js';

const state=()=>({version:1,entries:{},calendarEvents:{},favoriteDays:{},healthActivity:{days:{}},monthlyReviews:{},yearlyReviews:{},occurrences:[],trackerOverrides:{},settings:{}});
test('each calendar year has its own dark era, with gold and black dominant in 2027',()=>{
  assert.equal(themeForDate('2024-08-11').era,2024);
  assert.equal(themeForDate('2025-08-11').era,2025);
  assert.equal(themeForDate('2026-08-11').era,2026);
  assert.equal(themeForDate('2027-02-11').era,2027);
  assert.match(ERA_THEMES[2027].name,/gold/i);
  assert.equal(ERA_THEMES[2027].dark,'#0c0c0c');
  assert.equal(themeForDate('2026-11-19').viceCity,true);
  assert.equal(themeForDate('2026-12-30').viceCity,true);
  assert.equal(themeForDate('2027-01-02').viceCity,false);
});
test('Thanksgiving, Christmas and New Year override Vice City but return to it afterwards',()=>{
  assert.deepEqual([themeForDate('2026-11-25').viceCity,themeForDate('2026-11-26').occasion,themeForDate('2026-11-27').viceCity],[true,'thanksgiving',true]);
  assert.equal(themeForDate('2026-12-24').occasion,'christmas');
  assert.equal(themeForDate('2026-12-25').occasion,'christmas');
  assert.equal(themeForDate('2026-12-26').viceCity,true);
  assert.equal(themeForDate('2026-12-31').occasion,'new-year');
  assert.equal(themeForDate('2027-01-01').occasion,'new-year');
  assert.equal(themeForDate('2027-01-01').era,2027);
  assert.equal(themeForDate('2027-03-17').occasion,'st-patrick');
});
test('Knicks championship and parade have contextual colors; birthdays stay normal except July 31',()=>{
  const s=state();
  assert.equal(themeForDate('2026-06-13',personalCalendarEvents(s,'2026-06-13')).occasion,'knicks');
  assert.equal(themeForDate('2026-06-18',personalCalendarEvents(s,'2026-06-18')).occasion,'knicks');
  assert.equal(themeForDate('2026-07-31',personalCalendarEvents(s,'2026-07-31')).occasion,'my-birthday');
  assert.equal(themeForDate('2027-07-27',personalCalendarEvents(s,'2027-07-27')).occasion,'');
});
test('known birthdays repeat annually and official holidays remain visible',()=>{
  const s=state();
  assert.equal(KNOWN_BIRTHDAYS.length,10);
  assert.ok(calendarEventsOnDate(s,'2027-04-06').some(e=>e.name.includes('Grandpa Mike')));
  assert.ok(calendarEventsOnDate(s,'2024-01-21').some(e=>e.name.includes('Mom')));
  assert.ok(calendarEventsForMonth(s,'2026-11').some(e=>e.name==='Thanksgiving'));
  assert.ok(calendarEventsForMonth(s,'2026-11').some(e=>e.name.includes('Grand Theft Auto VI')));
});
test('private custom calendar events can repeat, be edited and be tombstoned across devices',()=>{
  const s=state(),evt=writeCalendarEvent(s,{date:'2027-05-12',name:'Crew 4 launch',repeat:'yearly',kind:'release',theme:'gold'});
  assert.ok(personalCalendarEvents(s,'2028-05-12').some(e=>e.id===evt.id));
  writeCalendarEvent(s,{id:evt.id,date:'2027-05-13',name:'New launch date',repeat:'yearly',theme:'none'});
  assert.equal(personalCalendarEvents(s,'2028-05-12').some(e=>e.id===evt.id),false);
  assert.equal(personalCalendarEvents(s,'2028-05-13').some(e=>e.id===evt.id),true);
  assert.ok(removeCalendarEvent(s,evt.id));
  assert.equal(personalCalendarEvents(s,'2028-05-13').some(e=>e.id===evt.id),false);
  assert.ok(mergeServer(state(),s).calendarEvents[evt.id].deleted);
  assert.ok(mergeLocal(state(),s).calendarEvents[evt.id].deleted);
});
test('diary headings are uppercase suggestions, with no implicit Save Day call',()=>{
  const s=state();
  assert.equal(proposedDiaryHeading(s,'2026-11-19'),'GTA VI RELEASE DAY, ');
  assert.equal(proposedDiaryHeading(s,'2026-12-25'),'CHRISTMAS DAY, ');
  assert.equal(proposedDiaryHeading(s,'2026-07-31'),'MY BIRTHDAY, ');
  assert.equal(proposedDiaryHeading(s,'2026-06-13'),'KNICKS NBA CHAMPIONSHIP, ');
  assert.match(proposedDiaryHeading(s,'2027-07-11'),/CARTER'S BIRTHDAY/);
  assert.equal(proposedDiaryHeading(s,'2026-06-16'),'');
  s.entries['2026-08-29']={text:"TIM'S BIRTHDAY, Woke up"};
  assert.ok(birthdaySuggestions(s).some(e=>e.name.includes('TIM')));
});
test('top-five days belong to the user and never fabricate the ordered 2024 or 2025 list',()=>{
  const s=state();
  assert.deepEqual(favoriteDays(s,2024),[]);
  assert.deepEqual(favoriteDays(s,2025),[]);
  assert.deepEqual(saveFavoriteDays(s,2026,['2026-06-13','2026-07-31']),['2026-06-13','2026-07-31']);
  assert.deepEqual(favoriteDays(s,2026),['2026-06-13','2026-07-31']);
  assert.throws(()=>saveFavoriteDays(s,2026,['2026-06-13','2026-06-13']),/same day twice/);
  assert.throws(()=>saveFavoriteDays(s,2026,['2025-08-01']),/same year/);
  assert.ok(yearsWithFavoriteDays(s,2026).includes(2024));
  assert.equal(favoriteDaysSuggestion(s,2026),null);
});
test('Health months compute sleep averages only from recorded nights and use at least seven nights for best month',()=>{
  const s=state(),days=[
    {date:'2026-10-01',sleepHours:6,steps:3000,exerciseMinutes:30,distanceMiles:2},
    {date:'2026-10-02',sleepHours:8,steps:10000,exerciseMinutes:45,distanceMiles:4},
    ...Array.from({length:7},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),sleepHours:9,steps:2000+i*100,exerciseMinutes:20,distanceMiles:1}))
  ];
  assert.equal(mergeHealthImport(s,{days,source:'Apple Health private import'}),9);
  const october=healthPeriod(s,{month:'2026-10'});
  assert.equal(october.metrics.sleepHours.average,7);
  assert.equal(october.metrics.sleepHours.days,2);
  assert.equal(october.metrics.sleepHours.total,14);
  assert.equal(october.metrics.sleepHours.best.date,'2026-10-02');
  assert.equal(october.metrics.sleepHours.bestMonth,null,'Two nights cannot win all-time best sleep month');
  const year=healthPeriod(s,{year:2026});
  assert.equal(year.metrics.sleepHours.average,77/9===8.555?8.55:8.56);
  assert.equal(year.metrics.sleepHours.bestMonth.month,'2026-11');
  assert.equal(year.metrics.sleepHours.bestMonth.average,9);
  assert.equal(year.metrics.steps.best.date,'2026-10-02');
  assert.equal(year.metrics.steps.bestMonth.month,'2026-10');
  assert.equal(year.metrics.exerciseMinutes.best.date,'2026-10-02');
  assert.equal(year.metrics.exerciseMinutes.bestMonth.month,'2026-11');
  assert.equal(healthPeriod(s,{year:2025}).metrics.sleepHours.average,null);
  assert.equal(formatHealth('sleepHours',null),'—');
});
test('Health importer accepts private CSV/JSON and merges daily records, never zero-fills missing sleep',async()=>{
  const csv='date,steps,distanceMiles,exerciseMinutes,sleepHours\n2024-08-01,12345,5.6,45,\n2024-08-02,9500,4.2,25,7.5\n';
  const parsed=csvHealthRows(csv),s=state();
  assert.equal(mergeHealthImport(s,parsed),2);
  assert.equal(healthPeriod(s,{year:2024}).metrics.sleepHours.days,1);
  assert.equal(healthPeriod(s,{year:2024}).metrics.steps.total,21845);
  const file={name:'health.json',size:200,text:async()=>JSON.stringify({days:[{date:'2024-08-03',steps:5000,sleepHours:8}]})};
  mergeHealthImport(s,await readHealthImportFile(file));
  assert.equal(healthRows(s).length,3);
  assert.equal(yearlyHealthOverview(s,[2024])[0].metrics.sleepHours.average,7.75);
});
test('Calendar, Year, Trackers, Records, Settings and cloud use the same features',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../themes.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
  for(const v of ['openPersonalCalendarEditor','proposedDiaryHeading','favoriteDaysPanel(y)','favoriteDaysByYearPanel()','healthReportMarkup({month}','healthReportMarkup({year:y}','healthReportMarkup({}','healthYearComparisonMarkup()','id="health-import-file"'])assert.ok(app.includes(v),v);
  assert.ok(html.includes('themes.css'));
  assert.ok(css.includes('body[data-tide-era="2027"]'));
  assert.ok(css.includes('body[data-tide-occasion="thanksgiving"]'));
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
  for(const file of ['theme-engine.js','personal-calendar.js','favorite-days.js','health-activity.js'])assert.ok(build.includes(file));
});
