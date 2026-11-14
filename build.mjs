import { mkdir,rm,copyFile,cp } from 'node:fs/promises';

const files=[
  'index.html','styles.css','themes.css','insights.css','mobile.css','date-jump.css','midnight-royal.css','date-jump.js','app.js','voice-dictation.js','engine.js','engine-v2.js','engine-v3.js','engine-v4.js',
  'enhancements.js','history-bootstrap.js','migraine-fix.js','tracker-upgrades.js','shared-save.js','year-rankings.js','year-ranking-utils.js',
  'gaming.js','gaming-data.js','gaming-diary-sessions.js','gaming-live.js','gaming-view.js','gaming-ask.js','diary-insights.js','life-trackers.js','ask-intelligence.js','calendar-data.js','theme-engine.js','personal-calendar.js','favorite-days.js','health-activity.js','health-insights.js','sleep-coach.js','health-ui.js','finance-engine.js','finances-ui.js',
  'platform-copy.js','storage.js','spotify.js','sw.js','manifest.webmanifest','icon.svg'
];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of files)await copyFile(file,`dist/${file}`);
await cp('history','dist/history',{recursive:true});
await cp('awards','dist/awards',{recursive:true});
console.log(`Built T.I.D.E. for Cloudflare Pages (${files.length} shell files + bundled history).`);