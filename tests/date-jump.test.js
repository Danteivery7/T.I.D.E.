import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DATE_MONTHS,isoDate,isoMonth,validDate,validMonth,inDateRange,monthGrid,pickerYears} from '../date-jump.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('custom date picker supports direct years 2024 2025 2026 and different months',()=>{
 const options=pickerYears({min:'2020-01-01',max:'2100-12-31'});
 for(const year of [2024,2025,2026,2027])assert.ok(options.includes(year));
 assert.equal(DATE_MONTHS.length,12);
 assert.equal(isoDate(2024,9,1),'2024-09-01');
 assert.equal(isoMonth(2025,2),'2025-02');
 assert.equal(inDateRange('2024-03-22',{min:'2020-01-01',max:'2100-12-31'}),true);
 assert.equal(inDateRange('2024-03',{mode:'month',min:'2020-01',max:'2100-12'}),true);
});
test('date grid aligns weekdays and respects leap years',()=>{
 const feb=monthGrid(2024,2);
 assert.equal(feb.filter(x=>x?.date).length,29);
 assert.equal(feb[4].date,'2024-02-01','February 2024 begins Thursday');
 assert.equal(feb.find(x=>x?.date==='2024-02-29').enabled,true);
 const short=monthGrid(2025,2);
 assert.equal(short.filter(x=>x?.date).length,28);
 assert.ok(!validDate('2025-02-29'));
 assert.ok(validDate('2024-02-29'));
 assert.ok(!validDate('2026-13-01'));
 assert.ok(!validDate('garbage'));
 assert.ok(validMonth('2026-11'));
 assert.ok(!validMonth('2026-00'));
});
test('date range constraints keep review pickers inside the original selected month',()=>{
 const grid=monthGrid(2026,11,{min:'2026-11-09',max:'2026-11-19'});
 assert.equal(grid.find(x=>x?.day===8).enabled,false);
 assert.equal(grid.find(x=>x?.day===9).enabled,true);
 assert.equal(grid.find(x=>x?.day===19).enabled,true);
 assert.equal(grid.find(x=>x?.day===20).enabled,false);
 const scoped=pickerYears({min:'2026-11-01',max:'2026-11-30'});
 assert.deepEqual(scoped,[2026]);
 assert.ok(!inDateRange('2027-01-01',{min:'2026-11-01',max:'2026-11-30'}));
});
test('one shared T.I.D.E. picker replaces native browser UI without changing the calendar grid',()=>{
 const app=read('app.js');
 const picker=read('date-jump.js'),html=read('index.html');
 assert.ok(picker.includes("input[type=\"date\"],input[type=\"month\"]"),'enhance both native formats');
 assert.ok(picker.includes("input.type='hidden'"),'Edge native popup disabled');
 assert.ok(picker.includes("input.dispatchEvent(new Event('change'"),'existing callback remains supported');
 assert.ok(picker.includes('data-date-year'),'year is directly selectable');
 assert.ok(picker.includes('data-date-month'),'month is directly selectable');
 assert.ok(picker.includes("observer.observe(root"),'re-rendered forms automatically enhanced');
 assert.ok(picker.includes("observer.observe(modalBody"),'modal editing dates automatically enhanced');
 assert.ok(app.includes('id="today-date-jump"'),'diary gets direct date navigation');
 assert.ok(app.includes('id="otd-date-picker"'),'On This Day date search remains intact');
 assert.ok(app.includes('id="cal-jump"'),'T.I.D.E. calendar month-navigation control remains intact');
 assert.ok(app.includes('class="tide-cal-grid"'),'the actual diary calendar remains intact');
 assert.ok(html.includes('href="date-jump.css"'));
 assert.ok(html.includes("await import('./date-jump.js')"));
 assert.ok(read('build.mjs').includes("'date-jump.js'"));
 assert.ok(read('build.mjs').includes("'date-jump.css'"));
 assert.ok(read('sw.js').includes("'/date-jump.js'"));
 assert.ok(read('sw.js').includes("'/date-jump.css'"));
 const css=read('date-jump.css');
 assert.ok(css.includes('grid-template-columns:repeat(7'));
 assert.ok(css.includes('@media(max-width:520px)'));
});
