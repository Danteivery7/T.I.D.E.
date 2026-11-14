import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Gaming defaults to Monthly, not All Time, and uses a locally selected month',()=>{
 const view=read('gaming-view.js');
 assert.match(view,/let mode='month'/);
 assert.match(view,/month=localMonth\(\)/);
 assert.match(view,/now\.getMonth\(\)\+1/);
 assert.doesNotMatch(view,/let mode='all-time'/);
});

test('Gaming navigation follows selected T.I.D.E. month instead of resetting to January or Yearly',()=>{
 const app=read('app.js'),gaming=read('gaming-view.js');
 assert.ok(app.includes("detail:{year:selectedYear,month:selectedMonth}"),'app sends selected month');
 assert.ok(gaming.includes("incomingMonth)&&Number(incomingMonth.slice(0,4))===incomingYear"),'incoming month/year check');
 assert.ok(gaming.includes("month=incomingMonth;"),'preserve exact month');
 assert.ok(gaming.includes("mode='month';"),'open in Monthly mode');
 assert.ok(!gaming.includes("else month=String(incomingYear)+'-01'"),'do not force January');
 assert.ok(!gaming.includes("mode='year';"),'do not force Yearly');
 const check=gaming.match(/if\(\/([^/]+)\/\.test\(incomingMonth\)/);
 assert.ok(check,'context month regex exists');
 const re=new RegExp(check[1]);
 assert.equal(re.test('2026-11'),true);
 assert.equal(re.test('2025-08'),true);
 assert.equal(re.test('2024-01'),true);
 assert.equal(re.test('2027-12'),true);
 assert.equal(re.test('2026-00'),false);
 assert.equal(re.test('2026-13'),false);
 assert.equal(re.test('garbage'),false);
});

test('Gaming context is registered before remote account fetch and original tabs remain selectable',()=>{
 const code=read('gaming.js'),view=read('gaming-view.js');
 assert.ok(code.indexOf('wireGamingView();')<code.indexOf('await pullGaming();'),'listen before async refresh');
 for(const tab of ['month','year','all-time'])assert.ok(view.includes('data-gmode="'+tab+'"'));
 assert.ok(view.includes("mode=b.dataset.gmode;renderGaming();"),'manual tab changes remain available');
 assert.ok(view.includes('value="\${month}"'),'month selector uses active month');
});
