import { cloudPull, cloudPush, cloudStatus, loadLocal, mergeStates, saveDraft, saveLocal } from './storage.js';

const root=document.querySelector('#view-root');
const toastRegion=document.querySelector('#toast-region');
const PENDING_KEY='tide_pending_cloud_save_v2';
let status={configured:false,authenticated:false};
let checking=null;
let committing=false;
let incomingCheck=false;

function toast(message,type='good'){
  const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastRegion?.append(el);setTimeout(()=>el.remove(),4200);
}
function removeSaveToasts(){
  toastRegion?.querySelectorAll('.toast').forEach(el=>{
    const text=el.textContent?.trim()||'';
    if(/Day saved locally|Cloud sync complete|Saving across devices|Day saved across devices|Shared save failed/i.test(text))el.remove();
  });
}
async function refreshStatus(force=false){
  if(checking&&!force)return checking;
  checking=cloudStatus().then(result=>{status=result||status;return status;}).finally(()=>{checking=null});
  return checking;
}
function selectedDate(){
  const text=root?.querySelector('.day-nav-center h1')?.textContent?.trim();
  if(!text)return null;
  const d=new Date(`${text.replace(/^[A-Za-z]+,\s*/,'')} 12:00:00`);
  if(Number.isNaN(d.getTime()))return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function currentPayload(){return {date:selectedDate(),text:root?.querySelector('#day-editor')?.value||'',queuedAt:new Date().toISOString()};}
function setPending(payload){try{localStorage.setItem(PENDING_KEY,JSON.stringify(payload||currentPayload()));}catch{}}
function getPending(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'null');}catch{return null;}}
function clearPending(){try{localStorage.removeItem(PENDING_KEY);}catch{}}
function decorate(){
  const note=root?.querySelector('#save-note');if(note)note.textContent='Save Day confirms the entry in shared Cloudflare storage so it is available on every connected device.';
  const auto=root?.querySelector('#autosync');if(auto){const label=auto.closest('label');if(label)label.style.display='none';}
  const pill=document.querySelector('#sync-pill span:last-child');if(pill&&status.authenticated)pill.textContent='Shared cloud ready';
}
function latestEntryStamp(state){
  let latest='';for(const entry of Object.values(state?.entries||{})){const stamp=String(entry?.updatedAt||'');if(stamp>latest)latest=stamp;}return latest;
}

async function commitPending({announce=true}={}){
  if(committing)return false;
  const pending=getPending();if(!pending)return true;
  committing=true;
  try{
    const fresh=await refreshStatus(true);
    if(!fresh.authenticated)throw new Error(fresh.configured?'Cloud Sync is not connected on this device.':'Shared Cloudflare storage is not configured.');
    if(announce){removeSaveToasts();toast('Saving across devices…');}
    const local=loadLocal();
    const pushed=await cloudPush(local,null);
    if(!pushed?.ok&&!pushed?.state)throw new Error('Cloudflare did not confirm the save.');
    if(pushed.state)saveLocal(pushed.state);
    clearPending();
    status.authenticated=true;
    removeSaveToasts();
    if(announce)toast('Day saved across devices.');
    decorate();
    return true;
  }catch(error){
    if(pending?.date)saveDraft(pending.date,pending.text||'');
    if(/Unauthorized|not connected/i.test(String(error?.message||error)))status.authenticated=false;
    removeSaveToasts();
    if(announce)toast(`Cloud save failed: ${error.message}. Your draft is preserved and T.I.D.E. will retry automatically.`,'bad');
    return false;
  }finally{committing=false;}
}

async function pullNewerDiary(){
  if(incomingCheck||document.hidden)return;
  incomingCheck=true;
  try{
    const fresh=await refreshStatus(true);if(!fresh.authenticated)return;
    const local=loadLocal(),pulled=await cloudPull();if(!pulled?.state)return;
    if(latestEntryStamp(pulled.state)<=latestEntryStamp(local))return;
    const merged=mergeStates(local,pulled.state);saveLocal(merged);
    const editor=root?.querySelector('#day-editor');
    if(editor&&document.activeElement===editor)return;
    location.reload();
  }catch{}finally{incomingCheck=false;}
}

await refreshStatus();
decorate();
if(getPending())void commitPending({announce:false});

document.addEventListener('click',async event=>{
  const button=event.target.closest('#save-day');if(!button)return;
  const payload=currentPayload();
  const fresh=status.authenticated?status:await refreshStatus(true);
  if(!fresh.authenticated){
    event.preventDefault();event.stopImmediatePropagation();
    if(payload.date)saveDraft(payload.date,payload.text);
    toast(fresh.configured?'Cloud Sync is not connected on this device. Open Settings and connect once; your draft is preserved.':'Shared Cloudflare storage is not configured. Your draft is preserved.','bad');
    return;
  }
  setPending(payload);
  setTimeout(()=>void commitPending({announce:true}),0);
},true);

document.addEventListener('click',event=>{
  if(event.target.closest('[data-view="today"],[data-view="settings"],#jump-today'))setTimeout(decorate,0);
},true);

window.addEventListener('online',()=>{if(getPending())void commitPending({announce:false});void pullNewerDiary();});
window.addEventListener('focus',()=>{if(getPending())void commitPending({announce:false});void pullNewerDiary();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(getPending())void commitPending({announce:false});void pullNewerDiary();}});
setInterval(()=>{if(document.hidden)return;if(getPending())void commitPending({announce:false});else void pullNewerDiary();},30000);
