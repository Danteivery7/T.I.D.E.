import { cloudPull, cloudStatus, loadLocal, mergeStates, saveLocal } from './storage.js';

let running=false;
let lastRun=0;

function diaryFingerprint(state){
  return JSON.stringify({entries:state?.entries||{},occurrences:state?.occurrences||[]});
}

async function refreshFromCloudOnResume(){
  if(running||document.visibilityState!=='visible')return;
  const now=Date.now();
  if(now-lastRun<1000)return;
  lastRun=now;
  running=true;
  try{
    const status=await cloudStatus();
    if(!status?.authenticated)return;
    const before=loadLocal();
    const pulled=await cloudPull();
    const merged=mergeStates(before,pulled?.state);
    const changed=diaryFingerprint(before)!==diaryFingerprint(merged);
    if(changed){
      saveLocal(merged);
      window.location.reload();
    }
  }catch{}
  finally{running=false;}
}

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')void refreshFromCloudOnResume();
});
window.addEventListener('focus',()=>void refreshFromCloudOnResume());
