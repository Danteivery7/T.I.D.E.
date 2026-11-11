import { MONTHS, askTide, trackerFromQuestion, activityStats, dateLabel, monthLabel, splitEvents, daySummary, loggingStreak } from './engine.js';
import { DIARY_SIGNALS, diarySignals } from './diary-insights.js';
import { aggregateAllTime, activityRange, allTimeTotal, gaming, gamingRecordHighlights, hours, platformLabel, keyTitle } from './gaming-data.js';

const ASK_STOP = new Set('a an the i me my mine myself we our is are was were did do does have has had can could would should tell show find give get what when where why who which how much many often did do something anything about with from for since into across at on to in of by and or it this that those these there then be been being most least last first time times day days month months year years all ever please info information records record list any every life daily yesterday today recently recent things thing name number count am'.split(' '));
const ASK_GAME_ALIASES = {'Grand Theft Auto V':['gta 5','gta v','gtav','gta online','grand theft auto 5'],'The Crew Motorfest':['crew motorfest','motorfest'],'The Crew 2':['crew 2','the crew ii'],'Super Mario Odyssey':['mario odyssey'],'Rocket League':['rocket league'],'Minecraft':['minecraft'],'College Football 25':['cfb25','cfb 25','college football 25'],'NBA 2K25':['2k25','nba2k25']};
const ASK_TOPIC_ALIASES={creative:/\b(edit(?:ed|ing|s)?|videos?|thumbnails?|youtube channel|content creation|content|filmed|filming)\b/i,learning:/\b(school|class|classes|college|graduation|graduate|learning|studying|lecture|homework|assignment|coursework|education)\b/i,business:/\b(work|working|job|business|company|client|sponsor|sponsorship|llc)\b/i,social:/\b(friends?|family|social|calls?|discord|facetime|hang(?:out|ing out)|dylan|carter|jaxson|talked to|spoke to)\b/i,sports:/\b(sports?|yankees|knicks|giants|nascar|football|baseball|basketball|hockey|soccer|olympics?|rangers|world series|playoffs?)\b/i,outings:/\b(travel|traveled|trip|outings?|visited|went out|beach|shopping|restaurant|vacation|where.*went)\b/i,money:/\b(money|spent|spending|bought|purchase|paid|refund|earned|income|balance|budget|financial|finance|paycheck|cash|transactions?|subscriptions?|credit card|bills?)\b|\$/i,wellness:/\b(health|wellness|sleep|slept|headache|migraine|sick|gym|exercise|workout|doctor|pain)\b/i,pets:/\b(pets?|samba|dogs?|cats?|stan|puppy)\b/i};
function askDateValid(x){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const d=new Date(x+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===x;
}

function askShiftDate(x,n){
  const d=new Date(x+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}

function askScope(q,{today=new Date().toLocaleDateString('en-CA'),selectedDate=today}={}){
  const lower=String(q||'').toLowerCase();
  let date='',month='',year=null;let rangeStart='',rangeEnd='',label='';
  const iso=lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/),us=lower.match(/\b(0?[1-9]|1[0-2])\/([0-3]?\d)\/(20\d{2})\b/);
  if(iso)date=iso[1];
  else if(us)date=`${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;
  else{
    const monthRe=MONTHS.map((m,i)=>({name:m.toLowerCase(),abbr:m.slice(0,3).toLowerCase(),i}));
    const alias='(?:'+monthRe.map(m=>`${m.name}|${m.abbr}`).join('|')+')';
    const forward=lower.match(new RegExp(`\\b(${alias})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,'i'));
    const reverse=lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${alias})(?:,?\\s*(20\\d{2}))?\\b`,'i'));
    if(forward||reverse){
      const m=forward?forward[1]:reverse[2],day=forward?forward[2]:reverse[1],yr=forward?forward[3]:reverse[3];
      const mi=monthRe.find(x=>x.name===m||x.abbr===m)?.i;
      if(mi!=null)date=`${yr||selectedDate.slice(0,4)}-${String(mi+1).padStart(2,'0')}-${String(Number(day)).padStart(2,'0')}`;
    }
  }
  if(!date&&/\byesterday\b/.test(lower))date=askShiftDate(today,-1);
  if(!date&&/\b(today|on this day)\b/.test(lower))date=/\bon this day\b/.test(lower)?selectedDate:today;
  if(date&&!askDateValid(date))date='';
  const yMatch=lower.match(/\b(20\d{2})\b/);
  if(!date){
    if(/\blast month\b/.test(lower)){const d=new Date(today.slice(0,7)+'-15T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);month=d.toISOString().slice(0,7)}
    else if(/\bthis month\b/.test(lower))month=today.slice(0,7);
    else{
      const m=MONTHS.findIndex(n=>new RegExp(`\\b${n.slice(0,3)}(?:${n.slice(3)})?\\b`,'i').test(lower));
      if(m>=0)month=`${yMatch?.[1]||today.slice(0,4)}-${String(m+1).padStart(2,'0')}`;
    }
    if(!month){
      if(/\blast year\b/.test(lower))year=Number(today.slice(0,4))-1;
      else if(/\bthis year\b/.test(lower))year=Number(today.slice(0,4));
      else if(yMatch)year=Number(yMatch[1]);
    }
  }
  if(date){rangeStart=rangeEnd=date;label=date;}
  else if(month){const [y,m]=month.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();rangeStart=month+'-01';rangeEnd=month+'-'+String(last).padStart(2,'0');label=monthLabel(month)}
  else if(year){rangeStart=`${year}-01-01`;rangeEnd=`${year}-12-31`;label=String(year)}
  else {rangeStart='0000-01-01';rangeEnd=today;label='all time'}
  return {date,month,year,start:rangeStart,end:rangeEnd,label,all:!date&&!month&&!year};
}

function askTokens(q){
  return [...new Set(String(q||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).map(x=>x.endsWith('ies')&&x.length>5?x.slice(0,-3)+'y':x.endsWith('ing')&&x.length>6?x.slice(0,-3):x.endsWith('ed')&&x.length>5?x.slice(0,-2):x).filter(x=>x.length>2&&!ASK_STOP.has(x)&&!/^20\d{2}$/.test(x)))];
}

function askRow(date,meta,source='Diary',extra={}){
  return {date,label:date,meta,source,...extra};
}

function askDateRows(state,scope){
  return Object.entries(state?.entries||{}).filter(([d,e])=>askDateValid(d)&&e?.text?.trim()&&d>=scope.start&&d<=scope.end).sort(([a],[b])=>b.localeCompare(a));
}

function askGameMatch(question,games){
  const s=String(question||'').toLowerCase();
  const sorted=[...(games||[])].sort((a,b)=>b.title.length-a.title.length);
  for(const g of sorted){
    const aliases=[g.title.toLowerCase(),...(ASK_GAME_ALIASES[g.title]||[])];
    for(const alias of aliases){
      const normalized=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp(`(?:^|[^a-z0-9])${normalized}(?=$|[^a-z0-9])`,'i').test(s))return g;
    }
  }
  return null;
}

function askGameDiaryMatches(state,scope,games){
  const rows=[];
  for(const [date,entry] of askDateRows(state,scope)){
    const parts=splitEvents(entry.text),matches=[];
    for(const part of parts){
      if(!/\b(play(?:ed|ing)?|launch(?:ed)?|logged onto|booted up|grinded)\b/i.test(part)||/\bwatched\b/i.test(part))continue;
      const matched=askGameMatch(part,games);
      if(matched)matches.push(matched.title);
    }
    if(matches.length)rows.push({date,titles:[...new Set(matches)],snippet:parts.find(part=>matches.some(name=>part.toLowerCase().includes(name.toLowerCase())))||''});
  }
  return rows;
}

function askMoneyNotice(state,scope,query){
  const signal=DIARY_SIGNALS.find(x=>x.id==='money'),rows=askDateRows(state,scope).flatMap(([date,entry])=>{
    const s=splitEvents(entry.text).filter(seg=>signal.pattern.test(seg)&&!/\b(?:no|not|never|without)\s+(?:purchases?|payments?|spending|income)\b/i.test(seg));
    return s.slice(0,2).map(seg=>askRow(date,seg,'Diary note'));
  });
  const finance=/\b(balance|bank|account|afford|budget|spent|spending|earnings?|income|monthly expenses|profit|net worth|total money|how much money)\b/i.test(query);
  return{kind:'money',heading:finance?'Financial records are not connected here':`${rows.length} money-related diary note${rows.length===1?'':'s'}`,primary:finance?'No verified financial total available':`${new Set(rows.map(r=>r.date)).size} diary days`,detail:finance?'T.I.D.E. can locate mentions of purchases, refunds and payments, but it cannot verify your current balance, actual expenses, earnings, or Budget Tracker figures.':'These are diary mentions, not bank transactions or spending totals.',items:rows.slice(0,60),source:'Your saved diary · mentions only',confidence:'Diary evidence',followups:['Show money-related diary entries this month','What did I write about purchases in 2026?']};
}

function askGameAnswer(state,question,scope,{selectedDate}={}){
  const q=String(question).toLowerCase();
  const games=aggregateAllTime('all'),game=askGameMatch(question,games);
  const wantsWhen=/(last|most recent|first|when.*play|how long ago)/.test(q);
  const wantsDates=/\b(what|which|show|list|when|did i)\b.*\b(days?|dates?|play(?:ed)?)\b/.test(q)||!!scope.date;
  const asksHours=/(hours?|minutes?|playtime|how long|time spent)/.test(q);
  const topN=Math.min(25,Math.max(1,Number(q.match(/\btop\s+(\d+)/)?.[1]||5)));
  if(game&&/\b(diary|mention(?:ed)?|wrote|which days|what days)\b/.test(q)){
    const entries=askGameDiaryMatches(state,scope,games).filter(row=>row.titles.some(t=>keyTitle(t)===game.key));
    const recent=entries[0],wantsLast=/\b(last|latest|most recent)\b/.test(q);
    return{kind:'game',heading:`Diary mentions · ${game.title}`,primary:wantsLast?(recent?.date||'No dated diary mention'):`${entries.length} day${entries.length===1?'':'s'} found`,detail:'These are diary passages explicitly mentioning playing this game. They are not independently verified sessions.',items:entries.slice(0,70).map(e=>askRow(e.date,e.snippet,'Diary mention')),date:wantsLast?recent?.date:'',source:'Your diary',followups:[`When did I last play ${game.title}?`]};
  }
  if(game&&wantsWhen){
    const matches=games.find(g=>g.key===game.key);
    const last=matches?.lastPlayed||'';
    const sources=(matches?.sources||[]).filter(s=>s.lastPlayed).sort((a,b)=>String(b.lastPlayed).localeCompare(String(a.lastPlayed)));
    return{kind:'game',heading:`Last played · ${game.title}`,primary:last||'No reported last-played date',detail:last?`${game.title} was last reported played on ${last}. This is the date provided by the gaming source, not a T.I.D.E. session timer.`:'The linked sources do not provide a last-played date for this title.',items:sources.slice(0,12).map(s=>({label:platformLabel(s.platform),meta:`Last reported ${s.lastPlayed} · ${hours(s.minutes||0)} lifetime` ,source:'Gaming account'})),source:'Connected gaming sources',followups:[`How many hours have I played ${game.title}?`,`When did I mention playing ${game.title} in my diary?`]};
  }
  const activity=scope.date?activityRange(scope.date,scope.date):scope.all?null:activityRange(scope.start,scope.end);
  if(scope.date){
    const date=scope.date,tracked=(activity?.games||[]).filter(g=>g.minutes>0).sort((a,b)=>b.minutes-a.minutes);
    const diary=askGameDiaryMatches(state,scope,games);
    const items=[...tracked.map(g=>({date,label:g.title,meta:`${hours(g.minutes)} · detected playtime change`,source:'Gaming snapshot'}))];
    for(const d of diary)for(const title of d.titles)if(!items.some(x=>x.label===title))items.push({date,label:title,meta:d.snippet||'Mentioned in diary',source:'Diary mention'});
    return{kind:'game',heading:`Gaming on ${date}`,primary:items.length?`${items.length} game${items.length===1?'':'s'} found`:'No dated gaming record found',detail:items.length?'T.I.D.E. combines gaming snapshot changes with explicit “played” notes from your diary. Snapshot minutes may include delayed reporting, not hours actually played that calendar day.':'That date has no matching recorded gaming changes or recognizable played-game mentions. This is not proof no gaming happened.',items,source:'Gaming snapshots + diary',followups:[`What happened on ${date}?`,'What is my most played game of all time?']};
  }
  if(game){
    const mins=scope.all?game.minutes:(activity?.games||[]).find(g=>g.key===game.key)?.minutes||0;
    const covered=scope.all?'All-time known hours':`Recorded ${scope.label} playtime`;
    return{kind:'game',heading:`${game.title} · ${covered}`,primary:hours(mins),detail:scope.all?'Known playtime aggregated across available platform sources.':'Only tracked and explicitly recovered playtime is assigned to this period; undated historical hours are not invented.',items:scope.all?Object.entries(game.platformMinutes||{}).sort((a,b)=>b[1]-a[1]).map(([platform,n])=>({label:platformLabel(platform),meta:hours(n),source:'Gaming account'})):[],source:scope.all?'Gaming account totals':'Dated / recovered gaming data',followups:[`When did I last play ${game.title}?`,`What games did I play in ${scope.label}?`]};
  }
  if(/last.*played|recent.*game/.test(q)&&scope.all){
    const recent=games.filter(x=>x.lastPlayed).sort((a,b)=>b.lastPlayed.localeCompare(a.lastPlayed));
    return{kind:'game',heading:'Most recently played games',primary:recent[0]?.title||'No last-played history',detail:recent[0]?`Latest reported date: ${recent[0].lastPlayed}. Based on source-provided last-played dates.`:'No linked game has a reported last-played date.',items:recent.slice(0,topN).map(g=>({label:g.title,meta:`Last reported ${g.lastPlayed} · ${hours(g.minutes)} lifetime`,source:'Gaming account'})),source:'Gaming source last-played dates'};
  }
  const ranked=(scope.all?games:activity?.games||[]).slice().sort((a,b)=>b.minutes-a.minutes).filter(x=>x.minutes>0);
  const total=scope.all?allTimeTotal('all'):activity?.total||0;
  const label=scope.all?'all time':scope.label;
  if(asksHours&&/\b(total|all|overall|how many)\b/.test(q))return{kind:'game',heading:`Gaming hours · ${label}`,primary:hours(total),detail:scope.all?'Lifetime known playtime includes historical totals.':'These minutes cover tracked and recovered data, not guessed historical playtime.',items:ranked.slice(0,5).map(x=>({label:x.title,meta:hours(x.minutes),source:'Gaming source'})),source:'Gaming data'};
  return{kind:'game',heading:`Most played games · ${label}`,primary:ranked[0]?.title||'No games recorded',detail:ranked[0]?`${hours(ranked[0].minutes)} known playtime for the leading game. ${scope.all?'Lifetime totals are used.':'Period totals are based on dated and recovered records only.'}`:'No gaming minutes are attributed to this period, which may reflect incomplete historical coverage.',items:ranked.slice(0,topN).map((g,i)=>({label:`#${i+1} ${g.title}`,meta:hours(g.minutes),source:'Gaming data'})),source:scope.all?'All-time gaming account totals':'Dated gaming snapshots and recovered monthly history'};
}

