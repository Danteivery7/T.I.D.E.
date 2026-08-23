import { isAuthenticated,json } from '../../_lib/auth.js';
import { mergeAndWrite,readCloud,validState } from '../../_lib/state.js';

async function authorize(context){return isAuthenticated(context.env,context.request)}
export async function onRequestGet(context){
  if(!await authorize(context))return json({error:'Unauthorized.'},401);
  try{const current=await readCloud(context.env);return json({state:current.state,etag:current.etag})}
  catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}
export async function onRequestPost(context){
  if(!await authorize(context))return json({error:'Unauthorized.'},401);
  try{
    let body;try{body=await context.request.json()}catch{return json({error:'Invalid JSON.'},400)}
    if(!validState(body?.state))return json({error:'Invalid T.I.D.E. state.'},400);
    const saved=await mergeAndWrite(context.env,body.state);
    return json({ok:true,state:saved.state,etag:saved.etag});
  }catch(error){return json({error:error?.message||'Shared storage request failed.'},500)}
}
