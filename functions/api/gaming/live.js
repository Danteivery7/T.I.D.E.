import { isAuthenticated, json } from '../../_lib/auth.js';

const EXOPHASE_USER='danteivery';
const STEAM_ID='76561199195640502';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';

function dateFromUnix(value){const n=Number(value)||0;return n>0?new Date(n*1000).toISOString().slice(0,10):'';}
function playMinutes(game){
  const u=game?.playtimeUnits;
  if(u&&(u.hours!=null||u.minutes!=null)){
    const structured=Math.max(0,Math.round((Number(u.hours)||0)*60)+(Number(u.minutes)||0));
    if(structured>0)return structured;
  }
  const s=String(game?.playtime||'').replace(/,/g,'.'),h=Number(s.match(/([\d.]+)\s*h/i)?.[1]||0),m=Number(s.match(/(\d+)\s*m/i)?.[1]||0);
  return Math.max(0,Math.round(h*60)+m);
}
function platformTokens(game){
  return(game?.meta?.platforms||[]).flatMap(p=>[p?.slug,p?.name]).filter(Boolean).map(x=>String(x).toLowerCase());
}
function environmentFor(game){
  const explicit=String(game?.meta?.environment_slug||game?.environment_slug||game?.environment||'').toLowerCase();
  if(explicit)return explicit;
  const endpoint=String(game?.meta?.endpoint_awards||game?.endpoint_awards||'').toLowerCase(),canonical=String(game?.meta?.canonical_url||game?.canonical_url||'').toLowerCase(),links=(game?.meta?.links||[]).map(x=>String(x?.endpoint||'').toLowerCase()).join(' '),haystack=`${endpoint} ${canonical} ${links}`,tokens=platformTokens(game),has=x=>tokens.some(t=>t.includes(x));
  if(/(?:uplay|ubisoft)/.test(haystack)||has('uplay')||has('ubisoft'))return'uplay';
  if(/steam/.test(haystack)||has('steam'))return'steam';
  if(/(?:psn|playstation|ps5|ps4)/.test(haystack)||has('playstation')||has('ps5')||has('ps4'))return'psn';
  if(/xbox/.test(haystack)||has('xbox'))return'xbox';
  if(/(?:switch|nintendo)/.test(haystack)||has('switch')||has('nintendo'))return'nintendo';
  if(/(?:origin|\bea\b)/.test(haystack)||has('origin')||has('ea'))return'ea';
  if(/epic/.test(haystack)||has('epic'))return'epic';
  if(/gog/.test(haystack)||has('gog'))return'gog';
  if(/windows/.test(haystack)||has('windows'))return'windows';
  return'';
}
function platformFor(game,environment=environmentFor(game)){
  const env=String(environment||'').toLowerCase(),tokens=platformTokens(game),has=x=>tokens.some(t=>t.includes(x));
  if(env.includes('uplay')||env.includes('ubisoft'))return'ubisoft';
  if(env==='steam'||env.includes('steam'))return'steam';
  if(env==='nintendo'||env.includes('switch'))return'nintendo';
  if(env==='origin'||env==='ea')return'ea';
  if(env==='gog')return'gog';
  if(env==='epic')return'epic';
  if(env==='xbox'||env.includes('xbox'))return'xbox';
  if(env==='psn'||env.includes('playstation')||env==='ps4'||env==='ps5'){
    const p4=has('ps4'),p5=has('ps5');
    if(p5&&!p4)return'ps5';
    if(p4&&!p5)return'ps4';
    return'playstation';
  }
  if(env==='windows')return'windows';
  if(has('uplay')||has('ubisoft'))return'ubisoft';
  if(has('steam'))return'steam';
  if(has('xbox'))return'xbox';
  if(has('switch')||has('nintendo'))return'nintendo';
  if(has('playstation')||has('ps4')||has('ps5'))return has('ps5')&&!has('ps4')?'ps5':has('ps4')&&!has('ps5')?'ps4':'playstation';
  if(has('windows'))return'windows';
  return env||'other';
}
function isMotorfestTitle(title){return /(?:the\s+crew\s+)?motorfest/i.test(String(title||''));}
function isUbisoftGame(game){const env=environmentFor(game),platform=platformFor(game,env),endpoint=String(game?.meta?.endpoint_awards||game?.endpoint_awards||'');return platform==='ubisoft'||/uplay|ubisoft/i.test(env)||/uplay|ubisoft/i.test(endpoint);}
function normalizeExophaseGame(g,index=0,source='api'){
  const title=String(g?.meta?.title||g?.title||'').trim();if(!title)return null;
  const environment=environmentFor(g),masterId=g?.master_id||g?.id||g?.meta?.master_id||null,masterPlayerId=g?.master_playerid||g?.master_player_id||g?.player_id||null,canonicalUrl=String(g?.meta?.canonical_url||g?.canonical_url||''),endpointAwards=String(g?.meta?.endpoint_awards||g?.endpoint_awards||'');
  return{sourceKey:`exophase:${environment||'unknown'}:${masterPlayerId||'player'}:${masterId||index}`,title,minutes:playMinutes(g),firstPlayed:dateFromUnix(g?.firstplayed),lastPlayed:dateFromUnix(g?.lastplayed_utc||g?.lastplayed),platform:platformFor(g,environment),environment,image:g?.resource_standard||g?.resource_tile||g?.meta?.image||'',canonicalUrl,endpointAwards,masterId,masterPlayerId,source};
}
function parseJsonStringLiteral(text,marker){const start=text.indexOf(marker);if(start<0)return null;const tail=text.slice(start+marker.length),m=tail.match(/^\s*\(\s*("(?:\\.|[^"\\])*")\s*\)/);if(!m)return null;try{return JSON.parse(m[1]);}catch{return null;}}
function balancedJson(text,marker){const start=text.indexOf(marker);if(start<0)return null;let i=start+marker.length;while(i<text.length&&text[i]!=='['&&text[i]!=='{')i++;if(i>=text.length)return null;const open=text[i],close=open==='['?']':'}';let depth=0,quote='',escape=false;for(let j=i;j<text.length;j++){const c=text[j];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c===open)depth++;else if(c===close){depth--;if(depth===0)return text.slice(i,j+1);}}return null;}
function playerGamesFromHtml(html){
  const text=String(html||'');
  const literal=text.match(/window\.playerGames\s*=\s*JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/i);
  if(literal){try{const outer=JSON.parse(literal[1]),parsed=JSON.parse(outer),rows=Array.isArray(parsed)?parsed:parsed?.games;if(Array.isArray(rows))return rows;}catch{}}
  for(const marker of ['window.playerGames =','window.playerGames=']){
    const raw=balancedJson(text,marker);if(!raw)continue;
    try{const parsed=JSON.parse(raw),rows=Array.isArray(parsed)?parsed:parsed?.games;if(Array.isArray(rows))return rows;}catch{}
  }
  return[];
}
async function resolveExophaseProfile(env){
  let playerId=String(env?.EXOPHASE_PLAYER_ID||''),recentRows=[],profileFetch='env-id';
  try{
    const r=await fetch(`https://www.exophase.com/user/${EXOPHASE_USER}/`,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','cache-control':'no-cache'}}),text=await r.text();
    if(r.ok){
      profileFetch='profile-page';recentRows=playerGamesFromHtml(text);
      if(!playerId){const m=text.match(/playerProfileId\s*[=:]\s*['\"]?([0-9]+)/i)||text.match(/\"playerProfileId\"\s*:\s*\"?([0-9]+)/i)||text.match(/public\/player\/([0-9]+)/i);if(m)playerId=m[1];}
    }else if(!playerId)throw new Error(`profile lookup returned ${r.status}`);
  }catch(error){if(!playerId)throw error;profileFetch=`env-id; profile fetch failed: ${String(error?.message||error)}`;}
  if(!playerId)throw new Error('player id was not exposed by the profile page');
  return{playerId,recentRows,profileFetch};
}
async function fetchPlayerGames(playerId,maxPages=200){
  const games=[],pageSizes=[];
  for(let page=1;page<=maxPages;page++){
    const u=`https://api.exophase.com/public/player/${encodeURIComponent(playerId)}/games?page=${page}&environment=&sort=1&showHidden=0&me=0&query=`,r=await fetch(u,{headers:{'user-agent':UA,'accept':'application/json, text/plain, */*','referer':'https://www.exophase.com/'}});
    if(!r.ok)throw new Error(`games feed returned ${r.status} on page ${page}`);
    const body=await r.json();if(!body?.success){if(page===1)throw new Error('games feed returned success=false');break;}
    const rows=Array.isArray(body.games)?body.games:[];pageSizes.push(rows.length);if(!rows.length)break;
    for(let i=0;i<rows.length;i++){const item=normalizeExophaseGame(rows[i],games.length+i,'api');if(item)games.push(item);}
    if(rows.length<50)break;
  }
  return{games,pageSizes};
}
async function enrichUbisoftMotorfest(games,recentRows){
  const diagnostics={recentCandidates:[],directPlayerLookups:[]};
  const bySource=new Map(games.map(x=>[x.sourceKey,x]));
  for(let i=0;i<(recentRows||[]).length;i++){
    const raw=recentRows[i];if(!isMotorfestTitle(raw?.meta?.title||raw?.title)||!isUbisoftGame(raw))continue;
    const item=normalizeExophaseGame(raw,i,'profile-recent');if(!item)continue;
    diagnostics.recentCandidates.push({title:item.title,minutes:item.minutes,masterPlayerId:item.masterPlayerId,masterId:item.masterId,environment:item.environment,platform:item.platform,endpointAwards:item.endpointAwards});
    const existing=bySource.get(item.sourceKey);
    if(existing){if(item.minutes>existing.minutes)Object.assign(existing,{...item,sourceKey:existing.sourceKey});}
    else if(item.minutes>0){games.push(item);bySource.set(item.sourceKey,item);}
  }
  let positive=games.filter(x=>x.platform==='ubisoft'&&isMotorfestTitle(x.title)&&(Number(x.minutes)||0)>0);
  if(positive.length)return diagnostics;
  const ids=[...new Set(games.filter(x=>x.platform==='ubisoft'&&isMotorfestTitle(x.title)&&Number(x.masterPlayerId)>0).map(x=>String(x.masterPlayerId)))].slice(0,8);
  for(const id of ids){
    try{
      const result=await fetchPlayerGames(id,3),matches=result.games.filter(x=>isMotorfestTitle(x.title));
      diagnostics.directPlayerLookups.push({playerId:id,ok:true,pageSizes:result.pageSizes,matches:matches.map(x=>({title:x.title,minutes:x.minutes,platform:x.platform,environment:x.environment,masterPlayerId:x.masterPlayerId,masterId:x.masterId}))});
      for(const match of matches){
        if((Number(match.minutes)||0)<=0)continue;
        const forced={...match,sourceKey:`exophase:ubisoft:${match.masterPlayerId||id}:${match.masterId||'motorfest'}`,platform:'ubisoft',environment:'ubisoft',source:'master-player-direct'};
        const existing=bySource.get(forced.sourceKey);if(existing){if(forced.minutes>existing.minutes)Object.assign(existing,forced);}else{games.push(forced);bySource.set(forced.sourceKey,forced);}
      }
    }catch(error){diagnostics.directPlayerLookups.push({playerId:id,ok:false,error:String(error?.message||error)});}
  }
  positive=games.filter(x=>x.platform==='ubisoft'&&isMotorfestTitle(x.title)&&(Number(x.minutes)||0)>0);
  diagnostics.positiveAfterDirect=positive.map(x=>({title:x.title,minutes:x.minutes,source:x.source,masterPlayerId:x.masterPlayerId,masterId:x.masterId}));
  return diagnostics;
}
async function exophase(env){
  try{
    const profile=await resolveExophaseProfile(env),library=await fetchPlayerGames(profile.playerId),games=library.games;
    const ubisoftEnrichment=await enrichUbisoftMotorfest(games,profile.recentRows);
    const ubisoftCandidates=games.filter(x=>x.platform==='ubisoft'&&/crew|motorfest/i.test(x.title)).map(x=>({title:x.title,minutes:x.minutes,sourceKey:x.sourceKey,masterPlayerId:x.masterPlayerId,masterId:x.masterId,environment:x.environment,platform:x.platform,canonicalUrl:x.canonicalUrl,endpointAwards:x.endpointAwards,source:x.source}));
    return{ok:true,playerId:profile.playerId,games,pagesRead:library.pageSizes.filter(n=>n>0).length,pageSizes:library.pageSizes,profileFetch:profile.profileFetch,recentGameCount:profile.recentRows.length,ubisoftCandidates,ubisoftEnrichment};
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
async function steamOfficial(env,map){
  const key=String(env?.STEAM_API_KEY||'').trim();if(!key)return false;
  const u=new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
  u.searchParams.set('key',key);u.searchParams.set('steamid',STEAM_ID);u.searchParams.set('include_appinfo','1');u.searchParams.set('include_played_free_games','1');u.searchParams.set('format','json');
  const r=await fetch(u.toString(),{headers:{'user-agent':UA,'accept':'application/json'}});if(!r.ok)throw new Error(`Steam Web API returned ${r.status}`);
  const rows=(await r.json())?.response?.games;if(!Array.isArray(rows)||!rows.length)throw new Error('Steam Web API returned no owned games');
  for(const row of rows)addSteam(map,row,'steam-web-api');return true;
}
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
async function steam(env){
  const map=new Map(),methods=[],errors=[];
  try{if(await steamOfficial(env,map))methods.push('web-api');}catch(error){errors.push(String(error?.message||error));}
  const headers={'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/xml;q=0.8','accept-language':'en-US,en;q=0.9'};
  const urls=[`https://steamcommunity.com/profiles/${STEAM_ID}/games?tab=all&xml=1`,`https://steamcommunity.com/profiles/${STEAM_ID}/games?xml=1`,`https://steamcommunity.com/profiles/${STEAM_ID}/games?tab=all`];
  const responses=await Promise.allSettled(urls.map(u=>fetch(u,{headers})));
  for(let i=0;i<responses.length;i++){
    const x=responses[i];if(x.status!=='fulfilled'||!x.value.ok)continue;const text=await x.value.text();
    if(i<2){parseSteamXml(text,map);methods.push(i===0?'xml-all':'xml');}else{parseSteamHtml(text,map);methods.push('community-page');}
  }
  const games=[...map.values()];
  if(!games.length)return{ok:false,error:errors[0]||'Steam public sources returned no owned-game playtime',games:[],method:methods.join('+')};
  return{ok:true,steamId:STEAM_ID,games,method:[...new Set(methods)].join('+')||'community',warnings:errors};
}
function mergeExophaseSteam(stm,exo){
  if(!exo?.ok)return stm;
  const exoSteam=(exo.games||[]).filter(x=>x.environment==='steam'||x.platform==='steam'),byTitle=new Map((stm.games||[]).map((x,i)=>[titleKey(x.title),i]));
  for(const x of exoSteam){
    const key=titleKey(x.title);if(!key)continue;const i=byTitle.get(key);
    if(i!=null){
      const cur=stm.games[i];if((Number(cur.minutes)||0)<=0&&(Number(x.minutes)||0)>0)cur.minutes=Number(x.minutes)||0;
      if(x.lastPlayed>String(cur.lastPlayed||''))cur.lastPlayed=x.lastPlayed;if(!cur.firstPlayed&&x.firstPlayed)cur.firstPlayed=x.firstPlayed;if(!cur.image&&x.image)cur.image=x.image;continue;
    }
    if((Number(x.minutes)||0)<=0)continue;
    byTitle.set(key,stm.games.length);stm.games.push({sourceKey:`steam:exophase:${x.masterPlayerId||'player'}:${x.masterId||key}`,appId:null,title:x.title,minutes:Number(x.minutes)||0,recentMinutes:0,hoursLast2Weeks:0,firstPlayed:x.firstPlayed||'',lastPlayed:x.lastPlayed||'',platform:'steam',environment:'steam',image:x.image||'',source:'exophase-steam-fallback'});
  }
  if(!stm.ok&&stm.games.length){stm.ok=true;stm.error='';stm.method='exophase-steam-fallback';}
  return stm;
}
export async function onRequestGet({env,request}){
  if(!(await isAuthenticated(env,request)))return json({error:'Connect T.I.D.E. Cloud Sync first.'},401);
  const [exo,rawSteam]=await Promise.all([exophase(env),steam(env)]),stm=mergeExophaseSteam(rawSteam,exo);
  return json({capturedAt:new Date().toISOString(),exophase:exo,steam:stm,ruleNotes:{legacyPs4:'19 visible games plus 118 unassigned lifetime hours',ubisoft:'Motorfest uses the live Exophase library, then the profile recent-games SSR blob, then the selected master_playerid library if the combined row has zero playtime. The client keeps only the single Ubisoft PC Motorfest identity nearest the known ~99h baseline.',steam:'Steam Web API is used when configured; current Steam community data and Exophase Steam are automatic fallbacks.',history:'Sources expose cumulative playtime and first/last played dates. T.I.D.E. creates its own exact monthly history from snapshots and recovers only defensible pre-baseline hours.'}});
}
