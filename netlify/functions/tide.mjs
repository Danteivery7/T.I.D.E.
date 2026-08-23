import { getStore } from '@netlify/blobs';
import { isAuthenticated, json } from '../lib/auth.mjs';
const STORE='tide-private-data';const KEY='state-v1';
function validState(state){return state&&typeof state==='object'&&Number(state.version)>=1&&state.entries&&typeof state.entries==='object'&&Array.isArray(state.occurrences)}
async function read(store){const entry=await store.getWithMetadata(KEY,{consistency:'strong',type:'json'});if(!entry)return{state:null,etag:null,exists:false};return{state:entry.data,etag:entry.etag,exists:true}}
export default async request=>{
  if(!isAuthenticated(request))return json({error:'Unauthorized.'},401);
  const store=getStore({name:STORE,consistency:'strong'});const {pathname}=new URL(request.url);
  try{
    if(request.method==='GET'&&pathname.endsWith('/state')){const r=await read(store);return json({state:r.state,etag:r.etag})}
    if(request.method==='POST'&&pathname.endsWith('/state')){
      let body;try{body=await request.json()}catch{return json({error:'Invalid JSON.'},400)}
      if(!validState(body?.state))return json({error:'Invalid T.I.D.E. state.'},400);
      const current=await read(store);const clientEtag=body?.etag||null;
      if(current.exists&&clientEtag&&clientEtag!==current.etag)return json({error:'Cloud data changed on another device. Sync first.'},409);
      const options=current.exists?{onlyIfMatch:current.etag}:{onlyIfNew:true};const result=await store.setJSON(KEY,body.state,options);
      if(!result.modified)return json({error:'Cloud data changed on another device. Sync first.'},409);
      return json({ok:true,etag:result.etag});
    }
  }catch(error){return json({error:error?.message||'Cloud request failed.'},400)}
  return json({error:'Not found.'},404);
};
export const config={path:'/api/tide/*'};
