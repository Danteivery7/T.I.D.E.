import {displayTitle,gaming,keyTitle,maxDate,now,saveGaming,toast} from './gaming-data.js';

const PC_SOURCE_VERSION='pc-monthly-v13';
const RECOVERY_VERSION='baseline-month-recovery-v2';
const UBISOFT_CORRECTION_VERSION='motorfest-total-minus-console-v3';
const MOTORFEST_PC_SOURCE_KEY='ubisoft:derived:motorfest:pc';
const MOTORFEST_PENDING_GRACE_MS=24*60*60*1000;
function localToday(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}

function isUbisoft(x){return String(x?.platform||'').toLowerCase()==='ubisoft';}
function isSteam(x){return String(x?.environment||'').toLowerCase()==='steam'||String(x?.platform||'').toLowerCase()==='steam';}
function isMotorfest(x){return /(?:the\s+crew\s+)?motorfest/i.test(String(x?.title||''));}
function isCrew2(x){return /(?:the\s+)?crew\s*2/i.test(String(x?.title||''));}
function cleanInvalidMotorfestInference(g){
  if(g.ubisoftCorrectionVersion===UBISOFT_CORRECTION_VERSION)return;
  const cleanRecords=records=>{
    for(const rec of Object.values(records||{})){
      for(const [k,item] of Object.entries(rec?.games||{})){
        if(!isMotorfest(item))continue;
        if(item.platformMinutes?.ubisoft!=null)delete item.platformMinutes.ubisoft;
        if(item.reasons?.ubisoft!=null)delete item.reasons.ubisoft;
        if(!Object.values(item.platformMinutes||{}).some(v=>(Number(v)||0)>0))delete rec.games[k];
      }
    }
  };
  cleanRecords(g.activity);cleanRecords(g.recoveredMonths);
  g.latestSources=(g.latestSources||[]).filter(x=>!(String(x?.platform||'').toLowerCase()==='ubisoft'&&isMotorfest(x)));
  delete g.ubisoftMotorfestPlayerId;delete g.ubisoftMotorfestSourceKey;delete g.ubisoftMotorfestMinutes;
  delete g.motorfestSnapshot;delete g.motorfestPendingPc;
  g.ubisoftCorrectionVersion=UBISOFT_CORRECTION_VERSION;
}
function chooseUbisoftPcIdentity(g,games){
  const crew2=games.filter(x=>isUbisoft(x)&&isCrew2(x)&&(Number(x.minutes)||0)>0);
  const savedPlayer=String(g.ubisoftPcPlayerId||'');
  let chosen=savedPlayer?crew2.find(x=>String(x.masterPlayerId||'')===savedPlayer)||null:null;
  if(!chosen){
    chosen=crew2.slice().sort((a,b)=>{
      const da=Math.abs((Number(a.minutes)||0)-5940),db=Math.abs((Number(b.minutes)||0)-5940);
      if(da!==db)return da-db;
      return String(a.masterPlayerId||'').localeCompare(String(b.masterPlayerId||''));
    })[0]||null;
  }
  if(!chosen&&savedPlayer)chosen=games.find(x=>isUbisoft(x)&&String(x.masterPlayerId||'')===savedPlayer)||null;
  if(chosen){
    g.ubisoftPcPlayerId=String(chosen.masterPlayerId||'');
    g.ubisoftCrew2SourceKey=chosen.sourceKey;
    g.ubisoftCrew2Minutes=Number(chosen.minutes)||0;
    g.ubisoftIdentityAnchor=savedPlayer&&String(chosen.masterPlayerId||'')===savedPlayer?'crew2-pc-saved-identity':'crew2-pc-99h-initial';
  }
  return chosen;
}
function sameUbisoftAccount(x,identity){
  if(!identity||!isUbisoft(x))return false;
  const selectedPlayer=String(identity.masterPlayerId||''),rowPlayer=String(x.masterPlayerId||'');
  if(selectedPlayer&&rowPlayer)return selectedPlayer===rowPlayer;
  return x.sourceKey===identity.sourceKey;
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
  const month=g.baselineDate.slice(0,7),monthStart=`${month}-01`,tracked=trackedByGamePlatform(g,g.baselineDate,date),rec={games:{},cutoffDate:date,baselineDate:g.baselineDate,updatedAt:now(),note:'Defensible pre-baseline recovery only. Steam recent-two-week time and games first played this month can be recovered; older long-running games remain partial.'};
  const recentStart=shift(date,-13);
  for(const source of next){
    if(!source.countMinutes)continue;let candidate=0,reason='';
    const recent=Math.max(0,Number(source.recentMinutes)||Math.round((Number(source.hoursLast2Weeks)||0)*60));
    if(source.platform==='steam'&&recent>0&&recentStart>=monthStart){candidate=recent;reason='Steam recent two-week playtime';}
    if(source.firstPlayed&&String(source.firstPlayed)>=monthStart&&String(source.firstPlayed)<=date&&(Number(source.minutes)||0)>candidate){candidate=Number(source.minutes)||0;reason='Entire lifetime falls after first-played date this month';}
    if(candidate<=0)continue;const id=`${keyTitle(source.title)}|${source.platform}`,already=tracked.get(id)||0,recovered=Math.max(0,candidate-already);addRecovered(rec,source,recovered,reason);
  }
  g.recoveredMonths||={};g.recoveredMonths[month]=rec;g.monthRecoveryVersion=RECOVERY_VERSION;
}
function steamFallbackSource(x){return{...x,sourceKey:`steam:exophase:${x.masterPlayerId||'player'}:${x.masterId||keyTitle(x.title)}`,sourceFamily:'steam',platform:'steam',countMinutes:true};}
function maxMotorfestMinutes(games,platforms){
  let best=0;
  for(const x of games){if(!isMotorfest(x)||!platforms.includes(String(x.platform||'').toLowerCase()))continue;best=Math.max(best,Number(x.minutes)||0);}
  return best;
}
function motorfestDerived(data,exoGames,previous){
  if(!data.exophase?.ok||!data.ubisoftMotorfest?.ok)return{ok:false,error:data.ubisoftMotorfest?.error||'Motorfest sources unavailable',source:previous||null};
  const total=Math.max(0,Number(data.ubisoftMotorfest.totalMinutes)||0),ps5=maxMotorfestMinutes(exoGames,['ps5','playstation']),xbox=maxMotorfestMinutes(exoGames,['xbox']),pc=total-ps5-xbox;
  if(total<=0)return{ok:false,error:'Ubisoft Motorfest returned no playtime',source:previous||null};
  if(pc<0)return{ok:false,error:'Motorfest console totals exceed Ubisoft total',source:previous||null,total,ps5,xbox};
  const modified=String(data.ubisoftMotorfest.lastModified||''),lastPlayed=/^\d{4}-\d{2}-\d{2}/.test(modified)?modified.slice(0,10):'';
  return{ok:true,total,ps5,xbox,pc,source:{sourceKey:MOTORFEST_PC_SOURCE_KEY,sourceFamily:'ubisoft-derived',title:'The Crew Motorfest',minutes:pc,firstPlayed:'',lastPlayed,platform:'ubisoft',environment:'ubisoft-derived',image:'',countMinutes:true,derived:true,derivedFrom:{ubisoftTotalMinutes:total,ps5Minutes:ps5,xboxMinutes:xbox}}};
}
function addDeltaGame(deltaGames,title,platform,minutes,lastPlayed='',image=''){
  minutes=Math.max(0,Number(minutes)||0);if(!minutes)return;
  const k=keyTitle(title),item=deltaGames[k]||{key:k,title:displayTitle(title),platformMinutes:{},lastPlayed:'',image:image||''};
  item.platformMinutes[platform]=(item.platformMinutes[platform]||0)+minutes;item.lastPlayed=maxDate(item.lastPlayed,lastPlayed);if(!item.image&&image)item.image=image;deltaGames[k]=item;
}
function consumePending(pending,minutes){
  let left=Math.max(0,Number(minutes)||0);const out=pending.map(x=>({...x,minutes:Math.max(0,Number(x.minutes)||0)}));
  for(let i=out.length-1;i>=0&&left>0;i--){const n=out[i].minutes;if(left>=n){left-=n;out.splice(i,1);}else{out[i].minutes=n-left;left=0;}}
  return out.filter(x=>x.minutes>0);
}
function reconcileMotorfestActivity(g,mf,date,deltaGames){
  if(!mf?.ok)return;
  const current={version:'total-minus-console-v1',total:mf.total,ps5:mf.ps5,xbox:mf.xbox,pc:mf.pc,capturedAt:now()},previous=g.motorfestSnapshot;
  let pending=Array.isArray(g.motorfestPendingPc)?g.motorfestPendingPc.filter(x=>(Number(x.minutes)||0)>0):[];
  if(previous?.version===current.version){
    const dTotal=current.total-(Number(previous.total)||0),dPs5=current.ps5-(Number(previous.ps5)||0),dXbox=current.xbox-(Number(previous.xbox)||0),unexplained=dTotal-dPs5-dXbox;
    if(unexplained>0)pending.push({minutes:unexplained,date,createdAt:now()});
    else if(unexplained<0)pending=consumePending(pending,-unexplained);
    const cutoff=Date.now()-MOTORFEST_PENDING_GRACE_MS,keep=[];
    for(const chunk of pending){const t=Date.parse(chunk.createdAt||'');if(Number.isFinite(t)&&t<=cutoff)addDeltaGame(deltaGames,'The Crew Motorfest','ubisoft',chunk.minutes,mf.source?.lastPlayed||'');else keep.push(chunk);}
    pending=keep;
  }
  g.motorfestSnapshot=current;g.motorfestPendingPc=pending;
  g.ubisoftMotorfestDiagnostics={totalMinutes:mf.total,ps5Minutes:mf.ps5,xboxMinutes:mf.xbox,pcMinutes:mf.pc,pendingPcMinutes:pending.reduce((n,x)=>n+(Number(x.minutes)||0),0),formula:'Ubisoft total - PS5 - Xbox',updatedAt:now()};
}
function process(data){
  const g=gaming();cleanInvalidMotorfestInference(g);
  const previous=new Map((g.latestSources||[]).map(x=>[x.sourceKey,x])),next=[],exoSteam=[];let ubiIdentity=null,keptUbisoft=[],mf=null;
  if(data.exophase?.ok){
    const steamLast={},steamFirst={},exoGames=data.exophase.games||[];ubiIdentity=chooseUbisoftPcIdentity(g,exoGames);
    for(const x of exoGames)if(isSteam(x)){steamLast[keyTitle(x.title)]=x.lastPlayed||'';steamFirst[keyTitle(x.title)]=x.firstPlayed||'';exoSteam.push(x);}
    for(const x of exoGames){
      if(isSteam(x))continue;
      if(isUbisoft(x)){
        if(isMotorfest(x))continue;
        if(!sameUbisoftAccount(x,ubiIdentity))continue;
        const kept={...x,sourceFamily:'exophase',platform:'ubisoft',countMinutes:true};
        next.push(kept);keptUbisoft.push(kept);continue;
      }
      next.push({...x,sourceFamily:'exophase',countMinutes:true});
    }
    const previousMf=(g.latestSources||[]).find(x=>x.sourceKey===MOTORFEST_PC_SOURCE_KEY)||null;mf=motorfestDerived(data,exoGames,previousMf);
    if(mf.source){next.push(mf.source);if(mf.ok)keptUbisoft.push(mf.source);}
    g._steamLast=steamLast;g._steamFirst=steamFirst;g.exophasePlayerId=data.exophase.playerId||g.exophasePlayerId||'';
    g.ubisoftLiveDiagnostics={pagesRead:data.exophase.pagesRead||0,pageSizes:data.exophase.pageSizes||[],candidates:data.exophase.crewCandidates||data.exophase.ubisoftCandidates||[],identityAnchor:g.ubisoftIdentityAnchor||'',selected:ubiIdentity?{title:ubiIdentity.title,minutes:Number(ubiIdentity.minutes)||0,sourceKey:ubiIdentity.sourceKey,masterPlayerId:ubiIdentity.masterPlayerId||'',platformTokens:ubiIdentity.platformTokens||[]}:null,keptGames:keptUbisoft.map(x=>({title:x.title,minutes:Number(x.minutes)||0,masterPlayerId:x.masterPlayerId||'',sourceKey:x.sourceKey,derived:Boolean(x.derived)})),updatedAt:now()};
  }else{
    next.push(...(g.latestSources||[]).filter(x=>x.sourceFamily==='exophase'||x.sourceFamily==='ubisoft-derived'));
  }

  const steamAdded=new Set();
  if(data.steam?.ok){
    for(const x of data.steam.games||[]){if(mf?.source&&isMotorfest(x))continue;const k=keyTitle(x.title);steamAdded.add(k);next.push({...x,sourceFamily:'steam',platform:'steam',countMinutes:true,firstPlayed:x.firstPlayed||g._steamFirst?.[k]||'',lastPlayed:maxDate(x.lastPlayed,g._steamLast?.[k])});}
  }
  for(const x of exoSteam){if(mf?.source&&isMotorfest(x))continue;const k=keyTitle(x.title);if(!steamAdded.has(k)&&(Number(x.minutes)||0)>0){next.push(steamFallbackSource(x));steamAdded.add(k);}}
  if(!data.steam?.ok&&!exoSteam.length)next.push(...(g.latestSources||[]).filter(x=>x.sourceFamily==='steam'));

  const first=!g.baselineDate,date=localToday(),deltaGames={};
  if(!first){
    for(const cur of next){
      if(cur.sourceKey===MOTORFEST_PC_SOURCE_KEY)continue;
      const old=previous.get(cur.sourceKey);if(!old)continue;const delta=(Number(cur.minutes)||0)-(Number(old.minutes)||0);if(delta<=0)continue;addDeltaGame(deltaGames,cur.title,cur.platform,delta,cur.lastPlayed,cur.image);
    }
    reconcileMotorfestActivity(g,mf,date,deltaGames);
  }else if(mf?.ok){
    reconcileMotorfestActivity(g,mf,date,deltaGames);
  }
  if(first)g.baselineDate=date;
  else if(Object.keys(deltaGames).length){
    const rec=g.activity[date]||{games:{},updatedAt:now()};
    for(const [k,item] of Object.entries(deltaGames)){const old=rec.games[k]||{key:k,title:item.title,platformMinutes:{},lastPlayed:'',image:item.image};for(const [p,v] of Object.entries(item.platformMinutes))old.platformMinutes[p]=(old.platformMinutes[p]||0)+v;old.lastPlayed=maxDate(old.lastPlayed,item.lastPlayed);rec.games[k]=old;}
    rec.updatedAt=now();g.activity[date]=rec;
  }
  recoverBaselineMonth(g,next,date,data);
  g.latestSources=next;g.lastRefreshAt=data.capturedAt||now();g.lastRefreshLocalDate=date;g.liveSourceVersion=PC_SOURCE_VERSION;g.liveStatus={exophase:data.exophase||{},steam:data.steam||{},ubisoftMotorfest:data.ubisoftMotorfest||{}};saveGaming(g);
  return{first,ubiIdentity,keptUbisoft,motorfest:mf,added:Object.values(deltaGames).reduce((n,x)=>n+Object.values(x.platformMinutes).reduce((a,b)=>a+b,0),0)};
}
export async function refreshGaming({manual=false,onDone=null}={}){
  try{
    if(manual)toast('Refreshing gaming accounts…');
    const r=await fetch('/api/gaming/live',{credentials:'same-origin',cache:'no-store'}),data=await r.json();if(!r.ok)throw new Error(data.error||`Gaming refresh failed (${r.status})`);
    const result=process(data),errors=[data.exophase?.ok?'':`Exophase: ${data.exophase?.error||'unavailable'}`,data.steam?.ok?'':`Steam: ${data.steam?.error||'unavailable'}`,data.ubisoftMotorfest?.ok?'':`Ubisoft Motorfest: ${data.ubisoftMotorfest?.error||'unavailable'}`].filter(Boolean),crew2=result.keptUbisoft.find(isCrew2),crew2Minutes=Number(crew2?.minutes)||0;
    if(data.exophase?.ok&&!result.ubiIdentity)errors.push('Ubisoft PC identity unavailable');
    if(data.exophase?.ok&&result.ubiIdentity&&crew2Minutes<=0)errors.push('Ubisoft PC Crew 2 returned no playtime');
    if(result.motorfest&&!result.motorfest.ok&&data.ubisoftMotorfest?.ok)errors.push(`Motorfest split: ${result.motorfest.error}`);
    if(manual)toast(errors.length?`Refresh saved with partial data · ${errors.join(' · ')}`:result.first?'Gaming baseline established. Future playtime changes will feed Month/Year automatically.':'Gaming refreshed.',errors.length?'bad':'good');
    onDone?.(data,result);return data;
  }catch(e){if(manual)toast(e.message,'bad');return null;}
}
export function autoRefreshGaming(){const g=gaming();if(g.liveSourceVersion!==PC_SOURCE_VERSION||g.monthRecoveryVersion!==RECOVERY_VERSION||g.ubisoftCorrectionVersion!==UBISOFT_CORRECTION_VERSION||g.lastRefreshLocalDate!==localToday())refreshGaming({manual:false});}
