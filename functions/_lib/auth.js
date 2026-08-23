const COOKIE_NAME='tide_session';
const SESSION_SECONDS=60*60*24*30;

export function isConfigured(env){return Boolean(env?.TIDE_ACCESS_CODE&&env?.TIDE_DB)}

function bytes(value){return new TextEncoder().encode(String(value??''))}
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))}
async function safeEqual(a,b){
  const da=await digest(a),db=await digest(b);
  if(da.length!==db.length)return false;
  let diff=0;for(let i=0;i<da.length;i++)diff|=da[i]^db[i];
  return diff===0;
}
async function hmacHex(secret,message){
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(message)));
  return [...sig].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function comparePassword(env,input){return safeEqual(input||'',env?.TIDE_ACCESS_CODE||'')}
async function sessionToken(env){return hmacHex(env?.TIDE_ACCESS_CODE||'','tide-cloudflare-session-v1')}
function parseCookies(request){
  const header=request.headers.get('cookie')||'',out={};
  for(const part of header.split(';')){
    const i=part.indexOf('=');if(i<0)continue;
    const key=part.slice(0,i).trim(),value=part.slice(i+1).trim();
    if(key)out[key]=decodeURIComponent(value);
  }
  return out;
}
export async function isAuthenticated(env,request){
  if(!isConfigured(env))return false;
  const token=parseCookies(request)[COOKIE_NAME];if(!token)return false;
  return safeEqual(token,await sessionToken(env));
}
export async function sessionCookie(env){return `${COOKIE_NAME}=${encodeURIComponent(await sessionToken(env))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`}
export function clearSessionCookie(){return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',...headers}})}