function askDiaryTopic(state,topic,question,scope){
  const category=DIARY_SIGNALS.find(x=>x.id===topic);if(!category)return null;
  const rows=askDateRows(state,scope);
  const matches=[];
  for(const [date,entry] of rows){
    const seg=splitEvents(entry.text).find(e=>category.pattern.test(e)&&!/\b(?:no|never|without)\s+(?:purchases?|payments?|spending|income)\b/i.test(e));
    if(seg)matches.push(askRow(date,seg,'Diary mention'));
  }
  const wantLast=/\b(last|recent|latest|most recent|when did i last)\b/i.test(question);
  const wantFirst=/\b(first|earliest)\b/i.test(question);
  const pick=wantLast?matches[0]:wantFirst?matches.at(-1):null;
  const countDays=matches.length,meta=`${countDays} distinct diary day${countDays===1?'':'s'} mentioning ${category.short.toLowerCase()} in ${scope.label}.`;
  if(pick)return{kind:'diary',heading:`${wantFirst?'Earliest':'Most recent'} ${category.short.toLowerCase()} mention`,primary:pick.date,detail:pick.meta,items:[pick],date:pick.date,source:'Your diary · word-pattern match',followups:[`Show all ${category.short.toLowerCase()} diary days in ${scope.label}`]};
  return{kind:'diary',heading:`${category.label} · ${scope.label}`,primary:`${countDays} day${countDays===1?'':'s'}`,detail:countDays?meta+' Results below show the matching diary passage; counts do not prove activities happened exactly as phrased.':`No recognizable ${category.short.toLowerCase()} mentions in your saved diary for this period.`,items:matches.slice(0,90),source:'Your saved diary',followups:[`What was my most active diary day in ${scope.label}?`]};
}

