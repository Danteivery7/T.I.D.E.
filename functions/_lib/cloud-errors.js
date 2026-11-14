// Consistent, safe error messages for T.I.D.E.'s private Cloudflare D1 saves.
// These never claim that a failed write reached another device.
function nextMidnightUTC(now=new Date()){
 const next=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
 return next.toISOString();
}
export function cloudStorageFailure(error,now=new Date()){
 const raw=String(error?.message||error||'');
 const exhaustedDaily=/D1.*free tier daily row (read|write) limit|daily row (read|write) limit/i.test(raw);
 if(exhaustedDaily){
   return {status:429,code:'D1_DAILY_QUOTA',retryAt:nextMidnightUTC(now),
     error:'Cloudflare has reached its daily D1 usage limit. Your unsynced changes remain on this device. Cloud writes can resume after 00:00 UTC (19:00 Eastern during standard time), and T.I.D.E. will retry automatically.'};
 }
 if(/QuotaExceededError|quota has been exceeded|quota exceeded/i.test(raw)){
   return {status:507,code:'STORAGE_QUOTA',
     error:'The storage quota has been exceeded. Keep this browser’s local T.I.D.E. data intact; your pending changes have not been confirmed in cloud storage. The updated save system reduces duplicate storage use.'};
 }
 if(/SQLITE_TOOBIG|string or blob too big|compressed D1 record limit|maximum.*size/i.test(raw)){
   return {status:507,code:'CLOUD_RECORD_SIZE',
     error:'The T.I.D.E. cloud record is too large for D1. Keep the local copy and export a backup. No cloud save was confirmed.'};
 }
 return {status:500,code:'CLOUD_SAVE_FAILED',error:raw.slice(0,260)||'T.I.D.E. cloud storage request failed.'};
}
