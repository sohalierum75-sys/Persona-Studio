import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "./api";
import { getPending, acknowledge, markAttempt, type RecordKind } from "./queue";
import { getDBForAccount, setMutationListener, storeKinds, type StoreName } from "../db";
export const SETTINGS_ID = "app";
export type SyncStatus = "idle"|"syncing"|"synced"|"offline"|"error"|"conflict"|"session-expired";
export interface ConflictItem { key:string; kind:RecordKind; id:string; mine:Record<string,unknown>|null; theirs:{data:Record<string,unknown>|null;version:number;deleted:boolean;updatedAt:string} }
export interface SyncState {status:SyncStatus;pendingCount:number;lastSynced:string|null;error:string|null;conflicts:ConflictItem[];dirty:boolean;savedAt:number|null}
const empty:SyncState = {status:"idle",pendingCount:0,lastSynced:null,error:null,conflicts:[],dirty:false,savedAt:null};
let state = {...empty};
const listeners = new Set<(s:SyncState)=>void>();
let active:string|null = null;
let timer:ReturnType<typeof setInterval>|undefined;
let debounce:ReturnType<typeof setTimeout>|undefined;
let remote:(()=>void)|null = null;
const stores = Object.fromEntries(Object.entries(storeKinds).map(([s,k])=>[k,s])) as Record<RecordKind,StoreName>;
const priority:Record<RecordKind,number> = {asset:0,character:1,location:2,outfit:3,episode:4,continuityGroup:5,scene:6,usageRecord:7,settings:8,project:9};
function publish(s:Partial<SyncState>) {state={...state,...s}; listeners.forEach(l=>l(state));}
export function getSyncState(){return state;}
export function subscribeSync(l:(s:SyncState)=>void){listeners.add(l);l(state);return ()=>{listeners.delete(l);};}
export function useSyncState(){const [s,set]=useState(state);useEffect(()=>subscribeSync(set),[]);return s;}
// Display model for status UIs: silent while idle, "Saving…" while a local
// change is in flight, "Saved" briefly after the server confirms, and the
// attention states (offline with pending changes, error, conflict, expired
// session) for as long as they need attention. Background polls with nothing
// to save stay silent.
export const SAVED_VISIBLE_MS=2500;
export type SyncDisplay="saving"|"saved"|"offline"|"error"|"conflict"|"session-expired";
export function useSyncDisplay():{shown:SyncDisplay|null;sync:SyncState}{
  const sync=useSyncState();
  const [savedVisible,setSavedVisible]=useState(false);
  useEffect(()=>{
    if(sync.savedAt==null){setSavedVisible(false);return;}
    setSavedVisible(true);
    const t=setTimeout(()=>setSavedVisible(false),SAVED_VISIBLE_MS);
    return ()=>clearTimeout(t);
  },[sync.savedAt]);
  const {status,dirty}=sync;
  let shown:SyncDisplay|null=null;
  if(status==="error"||status==="conflict"||status==="session-expired")shown=status;
  else if(status==="offline"&&dirty)shown="offline";
  else if(status==="syncing"&&dirty)shown="saving";
  else if(status==="synced"&&savedVisible)shown="saved";
  return {shown,sync};
}
export function setOnRemoteChange(cb:(()=>void)|null){remote=cb;}
export async function initSync(userId:string){
  teardownSync(); active=userId;
  setMutationListener(()=>{publish({status:navigator.onLine ? "syncing":"offline",dirty:true});clearTimeout(debounce);debounce=setTimeout(()=>void reconcile(),350);});
  window.addEventListener("online",wake);window.addEventListener("focus",wake);window.addEventListener("offline",offline);
  document.addEventListener("visibilitychange",visible);
  timer=setInterval(()=>{if(document.visibilityState === "visible") void reconcile();},10000);
  await reconcile();
}
export function teardownSync(){active=null;clearInterval(timer);clearTimeout(debounce);setMutationListener(null);window.removeEventListener("online",wake);window.removeEventListener("focus",wake);window.removeEventListener("offline",offline);document.removeEventListener("visibilitychange",visible);publish({...empty});}
function wake(){void reconcile({force:true});}
function offline(){publish({status:"offline"});}
function visible(){if(document.visibilityState === "visible") wake();}

