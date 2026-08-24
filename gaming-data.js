export const BASELINE_DATE='2026-08-23';
export const LEGACY_REMAINDER_MINUTES=118*60;
export const LEGACY_GAMES=[
['The Crew 2',1804,47,'2023-10-27'],['NBA 2K20',1438,52,'2021-04-10'],['Grand Theft Auto V',1196,19,'2023-07-07'],['Rocket League',980,53,'2024-07-11'],
['NBA 2K21',869,16,'2021-08-07'],['NBA 2K19',537,51,'2019-03-18'],['NBA 2K18',409,37,'2019-03-21'],['NBA 2K Playgrounds 2',351,32,'2023-11-05'],['NASCAR Heat 4',323,30,'2021-07-18'],
['NBA LIVE 19',143,56,'2018-09-23'],['Need for Speed',133,18,'2021-08-15'],['Madden NFL 19',69,29,'2023-02-12'],['NASCAR Heat 5',54,31,'2024-06-20'],['Wreckfest',38,33,'2023-09'],
['Job Simulator',33,34,'2021-01'],['Madden NFL 17',32,34,'2018-10-13'],['Fall Guys: Ultimate Knockout',32,1,'2022-10'],['FIFA 19',27,8,'2020-10-24'],['FIFA 22',26,35,'2022-05-24']
].map(([title,h,m,lastPlayed],i)=>({sourceKey:`legacy-ps4:${i}`,sourceFamily:'legacy-ps4',title,minutes:h*60+m,lastPlayed,firstPlayed:'',platform:'ps4',image:'',countMinutes:true,frozen:true}));
const KEY='tide_gaming_v1';
const aliases={'grand theft auto 5':'Grand Theft Auto V','gta 5':'Grand Theft Auto V','gta v':'Grand Theft Auto V','grand theft auto v':'Grand Theft Auto V','fall guys ultimate knockout':'Fall Guys','fall guys':'Fall Guys','the crew 2':'The Crew 2','the crew motorfest':'The Crew Motorfest'};

