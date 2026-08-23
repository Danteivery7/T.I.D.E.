import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME='tide_session';
const SESSION_SECONDS=60*60*24*30;

function hash(value){return createHash('sha256').update(String(value)).digest()}
function storageConfigured(){return Boolean(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID||process.env.VERCEL_OIDC_TOKEN)}
export function isConfigured(){return Boolean(process.env.TIDE_ACCESS_CODE)&&storageConfigured()}
export function comparePassword(input){const a=hash(input||''),b=hash(process.env.TIDE_ACCESS_CODE||'');return a.length===b.length&&timingSafeEqual(a,b)}
export function sessionToken(){const secret=process.env.TIDE_ACCESS_CODE||'';return createHmac('sha256',secret).update('tide-vercel-session-v1').digest('hex')}
export function parseCookies(request){const header=request.headers.get('cookie')||'';const out={};for(const part of header.split(';')){const i=part.indexOf('=');if(i<0)continue;const key=part.slice(0,i).trim(),value=part.slice(i+1).trim();if(key)out[key]=decodeURIComponent(value)}return out}
export function isAuthenticated(request){if(!isConfigured())return false;const token=parseCookies(request)[COOKIE_NAME];if(!token)return false;const a=hash(token),b=hash(sessionToken());return a.length===b.length&&timingSafeEqual(a,b)}
export function sessionCookie(){return `${COOKIE_NAME}=${encodeURIComponent(sessionToken())}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`}
export function clearSessionCookie(){return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',...headers}})}
