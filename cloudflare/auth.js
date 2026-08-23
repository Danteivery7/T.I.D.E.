const COOKIE_NAME='tide_session';
const SESSION_SECONDS=60*60*24*30;
const encoder=new TextEncoder();

function bytesEqual(a,b){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
async function sha256(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(String(value))))}
function toHex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}

export function isConfigured(env){return Boolean(env?.TIDE_ACCESS_CODE&&env?.TIDE_DB)}
export async function comparePassword(input,env){
  if(!env?.TIDE_ACCESS_CODE)return false;
  return bytesEqual(await sha256(input||''),await sha256(env.TIDE_ACCESS_CODE));
}
export async function sessionToken(env){
  const key=await crypto.subtle.importKey('raw',encoder.encode(env?.TIDE_ACCESS_CODE||''),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('tide-cloudflare-session-v1'))));
}
export function parseCookies(request){
  const header=request.headers.get('cookie')||'',out={};
  for(const part of header.split(';')){const i=part.indexOf('=');if(i<0)continue;const key=part.slice(0,i).trim(),value=part.slice(i+1).trim();if(key)out[key]=decodeURIComponent(value)}
  return out;
}
export async function isAuthenticated(request,env){
  if(!isConfigured(env))return false;
  const token=parseCookies(request)[COOKIE_NAME];if(!token)return false;
  return bytesEqual(await sha256(token),await sha256(await sessionToken(env)));
}
export function sessionCookie(token){return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`}
export function clearSessionCookie(){return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',...headers}})}
