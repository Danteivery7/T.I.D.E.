function refreshPlatformCopy(){
  document.querySelectorAll('#view-root .small.muted,#view-root .callout,#view-root .muted').forEach(el=>{
    if(el.textContent.includes('Netlify'))el.innerHTML=el.innerHTML.replaceAll('Netlify','Cloudflare');
  });
}
const observer=new MutationObserver(refreshPlatformCopy);
observer.observe(document.documentElement,{childList:true,subtree:true});
refreshPlatformCopy();
