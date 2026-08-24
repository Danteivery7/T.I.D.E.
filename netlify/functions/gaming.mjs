import { getStore } from '@netlify/blobs';
import { isAuthenticated, json } from '../lib/auth.mjs';

const EXOPHASE_USER='danteivery';
const STEAM_ID='76561199195640502';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36';
const STORE='tide-private-data';
const STATE_KEY='gaming-state-v1';

function dateFromUnix(value){const n=Number(value)||0;return n>0?new Date(n*1000).toISOString().slice(0,10):'';}
function playMinutes(game){
  const u=game?.playtimeUnits;
  if(u&&(u.hours!=null||u.minutes!=null))return Math.max(0,Math.round((Number(u.hours)||0)*60)+(Number(u.minutes)||0));
  const s=String(game?.playtime||''),h=Number(s.match(/([\d.]+)\s*h/i)?.[1]||0),m=Number(s.match(/(\d+)\s*m/i)?.[1]||0);
  return Math.max(0,Math.round(h*60)+m);
}
function platformFor(game){
  const env=String(game?.meta?.environment_slug||'').toLowerCase(),slugs=(game?.meta?.platforms||[]).map(p=>String(p?.slug||p?.name||'').toLowerCase()),has=x=>slugs.some(s=>s.includes(x));
  if(env==='steam'||has('steam'))return'steam';
  if(env==='nintendo'||has('switch'))return'nintendo';
  if(env==='uplay'||env==='ubisoft')return'ubisoft';
  if(env==='origin'||env==='ea')return'ea';
  if(env==='gog')return'gog';
  if(env==='epic')return'epic';
  if(env==='xbox'||has('xbox'))return'xbox';
  if(env==='psn'||has('playstation')||has('ps4')||has('ps5')){
    const p4=has('ps4'),p5=has('ps5');
    if(p5&&!p4)return'ps5';
    if(p4&&!p5)return'ps4';
    return'playstation';
  }
  if(env==='windows'||has('windows'))return'windows';
  return env||'other';
}
function extractPlayerId(text){
  for(const re of [
    /playerProfileId\s*[=:]\s*['\"]?([0-9]+)/i,
    /\"playerProfileId\"\s*:\s*\"?([0-9]+)/i,
    /public\/player\/([0-9]+)/i
  ]){const m=String(text||'').match(re);if(m)return m[1];}
  return'';
}
async function resolveExophaseId(){
  if(process.env.EXOPHASE_PLAYER_ID)return String(process.env.EXOPHASE_PLAYER_ID);
  const urls=[
    `https://www.exophase.com/user/${EXOPHASE_USER}/`,
    `https://www.exophase.com/user/${EXOPHASE_USER}/stats/`,
    `https://www.exophase.com/steam/user/${STEAM_ID}/`
  ];
  const errors=[];
  for(const url of urls){
    try{
      const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','cache-control':'no-cache'}}),text=await r.text();
      if(!r.ok){errors.push(`${r.status} ${url}`);continue;}
      const id=extractPlayerId(text);if(id)return id;
      errors.push(`no player id ${url}`);
    }catch(error){errors.push(String(error?.message||error));}
  }
  throw new Error(`player id lookup failed: ${errors.join(' · ')}`);
}
async function exophase(){
  try{
    const playerId=await resolveExophaseId(),games=[];
    for(let page=1;page<=200;page++){
      const u=`https://api.exophase.com/public/player/${encodeURIComponent(playerId)}/games?page=${page}&environment=&sort=1&showHidden=0&me=0&query=`,r=await fetch(u,{headers:{'user-agent':UA,'accept':'application/json, text/plain, */*','referer':'https://www.exophase.com/'}});
      if(!r.ok)throw new Error(`games feed returned ${r.status}`);
      const body=await r.json();
      if(!body?.success){if(page===1)throw new Error('games feed returned success=false');break;}
      const rows=Array.isArray(body.games)?body.games:[];if(!rows.length)break;
      for(const g of rows){
        const title=String(g?.meta?.title||'').trim();if(!title)continue;
        const environment=String(g?.meta?.environment_slug||'').toLowerCase(),masterId=g.master_id||g.meta?.master_id||null,masterPlayerId=g.master_playerid||null;
        games.push({sourceKey:`exophase:${environment||'unknown'}:${masterPlayerId||'player'}:${masterId||games.length}`,title,minutes:playMinutes(g),firstPlayed:dateFromUnix(g.firstplayed),lastPlayed:dateFromUnix(g.lastplayed_utc||g.lastplayed),platform:platformFor(g),environment,image:g.resource_standard||g.resource_tile||g.meta?.image||'',masterId,masterPlayerId});
      }
      if(rows.length<50)break;
    }
    return{ok:true,playerId,games};
  }catch(error){return{ok:false,error:String(error?.message||error),games:[]};}
}

function decodeXml(s){return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'\"').replace(/&#39;/g,"'");}
function tag(block,name){const m=block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,'i'));return decodeXml(m?.[1]||'').trim();}
function titleKey(value){return String(value||'').replace(/[™®©]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();}
function addSteam(map,row,source='steam-page'){
  const appId=Number(row?.appid??row?.appID??row?.appId)||0,title=String(row?.name||row?.title||'').trim(),minutes=Math.max(0,Math.round(Number(row?.playtime_forever??row?.minutes??0)||0)),recentMinutes=Math.max(0,Math.round(Number(row?.playtime_2weeks??row?.recentMinutes??0)||0));
  if(!appId&&!title)return;
  const key=appId?`app:${appId}`:`title:${titleKey(title)}`,existing=map.get(key),iconHash=String(row?.img_icon_url||'').trim(),image=String(row?.image||row?.logo||'').trim()||(appId&&iconHash?`https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`:''),lastPlayed=row?.lastPlayed||dateFromUnix(row?.rtime_last_played),firstPlayed=row?.firstPlayed||'';
  const next={sourceKey:appId?`steam:${appId}`:`steam:title:${titleKey(title)}`,appId:appId||null,title:title||existing?.title||`Steam ${appId}`,minutes,recentMinutes,hoursLast2Weeks:recentMinutes/60,firstPlayed,lastPlayed,platform:'steam',environment:'steam',image,source};
  if(!existing||next.minutes>existing.minutes)map.set(key,{...existing,...next,firstPlayed:existing?.firstPlayed||next.firstPlayed,lastPlayed:String(existing?.lastPlayed||'')>String(next.lastPlayed||'')?existing.lastPlayed:next.lastPlayed,image:next.image||existing?.image||''});
  else{
    if(lastPlayed&&lastPlayed>String(existing.lastPlayed||''))existing.lastPlayed=lastPlayed;
    if(!existing.firstPlayed&&firstPlayed)existing.firstPlayed=firstPlayed;
    if(recentMinutes>Number(existing.recentMinutes||0)){existing.recentMinutes=recentMinutes;existing.hoursLast2Weeks=recentMinutes/60;}
    map.set(key,existing);
  }
}
async function steamOfficial(map){
  const key=String(process.env.STEAM_API_KEY||'').trim();if(!key)return false;
  const u=new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
  u.searchParams.set('key',key);u.searchParams.set('steamid',STEAM_ID);u.searchParams.set('include_appinfo','1');u.searchParams.set('include_played_free_games','1');u.searchParams.set('format','json');
  const r=await fetch(u.toString(),{headers:{'user-agent':UA,'accept':'application/json'}});if(!r.ok)throw new Error(`Steam Web API returned ${r.status}`);
  const rows=(await r.json())?.response?.games;if(!Array.isArray(rows)||!rows.length)throw new Error('Steam Web API returned no owned games');
  for(const row of rows)addSteam(map,row,'steam-web-api');return true;
}
function parseJsonStringLiteral(text,marker){const start=text.indexOf(marker);if(start<0)return null;const tail=text.slice(start+marker.length),m=tail.match(/^\s*\(\s*("(?:\\.|[^"\\])*")\s*\)/);if(!m)return null;try{return JSON.parse(m[1]);}catch{return null;}}
function balancedJson(text,marker){const start=text.indexOf(marker);if(start<0)return null;let i=start+marker.length;while(i<text.length&&text[i]!=='['&&text[i]!=='{')i++;if(i>=text.length)return null;const open=text[i],close=open==='['?']':'}';let depth=0,quote='',escape=false;for(let j=i;j<text.length;j++){const c=text[j];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c===open)depth++;else if(c===close){depth--;if(depth===0)return text.slice(i,j+1);}}return null;}
function collectSteam(value,map,depth=0){if(value==null||depth>12)return;if(Array.isArray(value)){for(const x of value)collectSteam(x,map,depth+1);return;}if(typeof value==='object'){if((value.appid!=null||value.appID!=null||value.appId!=null)&&(value.playtime_forever!=null||value.minutes!=null))addSteam(map,value);for(const v of Object.values(value))collectSteam(v,map,depth+1);return;}if(typeof value==='string'&&value.length<8000000){const t=value.trim();if((t.startsWith('{')||t.startsWith('['))&&(t.includes('OwnedGames')||t.includes('rgGames')||t.includes('playtime_forever'))){try{collectSteam(JSON.parse(t),map,depth+1);}catch{}}}}
function parseSteamHtml(html,map){
  const renderText=parseJsonStringLiteral(html,'window.SSR.renderContext=JSON.parse');if(renderText)try{collectSteam(JSON.parse(renderText),map);}catch{}
  for(const marker of ['window.SSR.loaderData =','window.SSR.loaderData=','var rgGames =','var rgGames=']){const raw=balancedJson(html,marker);if(raw)try{collectSteam(JSON.parse(raw),map);}catch{}}
  const direct=html.match(/var\s+rgGames\s*=\s*(\[[\s\S]*?\])\s*;/);if(direct)try{collectSteam(JSON.parse(direct[1]),map);}catch{}
}
function parseSteamXml(xml,map){
  for(const m of xml.matchAll(/<game>([\s\S]*?)<\/game>/gi)){
    const block=m[1],appId=tag(block,'appID'),title=tag(block,'name'),hrs=Number(tag(block,'hoursOnRecord').replace(/,/g,'')||0),recent=Number(tag(block,'hoursLast2Weeks').replace(/,/g,'')||0);
    if(!title||!appId)continue;
    addSteam(map,{appid:Number(appId),name:title,playtime_forever:Math.max(0,Math.round(hrs*60)),playtime_2weeks:Math.max(0,Math.round(recent*60)),logo:tag(block,'logo')},'steam-xml');
  }
}
async function steam(exo){
  const map=new Map(),methods=[],errors=[];
  try{if(await steamOfficial(map))methods.push('web-api');}catch(error){errors.push(String(error?.message||error));}
  const headers={'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.9'};
  const urls=[
    `https://steamcommunity.com/profiles/${STEAM_ID}/games?tab=all&xml=1`,
    `https://steamcommunity.com/profiles/${STEAM_ID}/games?xml=1`,
    `https://steamcommunity.com/profiles/${STEAM_ID}/games?tab=all`
  ];
  const responses=await Promise.allSettled(urls.map(u=>fetch(u,{headers})));
  for(let i=0;i<responses.length;i++){
    const x=responses[i];if(x.status!=='fulfilled'||!x.value.ok)continue;
    const text=await x.value.text();
    if(i<2){parseSteamXml(text,map);methods.push(i===0?'xml-all':'xml');}else{parseSteamHtml(text,map);methods.push('community-page');}
  }
  if(exo?.ok){
    const byTitle=new Set([...map.values()].map(x=>titleKey(x.title)));
    for(const x of exo.games||[]){
      if(x.environment!=='steam'||(Number(x.minutes)||0)<=0)continue;
      const key=titleKey(x.title);if(byTitle.has(key))continue;
      addSteam(map,{name:x.title,minutes:Number(x.minutes)||0,firstPlayed:x.firstPlayed,lastPlayed:x.lastPlayed,image:x.image},'exophase-steam-fallback');byTitle.add(key);
    }
    if((exo.games||[]).some(x=>x.environment==='steam'))methods.push('exophase-fallback');
  }
  const games=[...map.values()];
  if(!games.length)return{ok:false,error:errors[0]||'Steam public sources returned no owned-game playtime',games:[],method:methods.join('+')};
  return{ok:true,steamId:STEAM_ID,games,method:[...new Set(methods)].join('+')||'community',warnings:errors};
}

function stamp(x){return String(x?.updatedAt||'');}
function newer(a,b){if(!a)return b;if(!b)return a;return stamp(b)>=stamp(a)?b:a;}
function mergeGaming(remote={},incoming={}){
  const newerState=stamp(incoming)>=stamp(remote)?incoming:remote,older=newerState===incoming?remote:incoming,out={...older,...newerState};
  out.activity={...(older.activity||{})};for(const [date,rec] of Object.entries(newerState.activity||{}))out.activity[date]=newer(out.activity[date],rec);
  out.recoveredMonths={...(older.recoveredMonths||{})};for(const [month,rec] of Object.entries(newerState.recoveredMonths||{}))out.recoveredMonths[month]=newer(out.recoveredMonths[month],rec);
  out.baselineDate=[remote.baselineDate,incoming.baselineDate].filter(Boolean).sort()[0]||null;
  out.latestSources=Array.isArray(newerState.latestSources)?newerState.latestSources:[];
  out.updatedAt=new Date().toISOString();return out;
}
async function readGaming(store){const entry=await store.getWithMetadata(STATE_KEY,{consistency:'strong',type:'json'});if(!entry)return{gaming:null,etag:null,exists:false};return{gaming:entry.data,etag:entry.etag,exists:true};}
async function writeGaming(store,incoming){
  for(let i=0;i<5;i++){
    const cur=await readGaming(store),merged=mergeGaming(cur.gaming||{},incoming||{}),options=cur.exists?{onlyIfMatch:cur.etag}:{onlyIfNew:true},result=await store.setJSON(STATE_KEY,merged,options);
    if(result.modified)return{gaming:merged,etag:result.etag};
  }
  throw new Error('Gaming cloud state changed too many times. Refresh again.');
}

export default async request=>{
  if(!isAuthenticated(request))return json({error:'Connect T.I.D.E. Cloud Sync first.'},401);
  const {pathname}=new URL(request.url);
  try{
    if(request.method==='GET'&&pathname.endsWith('/live')){
      const exo=await exophase(),stm=await steam(exo);
      return json({capturedAt:new Date().toISOString(),exophase:exo,steam:stm,ruleNotes:{legacyPs4:'19 visible games plus 118 unassigned lifetime hours',ubisoft:'One stable Exophase Ubisoft player identity is selected from Motorfest and all games on that PC identity are counted; duplicate Ubisoft identities are ignored.',steam:'Valve community XML/Web API are merged with Exophase Steam so a failure in one source cannot erase the library.',history:'Sources expose cumulative playtime and first/last played dates. T.I.D.E. creates exact future monthly history from snapshots and only recovers defensible pre-baseline hours.'}});
    }
    if(pathname.endsWith('/state')){
      const store=getStore({name:STORE,consistency:'strong'});
      if(request.method==='GET'){const r=await readGaming(store);return json({gaming:r.gaming||{},etag:r.etag});}
      if(request.method==='POST'){
        let body;try{body=await request.json();}catch{return json({error:'Invalid gaming state.'},400);}
        if(!body?.gaming||typeof body.gaming!=='object')return json({error:'Missing gaming state.'},400);
        return json(await writeGaming(store,body.gaming));
      }
    }
  }catch(error){return json({error:String(error?.message||error)},500);}
  return json({error:'Not found.'},404);
};

export const config={path:'/api/gaming/*'};
