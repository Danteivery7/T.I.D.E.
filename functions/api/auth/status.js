import { isConfigured,isAuthenticated,json } from '../../_lib/auth.js';
export async function onRequestGet(context){
  const configured=isConfigured(context.env);
  return json({configured,authenticated:configured?await isAuthenticated(context.env,context.request):false});
}
