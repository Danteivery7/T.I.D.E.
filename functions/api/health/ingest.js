import {json} from '../../_lib/auth.js';
import {mergeAndWrite,readCloud,validState} from '../../_lib/state.js';
import {parseHealthAutoExport} from '../../_lib/health-auto-export.js';

const MAX_BYTES=2_500_000;
async function equalToken(provided,configured){
 if(!configured||!provided||provided.length>300||configured.length>300)return false;
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([provided,configured].map(v=>crypto.subtle.digest('SHA-256',encoder.encode(v))));
 const aa=new Uint8Array(a),bb=new Uint8Array(b);let mismatch=0;
 for(let i=0;i<aa.length;i++)mismatch|=aa[i]^bb[i];
 return mismatch===0;
}
export async function onRequestGet(){
 return json({error:'This is a private upload-only endpoint. Use POST from Health Auto Export.'},405);
}
export async function onRequestPost({request,env}){
 if(!env?.TIDE_DB||!env?.TIDE_HEALTH_INGEST_TOKEN)
   return json({error:'T.I.D.E. Health automation has not been configured yet.'},503);
 const authorization=request.headers.get('authorization')||'';
 const match=authorization.match(/^Bearer\s+(.+)$/i);
 if(!match||!await equalToken(match[1].trim(),String(env.TIDE_HEALTH_INGEST_TOKEN)))
   return json({error:'Invalid Health upload token.'},401);
 if(!/application\/json/i.test(request.headers.get('content-type')||''))
   return json({error:'Send Health Auto Export as JSON (Version 2).'},415);
 const size=Number(request.headers.get('content-length')||0);
 if(size>MAX_BYTES)return json({error:'Export too large; enable JSON batch requests or reduce date range.'},413);
 let raw='';
 try{raw=await request.text();}catch{return json({error:'Could not read Health upload.'},400);}
 if(raw.length>MAX_BYTES)return json({error:'Export too large; enable JSON batch requests.'},413);
 let parsed;
 try{parsed=parseHealthAutoExport(JSON.parse(raw));}
 catch(error){return json({error:String(error?.message||'Invalid Health Auto Export JSON').slice(0,200)},422);}
 if(parsed.days.length>366)return json({error:'Upload a year or less at once. For automatic syncing, Previous 7 Days is recommended.'},413);
 try{
   const current=await readCloud(env);
   if(!validState(current.state))return json({error:'Activate your initial private T.I.D.E. Health + Finances import before starting auto-sync.'},409);
   const state=structuredClone(current.state),now=new Date().toISOString();
   state.healthActivity||={days:{},updatedAt:''};
   state.healthActivity.days||={};
   for(const record of parsed.days){
     state.healthActivity.days[record.date]={...(state.healthActivity.days[record.date]||{}),...record,updatedAt:now};
   }
   const latestDate=parsed.days.at(-1)?.date||'';
   state.healthActivity.source='Apple Health · Health Auto Export';
   state.healthActivity.updatedAt=now;
   state.healthActivity.autoSync={
     type:'health-auto-export',status:'receiving',lastReceivedAt:now,lastSourceDate:latestDate,
     metricNames:parsed.metricNames
   };
   await mergeAndWrite(env,state);
   return json({ok:true,daysUpserted:parsed.days.length,latestHealthDay:latestDate,receivedAt:now});
 }catch{return json({error:'Private T.I.D.E. storage update failed.'},500);}
}
