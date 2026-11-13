// T.I.D.E. private finance analytics. Pure computations with source/coverage notes.
// No banking secrets, Plaid keys or ChatGPT integration. Data is imported privately by the owner.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const money=n=>Math.round((Number(n)||0)*100)/100;
const validDay=d=>DAY.test(String(d))&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const isoNext=(d,n=1)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const monthNext=(d,n=1)=>{const day=Number(d.slice(8)),base=new Date(Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1+n,1,12));const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0,12)).getUTCDate();base.setUTCDate(Math.min(day,last));return base.toISOString().slice(0,10)};
export const CASH_GROUPS=['personal','business','all'];
export const FINANCE_COLOR_NEUTRAL_PCT=5;
export function moneyText(n){return Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'—'}
export const moneyChangeTone=pct=>pct==null?'unknown':pct>FINANCE_COLOR_NEUTRAL_PCT?'up':pct< -FINANCE_COLOR_NEUTRAL_PCT?'down':'flat';
export function ensureFinances(state){if(!state.finances||typeof state.finances!=='object')state.finances={};const f=state.finances;f.accounts||={};f.transactions||={};f.recurring||={};f.manualEvents||={};return f;}
export function normalizeFinanceTransaction(raw){
 if(!raw||!validDay(raw.date)||!Number.isFinite(Number(raw.amount)))return null;
 const value=Number(raw.amount);if(Math.abs(value)>1e9)return null;
 const name=String(raw.name||'').slice(0,120).trim();
 const id=String(raw.id||'').slice(0,90);
 if(!id)return null;
 return{id,date:raw.date,accountId:String(raw.accountId||'').slice(0,72),name,merchant:String(raw.merchant||'').slice(0,100),
 amount:money(value),category:String(raw.category||'other').slice(0,60),detail:String(raw.detail||'').slice(0,100),
 confidence:String(raw.confidence||'unknown').slice(0,30),updatedAt:String(raw.updatedAt||'').slice(0,35),source:'imported-posted'};
}
export function importFinances(state,payload){
 if(payload?.format!=='tide-finance-private-v1'||!Array.isArray(payload.transactions)||!Array.isArray(payload.accounts))throw new Error('Choose a T.I.D.E. private finance export (.json).');
 if(payload.transactions.length>100000||payload.accounts.length>30||JSON.stringify(payload).length>30_000_000)throw new Error('Finance export exceeds the supported import size.');
 const f=ensureFinances(state),time=new Date().toISOString();let accepted=0;
 for(const account of payload.accounts){
  const id=String(account.id||'').slice(0,72);if(!id)continue;
  const current=Number(account.balance);
  f.accounts[id]={...f.accounts[id],id,name:String(account.name||id).slice(0,80),group:account.group==='business'?'business':'personal',kind:String(account.kind||'checking').slice(0,40),
   balance:Number.isFinite(current)?money(current):null,available:Number.isFinite(Number(account.available))?money(account.available):null,
   balanceStatus:account.balanceStatus||'date_unknown',balanceDate:validDay(account.balanceDate)?account.balanceDate:null,
   capturedAt:String(account.snapshotCapturedAt||payload.capturedAt||time.slice(0,10)).slice(0,35),updatedAt:time};
 }
 for(const row of payload.transactions){
  const txn=normalizeFinanceTransaction(row);if(!txn)continue;
  txn.updatedAt=time;f.transactions[txn.id]=txn;accepted++;
 }
 for(const input of payload.recurring||[]){
  if(!input||!input.id||!Number.isFinite(Number(input.amount))||Number(input.amount)<0)continue;
  const id=String(input.id).slice(0,96);
  // Preserves user-edited imported schedule values.
  const prior=f.recurring[id];if(prior?.manualOverride)continue;
  f.recurring[id]={id,name:String(input.name||'Recurring charge').slice(0,100),amount:money(input.amount),
   nextDate:validDay(input.nextDate)?input.nextDate:null,frequency:input.frequency==='yearly'?'yearly':'monthly',
   accountId:String(input.accountId||'').slice(0,72),active:input.active!==false,origin:input.origin||'import',updatedAt:time};
 }
 f.source=String(payload.source||'Private finance import').slice(0,170);
 f.coverage={...payload.coverage,firstPosted:String(payload.coverage?.firstPosted||''),lastPosted:String(payload.coverage?.lastPosted||''),balanceSnapshotDate:payload.coverage?.balanceSnapshotDate||null};
 f.importedAt=time;f.isLiveConnected=false;f.updatedAt=time;
 return accepted;
}
export function transactionClass(tx){
 const c=String(tx.category||'').toLowerCase(),d=String(tx.detail||'').toLowerCase(),name=String(tx.name||'').toLowerCase();
 const isCredit=Number(tx.amount)>0,isDebit=Number(tx.amount)<0;
 const internal=/transfer (?:from|to) (?:checking|savings)|online transfer from|online transfer to|account transfer|savings transfer|between (?:my|accounts)/i.test(name+' '+d);
 const cardPay=/credit card payment|payment to (?:chase card|credit card)|card payment|autopay .*card/i.test(name);
 const refund=/refund|reimbursement|return credit|reversal/i.test(name);
 const deposit=/^(?:bank )?deposit\b|^atm cash deposit\b|^remote online deposit\b/i.test(name);
 if(cardPay)return'card_payment';
 if(internal)return'internal_transfer';
 if(c==='transfers'&&!deposit)return'unclassified_transfer';
 if(isCredit&&deposit)return'external_deposit_uncertain_income';
 if(isCredit&&refund)return'refund';
 if(isCredit&&c==='income')return'classified_income';
 if(isCredit)return'unclassified_credit';
 if(isDebit&&c==='transfers')return'unclassified_transfer';
 if(isDebit)return'purchase_or_expense';
 return'neutral';
}
export function financeTransactions(state,scope={},group='all'){
 const f=ensureFinances(state);return Object.values(f.transactions).filter(t=>{
  if(!t||!validDay(t.date)||!Number.isFinite(Number(t.amount)))return false;
  const acc=f.accounts[t.accountId];if(group!=='all'&&acc?.group!==group)return false;
  return(!scope.month||t.date.startsWith(scope.month+'-'))&&(!scope.year||t.date.startsWith(String(scope.year)+'-'))&&(!scope.start||t.date>=scope.start)&&(!scope.end||t.date<=scope.end);
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function financeDaily(state,scope={},group='all'){
 const byDate=new Map();
 for(const t of financeTransactions(state,scope,group)){
  if(!byDate.has(t.date))byDate.set(t.date,{date:t.date,grossCredits:0,receipts:0,confirmedIncome:0,unclassifiedDeposits:0,expenses:0,transfers:0,refunds:0,creditsCount:0,chargesCount:0});
  const d=byDate.get(t.date),v=Number(t.amount),kind=transactionClass(t);
  if(v>0)d.grossCredits+=v,d.creditsCount++;
  if(v<0)d.chargesCount++;
  if(kind==='classified_income')d.confirmedIncome+=v,d.receipts+=v;
  else if(kind==='external_deposit_uncertain_income')d.unclassifiedDeposits+=v,d.receipts+=v;
  else if(kind==='unclassified_credit'&&v>0)d.receipts+=v;
  else if(kind==='refund')d.refunds+=v;
  else if(kind==='purchase_or_expense')d.expenses-=v;
  else if(kind.includes('transfer')||kind==='card_payment')d.transfers+=v;
 }
 return [...byDate.values()].map(x=>Object.fromEntries(Object.entries(x).map(([k,v])=>typeof v==='number'?[k,money(v)]:[k,v]))).sort((a,b)=>a.date.localeCompare(b.date));
}
export function financeBalanceSnapshot(state,group='all'){
 const accounts=Object.values(ensureFinances(state).accounts).filter(a=>group==='all'||a.group===group);
 const valid=accounts.filter(a=>Number.isFinite(a.balance));
 if(!valid.length)return{value:null,count:0,status:'missing',asOf:null,accounts:[]};
 const dates=new Set(valid.map(a=>a.balanceDate).filter(Boolean));
 return{value:money(valid.reduce((n,a)=>n+a.balance,0)),count:valid.length,status:valid.some(a=>!a.balanceDate)?'date_unknown':dates.size===1?'source_dated':'mixed_dates',
  asOf:dates.size===1?[...dates][0]:null,accounts:valid.map(a=>({id:a.id,name:a.name,value:a.balance,asOf:a.balanceDate||null}))};
}
export function financeBalanceHistory(state,{group='all',start=null,end=null}={}){
 // Estimate end-of-day cash by reversing known POSTED transfers/expenses from the imported
 // account snapshot. Exact daily bank snapshots are not available in this source.
 const f=ensureFinances(state),accounts=Object.values(f.accounts).filter(a=>(group==='all'||a.group===group)&&Number.isFinite(a.balance));
 if(!accounts.length)return[];
 const txs=financeTransactions(state,{},group);
 if(!txs.length)return[];
 const first=txs[0].date,anchor=String(f.coverage?.balanceSnapshotDate||f.importedAt?.slice(0,10)||f.coverage?.lastPosted||'');
 if(!validDay(anchor))return[];
 const last=end&&end<anchor?end:anchor;const begin=start&&start>first?start:first;
 const total=money(accounts.reduce((n,a)=>n+a.balance,0));
 const byDate=new Map();
 for(const t of txs)byDate.set(t.date,money((byDate.get(t.date)||0)+Number(t.amount)));
 let backwards=0;const rows=[];
 for(let day=anchor;day>=begin;day=isoNext(day,-1)){
  const balance=money(total-backwards);
  if(day<=last)rows.push({date:day,balance,status:accounts.every(a=>a.balanceDate===day)?'source_dated':'reconstructed',coverage:'Known posted transactions only; anchor snapshot date may be unknown'});
  backwards+=byDate.get(day)||0;
  if(rows.length>3660)break;
 }
 return rows.reverse();
}
const pick=(items,key,asc=false)=>items.filter(x=>Number.isFinite(Number(x[key]))).slice().sort((a,b)=>(asc?Number(a[key])-Number(b[key]):Number(b[key])-Number(a[key]))||a.date.localeCompare(b.date))[0]||null;
export function financePeriod(state,scope={},group='all'){
 const daily=financeDaily(state,scope,group);
 const sum=key=>money(daily.reduce((n,d)=>n+Number(d[key]||0),0));
 const credits=pick(daily,'receipts'),earnings=pick(daily,'confirmedIncome'),spending=pick(daily,'expenses');
 const cash=financeBalanceHistory(state,{group,start:scope.start||scope.month&&scope.month+'-01'||scope.year&&scope.year+'-01-01',end:scope.end||scope.month&&scope.month+'-31'||scope.year&&scope.year+'-12-31'});
 const bestCash=pick(cash,'balance'),worstCash=pick(cash,'balance',true);
 const first=cash[0]||null,last=cash.at(-1)||null,closing=last?.balance??null,opening=first?.balance??null;
 const cashDelta=first&&last?money(last.balance-first.balance):null;
 const months=new Map();
 for(const d of daily){
  const m=d.date.slice(0,7);if(!months.has(m))months.set(m,{month:m,receipts:0,confirmedIncome:0,expenses:0,refunds:0});
  const r=months.get(m);for(const k of ['receipts','confirmedIncome','expenses','refunds'])r[k]+=d[k]||0;
 }
 for(const row of cash)if(row.date.slice(8)!=='00'){const m=row.date.slice(0,7);if(!months.has(m))months.set(m,{month:m,receipts:0,confirmedIncome:0,expenses:0,refunds:0});const r=months.get(m);r.endingCash=row.balance;r.lastBalanceDate=row.date;r.peakCash=Math.max(r.peakCash??-Infinity,row.balance);r.lowCash=Math.min(r.lowCash??Infinity,row.balance)}
 const monthly=[...months.values()].map(x=>({...x,receipts:money(x.receipts),confirmedIncome:money(x.confirmedIncome),expenses:money(x.expenses),refunds:money(x.refunds)})).sort((a,b)=>a.month.localeCompare(b.month));
 const by=(key,ascending=false)=>monthly.slice().filter(x=>Number.isFinite(x[key])).sort((a,b)=>(ascending?a[key]-b[key]:b[key]-a[key])||a.month.localeCompare(b.month))[0]||null;
 return{scope,group,received:sum('receipts'),confirmedIncome:sum('confirmedIncome'),unclassifiedDeposits:sum('unclassifiedDeposits'),expenses:sum('expenses'),refunds:sum('refunds'),
  credits:sum('grossCredits'),daily,months:monthly,closingCash:closing,openingCash:opening,cashChange:cashDelta,bestCash,worstCash,
  highestReceiptDay:credits,highestIncomeDay:earnings,highestSpendingDay:spending,
  bestReceiptMonth:by('receipts'),bestIncomeMonth:by('confirmedIncome'),bestCashMonth:by('peakCash'),worstCashMonth:by('lowCash',true),
  highestEndingMonth:by('endingCash'),lowestEndingMonth:by('endingCash',true),knownSource:!!Object.keys(ensureFinances(state).transactions).length,
  balanceStatus:financeBalanceSnapshot(state,group).status,
  sourceNote:'Historical cash values are estimates reconstructed from latest imported balances and posted transactions; not verified daily bank snapshots.'};
}
export function financeMonthComparison(state,month,group='all'){
 if(!/^\d{4}-\d{2}$/.test(month))return null;
 const last=monthNext(month+'-01',-1).slice(0,7);
 const current=financePeriod(state,{month},group),previous=financePeriod(state,{month:last},group);
 const a=current.closingCash,b=previous.closingCash;
 if(a==null||b==null)return{current,previous,pct:null,change:null,tone:'unknown'};
 const change=money(a-b),pct=b!==0?money(change/Math.abs(b)*100):a===0?0:null;
 return{current,previous,change,pct,tone:moneyChangeTone(pct),previousMonth:last};
}
export function upcomingFinance(state,{start=null,days=90,group='all',purchase=0,purchaseDate=null,openingCash=null}={}){
 const f=ensureFinances(state),today=start||new Date().toLocaleDateString('en-CA'),limit=isoNext(today,Math.max(1,Math.min(730,Number(days)||90)));
 const base=openingCash!==null&&openingCash!==undefined&&Number.isFinite(Number(openingCash))?Number(openingCash):financeBalanceSnapshot(state,group).value;
 if(base==null)return{ready:false,reason:'No current cash balance is imported.',items:[],firstNegativeDate:null};
 const events=[];
 for(const r of [...Object.values(f.recurring),...Object.values(f.manualEvents)]){
  if(!r||!r.active||!Number.isFinite(Number(r.amount))||!validDay(r.nextDate)||group!=='all'&&f.accounts[r.accountId]?.group!==group)continue;
  let day=r.nextDate,i=0;
  while(day<today&&i++<720)day=r.frequency==='yearly'?monthNext(day,12):r.frequency==='weekly'?isoNext(day,7):r.frequency==='once'?null:monthNext(day,1);
  if(!day)continue;
  while(day<=limit&&i++<800){
   events.push({date:day,name:r.name,amount:money(r.amount),source:r.origin||'scheduled',type:r.direction==='inflow'?'inflow':'charge',id:r.id});
   day=r.frequency==='yearly'?monthNext(day,12):r.frequency==='weekly'?isoNext(day,7):r.frequency==='once'?null:monthNext(day,1);
   if(!day)break;
  }
 }
 const spend=Math.max(0,Number(purchase)||0);
 if(spend)events.push({date:purchaseDate&&validDay(purchaseDate)?purchaseDate:today,name:'What-if purchase',amount:money(spend),source:'hypothetical',type:'charge',id:'simulation'});
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 let balance=money(base),firstNegativeDate=balance<0?today:null;
 const rows=events.map(e=>{
  balance=money(balance+(e.type==='inflow'?e.amount:-e.amount));
  if(!firstNegativeDate&&balance<0)firstNegativeDate=e.date;
  return{...e,balance};
 });
 const endCash=rows.length?rows.at(-1).balance:balance;
 return{ready:true,startingCash:money(base),items:rows,firstNegativeDate,finalBalance:endCash,nextCharge:rows.find(x=>x.type==='charge'&&x.source!=='hypothetical')||null,through:limit,
  knownMissing:!Object.values(f.recurring).every(x=>x.nextDate||!x.active),
  assumption:'Projection assumes imported balance still applies, scheduled charges post as predicted, and no unknown income or bills. Not a bank-verified balance or payment guarantee.'};
}
export function upsertFinanceSchedule(state,input){
 const f=ensureFinances(state);
 if(!input?.name||!Number.isFinite(Number(input.amount))||Number(input.amount)<0||!validDay(input.nextDate))throw new Error('Enter a description, nonnegative amount, and valid next date.');
 const id=String(input.id||('manual-'+Date.now()+'-'+Math.random().toString(36).slice(2)));
 const row={id,name:String(input.name).slice(0,100),amount:money(input.amount),nextDate:input.nextDate,frequency:['weekly','monthly','yearly','once'].includes(input.frequency)?input.frequency:'monthly',
  direction:input.direction==='inflow'?'inflow':'outflow',accountId:String(input.accountId||'').slice(0,72),active:true,origin:'user-confirmed schedule',manualOverride:true,updatedAt:new Date().toISOString()};
 f.manualEvents[id]=row;return row;
}
export function deleteFinanceSchedule(state,id){const f=ensureFinances(state);if(!f.manualEvents[id])return false;f.manualEvents[id]={...f.manualEvents[id],active:false,updatedAt:new Date().toISOString()};return true;}
export function askFinance(state,text,context={}){
 const q=String(text||'').toLowerCase();if(!/(money|cash|finance|finances|bank|balance|spend|spent|buy|purchase|income|earned|deposit|subscription|bill|run out|negative|charge|wealth|savings|broke|afford)/.test(q))return null;
 const f=ensureFinances(state);
 if(!Object.keys(f.transactions).length)return{kind:'money',heading:'FINANCES NOT IMPORTED',primary:'Connect your private finance records',detail:'Import the T.I.D.E. private financial JSON in Settings to answer bank-based questions. No live bank access is assumed.',source:'T.I.D.E. finance'};
 const year=Number((q.match(/\b20(?:2[4-9]|[3-9]\d)\b/)||[])[0]);
 const scope=year?{year}:/\bthis month\b/.test(q)?{month:String(context.today||'').slice(0,7)}:{};
 const monthMatch=q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/);
 if(monthMatch){const m=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(monthMatch[1])+1;scope.month=monthMatch[2]+'-'+String(m).padStart(2,'0');delete scope.year}
 const rep=financePeriod(state,scope),date=context.today||new Date().toLocaleDateString('en-CA');
 const dateFor=thing=>thing?.date||null;
 const mk=(header,value,dateValue,explanation)=>({kind:'money',heading:header,primary:value,detail:explanation||rep.sourceNote,date:dateValue,source:'Imported posted bank transactions · historical coverage labeled'});
 if(/run out|go negative|first negative|afford|if i (?:spend|buy)|what if/.test(q)){
  const simulation=q.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/),purchase=simulation?Number(simulation[1].replaceAll(',','')):0;
  const forecast=upcomingFinance(state,{start:date,days:180,purchase});
  if(!forecast.ready)return mk('PROJECTION NOT AVAILABLE','No balance snapshot',null,'Import bank balance and recurring charges first.');
  return mk('CONDITIONAL CASH RUNWAY',forecast.firstNegativeDate||'No negative date found',forecast.firstNegativeDate,
   (forecast.firstNegativeDate?'First modeled negative date with scheduled charges. ':'No negative balance through '+forecast.through+'. ')+forecast.assumption);
 }
 if(/biggest|most|highest|peak|best/.test(q)&&/(deposit|income|earn|make|made|received|got)/.test(q)){
  const r=/(earn|income)/.test(q)?rep.highestIncomeDay:rep.highestReceiptDay,metric=/(earn|income)/.test(q)?'confirmedIncome':'receipts';
  return mk('HIGHEST '+(metric==='receipts'?'RECEIPTS':'CLASSIFIED INCOME')+' DAY',r?moneyText(r[metric]):'No recorded inflows',r?.date,
   'Based on categorized posted credits, excluding identifiable own-account transfers. Deposits may be unclassified as earned income.');
 }
 if(/biggest|most|highest|peak|best|lowest|least|worst/.test(q)&&/(balance|cash|had|holding)/.test(q)){
  const low=/least|lowest|worst/.test(q),r=low?rep.worstCash:rep.bestCash;
  return mk(low?'LOWEST RECONSTRUCTED CASH':'HIGHEST RECONSTRUCTED CASH',r?moneyText(r.balance):'No cash history',r?.date,rep.sourceNote);
 }
 if(/next (?:bill|charge|subscription)|when.*(?:charge|subscription|bill)/.test(q)){
  const forecast=upcomingFinance(state,{start:date,days:100});
  return mk('NEXT KNOWN SCHEDULED CHARGE',forecast.nextCharge?moneyText(forecast.nextCharge.amount):'No next charge dated',forecast.nextCharge?.date,
   forecast.nextCharge?.name||'Other scheduled charges may be missing or have no reliable due date.');
 }
 if(/balance|how much.*(?:have|got)|cash on hand/.test(q)){
  const b=financeBalanceSnapshot(state);return mk('IMPORTED CASH SNAPSHOT',moneyText(b.value),b.asOf,
  b.status==='source_dated'?'Source-dated combined checking/savings snapshot.':'Balance snapshot date is unavailable. This is not a verified current available-cash amount.');
 }
 if(/spend|spent|expense/.test(q))return mk('CLASSIFIED EXPENSES',moneyText(rep.expenses),null,'Excludes internal transfers and card repayments to avoid double-counting underlying purchases; unknown movements are reported separately.');
 if(/income|earn|make|made/.test(q))return mk('CLASSIFIED INCOME CREDITS',moneyText(rep.confirmedIncome),null,'Some deposits remain unclassified. This is neither guaranteed taxable income nor full earnings.');
 return mk('CASH RECEIVED FROM POSTED TRANSACTIONS',moneyText(rep.received),null,'Excludes obvious internal transfers; unclassified external deposits are included as receipts, not verified earned income.');
}
