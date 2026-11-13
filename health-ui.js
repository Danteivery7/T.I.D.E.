import {healthRows,healthPeriod,formatHealth} from './health-activity.js';
import {migraineSummary,weeklyHealth,dailyHealthComparison} from './health-insights.js';
function healthEsc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function healthDateText(d){return d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'—';}

function healthMonthText(d){return d?new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'-01T12:00:00Z')):'—';}

function healthKpi(label,value,note,accent=''){return `<article class="insight-stat insight-stat--${accent}"><span>${healthEsc(label)}</span><strong>${healthEsc(value)}</strong><small>${healthEsc(note)}</small></article>`;}

function healthDayLink(day){return day&&day.date?`<button type="button" class="insight-open-day" data-insight-open-day="${healthEsc(day.date)}">Open ${healthDateText(day.date)} ↗</button>`:'';}

function healthRecord(label,value,explain,date){return `<div class="insight-record-row"><span>${healthEsc(label)}</span><strong>${healthEsc(value)}</strong><small>${healthEsc(explain||'')}</small>${date?healthDayLink({date}):''}</div>`;}

function healthGraph(values,key,title,{bars=false,average=false}={}){
 const rows=values.filter(x=>x[key]!==undefined&&x[key]!==null&&Number.isFinite(Number(x[key]))).slice(-400);
 if(!rows.length)return'<div class="insight-chart-empty">No recorded observations in this period. Missing days are not zero.</div>';
 const w=760,h=220,p=24,max=Math.max(1,...rows.map(x=>Number(x[key]))),min=0;const gap=(w-2*p)/Math.max(1,rows.length-(bars?0:1));
 const points=rows.map((x,i)=>({x:p+i*gap+(bars?gap*.5:0),y:h-p-(Number(x[key])-min)/(max-min)*(h-2*p),val:Number(x[key])}));
 const items=bars?points.map((pt,i)=>`<rect x="${Math.max(p,pt.x-gap*.34)}" y="${pt.y}" width="${Math.max(2,gap*.67)}" height="${Math.max(1,h-p-pt.y)}" rx="2" fill="currentColor" opacity="${i===points.length-1?.9:.62}"/>`).join(''): `<path d="${points.map((pt,i)=>`${i?'L':'M'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
 return `<div class="insight-chart-shell insight-chart--health"><div class="insight-chart-title"><b>${healthEsc(title)}</b><span>${rows.length} recorded ${rows.length===1?'day':'days'}</span></div><svg class="insight-line" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${healthEsc(title)}">${[0,1,2,3].map(i=>`<line x1="${p}" x2="${w-p}" y1="${p+(h-p*2)/3*i}" y2="${p+(h-p*2)/3*i}" stroke="currentColor" opacity=".13" stroke-dasharray="3 7"/>`).join('')}${items}</svg><div class="insight-chart-axis"><span>${healthEsc(rows[0].date||rows[0].week||'')}</span><span>Highest ${max.toFixed(1)}</span><span>${healthEsc(rows.at(-1).date||rows.at(-1).week||'')}</span></div></div>`;
}

function healthMonthBars(rows,title,key='count'){
 const source=rows.slice(-14),largest=Math.max(1,...source.map(x=>Number(x[key])||0));
 return `<section class="insight-surface"><h3>${healthEsc(title)}</h3><div class="insight-bars">${source.length?source.map(r=>`<div class="insight-bar-row"><span>${healthEsc(healthMonthText(r.month))}</span><div><i style="width:${Math.max(3,Math.round((Number(r[key])||0)/largest*100))}%"></i></div><strong>${healthEsc((Number(r[key])||0).toFixed(key==='count'?0:1))}</strong></div>`).join(''):'<p class="muted">No months recorded.</p>'}</div></section>`;
}

export function healthDailyCard(state,date,key){
 const month=String(date).slice(0,7),p=healthPeriod(state,{month}),m=p.metrics[key],sleep=key==='sleepHours';
 return `<section class="card today-health-panel today-health-panel--${sleep?'sleep':'steps'}"><div class="card-header today-panel-header"><div><div class="today-panel-eyebrow">${sleep?'☾ NIGHTLY REST':'↗ YOUR STEPS'}</div><h3>${sleep?'Sleep Snapshot':'Steps Snapshot'}</h3><p class="today-panel-description">${sleep?'Average sleeping hours per recorded night':'Monthly walking and movement highlights'}</p></div><button type="button" class="button ghost" data-insight-hub="health">Health ↗</button></div>
 <div class="insight-today-headline">${sleep?formatHealth(key,m.average):(m.total!=null?Math.round(m.total).toLocaleString('en-US'):'—')}</div><div class="insight-today-extremes"><div><span>${sleep?'Longest night':'Best day'}</span><b>${m.best?formatHealth(key,m.best.value):'—'}</b><small>${healthDateText(m.best?.date)}</small></div><div><span>${sleep?'Shortest night':'Lowest recorded day'}</span><b>${m.worst?formatHealth(key,m.worst.value):'—'}</b><small>${healthDateText(m.worst?.date)}</small></div></div><p class="insight-disclaimer">Missing and incomplete dates aren't assumed to be zero.</p></section>`;
}

export function healthReviewMarkup(state,scope={}){
 const report=healthPeriod(state,scope),m=report.metrics,s=m.sleepHours,steps=m.steps,exercise=m.exerciseMinutes,mig=migraineSummary(state,scope);
 return `<section class="insight-review insight-review--health"><div class="insight-review-head"><div><span class="insight-kicker">✧ HEALTH & ACTIVITY</span><h3>${scope.year?'Your wellness year':'Health Month in Review'}</h3><p>Source-backed Health activity and diary migraine dates</p></div><button class="button" type="button" data-insight-hub="health">Explore Health ↗</button></div><div class="insight-review-grid insight-review-grid--six">
 ${healthKpi('Average sleep per night',s.average!=null?formatHealth('sleepHours',s.average):'—',s.days+' recorded nights','primary')}
 ${healthKpi('Longest night',s.best?formatHealth('sleepHours',s.best.value):'—',healthDateText(s.best?.date))}
 ${healthKpi('Best sleep month',s.bestMonth?formatHealth('sleepHours',s.bestMonth.average):'—',healthMonthText(s.bestMonth?.month))}
 ${healthKpi('Total steps',steps.total!=null?Math.round(steps.total).toLocaleString('en-US'):'—',steps.days+' recorded days','good')}
 ${healthKpi('Best step day',steps.best?Math.round(steps.best.value).toLocaleString('en-US'):'—',healthDateText(steps.best?.date))}
 ${healthKpi('Migraine / headache days',String(mig.days),'Distinct diary or manually corrected days')}
 </div><p class="insight-disclaimer">Sleep averages are per recorded night, and a qualifying best/worst sleep month needs at least seven nights. Neither chart imputes missing days.</p></section>`;
}

export function healthLifetimeMarkup(state){
 const m=healthPeriod(state).metrics,mig=migraineSummary(state);
 return `<section class="insight-review insight-review--health"><div class="insight-review-head"><div><span class="insight-kicker">✧ HEALTH HALL OF FAME</span><h3>Lifetime wellness records</h3><p>Best and worst based on recorded evidence since 2018 where available</p></div><button type="button" class="button" data-insight-hub="health">Explore Health ↗</button></div><div class="insight-record-stack">
 ${healthRecord('Highest steps ever',m.steps.best?Math.round(m.steps.best.value).toLocaleString('en-US'):'—',healthDateText(m.steps.best?.date),m.steps.best?.date)}
 ${healthRecord('Lowest recorded steps day',m.steps.worst?Math.round(m.steps.worst.value).toLocaleString('en-US'):'—',healthDateText(m.steps.worst?.date),m.steps.worst?.date)}
 ${healthRecord('Longest measured sleep',m.sleepHours.best?formatHealth('sleepHours',m.sleepHours.best.value):'—',healthDateText(m.sleepHours.best?.date),m.sleepHours.best?.date)}
 ${healthRecord('Shortest measured sleep',m.sleepHours.worst?formatHealth('sleepHours',m.sleepHours.worst.value):'—',healthDateText(m.sleepHours.worst?.date),m.sleepHours.worst?.date)}
 ${healthRecord('Best average-sleep month',m.sleepHours.bestMonth?formatHealth('sleepHours',m.sleepHours.bestMonth.average):'—',healthMonthText(m.sleepHours.bestMonth?.month))}
 ${healthRecord('Lowest average-sleep month',m.sleepHours.worstMonth?formatHealth('sleepHours',m.sleepHours.worstMonth.average):'—',healthMonthText(m.sleepHours.worstMonth?.month))}
 ${healthRecord('Most exercise minutes in one day',m.exerciseMinutes.best?Math.round(m.exerciseMinutes.best.value)+' min':'—',healthDateText(m.exerciseMinutes.best?.date),m.exerciseMinutes.best?.date)}
 ${healthRecord('Largest walking-distance day',m.distanceMiles.best?formatHealth('distanceMiles',m.distanceMiles.best.value):'—',healthDateText(m.distanceMiles.best?.date),m.distanceMiles.best?.date)}
 ${healthRecord('Most migraine/headache days in a month',mig.topMonths[0]?mig.topMonths[0].count+' days':'—',healthMonthText(mig.topMonths[0]?.month))}
 </div><p class="insight-disclaimer">Older years may lack sleep or Apple Watch exercise coverage. Migraine results count dated evidence only, not previous estimated annual totals.</p></section>`;
}

export function healthHubMarkup(state,{tab='overview',period='month',month='2026-11',year=2026}={}){
 const today=new Date().toLocaleDateString('en-CA'),chosenMonth=/^\d{4}-\d{2}$/.test(month)?month:today.slice(0,7),selectedYear=Number(year)||Number(today.slice(0,4));
 const scope=period==='year'?{year:selectedYear}:period==='all'?{}:{month:chosenMonth};
 const report=healthPeriod(state,scope),rows=healthRows(state,scope),m=report.metrics,mig=migraineSummary(state,scope);
 const tabs=[['overview','Overview'],['sleep','Sleep'],['steps','Steps & Distance'],['exercise','Exercise & Rings'],['workouts','Workouts'],['migraines','Migraines']];
 const recorded=healthRows(state).length;
 let body='';
 if(!recorded&&tab!=='migraines')body='<section class="insight-empty-hub"><h3>Connect your private wellness history</h3><p>Import your prepared Apple Health daily JSON in Settings. Missing nights and workouts will stay missing, never zero.</p><button type="button" class="button primary" data-health-import>Import Health data</button></section>';
 else if(tab==='overview'){
  body=`<div class="insight-stat-grid">${healthKpi('Average nightly sleep',m.sleepHours.average!=null?formatHealth('sleepHours',m.sleepHours.average):'—',m.sleepHours.days+' recorded nights','primary')}
  ${healthKpi('Total recorded steps',m.steps.total!=null?Math.round(m.steps.total).toLocaleString('en-US'):'—',m.steps.days+' days','good')}
  ${healthKpi('Exercise time',m.exerciseMinutes.total!=null?Math.round(m.exerciseMinutes.total)+' min':'—',m.exerciseMinutes.days+' recorded days')}
  ${healthKpi('Migraine / headache days',String(mig.days),'Dated diary evidence')}</div>
  <div class="insight-two-col"><section class="insight-surface"><h3>How you've been sleeping</h3>${healthGraph(rows,'sleepHours','Recorded nightly sleep (hours)',{bars:true})}</section><section class="insight-surface"><h3>Steps through your calendar</h3>${healthGraph(rows,'steps','Daily recorded steps',{bars:false})}</section></div>
  <div class="insight-two-col"><section class="insight-surface"><h3>Strongest days</h3><div class="insight-record-stack">${healthRecord('Longest sleep',m.sleepHours.best?formatHealth('sleepHours',m.sleepHours.best.value):'—',healthDateText(m.sleepHours.best?.date),m.sleepHours.best?.date)}${healthRecord('Most steps',m.steps.best?Math.round(m.steps.best.value).toLocaleString('en-US'):'—',healthDateText(m.steps.best?.date),m.steps.best?.date)}${healthRecord('Most exercise',m.exerciseMinutes.best?Math.round(m.exerciseMinutes.best.value)+' min':'—',healthDateText(m.exerciseMinutes.best?.date),m.exerciseMinutes.best?.date)}</div></section><section class="insight-surface"><h3>Weekly patterns · Sunday to Saturday</h3>${healthGraph(weeklyHealth(state,chosenMonth,'steps').map(x=>({...x,date:x.week})), 'total','Steps per recorded week',{bars:true})}<p class="insight-disclaimer">Week totals include available days only.</p></section></div>`;
 }else if(tab==='sleep'){
  const sleep=m.sleepHours;
  body=`<div class="insight-stat-grid">${healthKpi('Average per recorded night',sleep.average!=null?formatHealth('sleepHours',sleep.average):'—',sleep.days+' measured nights','primary')}
   ${healthKpi('Longest night',sleep.best?formatHealth('sleepHours',sleep.best.value):'—',healthDateText(sleep.best?.date),'good')}
   ${healthKpi('Shortest night',sleep.worst?formatHealth('sleepHours',sleep.worst.value):'—',healthDateText(sleep.worst?.date))}
   ${healthKpi('Best month average',sleep.bestMonth?formatHealth('sleepHours',sleep.bestMonth.average):'—',healthMonthText(sleep.bestMonth?.month))}</div>
  <section class="insight-surface"><h3>Night-by-night sleep</h3><p class="insight-subcopy">Sleep assigned to the waking date from recorded sleep stages. In-bed time and awake time excluded.</p>${healthGraph(rows,'sleepHours','Recorded sleep hours per night',{bars:true})}</section>
  <div class="insight-two-col">${healthMonthBars(sleep.months?.map(x=>({...x,value:x.average}))||[],'Average hours per night by month','value')}<section class="insight-surface"><h3>Sleep highlights</h3>${healthRecord('Best night',sleep.best?formatHealth('sleepHours',sleep.best.value):'—',healthDateText(sleep.best?.date),sleep.best?.date)}${healthRecord('Worst night',sleep.worst?formatHealth('sleepHours',sleep.worst.value):'—',healthDateText(sleep.worst?.date),sleep.worst?.date)}${healthRecord('Lowest qualifying month',sleep.worstMonth?formatHealth('sleepHours',sleep.worstMonth.average):'—',healthMonthText(sleep.worstMonth?.month))}<p class="insight-disclaimer">Best and worst months each require at least seven recorded nights.</p></section></div>
  <section class="insight-surface"><h3>Weekly sleep · Sunday to Saturday</h3>${healthGraph(weeklyHealth(state,chosenMonth,'sleepHours').map(x=>({date:x.week,average:x.average})), 'average','Average nightly hours by week',{bars:true})}</section>`;
 }else if(tab==='steps'){
  body=`<div class="insight-stat-grid">${healthKpi('Recorded steps',m.steps.total!=null?Math.round(m.steps.total).toLocaleString('en-US'):'—',m.steps.days+' days','good')}
  ${healthKpi('Most steps in a day',m.steps.best?Math.round(m.steps.best.value).toLocaleString('en-US'):'—',healthDateText(m.steps.best?.date),'primary')}
  ${healthKpi('Lowest recorded day',m.steps.worst?Math.round(m.steps.worst.value).toLocaleString('en-US'):'—',healthDateText(m.steps.worst?.date))}
  ${healthKpi('Walking distance',m.distanceMiles.total!=null?formatHealth('distanceMiles',m.distanceMiles.total):'—','Imported walking and running distance')}</div>
  <section class="insight-surface"><h3>Steps every recorded day</h3>${healthGraph(rows,'steps','Daily step counts',{bars:true})}</section>
  <div class="insight-two-col"><section class="insight-surface"><h3>Distance and movement</h3>${healthGraph(rows,'distanceMiles','Walking and running · miles',{bars:false})}</section><section class="insight-surface"><h3>Weekly walking totals</h3>${healthGraph(weeklyHealth(state,chosenMonth,'steps').map(x=>({date:x.week,total:x.total})), 'total','Sunday–Saturday step weeks',{bars:true})}</section></div>
  ${healthRecord('Most walking in a day',m.distanceMiles.best?formatHealth('distanceMiles',m.distanceMiles.best.value):'—',healthDateText(m.distanceMiles.best?.date),m.distanceMiles.best?.date)}`;
 }else if(tab==='exercise'){
  const ring=report.rings||{};
  body=`<div class="insight-stat-grid">${healthKpi('Exercise minutes',m.exerciseMinutes.total!=null?Math.round(m.exerciseMinutes.total)+' min':'—',m.exerciseMinutes.days+' recorded days','primary')}
  ${healthKpi('Standing time',m.standMinutes.total!=null?Math.round(m.standMinutes.total)+' min':'—',m.standMinutes.days+' days')}
  ${healthKpi('Active calories',m.activeCalories.total!=null?Math.round(m.activeCalories.total).toLocaleString('en-US')+' kcal':'—',m.activeCalories.days+' recorded days')}
  ${healthKpi('Exercise rings completed',String(ring.exerciseGoalMet?.closedDays??0),`Of ${ring.exerciseGoalMet?.recordedDays??0} days with known exercise goals`,'good')}</div>
  <div class="insight-two-col"><section class="insight-surface"><h3>Exercise every day</h3>${healthGraph(rows,'exerciseMinutes','Daily exercise minutes',{bars:true})}</section><section class="insight-surface"><h3>Active energy</h3>${healthGraph(rows,'activeCalories','Active calories',{bars:false})}</section></div>
  <section class="insight-surface"><h3>Move / Exercise / Stand Rings</h3><div class="insight-ring-grid">${[['Move','moveGoalMet'],['Exercise','exerciseGoalMet'],['Stand','standGoalMet']].map(([name,k])=>`<div><span>${name}</span><strong>${ring[k]?.closedDays??0}</strong><small>Completed days of ${ring[k]?.recordedDays??0} with goals</small></div>`).join('')}</div><p class="insight-disclaimer">Goals come from Apple Health activity summaries. No ring is marked closed if its goal is unknown.</p></section>`;
 }else if(tab==='workouts'){
  const workouts=rows.filter(x=>Number(x.workouts)>0),types=new Map();for(const d of workouts)for(const [type,num] of Object.entries(d.workoutTypes||{}))types.set(type,(types.get(type)||0)+Number(num));
  body=`<div class="insight-stat-grid">${healthKpi('Recorded workouts',m.workouts.total!=null?Math.round(m.workouts.total):'—',m.workouts.days+' days with workouts','primary')}
  ${healthKpi('Workout duration',m.workoutMinutes.total!=null?Math.round(m.workoutMinutes.total)+' min':'—','Sum of recorded workout minutes','good')}
  ${healthKpi('Longest workout day',m.workoutMinutes.best?Math.round(m.workoutMinutes.best.value)+' min':'—',healthDateText(m.workoutMinutes.best?.date))}</div>
  <div class="insight-two-col"><section class="insight-surface"><h3>Minutes spent working out</h3>${healthGraph(rows,'workoutMinutes','Recorded workout minutes',{bars:true})}</section><section class="insight-surface"><h3>Workout types</h3>${[...types].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([name,count])=>`<div class="insight-charge"><b>${healthEsc(name.replace(/([a-z])([A-Z])/g,'$1 $2'))}</b><strong>${count} workouts</strong></div>`).join('')||'<p class="muted">No recorded workouts for this period.</p>'}</section></div>`;
 }else{
  const all=migraineSummary(state),migraines=mig.rows;
  const p=mig.seasonal,percentage=v=>v==null?'—':(v*100).toFixed(1)+'%';
  body=`<div class="insight-stat-grid">${healthKpi('Symptom days',String(mig.days),'Confirmed from dated diary or tracker corrections','primary')}
  ${healthKpi('Migraine mentions',String(mig.types.migraine),'Distinct days, not mentions')}
  ${healthKpi('Headache-only days',String(mig.types.headache),'Distinct dated diary reports')}
  ${healthKpi('Last reported day',mig.lastDate?healthDateText(mig.lastDate):'—','Not proof of symptom-free days')}</div>
  <div class="insight-two-col">${healthMonthBars(mig.topMonths.slice(0,8).sort((a,b)=>a.month.localeCompare(b.month)),'Most reported migraine / headache months','count')}
  <section class="insight-surface"><h3>Seasonal symptom comparison</h3><div class="insight-season-pairs"><div><span>September – December 15</span><strong>${percentage(p.fallRate)}</strong><small>${p.fallDays} days / ${p.fallLoggedDays} diary days</small></div><div><span>Rest of year</span><strong>${percentage(p.restRate)}</strong><small>${p.restDays} days / ${p.restLoggedDays} diary days</small></div></div><p class="insight-disclaimer">${p.ratio!=null?`${p.ratio}× rate in the autumn window. `:''}Rates compare days with diary entries. Patterns are associations, not proven causes.</p></section></div>
  <div class="insight-two-col"><section class="insight-surface"><h3>School days vs No-school days</h3><div class="insight-season-pairs">${[['Explicit class days',mig.school.classDays,mig.school.classSymptomDays],['Explicit no-school days',mig.school.noSchoolDays,mig.school.noSchoolSymptomDays]].map(([label,total,symptom])=>`<div><span>${healthEsc(label)}</span><strong>${total?((symptom/total)*100).toFixed(1)+'%':'—'}</strong><small>${symptom} symptoms / ${total} clearly labeled days</small></div>`).join('')}</div><p class="insight-disclaimer">Only days explicitly labeled in your diary are classified.</p></section>
  <section class="insight-surface"><h3>Home alone vs with others</h3><div class="insight-season-pairs">${[['Explicit home-alone days',mig.homeAlone.aloneDays,mig.homeAlone.aloneSymptomDays],['Explicit not-alone days',mig.homeAlone.notAloneDays,mig.homeAlone.notAloneSymptomDays]].map(([label,total,symptom])=>`<div><span>${healthEsc(label)}</span><strong>${total?((symptom/total)*100).toFixed(1)+'%':'—'}</strong><small>${symptom} symptoms / ${total} labeled days</small></div>`).join('')}</div><p class="insight-disclaimer">Insufficient observations cannot establish a relationship.</p></section></div>
  <section class="insight-surface"><h3>Sleep versus reported symptom days</h3><div class="insight-season-pairs"><div><span>Nights on migraine / headache dates</span><strong>${mig.sleep.averageSymptomNight??'—'} h</strong><small>${mig.sleep.pairedSymptomNights} paired recorded nights</small></div><div><span>Nights without dated symptoms</span><strong>${mig.sleep.averageOtherNight??'—'} h</strong><small>${mig.sleep.pairedOtherNights} recorded nights</small></div></div><p class="insight-disclaimer">Same-date sleep comparisons are descriptive and not proof sleep caused or prevented a migraine.</p></section>
  <section class="insight-surface"><h3>Every dated symptom record</h3><div class="insight-migraine-log">${migraines.slice().reverse().slice(0,160).map(r=>`<div class="insight-migraine-row"><span>${healthDateText(r.date)}</span><b>${r.kind==='migraine'?'Migraine':'Headache'}</b><small>${healthEsc(r.detail)}</small>${healthDayLink(r)}</div>`).join('')||'<p>No dated symptom evidence in the current period.</p>'}</div><p class="insight-disclaimer">Legacy estimated annual totals are retained elsewhere but not added as confirmed dated migraine days. The original historical infographic is a reference, not a live clinical diagnosis.</p></section>`;
 }
 const tabMarkup=tabs.map(([id,label])=>`<button type="button" data-health-tab="${id}" aria-selected="${tab===id}" class="insight-tab ${tab===id?'active':''}">${label}</button>`).join('');
 return `<div class="insight-hub insight-hub--health"><div class="insight-hero"><div><span class="insight-kicker">✧ T.I.D.E. HEALTH · PRIVATE</span><h2>Know the rhythm <em>of your life.</em></h2><p>Explore every recorded night, daily steps, workouts, activity rings and diary-based migraine patterns, with missing data shown honestly.</p></div><div class="insight-hero-art">✧</div></div>
 <div class="insight-status"><i class="${recorded?'ready':''}"></i><strong>${recorded?'HEALTH HISTORY IMPORTED':'IMPORT NEEDED'}</strong><span>${recorded} dated Health days · ${healthEsc(state.healthActivity?.source||'No Apple Health file imported')}</span><b>MANUAL IMPORT · NOT LIVE SYNC</b></div>
 <div class="insight-toolbar"><div class="insight-segment">${[['month','Month'],['year','Year'],['all','All Time']].map(([k,label])=>`<button type="button" data-health-period="${k}" class="${period===k?'active':''}">${label}</button>`).join('')}</div>
 ${period==='month'?`<label>Month <input class="input" type="month" id="health-month" value="${chosenMonth}"></label>`:period==='year'?`<label>Year <select class="select" id="health-year">${Array.from({length:Math.max(9,Number(today.slice(0,4))-2017)},(_,i)=>2018+i).map(y=>`<option value="${y}" ${selectedYear===y?'selected':''}>${y}</option>`).join('')}</select></label>`:'<span>All imported history since 2018</span>'}
 <button type="button" class="button" data-health-import>Import new Apple Health history ↗</button></div>
 <div class="insight-tabs" role="tablist" aria-label="Health exploration">${tabMarkup}</div><div class="insight-hub-body">${body}</div>
 <p class="insight-disclaimer">Apple Health data currently enters T.I.D.E. through private owner imports. This website does not directly read your Apple Watch or your ChatGPT Health connection. Missing recordings are not assumed to mean zero sleep, steps or exercise.</p></div>`;
}
