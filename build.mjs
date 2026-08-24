import { mkdir,rm,copyFile,cp } from 'node:fs/promises';

const files=[
  'index.html','styles.css','app.js','engine.js','engine-v2.js','engine-v3.js','engine-v4.js',
  'enhancements.js','history-bootstrap.js','migraine-fix.js','tracker-upgrades.js','shared-save.js','platform-copy.js','storage.js','spotify.js','sw.js','manifest.webmanifest','icon.svg'
];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of files)await copyFile(file,`dist/${file}`);
await cp('history','dist/history',{recursive:true});
console.log(`Built T.I.D.E. for Cloudflare Pages (${files.length} shell files + bundled history).`);