function askPeopleAnswer(state,question,scope){
  const text=String(question||''),lower=text.toLowerCase(),dates=askDateRows(state,scope);
  const patterns=[
    /\b(?:spoke (?:to|with)|talked (?:to|with)|called|facetimed|face timed|texted|hung out with|played with|went with|visited with|chatted with|on (?:a )?call with|with)\s+([A-Z][a-z]{2,})(?:\s+(?:and|&)\s+([A-Z][a-z]{2,}))?/gi
  ];
  const reject=new Set(['The','And','My','His','Her','Our','Mom','Dad','Family','Friends','Everyone','Someone','World','Xbox','Playstation','Nintendo','Steam','Discord','Tide','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Today','Yesterday','Youtube','Yankees','Knicks','Giants','Nfl','Nba','MlB','GeoGuessr','Geo','Man','City','Game','Month','Year','September','October','November','December','January','February','March','April','May','June','July','August','Walmart','Costco','Publix','Home','Work']);
  const perName=new Map();
  for(const [date,entry] of dates){
    const seen=new Set();
    for(const snippet of splitEvents(entry.text)){
      for(const p of patterns){p.lastIndex=0;let found;while((found=p.exec(snippet))!==null){
        for(const name of [found[1],found[2]].filter(Boolean)){
          if(!/^[A-Z]/.test(name)||reject.has(name)||name.length<3)continue;
          const key=name.toLowerCase();
          if(seen.has(key))continue;seen.add(key);
          const row=perName.get(key)||{name,days:[],example:''};
          row.days.push({date,snippet});row.example=snippet;perName.set(key,row);
        }
      }}
    }
  }
  const ranking=[...perName.values()].sort((a,b)=>b.days.length-a.days.length||a.name.localeCompare(b.name));
  if(!ranking.length)return null;
  const focused=ranking.find(row=>new RegExp(`(?:^|[^a-z])${row.name.toLowerCase()}(?:$|[^a-z])`).test(lower));
  const asksWho=/\b(who|which (?:friend|person|people)|most (?:social|spoken|talked|called))\b/.test(lower);
  if(!focused&&!asksWho)return null;
  const last=/\b(last|latest|most recent)\b/.test(lower),first=/\b(first|earliest)\b/.test(lower);
  if(focused){
    const timeline=focused.days.slice().sort((a,b)=>last?b.date.localeCompare(a.date):first?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
    const row=timeline[0];
    return{kind:'social',heading:`Diary mentions · ${focused.name}`,primary:(last||first)?row?.date:`${focused.days.length} days mentioned`,detail:`T.I.D.E. found diary entries with ${focused.name} next to social language. This is a count of recorded mentions, not verified time spent together.`,items:timeline.slice(0,80).map(item=>askRow(item.date,item.snippet,'Diary mention')),date:last||first?row?.date:'',source:'Your diary · name matches',followups:[`When did I last mention ${focused.name}?`]};
  }
  return{kind:'social',heading:'People in your diary',primary:ranking[0]?ranking[0].name:'No matching names',detail:'Names found near social verbs such as “with,” “called,” or “FaceTimed.” Counts are distinct diary days with matching language, not a complete record of relationships.',items:ranking.slice(0,30).map(row=>({label:row.name,meta:`${row.days.length} diary day${row.days.length===1?'':'s'} · Latest ${row.days.map(x=>x.date).sort().at(-1)}`,source:'Diary text'})),source:'Diary · detected names',followups:['What did I do with friends this month?']};
}

function askDiarySearch(state,question,scope){
  const quote=String(question).match(/["“]([^"”]{3,})["”]/)?.[1]||'';
  const qTokens=askTokens(quote||question); const found=[];
  if(!qTokens.length)return null;
  for(const [date,entry] of askDateRows(state,scope)){
    const snippets=splitEvents(entry.text).map(s=>{
      const lower=s.toLowerCase();const toks=qTokens.filter(t=>lower.includes(t));
      const strict=quote&&lower.includes(quote.toLowerCase());
      return{snippet:s,points:(strict?8:0)+toks.length*2+((toks.length===qTokens.length)?5:0)};
    }).filter(x=>x.points>0).sort((a,b)=>b.points-a.points);
    if(snippets.length){
      const top=snippets[0];
      if(quote&&!top.snippet.toLowerCase().includes(quote.toLowerCase()))continue;
      found.push({date,score:top.points,snippet:top.snippet});
    }
  }
  found.sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date));
  const last=/\b(last time|last|most recent|latest)\b/i.test(question)&&!/most common/.test(question);
  const first=/\b(first time|earliest)\b/i.test(question);
  if(last||first)found.sort((a,b)=>last?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
  const top=found[0];
  return{kind:'search',heading:quote?`Searching for “${quote}”`:`Diary search · ${scope.label}`,primary:top&& (last||first)?top.date:`${found.length} matching day${found.length===1?'':'s'}`,detail:top?`Matches are based on relevant words and phrases from your saved diary${last||first?'. Most relevant date shown first.':'. Results are ranked by matching language and date.'}`:'No matching saved diary entry was found. Try using a person, game, place, event, or phrase from your notes.',items:found.slice(0,90).map(x=>askRow(x.date,x.snippet,'Diary text')),source:'Diary text search',date:(last||first)?top?.date:''};
}

function askLifeOverview(state,scope){
  const insights=diarySignals(state,scope),activities=activityStats(state,scope.month?{month:scope.month}:scope.year?{year:scope.year}:{});
  const recent=insights.milestones.slice(0,5);
  const items=insights.ranked.filter(c=>c.days>0).slice(0,7).map(c=>({label:c.label,meta:`${c.days} distinct diary day${c.days===1?'':'s'} with a mention`,source:'Diary patterns'}));
  items.push(...recent.map(x=>askRow(x.date,x.snippet,'Possible milestone')));
  const top=activities.counts?.[0];
  return{kind:'life',heading:`Your life · ${scope.label}`,primary:`${insights.loggedDays} diary days`,detail:`${top?`Most frequently recognized activity: ${top[0]} (${top[1]} events). `:''}The categories below come from words in your diary. Possible milestones are clues to review, not independently verified achievements.`,items,source:'Your T.I.D.E. diary',followups:[`What happened on my most varied day in ${scope.label}?`,`What did I write about money in ${scope.label}?`,`What games did I play in ${scope.label}?`]};
}

function askDateStory(state,scope,question){
  const date=scope.date;const text=state?.entries?.[date]?.text||'';
  if(!text)return{kind:'diary',heading:`Diary · ${date}`,primary:'No saved diary entry',detail:'There is no diary entry saved for that date. You can still check game-account changes separately.',items:[],source:'Your diary',followups:[`What games did I play on ${date}?`]};
  const events=splitEvents(text);
  return{kind:'diary',heading:`Your day · ${date}`,primary:`${events.length} recorded event${events.length===1?'':'s'}`,detail:daySummary(text),items:events.slice(0,90).map(s=>({date,label:s,meta:'Saved diary note',source:'Diary'})),date,source:'Your diary · dated events',followups:[`What games did I play on ${date}?`,`What did I write about money on ${date}?`]};
}

function askMusicIntent(q){
  return /\b(music|song|songs|track|tracks|artist|artists|album|albums|listen|listened|spotify|stats\.?fm|streamed|streams)\b/i.test(q);
}

function askMusicAnswer(question,scope,data){
  const lower=question.toLowerCase();
  const category=/\balbums?\b/.test(lower)?'albums':/\bartists?\b/.test(lower)?'artists':/\b(songs?|tracks?)\b/.test(lower)?'songs':'';
  const selected=category?[category]:['songs','artists','albums'];
  const list=selected.flatMap(cat=>(data?.[cat]||[]).map(item=>({...item,cat})));
  const items=category?list.map(x=>({label:x.name,meta:`${x.artist||x.album||x.cat} · ${x.streams.toLocaleString('en-US')} streams`,image:x.image,source:'stats.fm'})):selected.map(cat=>{const first=data?.[cat]?.[0];return{label:`${cat==='songs'?'Top Song':cat==='artists'?'Top Artist':'Top Album'} · ${first?.name||'No data'}`,meta:first?`${first.streams.toLocaleString('en-US')} streams`:'No streams returned',image:first?.image||'',source:'stats.fm'}});
  const winner=list[0];
  return{kind:'music',heading:`Your listening · ${scope.label}`,primary:category?(winner?.name||'No results'):'Top songs, artists & albums',detail:category&&winner?`${winner.streams.toLocaleString('en-US')} streams · Ranked from actual stats.fm listening data.`:'Winners shown for the chosen period using available actual stats.fm streams, not diary guesses.',items,source:'stats.fm · actual streams',followups:['What was my top song this year?','Who is my top artist all time?']};
}

function answerAsk(state,question,{today,selectedDate,musicData=null}={}){
  const q=String(question||'').trim(),now=today||new Date().toLocaleDateString('en-CA'),scope=askScope(q,{today:now,selectedDate:selectedDate||now}),lower=q.toLowerCase();
  if(!q)return{kind:'help',heading:'Ask about your history',primary:'What would you like to explore?',detail:'Try a game, date, activity, song, person, life event, or money-related diary note. T.I.D.E. searches saved data; it does not make up missing information.',items:[],source:'Local T.I.D.E. search'};
  if(askMusicIntent(q))return musicData?askMusicAnswer(q,scope,musicData):{kind:'music-needed',scope,source:'stats.fm'};
  const gameList=aggregateAllTime('all'),game=askGameMatch(q,gameList);
  const gameIntent=!!game||/\b(games?|gaming|playtime|ps4|ps5|nintendo|switch|steam|xbox|console|play|playing|played)\b/i.test(q)&&!/played.*(?:sports|basketball|volleyball|football|baseball)/i.test(q);
  const money=ASK_TOPIC_ALIASES.money.test(q);
  const moneyTimeQuestion=/\b(spend|spent)\s+(?:time|hours?|minutes?)\s+(?:play|gaming)|\btime\s+spent\s+(?:gaming|play)/i.test(q);
  if(money&&!moneyTimeQuestion&&(/\b(how much|budget|balance|afford|account|income|spent|spending|payment|subscription|money)\b/i.test(q)||!/game/.test(q)))return askMoneyNotice(state,scope,q);
  const summary=/\b(about my life|summari[sz]e|overview|recap|highlights?|what.*(?:did i do|happened|been doing)|how was my|tell me about my|my life|my year|my month)\b/i.test(q);
  if(gameIntent && (!scope.date||/\b(gam(?:e|ing)|play(?:ed|ing)?|console)\b/i.test(q)))return askGameAnswer(state,q,scope,{selectedDate});
  if(scope.date&&/what (?:did|happened|was)|tell me about|describe|how was|on this day|my day|that day/.test(lower))return askDateStory(state,scope,q);
  const tracker=trackerFromQuestion(state,q);
  if(tracker||/\bmonty\b|daily challenge|geo(?:guessr)? 10k|hong kong|mors mutual|migraine streak/.test(lower)){
    const a=askTide(state,q);
    return{...a,kind:'tracker',heading:tracker?.name||'Tracked record',source:'T.I.D.E. tracker history',items:a?.items||[]};
  }
  if(/\b(best|worst)\s+(day|month)|why.*best|why.*worst|most edit(?:ed|ing)/.test(lower)){
    const a=askTide(state,q);
    return{...a,kind:'diary',heading:'Your saved personal picks',source:'Your diary and review picks',items:a?.items||[]};
  }
  const people=askPeopleAnswer(state,q,scope);
  if(people)return people;
  const topic=Object.keys(ASK_TOPIC_ALIASES).find(id=>id!=='money'&&ASK_TOPIC_ALIASES[id].test(q));
  if(topic)return askDiaryTopic(state,topic,q,scope);
  if(summary||!askTokens(q).length)return scope.date?askDateStory(state,scope,q):askLifeOverview(state,scope);
  const searched=askDiarySearch(state,q,scope);
  if(searched?.items?.length)return searched;
  if(scope.date)return askDateStory(state,scope,q);
  if(searched)return searched;
  return askLifeOverview(state,scope);
}

export { askScope, askMusicIntent, askMusicAnswer, answerAsk };
