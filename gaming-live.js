import {displayTitle,gaming,hours,keyTitle,maxDate,now,saveGaming,toast} from './gaming-data.js';

const PC_SOURCE_VERSION='pc-monthly-v7';
const RECOVERY_VERSION='baseline-month-recovery-v2';
function localToday(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}

function isUbisoft(x){
  const env=String(x?.environment||'').toLowerCase(),platform=String(x?.platform||'').toLowerCase(),source=String(x?.sourceKey||'').toLowerCase(),canonical=String(x?.canonicalUrl||'').toLowerCase();
  return env.includes('uplay')||env.includes('ubisoft')||platform==='ubisoft'||source.includes(':uplay:')||source.includes(':ubisoft:')||canonical.includes('uplay')||canonical.includes('ubisoft');
}
function isSteam(x){return String(x?.environment||'').toLowerCase()==='steam'||String(x?.platform||'').toLowerCase()==='steam';}
function isMotorfest(x){return /(?:the\s+crew\s+)?motorfest/i.test(String(x?.title||''));}
function chooseUbisoftIdentity(g,games){
  const candidates=games.filter(x=>isUbisoft(x)&&isMotorfest(x));
  if(!candidates.length)return null;
  const savedPlayer=String(g.ubisoftMotorfestPlayerId||''),positive=candidates.filter(x=>(Number(x.minutes)||0)>0),pool=positive.length?positive:candidates;
  const chosen=pool.slice().sort((a,b)=>{
    const da=Math.abs((Number(a.minutes)||0)-5940),db=Math.abs((Number(b.minutes)||0)-5940);
    if(da!==db)return da-db;
    const as=String(a.masterPlayerId||'')===savedPlayer?0:1,bs=String(b.masterPlayerId||'')===savedPlayer?0:1;
    return as-bs;
  })[0]||null;
  if(chosen){
    g.ubisoftMotorfestPlayerId=String(chosen.masterPlayerId||'');
    g.ubisoftMotorfestSourceKey=chosen.sourceKey;
    g.ubisoftMotorfestMinutes=Number(chosen.minutes)||0;
  }
  return chosen;
}
function shift(date,n){const [y,m,d]=String(date).split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);}
function trackedByGamePlatform(g,start,end){
  const out=new Map();
  for(const [date,rec] of Object.entries(g.activity||{})){
    if(date<start||date>end)continue;
    for(const item of Object.values(rec.games||{})){
      const k=item.key||keyTitle(item.title);
      for(const [platform,value] of Object.entries(item.platformMinutes||{})){
        const id=`${k}|${platform}`;out.set(id,(out.get(id)||0)+(Number(value)||0));
      }
    }
  }
  return out;
}
function addRecovered(rec,source,minutes,reason){
  if(minutes<=0)return;
  const k=keyTitle(source.title),item=rec.games[k]||{key:k,title:displayTitle(source.title),platformMinutes:{},lastPlayed:'',image:source.image||'',reasons:{}};
  item.platformMinutes[source.platform]=(item.platformMinutes[source.platform]||0)+minutes;
  item.lastPlayed=maxDate(item.lastPlayed,source.lastPlayed);
  if(!item.image&&source.image)item.image=source.image;
  item.reasons[source.platform]=reason;
  rec.games[k]=item;
}
function recoverBaselineMonth(g,next,date,data){
  if(g.monthRecoveryVersion===RECOVERY_VERSION)return;
  if(!g.baselineDate||g.baselineDate.slice(0,7)!==date.slice(0,7))return;
  if(!data.exophase?.ok&&!data.steam?.ok)return;
  const month=g.baselineDate.slice(0,7),monthStart=`${month}-01`,tracked=trackedByGamePlatform(g,g.baselineDate,date),
    rec={games:{},cutoffDate:date,baselineDate:g.baselineDate,updatedAt:now(),note:'Defensible pre-baseline recovery only. Steam recent-two-week time and games first played this month can be recovered; older long-running games remain partial.'};
  const recentStart=shift(date,-13);
  for(const source of next){
    if(!source.countMinutes)continue;
    let candidate=0,reason='';
    const recent=Math.max(0,Number(source.recentMinutes)||Math.round((Number(source.hoursLast2Weeks)||0)*60));
    if(source.platform==='steam'&&recent>0&&recentStart>=monthStart){candidate=recent;reason='Steam recent two-week playtime';}
    if(source.firstPlayed&&String(source.firstPlayed)>=monthStart&&String(source.firstPlayed)<=date&&(Number(source.minutes)||0)>candidate){candidate=Number(source.minutes)||0;reason='Entire lifetime falls after first-played date this month';}
    if(candidate<=0)continue;
    const id=`${keyTitle(source.title)}|${source.platform}`,already=tracked.get(id)||0,recovered=Math.max(0,candidate-already);
    addRecovered(rec,source,recovered,reason);
  }
  g.recoveredMonths||={};g.recoveredMonths[month]=rec;g.monthRecoveryVersion=RECOVERY_VERSION;
}
function steamFallbackSource(x){return{...x,sourceKey:`steam:exophase:${x.masterPlayerId||'player'}:${x.masterId||keyTitle(x.title)}`,sourceFamily:'steam',platform:'steam',countMinutes:true};}
function process(data){
  const g=gaming(),previous=new Map((g.latestSources||[]).map(x=>[x.sourceKey,x])),next=[],exoSteam=[];let ubiIdentity=null;
  if(data.exophase?.ok){
    const steamLast={},steamFirst={},exoGames=data.exophase.games||[];ubiIdentity=chooseUbisoftIdentity(g,exoGames);
    for(const x of exoGames)if(isSteam(x)){steamLast[keyTitle(x.title)]=x.lastPlayed||'';steamFirst[keyTitle(x.title)]=x.firstPlayed||'';exoSteam.push(x);}
    for(const x of exoGames){
      if(isSteam(x))continue;
      if(isUbisoft(x)){
        if(!ubiIdentity||x.sourceKey!==ubiIdentity.sourceKey)continue;
        next.push({...x,sourceFamily:'exophase',platform:'ubisoft',environment:'ubisoft',countMinutes:true});
        continue;
      }
      next.push({...x,sourceFamily:'exophase',countMinutes:true});
    }
    g._steamLast=steamLast;g._steamFirst=steamFirst;g.exophasePlayerId=data.exophase.playerId||g.exophasePlayerId||'';
    g.ubisoftLiveDiagnostics={pagesRead:data.exophase.pagesRead||0,pageSizes:data.exophase.pageSizes||[],profileFetch:data.exophase.profileFetch||'',recentGameCount:data.exophase.recentGameCount||0,candidates:data.exophase.ubisoftCandidates||[],enrichment:data.exophase.ubisoftEnrichment||{},selected:ubiIdentity?{title:ubiIdentity.title,minutes:Number(ubiIdentity.minutes)||0,sourceKey:ubiIdentity.sourceKey,masterPlayerId:ubiIdentity.masterPlayerId||'',canonicalUrl:ubiIdentity.canonicalUrl||'',source:ubiIdentity.source||''}:null,updatedAt:now()};
  }else next.push(...(g.latestSources||[]).filter(x=>x.sourceFamily==='exophase'));

  const steamAdded=new Set();
  if(data.steam?.ok){
    for(const x of data.steam.games||[]){
      const k=keyTitle(x.title);steamAdded.add(k);
      next.push({...x,sourceFamily:'steam',platform:'steam',countMinutes:true,firstPlayed:x.firstPlayed||g._steamFirst?.[k]||'',lastPlayed:maxDate(x.lastPlayed,g._steamLast?.[k])});
    }
  }
  for(const x of exoSteam){const k=keyTitle(x.title);if(!steamAdded.has(k)&&(Number(x.minutes)||0)>0){next.push(steamFallbackSource(x));steamAdded.add(k);}}
  if(!data.steam?.ok&&!exoSteam.length)next.push(...(g.latestSources||[]).filter(x=>x.sourceFamily==='steam'));

  const first=!g.baselineDate,date=localToday(),deltaGames={};
  if(!first){
    for(const cur of next){
      const old=previous.get(cur.sourceKey);if(!old)continue;
      const delta=(Number(cur.minutes)||0)-(Number(old.minutes)||0);if(delta<=0)continue;
      const k=keyTitle(cur.title),item=deltaGames[k]||{key:k,title:displayTitle(cur.title),platformMinutes:{},lastPlayed:'',image:cur.image||''};
      item.platformMinutes[cur.platform]=(item.platformMinutes[cur.platform]||0)+delta;
      item.lastPlayed=maxDate(item.lastPlayed,cur.lastPlayed);deltaGames[k]=item;
    }
  }
  if(first)g.baselineDate=date;
  else if(Object.keys(deltaGames).length){
    const rec=g.activity[date]||{games:{},updatedAt:now()};
    for(const [k,item] of Object.entries(deltaGames)){
      const old=rec.games[k]||{key:k,title:item.title,platformMinutes:{},lastPlayed:'',image:item.image};
      for(const [p,v] of Object.entries(item.platformMinutes))old.platformMinutes[p]=(old.platformMinutes[p]||0)+v;
      old.lastPlayed=maxDate(old.lastPlayed,item.lastPlayed);rec.games[k]=old;
    }
    rec.updatedAt=now();g.activity[date]=rec;
  }

  recoverBaselineMonth(g,next,date,data);
  g.latestSources=next;g.lastRefreshAt=data.capturedAt||now();g.lastRefreshLocalDate=date;g.liveSourceVersion=PC_SOURCE_VERSION;g.liveStatus={exophase:data.exophase||{},steam:data.steam||{}};
  saveGaming(g);
  return{first,ubiIdentity,added:Object.values(deltaGames).reduce((n,x)=>n+Object.values(x.platformMinutes).reduce((a,b)=>a+b,0),0)};
}
export async function refreshGaming({manual=false,onDone=null}={}){
  try{
    if(manual)toast('Refreshing gaming accounts…');
    const r=await fetch('/api/gaming/live',{credentials:'same-origin',cache:'no-store'}),data=await r.json();
    if(!r.ok)throw new Error(data.error||`Gaming refresh failed (${r.status})`);
    const result=process(data),errors=[data.exophase?.ok?'':`Exophase: ${data.exophase?.error||'unavailable'}`,data.steam?.ok?'':`Steam: ${data.steam?.error||'unavailable'}`].filter(Boolean),ubi=result.ubiIdentity,ubiMinutes=Number(ubi?.minutes)||0;
    if(data.exophase?.ok&&ubiMinutes<=0){
      const enrich=data.exophase.ubisoftEnrichment||{},recent=(enrich.recentCandidates||[]).length,direct=(enrich.directPlayerLookups||[]).length;
      errors.push(`Ubisoft Motorfest: live playtime still 0h · recent ${recent} · direct ${direct}`);
    }
    const ubiSource=String(ubi?.source||'').replace(/-/g,' '),ubiNote=ubiMinutes>0?` · Motorfest PC ${hours(ubiMinutes)} loaded${ubiSource?` via ${ubiSource}`:''}`:'';
    if(manual)toast(errors.length?`Refresh saved with partial data · ${errors.join(' · ')}${ubiNote}`:result.first?`Gaming baseline established${ubiNote}. Future playtime changes will feed Month/Year automatically.`:`Gaming refreshed${result.added?` · +${hours(result.added)} tracked`:''}${ubiNote}.`,errors.length?'bad':'good');
    onDone?.(data,result);return data;
  }catch(e){if(manual)toast(e.message,'bad');return null;}
}
export function autoRefreshGaming(){const g=gaming();if(g.liveSourceVersion!==PC_SOURCE_VERSION||g.monthRecoveryVersion!==RECOVERY_VERSION||g.lastRefreshLocalDate!==localToday())refreshGaming({manual:false});}
