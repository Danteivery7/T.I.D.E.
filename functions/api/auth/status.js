import { isConfigured,isAuthenticated,json,sessionCookie } from '../../_lib/auth.js';
export async function onRequestGet(context){
  const configured=isConfigured(context.env);
  const authenticated=configured?await isAuthenticated(context.env,context.request):false;
  return json({configured,authenticated},200,authenticated?{'set-cookie':await sessionCookie(context.env)}:{});
}
