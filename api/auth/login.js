import { comparePassword, isConfigured, json, sessionCookie } from '../_lib/auth.js';

export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(!isConfigured())return json({error:'T.I.D.E. shared storage is not configured yet.'},503);
  let body;try{body=await request.json()}catch{return json({error:'Invalid request.'},400)}
  if(!comparePassword(body?.password))return json({error:'Incorrect access code.'},401);
  return json({ok:true},200,{'set-cookie':sessionCookie()});
}