export const now=()=>new Date().toISOString();
export const today=()=>new Date().toISOString().slice(0,10);
export const esc=s=>String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
export const fmt=n=>new Intl.NumberFormat('en-US').format(Math.round(Number(n)||0));
export const hours=min=>{const n=Math.max(0,Number(min)||0),h=Math.floor(n/60),m=Math.round(n%60);return m?`${fmt(h)}h ${m}m`:`${fmt(h)}h`;};
export function shortDate(d){if(!d)return'—';if(/^\d{4}-\d{2}$/.test(d)){const [y,m]=d.split('-').map(Number);return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));}return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`));}
export const clean=s=>String(s||'').replace(/[™®©]/g,'').replace(/\bNA\b$/i,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
function canonicalTitle(title){
  const n=clean(title);
  if(aliases[n])return aliases[n];
  if(/^(?:grand theft auto|gta) (?:v|5)(?: |$)/.test(n))return'Grand Theft Auto V';
  return String(title||'Unknown Game').replace(/[™®©]/g,'').trim();
}
export function keyTitle(title){return clean(canonicalTitle(title));}
export function displayTitle(title){return canonicalTitle(title);}
export const maxDate=(a,b)=>!a?(b||''):!b?a:(String(b)>String(a)?b:a);
export const platformLabel=p=>({ps4:'PS4',ps5:'PS5',playstation:'PlayStation',xbox:'Xbox',nintendo:'Nintendo',steam:'Steam',ubisoft:'Ubisoft PC',ea:'EA PC',gog:'GOG',epic:'Epic',windows:'Windows PC',pc:'PC'})[p]||String(p||'Other').toUpperCase();
export const isPcPlatform=p=>['steam','ubisoft','ea','gog','epic','windows','pc'].includes(p);
export function filterAllows(p,filter='all'){if(filter==='all')return true;if(filter==='pc')return isPcPlatform(p);if(filter==='console')return ['ps4','ps5','playstation','xbox','nintendo'].includes(p);if(filter==='playstation')return ['ps4','ps5','playstation'].includes(p);return p===filter;}
function ignoreGamePlatform(title,platform){return String(platform||'').toLowerCase()==='xbox'&&clean(title)==='forza horizon 6';}

function blank(){return{latestSources:[],activity:{},recoveredMonths:{},baselineDate:null,liveStatus:{},updatedAt:''};}
function shape(x){
  x=x&&typeof x==='object'?x:blank();
  x.latestSources=Array.isArray(x.latestSources)?x.latestSources:[];
  x.activity=x.activity&&typeof x.activity==='object'?x.activity:{};
  x.recoveredMonths=x.recoveredMonths&&typeof x.recoveredMonths==='object'?x.recoveredMonths:{};
  x.liveStatus=x.liveStatus||{};
  return x;
}
export function loadGaming(){try{return shape(JSON.parse(localStorage.getItem(KEY)||'null')||blank());}catch{return blank();}}
let cache=loadGaming();
export function gaming(){return cache;}
function newerRecord(a,b){if(!a)return b;if(!b)return a;return String(b.updatedAt||'')>=String(a.updatedAt||'')?b:a;}
export function mergeGaming(a={},b={}){
  a=shape(a);b=shape(b);
  const latest=String(b.updatedAt||'')>=String(a.updatedAt||'')?b:a,older=latest===b?a:b,out=shape({...older,...latest});
  out.activity={...(older.activity||{})};
  for(const [d,r] of Object.entries(latest.activity||{}))out.activity[d]=newerRecord(out.activity[d],r);
  out.recoveredMonths={...(older.recoveredMonths||{})};
  for(const [m,r] of Object.entries(latest.recoveredMonths||{}))out.recoveredMonths[m]=newerRecord(out.recoveredMonths[m],r);
  out.baselineDate=[a.baselineDate,b.baselineDate].filter(Boolean).sort()[0]||null;
  out.latestSources=Array.isArray(latest.latestSources)?latest.latestSources:[];
  return out;
}
export async function pullGaming(){try{const r=await fetch('/api/gaming/state',{credentials:'same-origin'});if(!r.ok)return cache;const body=await r.json();cache=mergeGaming(cache,body.gaming||{});localStorage.setItem(KEY,JSON.stringify(cache));return cache;}catch{return cache;}}
export function saveGaming(g,{sync=true}={}){g=shape(g);g.updatedAt=now();cache=g;localStorage.setItem(KEY,JSON.stringify(g));if(sync)fetch('/api/gaming/state',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({gaming:g})}).catch(()=>{});return g;}

export function currentSources(){return[...LEGACY_GAMES,...gaming().latestSources].filter(s=>!ignoreGamePlatform(s.title,s.platform));}
function addAggregate(map,title,platform,minutes,lastPlayed='',image='',source=null){
  minutes=Math.max(0,Number(minutes)||0);if(!minutes)return;
  const k=keyTitle(title),g=map.get(k)||{key:k,title:displayTitle(title),minutes:0,lastPlayed:'',platformMinutes:{},sources:[],image:''};
  g.minutes+=minutes;g.lastPlayed=maxDate(g.lastPlayed,lastPlayed);g.platformMinutes[platform]=(g.platformMinutes[platform]||0)+minutes;
  if(source)g.sources.push(source);if(!g.image&&image)g.image=image;map.set(k,g);
}
export function aggregateAllTime(filter='all'){
  const map=new Map();
  for(const s of currentSources()){if(!s.countMinutes||!filterAllows(s.platform,filter))continue;addAggregate(map,s.title,s.platform,s.minutes,s.lastPlayed,s.image,s);}
  return[...map.values()];
}
export const remainderFor=filter=>['all','ps4','playstation'].includes(filter)?LEGACY_REMAINDER_MINUTES:0;
export const allTimeTotal=(filter='all')=>aggregateAllTime(filter).reduce((n,g)=>n+g.minutes,0)+remainderFor(filter);

function monthKeyInRange(month,start,end){const first=`${month}-01`,last=`${month}-31`;return last>=start&&first<=end;}
export function activityRange(start,end,filter='all'){
  const map=new Map();let total=0,recoveredMinutes=0,trackedMinutes=0;
  for(const [month,rec] of Object.entries(gaming().recoveredMonths||{})){
    if(!monthKeyInRange(month,start,end))continue;
    for(const item of Object.values(rec.games||{})){
      const title=item.title||item.key;let mins=0;
      for(const [p,v] of Object.entries(item.platformMinutes||{}))if(!ignoreGamePlatform(title,p)&&filterAllows(p,filter))mins+=Number(v)||0;
      if(!mins)continue;
      for(const [p,v] of Object.entries(item.platformMinutes||{}))if(!ignoreGamePlatform(title,p)&&filterAllows(p,filter))addAggregate(map,title,p,v,item.lastPlayed,item.image);
      recoveredMinutes+=mins;total+=mins;
    }
  }
  for(const [date,rec] of Object.entries(gaming().activity||{})){
    if(date<start||date>end)continue;
    for(const item of Object.values(rec.games||{})){
      const title=item.title||item.key;let mins=0;
      for(const [p,v] of Object.entries(item.platformMinutes||{}))if(!ignoreGamePlatform(title,p)&&filterAllows(p,filter))mins+=Number(v)||0;
      if(!mins)continue;
      for(const [p,v] of Object.entries(item.platformMinutes||{}))if(!ignoreGamePlatform(title,p)&&filterAllows(p,filter))addAggregate(map,title,p,v,item.lastPlayed,item.image);
      trackedMinutes+=mins;total+=mins;
    }
  }
  return{games:[...map.values()],total,recoveredMinutes,trackedMinutes,coverageStart:gaming().baselineDate,recoveredMonths:Object.keys(gaming().recoveredMonths||{}).filter(m=>monthKeyInRange(m,start,end))};
}
export function knownLastPlayed(start,end,filter='all'){
  const floor=d=>/^\d{4}-\d{2}$/.test(d)?`${d}-01`:d,ceil=d=>/^\d{4}-\d{2}$/.test(d)?`${d}-31`:d;
  return aggregateAllTime(filter).filter(g=>g.lastPlayed&&floor(g.lastPlayed)>=start&&ceil(g.lastPlayed)<=end).sort((a,b)=>String(b.lastPlayed).localeCompare(String(a.lastPlayed)));
}
export function boundedHistoricalRange(start,end,filter='all'){
  const map=new Map();
  for(const s of currentSources()){
    if(!s.countMinutes||!filterAllows(s.platform,filter)||!s.firstPlayed||!s.lastPlayed)continue;
    if(String(s.firstPlayed)<start||String(s.lastPlayed)>end||String(s.lastPlayed)<String(s.firstPlayed))continue;
    addAggregate(map,s.title,s.platform,s.minutes,s.lastPlayed,s.image,s);
  }
  const games=[...map.values()].sort((a,b)=>b.minutes-a.minutes);
  return{games,total:games.reduce((n,g)=>n+g.minutes,0)};
}
export function historicalActivityEvidence(start,end,filter='all'){
  const bounded=boundedHistoricalRange(start,end,filter),boundedKeys=new Set(bounded.games.map(g=>g.key)),last=knownLastPlayed(start,end,filter).filter(g=>!boundedKeys.has(g.key));
  return{boundedGames:bounded.games,boundedTotal:bounded.total,lastPlayedGames:last};
}
export function toast(text,type='good'){const r=document.querySelector('#toast-region');if(!r)return;const e=document.createElement('div');e.className=`toast ${type}`;e.textContent=text;r.append(e);setTimeout(()=>e.remove(),3200);}