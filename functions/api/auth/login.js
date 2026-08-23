import { comparePassword,isConfigured,json,sessionCookie } from '../../_lib/auth.js';
export async function onRequestPost(context){
  if(!isConfigured(context.env))return json({error:'Cloud sync is not configured yet.'},503);
  let body;try{body=await context.request.json()}catch{return json({error:'Invalid JSON.'},400)}
  if(!await comparePassword(context.env,body?.password))return json({error:'Wrong access code.'},401);
  return json({ok:true,configured:true,authenticated:true},200,{'set-cookie':await sessionCookie(context.env)});
}
