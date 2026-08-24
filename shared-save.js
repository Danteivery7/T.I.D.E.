import { cloudPull, cloudPush, cloudStatus, loadLocal, mergeStates } from './storage.js';

const root=document.querySelector('#view-root');
const toastRegion=document.querySelector('#toast-region');
let status={configured:false,authenticated:false};
let checking=null;
let pending=null;

function toast(message,type='good'){
  const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastRegion?.append(el);setTimeout(()=>el.remove(),3600);
}
async function refreshStatus(){
  if(checking)return checking;
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
function removeLocalToast(){
  toastRegion?.querySelectorAll('.toast').forEach(el=>{if(el.textContent?.trim()==='Day saved locally.')el.remove();});
}
function decorate(){
  const note=root?.querySelector('#save-note');if(note)note.textContent='Save Day writes to your shared Cloudflare database so every connected device sees it.';
  const auto=root?.querySelector('#autosync');if(auto){const label=auto.closest('label');if(label)label.style.display='none';}
  const settings=root?.querySelector('.settings-section .small.muted');
  if(settings&&/Typing never syncs|Cloud writes happen/i.test(settings.textContent||''))settings.textContent='Save Day always writes to the shared Cloudflare database. Unsaved typing stays as a local draft until you press Save Day.';
}

await refreshStatus();
decorate();
document.addEventListener('click',event=>{
  if(event.target.closest('[data-view="today"],[data-view="settings"],#jump-today'))setTimeout(decorate,0);
},true);

document.addEventListener('click',async event=>{
  const button=event.target.closest('#save-day');if(!button)return;
  if(!status.authenticated){
    event.preventDefault();event.stopImmediatePropagation();
    const label=button.textContent;button.disabled=true;button.textContent='Checking cloud…';
    const fresh=await refreshStatus();button.disabled=false;button.textContent=label;
    if(fresh.authenticated){button.click();return;}
    toast(fresh.configured?'Connect Cloud Sync before saving. Your draft is still here.':'Shared Cloudflare storage is not configured, so T.I.D.E. will not mark this day saved.','bad');
    return;
  }
  pending={date:selectedDate(),text:root?.querySelector('#day-editor')?.value||''};
},true);

document.addEventListener('click',async event=>{
  if(!event.target.closest('#save-day')||!status.authenticated||!pending)return;
  const save=pending;pending=null;
  removeLocalToast();toast('Saving across devices…');
  try{
    const pulled=await cloudPull();
    const merged=mergeStates(loadLocal(),pulled.state);
    const pushed=await cloudPush(merged,pulled.etag);
    status.authenticated=true;
    removeLocalToast();
    toast('Day saved across devices.');
    const pill=document.querySelector('#sync-pill span:last-child');if(pill)pill.textContent='Shared cloud ready';
  }catch(error){
    status.authenticated=false;
    removeLocalToast();
    toast(`Shared save failed: ${error.message}. This save is not confirmed across devices yet.`,'bad');
  }
});
