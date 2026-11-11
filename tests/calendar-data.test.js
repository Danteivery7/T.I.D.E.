import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_MONTHS,holidaysForYear,holidaysForMonth,holidaysOnDate,monthIdentity } from '../calendar-data.js';
import {readFileSync} from 'node:fs';

const names=(date)=>holidaysOnDate(date).map(x=>x.name);
const contains=(date,name)=>names(date).some(x=>x.includes(name));

test('all twelve months have their own named design identity',()=>{
  assert.equal(CALENDAR_MONTHS.length,12);
  assert.equal(new Set(CALENDAR_MONTHS.map(x=>x.name)).size,12);
  assert.equal(new Set(CALENDAR_MONTHS.map(x=>x.tagline)).size,12);
  assert.equal(new Set(CALENDAR_MONTHS.map(x=>x.motif)).size,12);
  assert.equal(monthIdentity('2026-11').name,'November');
});
test('2026 federal fixed and moving holidays appear on correct dates',()=>{
  assert.ok(contains('2026-01-19','Martin Luther King'));
  assert.ok(contains('2026-02-16','Presidents Day'));
  assert.ok(contains('2026-05-25','Memorial Day'));
  assert.ok(contains('2026-06-19','Juneteenth'));
  assert.ok(contains('2026-09-07','Labor Day'));
  assert.ok(contains('2026-10-12','Columbus Day'));
  assert.ok(contains('2026-11-11','Veterans Day'));
  assert.ok(contains('2026-11-26','Thanksgiving'));
  assert.ok(contains('2026-12-25','Christmas Day'));
  assert.equal(holidaysOnDate('2026-11-26').find(x=>x.name==='Thanksgiving').kind,'federal');
});
test('actual and observed federal holidays remain separate',()=>{
  assert.ok(contains('2026-07-03','Independence Day (observed)'));
  assert.ok(contains('2026-07-04','Independence Day'));
  assert.ok(contains('2027-12-24','Christmas Day (observed)'));
  assert.ok(contains('2021-12-31',"New Year's Day (observed)"));
  assert.ok(contains('2022-01-01',"New Year's Day"));
  assert.ok(contains('2023-01-02',"New Year's Day (observed)"));
});
test('variable observances and leap days are calculated rather than hardcoded',()=>{
  assert.ok(contains('2026-04-05','Easter Sunday'));
  assert.ok(contains('2027-03-28','Easter Sunday'));
  assert.ok(contains('2026-05-10',"Mother's Day"));
  assert.ok(contains('2026-06-21',"Father's Day"));
  assert.ok(contains('2026-10-31','Halloween'));
  assert.ok(contains('2026-11-27','Black Friday'));
  assert.equal(holidaysForMonth('2028-02').every(x=>x.date.startsWith('2028-02-')),true);
});
test('GTA VI launch is treated as a distinct event, not a federal holiday',()=>{
  const event=holidaysOnDate('2026-11-19').find(x=>x.name==='Grand Theft Auto VI release');
  assert.equal(event.kind,'special');
  assert.equal(holidaysOnDate('2027-11-19').some(x=>x.kind==='special'),false);
});
test('month filtering and invalid dates are handled safely',()=>{
  assert.ok(holidaysForMonth('2026-11').every(x=>x.date.startsWith('2026-11-')));
  assert.deepEqual(holidaysForMonth('invalid'),[]);
  assert.deepEqual(holidaysOnDate('invalid'),[]);
  assert.deepEqual(holidaysForYear(0),[]);
});
test('calendar and On This Day controls and styling are present in the app',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
  for(const marker of ['tideCalendarCell','cal-holidays-toggle','cal-jump','tide-cal-agenda','otd-date-picker','tide-otd-timeline','otdNearbyRows','function onThisDayRows'])assert.ok(app.includes(marker),marker);
  for(const marker of ['.tide-calendar-stage.theme-01','.tide-calendar-stage.theme-12','.tide-cal-day-num','.tide-cal-holiday','.tide-otd-memory','.tide-otd-nearby'])assert.ok(css.includes(marker),marker);
  assert.ok(build.includes("'calendar-data.js'"));
});
