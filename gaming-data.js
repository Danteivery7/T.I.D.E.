export const BASELINE_DATE='2026-08-23';
export const LEGACY_REMAINDER_MINUTES=118*60;
export const LEGACY_GAMES=[
['The Crew 2',1804,47,'2023-10-27'],['NBA 2K20',1438,52,'2021-04-10'],['Grand Theft Auto V',1196,19,'2023-07-07'],['Rocket League',980,53,'2024-07-11'],
['NBA 2K21',869,16,'2021-08-07'],['NBA 2K19',537,51,'2019-03-18'],['NBA 2K18',409,37,'2019-03-21'],['NBA 2K Playgrounds 2',351,32,'2023-11-05'],['NASCAR Heat 4',323,30,'2021-07-18'],
['NBA LIVE 19',143,56,'2018-09-23'],['Need for Speed',133,18,'2021-08-15'],['Madden NFL 19',69,29,'2023-02-12'],['NASCAR Heat 5',54,31,'2024-06-20'],['Wreckfest',38,33,'2023-09'],
['Job Simulator',33,34,'2021-01'],['Madden NFL 17',32,34,'2018-10-13'],['Fall Guys: Ultimate Knockout',32,1,'2022-10'],['FIFA 19',27,8,'2020-10-24'],['FIFA 22',26,35,'2022-05-24']
].map(([title,h,m,lastPlayed],i)=>({sourceKey:`legacy-ps4:${i}`,sourceFamily:'legacy-ps4',title,minutes:h*60+m,lastPlayed,platform:'ps4',image:'',countMinutes:true,frozen:true}));
const KEY='tide_gaming_v1';
const aliases={'grand theft auto 5':'Grand Theft Auto V','gta 5':'Grand Theft Auto V','gta v':'Grand Theft Auto V','grand theft auto v':'Grand Theft Auto V','fall guys ultimate knockout':'Fall Guys','fall guys':'Fall Guys','the crew 2':'The Crew 2','the crew motorfest':'The Crew Motorfest'};
export const now=()=>new Date().toISOString();
export const today=()=>new Date().toISOString().slice(0,10);
export const esc=s=>String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
export const fmt=n=>new Intl.NumberFormat('en-US').format(Math.round(Number(n)||0));
export const hours=min=>{const n=Math.max(0,Number(min)||0),h=Math.floor(n/60),m=Math.round(n%60);return m?`${fmt(h)}h ${m}m`:`${fmt(h)}h`;};
export function shortDate(d){if(!d)return'—';if(/^\d{4}-\d{2}$/.test(d)){const [y,m]=d.split('-').map(Number);return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));}return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${d}T12:00:00`));}
export const clean=s=>String(s||'').replace(/[™®©]/g,'').replace(/\bNA\b$/i,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
export function keyTitle(title){const n=clean(title);return clean(aliases[n]||n);}
export function displayTitle(title){const n=clean(title);return aliases[n]||String(title||'Unknown Game').replace(/[™®©]/g,'').trim();}
export const maxDate=(a,b)=>!a?(b||''):!b?a:(String(b)>String(a)?b:a);
export const platformLabel=p=>({ps4:'PS4',ps5:'PS5',playstation:'PlayStation',xbox:'Xbox',nintendo:'Nintendo',steam:'Steam',ubisoft:'Ubisoft PC',ea:'EA PC',gog:'GOG',epic:'Epic',windows:'Windows PC',pc:'PC'})[p]||String(p||'Other').toUpperCase();
export const isPcPlatform=p=>['steam','ubisoft','ea','gog','epic','windows','pc'].includes(p);
export function filterAllows(p,filter='all'){if(filter==='all')return true;if(filter==='pc')return isPcPlatform(p);if(filter==='console')return ['ps5','xbox','nintendo'].includes(p);if(filter==='playstation')return ['ps4','ps5','playstation'].includes(p);return p===filter;}
function blank(){return{latestSources:[],activity:{},baselineDate:null,liveStatus:{},updatedAt:''};}
export function loadGaming(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null')||blank();x.latestSources=Array.isArray(x.latestSources)?x.latestSources:[];x.activity=x.activity&&typeof x.activity==='object'?x.activity:{};x.liveStatus=x.liveStatus||{};return x;}catch{return blank();}}
let cache=loadGaming();
export function gaming(){return cache;}
export function mergeGaming(a={},b={}){const latest=String(b.updatedAt||'')>=String(a.updatedAt||'')?b:a,older=latest===b?a:b,out={...older,...latest};out.activity={...(older.activity||{})};for(const [d,r] of Object.entries(latest.activity||{})){const old=out.activity[d];out.activity[d]=!old||String(r.updatedAt||'')>=String(old.updatedAt||'')?r:old;}out.baselineDate=[a.baselineDate,b.baselineDate].filter(Boolean).sort()[0]||null;out.latestSources=Array.isArray(latest.latestSources)?latest.latestSources:[];return out;}
export async function pullGaming(){try{const r=await fetch('/api/gaming/state',{credentials:'same-origin'});if(!r.ok)return cache;const body=await r.json();cache=mergeGaming(cache,body.gaming||{});localStorage.setItem(KEY,JSON.stringify(cache));return cache;}catch{return cache;}}
export function saveGaming(g,{sync=true}={}){g.updatedAt=now();cache=g;localStorage.setItem(KEY,JSON.stringify(g));if(sync)fetch('/api/gaming/state',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({gaming:g})}).catch(()=>{});return g;}
export function currentSources(){return[...LEGACY_GAMES,...gaming().latestSources];}
export function aggregateAllTime(filter='all'){const map=new Map();for(const s of currentSources()){if(!s.countMinutes||!filterAllows(s.platform,filter))continue;const k=keyTitle(s.title),g=map.get(k)||{key:k,title:displayTitle(s.title),minutes:0,lastPlayed:'',platformMinutes:{},sources:[],image:''};g.minutes+=Number(s.minutes)||0;g.lastPlayed=maxDate(g.lastPlayed,s.lastPlayed);g.platformMinutes[s.platform]=(g.platformMinutes[s.platform]||0)+(Number(s.minutes)||0);g.sources.push(s);if(!g.image&&s.image)g.image=s.image;map.set(k,g);}return[...map.values()];}
export const remainderFor=filter=>['all','ps4','playstation'].includes(filter)?LEGACY_REMAINDER_MINUTES:0;
export const allTimeTotal=(filter='all')=>aggregateAllTime(filter).reduce((n,g)=>n+g.minutes,0)+remainderFor(filter);
export function activityRange(start,end,filter='all'){const map=new Map();let total=0;for(const [date,rec] of Object.entries(gaming().activity||{})){if(date<start||date>end)continue;for(const item of Object.values(rec.games||{})){let mins=0;for(const [p,v] of Object.entries(item.platformMinutes||{}))if(filterAllows(p,filter))mins+=Number(v)||0;if(!mins)continue;const k=item.key||keyTitle(item.title),g=map.get(k)||{key:k,title:item.title,minutes:0,lastPlayed:'',platformMinutes:{},sources:[],image:item.image||''};g.minutes+=mins;g.lastPlayed=maxDate(g.lastPlayed,item.lastPlayed);for(const [p,v] of Object.entries(item.platformMinutes||{}))if(filterAllows(p,filter))g.platformMinutes[p]=(g.platformMinutes[p]||0)+(Number(v)||0);map.set(k,g);total+=mins;}}return{games:[...map.values()],total,coverageStart:gaming().baselineDate};}
export function knownLastPlayed(start,end,filter='all'){const floor=d=>/^\d{4}-\d{2}$/.test(d)?`${d}-01`:d,ceil=d=>/^\d{4}-\d{2}$/.test(d)?`${d}-31`:d;return aggregateAllTime(filter).filter(g=>g.lastPlayed&&floor(g.lastPlayed)>=start&&ceil(g.lastPlayed)<=end).sort((a,b)=>String(b.lastPlayed).localeCompare(String(a.lastPlayed)));}
export function toast(text,type='good'){const r=document.querySelector('#toast-region');if(!r)return;const e=document.createElement('div');e.className=`toast ${type}`;e.textContent=text;r.append(e);setTimeout(()=>e.remove(),3200);}
