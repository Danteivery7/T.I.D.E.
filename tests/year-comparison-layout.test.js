import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparisonYears} from '../year-ranking-utils.js';
import {healthHubMarkup} from '../health-ui.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const gaming=read('gaming-view.js');
const app=read('app.js');
const styles=read('year-comparisons.css');

test('year-by-year summaries have exactly 1, 2, 3 and 4 visible years for 2024–2027',()=>{
 assert.deepEqual(comparisonYears(2024,2026),[2024]);
 assert.deepEqual(comparisonYears(2025,2026),[2024,2025]);
 assert.deepEqual(comparisonYears(2026,2026),[2024,2025,2026]);
 assert.deepEqual(comparisonYears(2027,2026),[2024,2025,2026]);
 assert.deepEqual(comparisonYears(2027,2027),[2024,2025,2026,2027]);
});

test('Gaming Sessions year cards use dedicated flexible layout without altering four-stat dashboards',()=>{
 const a=gaming.indexOf('function diarySessionComparison(throughYear)');
 const b=gaming.indexOf('export function renderGaming()',a);
 assert.ok(a>=0&&b>a);
 const history=gaming.slice(a,b);
 assert.ok(history.includes('class="year-comparison-cards year-comparison-cards--gaming"'));
 assert.ok(history.includes('class="card year-comparison-card year-session-card"'));
 assert.ok(!history.includes('class="grid grid-4"'),'no reserved 4-year slots');
 assert.ok(gaming.includes('<div class="grid grid-4"><div class="card">'),'original four Gaming KPIs untouched');
});

test('Sleep year cards share the same adaptive row without changing recorded-night logic',()=>{
 assert.ok(app.includes('health-year-comparison-grid year-comparison-cards year-comparison-cards--sleep'));
 assert.ok(app.includes('health-year-avg year-comparison-card'));
 assert.ok(app.includes('healthYearComparisonMarkup(y)'));
 assert.ok(app.includes('x.metrics.sleepHours.days?formatHealth'));
});

test('Yearly step averages retain recorded-day counts and proportional mini-bars',()=>{
 const start=read('health-ui.js').indexOf('function stepsYearComparison(state,throughYear)');
 const end=read('health-ui.js').indexOf('export function healthDailyCard(',start);
 assert.ok(start>=0&&end>start);
 const section=read('health-ui.js').slice(start,end);
 assert.ok(section.includes('year-comparison-cards year-comparison-cards--steps'));
 assert.ok(section.includes('year-comparison-card year-step-card'));
 assert.ok(section.includes('year-step-meter'));
 assert.ok(section.includes('m.days'));
 assert.ok(section.includes('comparisonYears(throughYear)'));
 assert.ok(!section.includes('year-comparison-card year-step-card')===false);
 const state={entries:{},occurrences:[],monthlyReviews:{},yearlyReviews:{},
  healthActivity:{days:{
    '2024-07-05':{date:'2024-07-05',steps:4000},
    '2025-07-05':{date:'2025-07-05',steps:5000},
    '2026-07-05':{date:'2026-07-05',steps:6500}
  }}};
 const html=healthHubMarkup(state,{tab:'steps',period:'year',year:2025});
 const sectionStart=html.indexOf('Average daily steps · year by year');
 const sub=html.slice(sectionStart,html.indexOf('</section>',sectionStart));
 assert.equal((sub.match(/class="year-comparison-card year-step-card"/g)||[]).length,2);
 assert.ok(sub.includes('2024'));
 assert.ok(sub.includes('2025'));
 assert.ok(!sub.includes('2026'));
});

test('Every historical year row fills remaining width instead of leaving grid blanks',()=>{
 assert.ok(styles.includes('display:flex'));
 assert.ok(styles.includes('flex-wrap:wrap'));
 assert.ok(styles.includes('justify-content:center'));
 assert.ok(styles.includes('flex:1 1 calc((100% - 36px)/4)'));
 assert.ok(styles.includes('flex-basis:calc((100% - 12px)/2)'));
 assert.ok(styles.includes('flex-basis:100%'));
 assert.ok(styles.includes('@media(max-width:1120px)'));
 assert.ok(styles.includes('@media(max-width:600px)'));
 assert.ok(styles.includes('max-width:100%'));
 assert.ok(styles.includes('year-comparison-cards--sleep'));
 assert.ok(styles.includes('year-comparison-cards--steps'));
 assert.ok(styles.includes('year-comparison-cards--gaming'));
});

test('Responsive year comparison stylesheet is shipped online and offline after existing themes',()=>{
 const html=read('index.html');
 assert.ok(html.includes('<link rel="stylesheet" href="year-comparisons.css">'));
 assert.ok(html.indexOf('href="year-comparisons.css"')>html.indexOf('href="midnight-royal.css"'));
 assert.ok(read('build.mjs').includes("'year-comparisons.css'"));
 assert.ok(read('sw.js').includes("'/year-comparisons.css'"));
 assert.ok(read('sw.js').includes('tide-shell-v50'));
});
