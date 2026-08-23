import { isAuthenticated, isConfigured, json } from '../_lib/auth.js';

export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed.'},405);
  return json({configured:isConfigured(),authenticated:isAuthenticated(request)});
}
