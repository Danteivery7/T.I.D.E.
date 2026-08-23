import { clearSessionCookie, json } from '../_lib/auth.js';

export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  return json({ok:true},200,{'set-cookie':clearSessionCookie()});
}
