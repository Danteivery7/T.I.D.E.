import seed from './seed/manifest.js';
import p1 from './seed/part1.js';
import p2 from './seed/part2.js';
import p3 from './seed/part3.js';
import p4 from './seed/part4.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
function b64(value){const bin=atob(value),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function digestHex(bytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))}
async function gunzip(bytes){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer())}
export async function decryptSeed(env){
  if(!env?.TIDE_ACCESS_CODE)throw new Error('TIDE_ACCESS_CODE is not configured.');
  const material=await crypto.subtle.importKey('raw',encoder.encode(env.TIDE_ACCESS_CODE),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:b64(seed.salt),iterations:seed.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const ciphertext=b64(p1+p2+p3+p4),tag=b64(seed.tag),combined=new Uint8Array(ciphertext.length+tag.length);combined.set(ciphertext);combined.set(tag,ciphertext.length);
  const compressed=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(seed.iv),additionalData:encoder.encode(seed.aad),tagLength:128},key,combined));
  if(await digestHex(compressed)!==seed.compressedSha256)throw new Error('Encrypted T.I.D.E. history failed integrity verification.');
  const plain=await gunzip(compressed);if(await digestHex(plain)!==seed.plaintextSha256)throw new Error('Decompressed T.I.D.E. history failed integrity verification.');
  return JSON.parse(decoder.decode(plain));
}
