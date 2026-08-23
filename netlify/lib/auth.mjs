import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
const COOKIE_NAME='tide_session';
const SESSION_SECONDS=60*60*24*30;
function hash(value){return createHash('sha256').update(String(value)).digest()}
export function isConfigured(){return Boolean(process.env.TIDE_ACCESS_CODE)}
export function comparePassword(input){const a=hash(input||''),b=hash(process.env.TIDE_ACCESS_CODE||'');return a.length===b.length&&timingSafeEqual(a,b)}
export function sessionToken(){const secret=process.env.TIDE_ACCESS_CODE||'';const site=process.env.SITE_ID||process.env.URL||'tide';return createHmac('sha256',secret).update(`tide-session-v1:${site}`).digest('hex')}
export function parseCookies(request){const header=request.headers.get('cookie')||'';const out={};for(const p of header.split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim(),v=p.slice(i+1).trim();if(k)out[k]=decodeURIComponent(v)}return out}
export function isAuthenticated(request){if(!isConfigured())return false;const token=parseCookies(request)[COOKIE_NAME];if(!token)return false;const a=hash(token),b=hash(sessionToken());return a.length===b.length&&timingSafeEqual(a,b)}
export function sessionCookie(){return `${COOKIE_NAME}=${encodeURIComponent(sessionToken())}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`}
export function clearSessionCookie(){return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}})}
