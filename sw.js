const CACHE='tide-shell-v12';
const CORE=['/','/index.html','/styles.css','/app.js','/engine.js','/engine-v2.js','/engine-v3.js','/engine-v4.js','/enhancements.js','/history-bootstrap.js','/migraine-fix.js','/tracker-upgrades.js','/shared-save.js','/year-rankings.js','/gaming.js','/gaming-data.js','/gaming-live.js','/gaming-view.js','/gaming-ask.js','/storage.js','/spotify.js','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin)return;
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(event.request));return;}
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(async()=>await caches.match(event.request)||await caches.match('/index.html')));
});