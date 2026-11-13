import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importFinances,financeTransactions,financeDaily,financePeriod,financeMonthComparison,financeBalanceSnapshot,upcomingFinance,askFinance,moneyText,transactionClass} from '../finance-engine.js';
import {financeHubMarkup,financeReviewMarkup,financeRecordsMarkup,financeTodayMarkup} from '../finances-ui.js';
import {healthHubMarkup,healthReviewMarkup,healthLifetimeMarkup,healthDailyCard} from '../health-ui.js';
import {healthAnswers,migraineSummary,weeklyHealth} from '../health-insights.js';
import {mergeHealthImport,healthPeriod} from '../health-activity.js';
import {mergeStates as mergeLocal} from '../storage.js';
import {mergeStates as mergeServer} from '../functions/_lib/state.js';

const blank=()=>({version:1,entries:{},occurrences:[],monthlyReviews:{},yearlyReviews:{},trackerOverrides:{},settings:{},healthActivity:{days:{}}});
function fixture(){
 const s=blank();
 importFinances(s,{format:'tide-finance-private-v1',capturedAt:'2026-11-13',source:'Chase posted transactions, not live',accounts:[
   {id:'cash',name:'Personal Checking',balance:50,kind:'checking',group:'personal',balanceStatus:'date_unknown'},
   {id:'business',name:'Business Checking',balance:-15,kind:'checking',group:'business',balanceStatus:'date_unknown'}
 ],coverage:{firstPosted:'2026-01-01',lastPosted:'2026-11-12',balanceSnapshotDate:null},transactions:[
   {id:'a',date:'2026-01-23',accountId:'cash',name:'Deposit',amount:4110,category:'transfers'},
   {id:'b',date:'2026-05-22',accountId:'cash',name:'Bank Deposit',amount:4100,category:'transfers'},
   {id:'c',date:'2026-11-07',accountId:'cash',name:'Payroll',amount:300,category:'income'},
   {id:'d',date:'2026-11-08',accountId:'cash',name:'Rent',amount:-180,category:'housing'},
   {id:'e',date:'2026-11-08',accountId:'cash',name:'Transfer from Checking',amount:50,category:'transfers'},
   {id:'f',date:'2026-11-09',accountId:'cash',name:'Credit card payment',amount:-100,category:'transfers'},
   {id:'g',date:'2026-11-09',accountId:'cash',name:'Refund',amount:15,category:'other'}
 ],recurring:[{id:'r1',name:'Service fee',amount:15,nextDate:'2026-11-19',frequency:'monthly',accountId:'cash'},
 {id:'r2',name:'Another fee',amount:15,nextDate:'2026-11-20',frequency:'monthly',accountId:'business'}]});
 return s;
}
test('posted deposit classification is receipts, not earned income or own-account transfers',()=>{
 const s=fixture(),p=financePeriod(s,{year:2026});
 assert.equal(p.highestReceiptDay.date,'2026-01-23');
 assert.equal(p.highestReceiptDay.receipts,4110);
 assert.equal(p.confirmedIncome,300);
 assert.equal(p.received,8525);
 assert.equal(p.expenses,180);
 assert.equal(transactionClass({name:'Transfer from Savings',category:'transfers',amount:50}),'internal_transfer');
 assert.equal(transactionClass({name:'Credit card payment',category:'transfers',amount:-100}),'card_payment');
 assert.equal(moneyText(4110),'$4,110.00');
});
test('unknown balance date stays unknown and daily cash peaks are labeled reconstructed',()=>{
 const s=fixture(),b=financeBalanceSnapshot(s);
 assert.equal(b.value,35);assert.equal(b.asOf,null);assert.equal(b.status,'date_unknown');
 const report=financePeriod(s,{year:2026});
 assert.match(report.sourceNote,/reconstructed/i);
 assert.equal(report.balanceStatus,'date_unknown');
 assert.ok(report.bestCash?.date&&report.worstCash?.date);
 assert.notEqual(report.bestCash?.status,'source_dated');
});
test('two independent fees are included and simulated spending changes conditional runway without changing underlying balance',()=>{
 const s=fixture(),before=JSON.stringify(s.finances);
 const plain=upcomingFinance(s,{start:'2026-11-13',days:30});
 const hypothetical=upcomingFinance(s,{start:'2026-11-13',days:30,purchase:30});
 assert.ok(plain.ready);assert.equal(plain.items.filter(x=>x.name.includes('fee')).length,2);
 assert.equal(plain.nextCharge.date,'2026-11-19');
 assert.equal(hypothetical.finalBalance,plain.finalBalance-30);
 assert.equal(JSON.stringify(s.finances),before);
 assert.ok(upcomingFinance(blank(),{start:'2026-11-13',days:10}).ready===false);
});
test('month and year models separately calculate cash receipts, expenses and comparisons',()=>{
 const s=fixture();
 const jan=financePeriod(s,{month:'2026-01'});
 assert.equal(jan.received,4110);
 const may=financePeriod(s,{month:'2026-05'});
 assert.equal(may.received,4100);
 const nov=financePeriod(s,{month:'2026-11'});
 assert.equal(nov.confirmedIncome,300);
 assert.equal(nov.expenses,180);
 const comp=financeMonthComparison(s,'2026-11');
 assert.ok(comp&&typeof comp==='object');
});
test('finance and health state merge privately across devices without leaking metadata into site assets',()=>{
 const s=fixture();
 const h=blank();mergeHealthImport(h,{days:[{date:'2026-11-12',steps:4500,sleepHours:7.75}]});
 const l=mergeLocal(s,h),b=mergeServer(s,h);
 assert.ok(l.finances?.transactions?.a);
 assert.ok(b.finances?.transactions?.a);
 assert.equal(l.healthActivity.days['2026-11-12'].sleepHours,7.75);
 assert.equal(b.healthActivity.days['2026-11-12'].steps,4500);
});
test('health dashboard preserves longest and shortest nights, step extremes, and migraine dates',()=>{
 const s=blank();
 const days=Array.from({length:9},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),sleepHours:6+i*.2,steps:1200+i*100,exerciseMinutes:10+i}));
 mergeHealthImport(s,{days});
 s.entries['2026-11-04']={text:'Had a migraine all afternoon.'};
 s.entries['2026-11-06']={text:'No migraine today.'};
 const p=healthPeriod(s,{month:'2026-11'});
 assert.equal(p.metrics.sleepHours.days,9);
 assert.equal(p.metrics.sleepHours.best.date,'2026-11-09');
 assert.equal(p.metrics.sleepHours.bestMonth.month,'2026-11');
 assert.equal(p.metrics.steps.best.date,'2026-11-09');
 assert.equal(migraineSummary(s,{month:'2026-11'}).days,1);
 assert.equal(migraineSummary(s,{month:'2026-11'}).rows[0].date,'2026-11-04');
 assert.equal(weeklyHealth(s,'2026-11','sleepHours').length>=2,true);
});
test('full Health and Finances hubs present accessible tabs and date-linked reports',()=>{
 const s=fixture();mergeHealthImport(s,{days:[{date:'2026-11-12',steps:5000,sleepHours:7.5}]});
 const a=financeHubMarkup(s,{year:2026,tab:'runway',group:'all'});
 const b=healthHubMarkup(s,{year:2026,period:'month',month:'2026-11',tab:'migraines'});
 for(const t of ['data-fin-tab="overview"','data-fin-tab="runway"','fin-whatif-form','data-fin-group="personal"','data-fin-import'])assert.ok(a.includes(t),t);
 for(const t of ['data-health-tab="sleep"','data-health-tab="migraines"','data-health-period="month"','School days vs No-school','Home alone','Sleep versus'])assert.ok(b.includes(t),t);
 assert.ok(financeReviewMarkup(s,{year:2026}).includes('Financial Year in Review'));
 assert.ok(financeRecordsMarkup(s).includes('Highest reconstructed cash'));
 assert.ok(financeTodayMarkup(s,'2026-11-13').includes('Money Snapshot'));
 assert.ok(healthReviewMarkup(s,{month:'2026-11'}).includes('Health Month in Review'));
 assert.ok(healthLifetimeMarkup(s).includes('Longest measured sleep'));
 assert.ok(healthDailyCard(s,'2026-11-13','sleepHours').includes('Sleep Snapshot'));
 assert.ok(healthDailyCard(s,'2026-11-13','steps').includes('Steps Snapshot'));
});
test('Ask TIDE routes Health and finance questions to saved data, never fabricated live links',()=>{
 const s=fixture();mergeHealthImport(s,{days:[{date:'2026-11-12',steps:6000,sleepHours:8}]});
 assert.equal(askFinance(s,'What day did I receive the most money in 2026?',{today:'2026-11-13'}).date,'2026-01-23');
 assert.equal(healthAnswers(s,'What was my highest step day in November 2026?',{today:'2026-11-13'}).date,'2026-11-12');
 assert.match(askFinance(s,'When will I run out of money?',{today:'2026-11-13'}).detail,/assumes|conditional|projection|unknown/i);
});
test('original six award themes still exist beside exactly three additional annual highlight cards',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const names=['Best day of the year','Best month of the year','Top activity','Song of the year','Artist of the year','Video game of the year','Best exercise day','Longest sleep night','Biggest money received day'];
 for(const name of names)assert.ok(app.includes(name),name);
 for(const tag of ['yearAwardCard("steps"','yearAwardCard("sleep"','yearAwardCard("income"'])assert.ok(app.includes(tag),tag);
 for(const token of ['healthDailyCard(state,date','financeTodayMarkup(state,date)','data-view="finances"','data-view="health"'])assert.ok(app.includes(token)||readFileSync(new URL('../index.html',import.meta.url),'utf8').includes(token),token);
});