export async function reconcile(opts:{force?:boolean}={}):Promise<void>{
  const userId=active;if(!userId)return;
  await navigator.locks.request(`ps-sync:${userId}`,{ifAvailable:true},async lock=>{
    if(!lock || active!==userId)return;
    const db:any=await getDBForAccount(userId);
    let conflicts:ConflictItem[]=(await db.get("meta","conflicts"))?.value ?? [];
    const update=(s:Partial<SyncState>)=>{if(active===userId)publish(s);};
    update({status:"syncing",error:null});
    try{
      if(!navigator.onLine)throw new ApiError(0,"Offline");
      const ops=(await getPending(userId)).sort((a,b)=>priority[a.kind]-priority[b.kind]);
      let processed=0;
      // Small batches keep large image records below the HTTP body limit.
      for(const op of ops){
        if(active!==userId)return;
        if(conflicts.some(c=>c.key===op.key))continue;
        if(!opts.force && op.lastAttempt && Date.now()-Date.parse(op.lastAttempt)<Math.min(60000,1000*2**Math.min(op.attempts,6)))continue;
        const response=await apiFetch<{results:any[]}>("/api/sync/ops",{method:"POST",expectedUser:userId,body:{ops:[{opId:op.revision,kind:op.kind,id:op.id,type:op.type,baseVersion:op.baseVersion,data:op.data}]}});
        const result=response.results[0];
        if(result?.status==="applied" || result?.status==="unchanged"){await acknowledge(op,result.version);processed++;}
        else if(result?.status==="conflict"){
          const latest=(await getPending(userId)).find(p=>p.key===op.key) ?? op;
          conflicts.push({key:op.key,kind:op.kind,id:op.id,mine:latest.type==="put" ? latest.data ?? null:null,theirs:result.record});
          await db.put("meta",{key:"conflicts",value:conflicts});
        }else await markAttempt(op,result?.error ?? "Save rejected");
      }
      const response=await apiFetch<{records:any[]}>("/api/sync",{expectedUser:userId});
      if(active!==userId)return;
      // This transaction shields mutations made while the network was in flight.
      const tx=db.transaction([...Object.values(stores),"ops","meta"],"readwrite");
      const pending=await tx.objectStore("ops").getAll();
      const shield=new Set(pending.map((p:any)=>`${p.kind}:${p.id}`));
      for(const r of response.records){
        const store=stores[r.kind as RecordKind];
        if(!store || shield.has(`${r.kind}:${r.id}`))continue;
        if(r.deleted)await tx.objectStore(store).delete(r.id);else await tx.objectStore(store).put(r.data);
        await tx.objectStore("meta").put({key:`ver:${userId}:${r.kind}:${r.id}`,value:r.version});
      }
      await tx.done;
      if(active!==userId)return;
      remote?.();
      const stillDirty=conflicts.length>0 || pending.length>0;
      update({pendingCount:pending.length,conflicts,status:conflicts.length ? "conflict":pending.some((p:any)=>p.error) ? "error":pending.length ? "syncing":"synced",error:pending.find((p:any)=>p.error)?.error ?? null,lastSynced:pending.length ? state.lastSynced:new Date().toISOString(),dirty:stillDirty,savedAt:stillDirty ? state.savedAt : processed>0 || state.dirty ? Date.now() : state.savedAt});
    }catch(e){
      const pending=await getPending(userId);
      update({pendingCount:pending.length,conflicts,status:e instanceof ApiError && e.status===0 ? "offline":e instanceof ApiError && e.status===401 ? "session-expired":"error",error:e instanceof Error ? e.message:"Sync failed",dirty:pending.length>0 || state.dirty});
    }
  });
}
export async function resolveConflict(key:string,choice:"mine"|"theirs"){
  const userId=active;if(!userId)return;
  await navigator.locks.request(`ps-sync:${userId}`,async()=>{
    const db:any=await getDBForAccount(userId);
    const tx=db.transaction([...Object.values(stores),"ops","meta"],"readwrite");
    const conflicts:ConflictItem[]=(await tx.objectStore("meta").get("conflicts"))?.value ?? [];
    const c=conflicts.find(x=>x.key===key);if(!c){await tx.done;return;}
    const pending=await tx.objectStore("ops").get(key);
    if(choice==="mine" && pending){
      await tx.objectStore("ops").put({...pending,revision:crypto.randomUUID(),baseVersion:c.theirs.version,attempts:0,lastAttempt:null,error:null});
    }else{
      if(c.theirs.deleted)await tx.objectStore(stores[c.kind]).delete(c.id);else await tx.objectStore(stores[c.kind]).put(c.theirs.data);
      await tx.objectStore("ops").delete(key);
      await tx.objectStore("meta").put({key:`ver:${userId}:${c.kind}:${c.id}`,value:c.theirs.version});
    }
    await tx.objectStore("meta").put({key:"conflicts",value:conflicts.filter(x=>x.key!==key)});
    await tx.done;
  });
  remote?.();await reconcile({force:true});
}
