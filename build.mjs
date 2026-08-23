import { mkdir,rm,copyFile } from 'node:fs/promises';

const files=[
  'index.html','styles.css','app.js','engine.js','engine-v2.js','engine-v3.js',
  'enhancements.js','storage.js','spotify.js','sw.js','manifest.webmanifest','icon.svg'
];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of files)await copyFile(file,`dist/${file}`);
console.log(`Built T.I.D.E. for Cloudflare Pages (${files.length} files).`);
