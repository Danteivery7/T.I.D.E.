import {moneyText,financePeriod,financeBalanceSnapshot,financeBalanceHistory,financeMonthComparison,financeTransactions,upcomingFinance,transactionClass,ensureFinances} from './finance-engine.js';
function htmlSafe(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function moneyLabel(v){return v==null?'—':moneyText(Number(v));}

function dateText(date){return !date?'—':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(String(date).slice(0,10)+'T12:00:00Z'));}

function monthText(month){if(!month)return'—';return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));}

function financeStat(label,value,note,tone=''){return `<article class="insight-stat insight-stat--${tone}"><span>${htmlSafe(label)}</span><strong>${htmlSafe(value)}</strong><small>${htmlSafe(note)}</small></article>`;}

function financeDateButton(row,label='Open diary'){return row?.date?`<button type="button" class="insight-open-day" data-insight-open-day="${htmlSafe(row.date)}">${htmlSafe(label)} ↗</button>`:'';}

function financeRow(title,value,detail,date){return `<div class="insight-record-row"><span>${htmlSafe(title)}</span><strong>${htmlSafe(value)}</strong><small>${htmlSafe(detail||'')}</small>${date?financeDateButton({date}):''}</div>`;}

function financeLineChart(items,title='Cash balance history',key='balance'){
 const rows=items.filter(x=>Number.isFinite(Number(x[key]))).slice(-370);
 if(!rows.length)return'<div class="insight-chart-empty">No dated balance observations for this range.</div>';
 const width=800,height=225,p=26,values=rows.map(x=>Number(x[key])),min=Math.min(...values,0),max=Math.max(...values,0),range=Math.max(.01,max-min),step=(width-p*2)/Math.max(1,rows.length-1);
 const points=rows.map((x,i)=>({x:p+i*step,y:height-p-(Number(x[key])-min)/range*(height-p*2)}));
 const path=points.map((pt,i)=>`${i?'L':'M'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');
 return `<div class="insight-chart-shell"><div class="insight-chart-title"><b>${htmlSafe(title)}</b><span>${rows.length} reported points</span></div><svg class="insight-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${htmlSafe(title)}" preserveAspectRatio="none"><line x1="${p}" y1="${height-p}" x2="${width-p}" y2="${height-p}" stroke="currentColor" opacity=".18"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${points.filter((_,i)=>i===0||i===points.length-1).map(pt=>`<circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="4" fill="currentColor"/>`).join('')}</svg><div class="insight-chart-axis"><span>${htmlSafe(rows[0].date||'')}</span><span>Low ${moneyText(Math.min(...values))}</span><span>High ${moneyText(Math.max(...values))}</span><span>${htmlSafe(rows.at(-1).date||'')}</span></div></div>`;
}

function financeBars(items,title,key){
 const rows=items.filter(x=>Number.isFinite(Number(x[key]))).slice(-12),high=Math.max(1,...rows.map(x=>Math.abs(Number(x[key]))));
 return `<section class="insight-surface"><div class="insight-section-head"><h3>${htmlSafe(title)}</h3></div><div class="insight-bars">${rows.length?rows.map(x=>`<div class="insight-bar-row"><span>${htmlSafe(monthText(x.month))}</span><div><i style="width:${Math.max(3,Math.round(Math.abs(Number(x[key]))/high*100))}%"></i></div><strong>${moneyText(Number(x[key]))}</strong></div>`).join(''):'<p class="muted">No posted activity.</p>'}</div></section>`;
}

export function financeRecordsMarkup(state,scope={},group='all'){
 const p=financePeriod(state,scope,group);
 if(!p.knownSource)return'<div class="insight-empty">Import private bank transactions to unlock financial records.</div>';
 return `<div class="insight-record-stack">${[
 ['Highest money received in one day',moneyLabel(p.highestReceiptDay?.receipts),dateText(p.highestReceiptDay?.date),p.highestReceiptDay?.date],
 ['Most categorized income in one day',moneyLabel(p.highestIncomeDay?.confirmedIncome),dateText(p.highestIncomeDay?.date),p.highestIncomeDay?.date],
 ['Largest expense day',moneyLabel(p.highestSpendingDay?.expenses),dateText(p.highestSpendingDay?.date),p.highestSpendingDay?.date],
 ['Highest reconstructed cash day',moneyLabel(p.bestCash?.balance),dateText(p.bestCash?.date),p.bestCash?.date],
 ['Lowest reconstructed cash day',moneyLabel(p.worstCash?.balance),dateText(p.worstCash?.date),p.worstCash?.date],
 ['Best month of money received',moneyLabel(p.bestReceiptMonth?.receipts),monthText(p.bestReceiptMonth?.month),null],
 ['Highest estimated closing month',moneyLabel(p.highestEndingMonth?.endingCash),monthText(p.highestEndingMonth?.month),null],
 ['Lowest estimated closing month',moneyLabel(p.lowestEndingMonth?.endingCash),monthText(p.lowestEndingMonth?.month),null],
 ['Reconstructed days below zero',p.negativeCashDays==null?'—':String(p.negativeCashDays),'Estimated combined cash position; incomplete historical coverage',null],
 ['Lowest money received month',moneyLabel(p.worstReceiptMonth?.receipts),monthText(p.worstReceiptMonth?.month),null],
 ['Highest recorded expense month',moneyLabel(p.bestExpenseMonth?.expenses),monthText(p.bestExpenseMonth?.month),null]
 ].map(([a,b,c,d])=>financeRow(a,b,c,d)).join('')}</div><p class="insight-disclaimer">Cash-day and closing-month highs/lows are reconstructed estimates, not verified bank balance history. Historical coverage begins with imported transaction data.</p>`;
}

export function financeReviewMarkup(state,scope={}){
 const p=financePeriod(state,scope),monthly=scope.month,compare=monthly?financeMonthComparison(state,monthly):null;
 return `<section class="insight-review insight-review--finance"><div class="insight-review-head"><div><span class="insight-kicker">◈ FINANCES</span><h3>${monthly?'Financial Month in Review':'Financial Year in Review'}</h3><p>${htmlSafe(monthly?monthText(monthly):String(scope.year||'All available history'))} · source-labeled cash flow</p></div><button class="button" type="button" data-insight-hub="finances">Explore Finances ↗</button></div><div class="insight-review-grid">
 ${financeStat('Money received',p.knownSource?moneyText(p.received):'—','Internal transfers excluded','good')}
 ${financeStat('Classified expenses',p.knownSource?moneyText(p.expenses):'—','Card repayments not double-counted')}
 ${financeStat(monthly?'Estimated closing cash':'Biggest receipts day',p.knownSource?moneyLabel(monthly?p.closingCash:p.highestReceiptDay?.receipts):'—',monthly?'Historical reconstruction':dateText(p.highestReceiptDay?.date),'primary')}
 ${financeStat(monthly?'Month vs previous month':'Best received month',p.knownSource?(monthly?(compare?.pct==null?'—':`${compare.pct>=0?'+':''}${compare.pct.toFixed(1)}% · ${moneyLabel(compare.change)}`):moneyLabel(p.bestReceiptMonth?.receipts)):'—',monthly?compare?.tone==='down'?'↓ Lower':compare?.tone==='up'?'↑ Higher':'≈ About the same':monthText(p.bestReceiptMonth?.month),monthly?compare?.tone||'':'')}
 </div><p class="insight-disclaimer">Only imported posted account activity is included. Cash comparisons are estimates; missing payments or deposits can change the result.</p></section>`;
}

export function financeTodayMarkup(state,date){
 const p=financePeriod(state,{month:String(date).slice(0,7)}),snap=financeBalanceSnapshot(state),forecast=upcomingFinance(state,{start:date,days:120});
 return `<section class="card today-finance-panel"><div class="card-header today-panel-header"><div><div class="today-panel-eyebrow">◈ YOUR MONEY</div><h3>Money Snapshot</h3><p class="today-panel-description">Cash, upcoming charges and conditional runway.</p></div><button class="button ghost" type="button" data-insight-hub="finances">Finances ↗</button></div><div class="insight-today-grid">
 <div><span>Imported cash</span><b>${moneyLabel(snap.value)}</b></div><div><span>Money received this month</span><b>${p.knownSource?moneyText(p.received):'—'}</b></div><div><span>Next known charge</span><b>${forecast.nextCharge?moneyText(forecast.nextCharge.amount):'—'}</b><small>${dateText(forecast.nextCharge?.date)}</small></div><div><span>Runway (conditional)</span><b>${forecast.firstNegativeDate?dateText(forecast.firstNegativeDate):'—'}</b><small>Not bank verified</small></div></div><p class="insight-disclaimer">Source snapshots may be stale. No live bank connection is configured.</p></section>`;
}

export function financeHubMarkup(state,{tab='overview',group='all',year=2026,search='',whatIf=0}={}){
 const f=ensureFinances(state),has=Object.keys(f.transactions).length>0,period=financePeriod(state,{year},group),snap=financeBalanceSnapshot(state,group),today=new Date().toLocaleDateString('en-CA'),forecast=upcomingFinance(state,{group,start:today,days:180,purchase:Number(whatIf)||0});
 const tabs=[['overview','Overview'],['history','Cash History'],['runway','Runway & Bills'],['transactions','Transactions'],['records','Personal Bests']];
 const yList=[2024,2025,2026,2027,Number(today.slice(0,4))].filter((y,i,all)=>all.indexOf(y)===i).sort();
 let body='';
 if(!has)body=`<div class="insight-empty-hub"><div>◈</div><h2>Build your private financial timeline.</h2><p>Import the prepared T.I.D.E. Finances file from Settings. It contains sanitized linked-account records, never bank credentials. Automatic connection to ChatGPT's Finances data is not available to this website.</p><button type="button" class="button primary" data-fin-import>Import Private Finances</button></div>`;
 else if(tab==='overview'){
  const current=financePeriod(state,{month:today.slice(0,7)},group),comparison=financeMonthComparison(state,today.slice(0,7),group);
  body=`<div class="insight-stat-grid">${financeStat('Imported cash snapshot',moneyLabel(snap.value),snap.status==='date_unknown'?'Source balance date unknown':'Source-dated balance','primary')}
  ${financeStat('Money received · this month',moneyText(current.received),'Excludes identifiable own transfers','good')}
  ${financeStat('Expenses · this month',moneyText(current.expenses),'No double-counted card repayments')}
  ${financeStat('Cash change this month',current.cashChange!=null?moneyText(current.cashChange):'—','Reconstructed · month to date')}
  ${financeStat('Next scheduled charge',forecast.nextCharge?moneyText(forecast.nextCharge.amount):'—',forecast.nextCharge?dateText(forecast.nextCharge.date)+' · '+forecast.nextCharge.name:'No dated upcoming charge')}
  </div><div class="insight-two-col"><section class="insight-surface"><h3>Cash balance story</h3><p class="insight-subcopy">Estimated daily cash position from imported records</p>${financeLineChart(financeBalanceHistory(state,{group,start:year+'-01-01',end:year+'-12-31'}),'Cash position · '+year)}</section>
  <section class="insight-surface"><h3>Cash runway</h3><div class="insight-forecast-emphasis ${forecast.firstNegativeDate?'is-risk':''}"><span>First projected negative date</span><strong>${forecast.firstNegativeDate?dateText(forecast.firstNegativeDate):'None in modeled window'}</strong><small>Conditional; no unknown income included</small></div>${forecast.items.filter(r=>r.source!=='hypothetical').slice(0,5).map(r=>`<div class="insight-charge"><b>${htmlSafe(r.name)}</b><span>${dateText(r.date)}</span><strong>−${moneyText(r.amount)}</strong></div>`).join('')}</section></div>
  <div class="insight-two-col">${financeBars(period.months,'Monthly receipts','receipts')}${financeBars(period.months,'Monthly classified expenses','expenses')}</div>
  <section class="insight-surface"><h3>Your linked cash-account snapshot</h3><div class="insight-account-grid">${snap.accounts.map(a=>financeStat(a.name,moneyText(a.value),a.asOf?dateText(a.asOf):'Bank balance snapshot date unavailable')).join('')}</div><p class="insight-disclaimer">Compared with the previous month: ${comparison?.pct==null?'no reliable exact percentage':`${comparison.pct.toFixed(1)}% (${moneyLabel(comparison.change)}), ${comparison.tone}`}. Historical cash positions are reconstructed rather than directly observed.</p></section>`;
 }else if(tab==='history'){
  body=`<section class="insight-surface"><h3>${htmlSafe(year)} cash timeline</h3><p class="insight-subcopy">End-of-day estimates generated backwards from imported snapshot(s), with dates and unknown source freshness disclosed.</p>${financeLineChart(financeBalanceHistory(state,{group,start:year+'-01-01',end:year+'-12-31'}),'Reconstructed cash · '+year)}</section>
  <div class="insight-two-col">${financeBars(period.months,'Money received by month','receipts')}${financeBars(period.months,'Classified expenses by month','expenses')}</div>${financeRecordsMarkup(state,{year},group)}`;
 }else if(tab==='runway'){
  body=`<div class="insight-stat-grid">${financeStat('Imported starting cash',moneyLabel(forecast.startingCash),'Undated bank snapshot','primary')}
  ${financeStat('First modeled negative',forecast.firstNegativeDate?dateText(forecast.firstNegativeDate):'Not in forecast','Conditional, never guaranteed',forecast.firstNegativeDate?'down':'good')}
  ${financeStat('Projected balance',moneyLabel(forecast.finalBalance),'Through '+dateText(forecast.through))}
  ${financeStat('Next scheduled charge',forecast.nextCharge?moneyText(forecast.nextCharge.amount):'—',forecast.nextCharge?dateText(forecast.nextCharge.date):'Unknown')}</div>
  <section class="insight-surface"><h3>What if I spend…?</h3><p class="insight-subcopy">Try a purchase without changing saved bank records.</p><form id="fin-whatif-form" class="insight-form"><label>Hypothetical spending<input id="fin-whatif-value" class="input" type="number" min="0" max="1000000" step=".01" value="${Math.max(0,Number(whatIf)||0)}"></label><button type="submit" class="button primary">Recalculate runway</button></form></section>
  <section class="insight-surface"><div class="insight-section-head"><h3>Upcoming transactions · next 180 days</h3><button type="button" class="button" data-fin-add-schedule>+ Scheduled item</button></div>
  <div class="insight-ledger"><div class="insight-ledger-head"><span>Date</span><span>Charge or deposit</span><span>Amount</span><span>Projected cash</span></div>${forecast.items.slice(0,120).map(r=>`<div class="insight-ledger-row ${r.balance<0?'is-negative':''}"><span>${dateText(r.date)}</span><span><b>${htmlSafe(r.name)}</b><small>${htmlSafe(r.source)}</small></span><span>${r.type==='inflow'?'+':'−'}${moneyText(r.amount)}</span><strong>${moneyText(r.balance)}</strong></div>`).join('')||'<p>No scheduled dated transactions yet.</p>'}</div><p class="insight-disclaimer">${htmlSafe(forecast.assumption||'Missing imported balance.')} ${forecast.knownMissing?'Some charges have an unknown due date and are excluded.':''}</p></section>
  <section class="insight-surface"><h3>Recurring charges</h3>${[...Object.values(f.recurring),...Object.values(f.manualEvents)].filter(x=>x.active).map(r=>`<div class="insight-charge"><b>${htmlSafe(r.name)}</b><span>${r.nextDate?dateText(r.nextDate):'Date unavailable'}</span><strong>${moneyText(r.amount)}</strong>${String(r.id).startsWith('manual-')?`<button type="button" data-fin-del-schedule="${htmlSafe(r.id)}" class="button ghost">Remove</button>`:''}</div>`).join('')}</section>`;
 }else if(tab==='transactions'){
  const q=search.toLowerCase().trim(),rows=financeTransactions(state,{year},group).filter(t=>!q||[t.name,t.merchant,t.category,t.date,t.detail].join(' ').toLowerCase().includes(q)).slice().reverse();
  body=`<section class="insight-surface"><h3>Posted transaction search · ${year}</h3><p class="insight-subcopy">Own transfers, unclassified deposits, refunds and card repayments are labeled, not silently counted as earned income.</p>
  <form id="fin-transactions-form" class="insight-form"><input id="fin-transactions-search" class="input" type="search" placeholder="Search merchant, amount category, date..." value="${htmlSafe(search)}"><button class="button primary" type="submit">Search</button></form>
  <div class="insight-transactions">${rows.slice(0,300).map(t=>`<div class="insight-txn"><span>${t.amount>0?'↗':'↘'}</span><div><b>${htmlSafe(t.name)}</b><small>${dateText(t.date)} · ${htmlSafe(t.category)} · ${htmlSafe(f.accounts[t.accountId]?.name||'Linked account')} · ${htmlSafe(transactionClass(t).replaceAll('_',' '))}</small></div><strong class="${t.amount>0?'plus':'minus'}">${t.amount>0?'+':'−'}${moneyText(Math.abs(t.amount))}</strong></div>`).join('')||'<p>No matching imported transactions.</p>'}</div><p class="insight-disclaimer">Showing ${Math.min(rows.length,300)} of ${rows.length} matching records. No account numbers are displayed.</p></section>`;
 }else body=financeRecordsMarkup(state,{year},group);
 const nav=tabs.map(([k,label])=>`<button type="button" data-fin-tab="${k}" class="insight-tab ${tab===k?'active':''}" aria-selected="${tab===k}">${label}</button>`).join('');
 return `<div class="insight-hub insight-hub--finance"><div class="insight-hero"><div><span class="insight-kicker">◈ T.I.D.E. FINANCES · PRIVATE</span><h2>Every dollar has <em>a story.</em></h2><p>Your money in context: cash snapshots, month-to-month change, inflows, expenses, historical peaks and conditional runway.</p></div><div class="insight-hero-art">◈</div></div>
 <div class="insight-status"><i class="${has?'ready':''}"></i><strong>${has?'IMPORTED BANK HISTORY':'PRIVATE IMPORT REQUIRED'}</strong><span>${htmlSafe(f.coverage?.firstPosted||'')} ${has?'through '+htmlSafe(f.coverage?.lastPosted||''):''} · ${Object.keys(f.transactions).length} posted records</span><b>NOT LIVE CONNECTED</b></div>
 <div class="insight-toolbar"><div class="insight-segment">${[['all','Combined'],['personal','Personal'],['business','Business']].map(([k,label])=>`<button type="button" data-fin-group="${k}" class="${group===k?'active':''}">${label}</button>`).join('')}</div><label>Year <select class="select" id="fin-year">${yList.map(v=>`<option value="${v}" ${year===v?'selected':''}>${v}</option>`).join('')}</select></label><button type="button" class="button" data-fin-import>Import updated bank export ↗</button></div>
 <div class="insight-tabs" role="tablist" aria-label="Finance exploration">${nav}</div>
 <div class="insight-hub-body">${body}</div>
 <section class="insight-surface insight-search-hub"><span class="insight-kicker">⌕ ASK MY FINANCES</span><h3>Your money, searchable</h3><p class="insight-subcopy">Ask about income, the biggest cash receipt, scheduled bills or conditional purchases using your imported data.</p>
 <form id="fin-ask-form" class="insight-form"><input class="input" id="fin-ask-question" placeholder="Which day did I receive the most money in 2026?"><button class="button primary" type="submit">Ask</button></form>
 <div id="fin-ask-output" aria-live="polite"></div><div class="insight-suggest">${['What day did I receive the most money in 2026?','When will I run out of money?','What is my highest cash balance?'].map(q=>`<button type="button" data-fin-suggest="${htmlSafe(q)}">${htmlSafe(q)}</button>`).join('')}</div></section>
 <p class="insight-disclaimer">Transaction history is imported privately. T.I.D.E. cannot access ChatGPT Finances or Plaid automatically and never stores bank credentials in the public website. Refresh data with a new private export.</p></div>`;
}
