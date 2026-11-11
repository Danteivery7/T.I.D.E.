// Read-only diary analytics. Counts *days that mention* a subject, not
// money spent, verified attendance, physical symptoms, or time spent.
export const DIARY_SIGNALS=[
  {id:'creative',label:'Creative & content days',short:'Creative',symbol:'🎬',pattern:/\b(?:edit(?:ed|ing|s)?|premiere|after effects|photoshop|thumbnail|video compilation|video game chaos|v\s?g\s?c|render(?:ed|ing)? a video|export(?:ed|ing)? a video|film(?:ed|ing)?|record(?:ed|ing)? (?:a|my|the) video|upload(?:ed|ing)?|content creat(?:or|ion)|youtube channel)\b/i},
  {id:'learning',label:'School & learning days',short:'Learning',symbol:'🎓',pattern:/\b(?:lecture|lectures|attend(?:ed|ing)? class|schoolwork|homework|assignment|coursework|semester|exams?|stud(?:y|ied|ying)|professor|graduat(?:ed|ion)|presentation|college class|classwork)\b/i},
  {id:'business',label:'Work & business days',short:'Work / Business',symbol:'💼',pattern:/\b(?:work shift|at work|clock(?:ed)? in|job interview|got hired|new job|paycheck|client|business|sponsor(?:ship)?|vending|my llc|my company|vendor|marketing plan|built (?:a|the) website|deployed (?:a|the) (?:site|app)|launched (?:a|the|my) (?:business|website|app))\b/i},
  {id:'social',label:'Friends & family days',short:'Social',symbol:'🤝',pattern:/\b(?:discord|face(?:time|timed)|group chat|hang(?:ing)? out|hung out|spoke (?:with|to)|talked (?:with|to)|called (?:my|mom|dad|friend|family)|party|visited (?:me|us|family|mom|dad)|played with (?:friends|everyone|dylan|carter|jaxson)|with (?:dylan|carter|jaxson|family|friends)|family dinner)\b/i},
  {id:'sports',label:'Sports days mentioned',short:'Sports',symbol:'🏆',pattern:/\b(?:yankees|knicks|giants|rangers|nascar|daytona|talladega|nba|nfl|nhl|mlb|f1|formula one|football|baseball|basketball|volleyball|soccer|world cup|world series|playoff|olympics?|championship|tennis|hockey|premier league)\b/i},
  {id:'outings',label:'Outings & travel days',short:'Outings',symbol:'🗺️',pattern:/\b(?:went to (?:the )?(?:store|beach|park|mall|museum|restaurant|library|airport|walmart|costco|publix|universal)|visited (?:the )?(?:beach|park|museum|store|mall)|went out|went shopping|traveled?|travelled|drove to|flew to|flight|road trip|vacation|concert|theme park|field trip|visited (?:a|the) city)\b/i},
  {id:'money',label:'Money-related diary days',short:'Money notes',symbol:'💵',pattern:/(?:\$\s?\d[\d,.]*|\b(?:bought|purchased|paid for|payment|refund(?:ed)?|got paid|earned|paycheck|salary|sold|purchase|cashback|budget|bills?|spen[dt]|invoice|deposit|credit card|rent|won \d+ bucks|lost \d+ bucks)\b)/i},
  {id:'wellness',label:'Wellness-related diary days',short:'Wellness notes',symbol:'🌿',pattern:/\b(?:migraines?|headaches?|got sick|felt sick|threw up|vomit(?:ed|ing)?|doctor|dentist|hospital|physio|work(?:ed|ing)? out|workout|gym|exercise|went (?:for|on) a walk|took a nap|sleep schedule|slept)\b/i},
  {id:'pets',label:'Pet-related diary days',short:'Pets',symbol:'🐾',pattern:/\b(?:samba|my dog|the dog|dogs|my cat|the cat|cats|puppy|kitten|pet(?:ted|ting)? (?:the|my) (?:dog|cat)|vet appointment)\b/i}
];
export const DIARY_SPORTS=[
  {name:'Yankees',pattern:/\b(?:yankees|nyy)\b/i},
  {name:'Knicks',pattern:/\b(?:knicks|nyk)\b/i},
  {name:'Giants',pattern:/\b(?:giants|nyg)\b/i},
  {name:'NASCAR',pattern:/\b(?:nascar|daytona|talladega)\b/i},
  {name:'Rangers',pattern:/\b(?:rangers|nyr)\b/i},
  {name:'Olympics',pattern:/\bolympics?\b/i},
  {name:'NFL',pattern:/\b(?:nfl|super bowl)\b/i},
  {name:'NBA',pattern:/\bnba\b/i},
  {name:'MLB',pattern:/\bmlb\b/i},
  {name:'Notre Dame',pattern:/\bnotre dame\b/i},
  {name:'Orlando City',pattern:/\borlando city\b/i}
];
const MILESTONE=/\b(?:graduat(?:ed|ion)|finished school|got hired|first day (?:of|at) (?:work|school|class)|launched (?:a|the|my) (?:business|channel|site|website|app)|published (?:my|the|a) (?:video|article|project)|passed (?:my|the|a) (?:exam|test)|completed (?:my|the|a) (?:degree|course|project)|personal best|first paycheck|my birthday|birthday party|won (?:a|the) (?:championship|trophy|award)|finished (?:my|the) (?:degree|semester)|moved (?:into|to) (?:a|my|the) new)\b/i;
const YMD=/^\d{4}-\d{2}-\d{2}$/;
const MS_DAY=86_400_000;
const shortSegment=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,160);
const dayNum=day=>{const n=Date.parse(day+'T12:00:00Z');return Number.isFinite(n)?Math.floor(n/MS_DAY):null};
function countStreak(dates){
  const nums=[...new Set(dates)].sort().map(day=>({day,n:dayNum(day)})).filter(x=>x.n!==null);
  let peak=null,runStart='',runEnd='',runLength=0,prev=-Infinity;
  for(const {day,n} of nums){
    if(n===prev+1){runLength++;runEnd=day}
    else{runStart=runEnd=day;runLength=1}
    if(!peak||runLength>peak.days)peak={days:runLength,start:runStart,end:runEnd};
    prev=n;
  }
  return peak;
}
const topMonth=dates=>{
  const counts=new Map();
  for(const d of dates){const m=d.slice(0,7);counts.set(m,(counts.get(m)||0)+1)}
  return [...counts].map(([month,days])=>({month,days})).sort((a,b)=>b.days-a.days||b.month.localeCompare(a.month))[0]||null;
};
export function diarySignals(state,{year=null,month=null}={}){
  const buckets=Object.fromEntries(DIARY_SIGNALS.map(cat=>[cat.id,[]]));
  const examples=Object.fromEntries(DIARY_SIGNALS.map(cat=>[cat.id,[]]));
  const teams=Object.fromEntries(DIARY_SPORTS.map(team=>[team.name,[]]));
  const milestones=[];
  let varied=null,loggedDays=0;
  for(const [date,entry] of Object.entries(state?.entries||{})){
    if(!YMD.test(date)||year&&!date.startsWith(String(year)+'-')||month&&!date.startsWith(month))continue;
    const raw=String(entry?.text||'').trim();if(!raw)continue;
    loggedDays++;
    const parts=raw.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
    const hits=[];
    for(const cat of DIARY_SIGNALS){
      const found=parts.find(part=>cat.pattern.test(part));
      if(!found)continue;
      buckets[cat.id].push(date);
      hits.push(cat.id);
      examples[cat.id].push({date,snippet:shortSegment(found)});
    }
    for(const team of DIARY_SPORTS)if(team.pattern.test(raw))teams[team.name].push(date);
    if(hits.length>0&&(!varied||hits.length>varied.count||(hits.length===varied.count&&date>varied.date)))
      varied={date,count:hits.length,labels:hits.map(id=>DIARY_SIGNALS.find(c=>c.id===id).short)};
    const candidate=parts.find(part=>MILESTONE.test(part));
    if(candidate)milestones.push({date,snippet:shortSegment(candidate)});
  }
  const categories=DIARY_SIGNALS.map(cat=>({
    id:cat.id,label:cat.label,short:cat.short,symbol:cat.symbol,
    days:buckets[cat.id].length,peakMonth:topMonth(buckets[cat.id]),
    streak:countStreak(buckets[cat.id]),
    examples:examples[cat.id].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2)
  }));
  const ranked=categories.slice().sort((a,b)=>b.days-a.days||a.label.localeCompare(b.label));
  const sports=DIARY_SPORTS.map(team=>({name:team.name,days:teams[team.name].length}))
    .filter(x=>x.days>0).sort((a,b)=>b.days-a.days||a.name.localeCompare(b.name));
  const recentMilestones=milestones.sort((a,b)=>b.date.localeCompare(a.date));
  return{loggedDays,categories,ranked,mostVaried:varied,
    sports,topSports:sports[0]||null,
    milestones:recentMilestones.slice(0,24),milestoneCount:recentMilestones.length};
}
