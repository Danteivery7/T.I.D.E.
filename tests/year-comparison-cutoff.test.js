import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparisonYears,yearRankStatus} from '../year-ranking-utils.js';
import {yearsWithFavoriteDays} from '../favorite-days.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('historical year-by-year panels use the selected year without future-year leaks',()=>{
 assert.deepEqual(comparisonYears(2024,2026),[2024]);
 assert.deepEqual(comparisonYears(2025,2026),[2024,2025]);
 assert.deepEqual(comparisonYears(2026,2026),[2024,2025,2026]);
 assert.deepEqual(comparisonYears(2027,2026),[2024,2025,2026],'do not show 2027 early');
 assert.deepEqual(comparisonYears(2027,2027),[2024,2025,2026,2027],'2027 appears automatically in 2027');
 assert.deepEqual(comparisonYears(2025,2027),[2024,2025],'historical 2025 views remain fixed in 2027');
 assert.deepEqual(comparisonYears(2023,2026),[]);
});

test('Gaming Sessions uses the shared year limit when opening Yearly and Monthly or All Time',()=>{
 const gaming=read('gaming-view.js');
 assert.ok(gaming.includes('function diarySessionComparison(throughYear)'));
 assert.ok(gaming.includes('const years=comparisonYears(throughYear);'));
 assert.ok(gaming.includes("diarySessionComparison(mode==='all-time'?new Date().getFullYear():activeYear)"));
 assert.ok(!gaming.includes('2024,2025,2026,2027,...all.map'), 'future hard-coded cards removed');
 assert.ok(!gaming.includes(" · Upcoming"),'no projected future session cards');
 assert.ok(gaming.includes("mode==='month'?Number(month.slice(0,4)):year"),'selected annual context is retained');
 assert.ok(gaming.includes('data-gmode="year"'),'Yearly remains selectable');
});

test('sleep and steps year comparisons follow same historical-only year cutoff',()=>{
 const app=read('app.js');
 const health=read('health-ui.js');
 assert.ok(app.includes('function healthYearComparisonMarkup(selectedYear='));
 assert.ok(app.includes('const years=comparisonYears(selectedYear);'));
 assert.ok(app.includes('healthYearComparisonMarkup(y)'));
 assert.ok(health.includes('const years=comparisonYears(throughYear).filter(y=>available.has(y));'));
 assert.ok(app.includes('x<=Number(isoToday().slice(0,4))'),'future Year in Review selector values hidden');
});

test('future saved favorite-day years are not listed before their year arrives',()=>{
 const now=new Date().getFullYear(),future=now+1;
 const state={favoriteDays:{'2024':{dates:[]},[String(future)]:{dates:[]}}};
 const years=yearsWithFavoriteDays(state,now);
 assert.ok(years.includes(2024));
 assert.ok(years.includes(now));
 assert.ok(!years.includes(future));
 assert.ok(years.every(y=>y<=now));
});

test('projected year power rankings remain intentionally available and distinctly labeled',()=>{
 assert.equal(yearRankStatus(2027,2026),'projected');
 assert.equal(yearRankStatus(2026,2026),'in-progress');
 assert.equal(yearRankStatus(2024,2026),'completed');
 assert.ok(read('year-rankings.js').includes('projected'),'separate user-curated future ranking section remains intact');
});
