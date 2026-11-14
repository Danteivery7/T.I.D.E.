// Compact Cloudflare D1 state snapshots. D1 has a 2 MB maximum single-value
// size; gzip keeps the existing database schema/legacy records compatible.
const MARKER='tide-gzip-v1:';
const MIN_COMPRESS_BYTES=256_000;
const MAX_CLOUD_VALUE_BYTES=1_850_000;
const encoder=new TextEncoder();

function toBase64(bytes){
 let out='';
 for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(out);
}
function fromBase64(text){
 const chars=atob(text),bytes=new Uint8Array(chars.length);
 for(let i=0;i<chars.length;i++)bytes[i]=chars.charCodeAt(i);
 return bytes;
}
export async function encodeCloudState(state){
 const json=JSON.stringify(state);
 const bytes=encoder.encode(json);
 if(bytes.length<MIN_COMPRESS_BYTES)return json;
 if(typeof CompressionStream!=='function')throw new Error('Cloud compression is unavailable in this runtime.');
 const zipped=new Uint8Array(await new Response(
   new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
 ).arrayBuffer());
 const stored=MARKER+toBase64(zipped);
 if(encoder.encode(stored).byteLength>MAX_CLOUD_VALUE_BYTES)
   throw new Error('T.I.D.E. state exceeds the compressed D1 record limit. Export a backup; cloud sharding is required before the next import.');
 return stored;
}
export async function decodeCloudState(value){
 if(typeof value!=='string')throw new Error('The saved T.I.D.E. state is not a supported storage record.');
 if(!value.startsWith(MARKER))return JSON.parse(value);
 if(typeof DecompressionStream!=='function')throw new Error('Cloud decompression is unavailable in this runtime.');
 const gzip=fromBase64(value.slice(MARKER.length));
 const json=await new Response(
   new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'))
 ).text();
 return JSON.parse(json);
}
export function isCompressedCloudState(value){
 return typeof value==='string'&&value.startsWith(MARKER);
}
