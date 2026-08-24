import {displayTitle,gaming,hours,keyTitle,maxDate,now,saveGaming,today,toast} from './gaming-data.js';

const PC_SOURCE_VERSION='pc-source-v2';
function isUbisoft(x){return x.environment==='uplay'||x.environment==='ubisoft';}
function chooseUbisoftIdentity(g,games){
  const candidates=games.filter(x=>isUbisoft(x)&&/the crew motorfest/i.test(x.title||''));
  if(!candidates.length)return null;
  const savedPlayer=String(g.ubisoftMotorfestPlayerId||'');
  let chosen=savedPlayer?candidates.find(x=>String(x.masterPlayerId||'')===savedPlayer):null;
  if(!chosen){const positive=candidates.filter(x=>(Number(x.minutes)||0)>0),pool=positive.length?positive:candidates;chosen=pool.slice().sort((a,b)=>Math.abs((Number(a.minutes)||0)-5940)-Math.abs((Number(b.minutes)||0)-5940))[0];}
  if(chosen){g.ubisoftMotorfestPlayerId=String(chosen.masterPlayerId||'');g.ubisoftMotorfestSourceKey=chosen.sourceKey;}
  return chosen||null;
}
function process(data){const g=gaming(),previous=new Map((g.latestSources||[]).map(x=>[x.sourceKey,x])),next=[];
  if(data.exophase?.ok){const steamLast={},exoGames=data.exophase.games||[],ubiIdentity=chooseUbisoftIdentity(g,exoGames);for(const x of exoGames)if(x.environment==='steam')steamLast[keyTitle(x.title)]=x.lastPlayed||'';for(const x of exoGames){if(x.environment==='steam')continue;if(isUbisoft(x)){if(!ubiIdentity||String(x.masterPlayerId||'')!==String(ubiIdentity.masterPlayerId||''))continue;}next.push({...x,sourceFamily:'exophase',countMinutes:true});}g._steamLast=steamLast;
  }else next.push(...(g.latestSources||[]).filter(x=>x.sourceFamily==='exophase'));
  if(data.steam?.ok){for(const x of data.steam.games||[])next.push({...x,sourceFamily:'steam',platform:'steam',countMinutes:true,lastPlayed:maxDate(x.lastPlayed,g._steamLast?.[keyTitle(x.title)])});}else next.push(...(g.latestSources||[]).filter(x=>x.sourceFamily==='steam'));
  const first=!g.baselineDate,date=today(),deltaGames={};if(!first){for(const cur of next){const old=previous.get(cur.sourceKey);if(!old)continue;const delta=(Number(cur.minutes)||0)-(Number(old.minutes)||0);if(delta<=0)continue;const k=keyTitle(cur.title),item=deltaGames[k]||{key:k,title:displayTitle(cur.title),platformMinutes:{},lastPlayed:'',image:cur.image||''};item.platformMinutes[cur.platform]=(item.platformMinutes[cur.platform]||0)+delta;item.lastPlayed=maxDate(item.lastPlayed,cur.lastPlayed);deltaGames[k]=item;}}
  if(first)g.baselineDate=date;else if(Object.keys(deltaGames).length){const rec=g.activity[date]||{games:{},updatedAt:now()};for(const [k,item] of Object.entries(deltaGames)){const old=rec.games[k]||{key:k,title:item.title,platformMinutes:{},lastPlayed:'',image:item.image};for(const [p,v] of Object.entries(item.platformMinutes))old.platformMinutes[p]=(old.platformMinutes[p]||0)+v;old.lastPlayed=maxDate(old.lastPlayed,item.lastPlayed);rec.games[k]=old;}rec.updatedAt=now();g.activity[date]=rec;}
  g.latestSources=next;g.lastRefreshAt=data.capturedAt||now();g.liveSourceVersion=PC_SOURCE_VERSION;g.liveStatus={exophase:data.exophase||{},steam:data.steam||{}};saveGaming(g);return{first,added:Object.values(deltaGames).reduce((n,x)=>n+Object.values(x.platformMinutes).reduce((a,b)=>a+b,0),0)};
}
export async function refreshGaming({manual=false,onDone=null}={}){try{if(manual)toast('Refreshing gaming accounts…');const r=await fetch('/api/gaming/live',{credentials:'same-origin',cache:'no-store'}),data=await r.json();if(!r.ok)throw new Error(data.error||`Gaming refresh failed (${r.status})`);const result=process(data),errors=[data.exophase?.ok?'':`Exophase: ${data.exophase?.error||'unavailable'}`,data.steam?.ok?'':`Steam: ${data.steam?.error||'unavailable'}`].filter(Boolean);if(manual)toast(errors.length?`Refresh saved with partial data · ${errors.join(' · ')}`:result.first?'Gaming baseline established. Future playtime changes will feed Month/Year automatically.':`Gaming refreshed${result.added?` · +${hours(result.added)} tracked`:''}.`,errors.length?'bad':'good');onDone?.(data,result);return data;}catch(e){if(manual)toast(e.message,'bad');return null;}}
export function autoRefreshGaming(){const g=gaming();if(g.liveSourceVersion!==PC_SOURCE_VERSION||g.lastRefreshAt?.slice(0,10)!==today())refreshGaming({manual:false});}
