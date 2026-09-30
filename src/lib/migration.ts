import { getLocalBackup } from "./accounts";
import { getDBForAccount, storeKinds, type StoreName } from "../db";
import { apiFetch } from "./api";
import { reconcile } from "./sync";

const order:StoreName[] = ["referenceAssets","characters","locations","outfits","episodes","continuityGroups","scenes","usageRecords","settings","projects"];
export async function importLocalProjects(userId:string, progress:(text:string)=>void):Promise<void> {
  const backup=await getLocalBackup();
  const db:any=await getDBForAccount(userId);
  // Persistent destination IDs prevent duplicate imports, and keep an existing
  // cloud project safe even if it shares IDs with an old local project.
  let mapping:Record<string,string>=(await db.get("meta","import-mapping"))?.value;
  if(!mapping){
    mapping={};
    for(const store of order) for(const row of backup.stores[store] ?? []) if(row.id && store!=="settings") mapping[row.id]=crypto.randomUUID();
    await db.put("meta",{key:"import-mapping",value:mapping});
  }
  const remap=(v:any):any => typeof v==="string" ? mapping[v] ?? v : Array.isArray(v) ? v.map(remap) : v && typeof v==="object" ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)])) : v;
  const uploaded:Set<string>=new Set((await db.get("meta","import-progress"))?.value ?? []);
  const records=order.flatMap(store=>(backup.stores[store] ?? []).map(row=>({store,data:remap(row)})));
  for(const {store,data} of records){
    const opId=`migration:${store}:${data.id}`;
    if(uploaded.has(opId))continue;
    progress(`Uploading ${uploaded.size+1} of ${records.length}…`);
    // Keep existing account preferences; never silently overwrite them.
    if(store==="settings" && await db.get("settings","app")){
      await db.put("meta",{key:"imported-local-settings",value:data});
      uploaded.add(opId);
    }else{
      const res=await apiFetch<{results:Array<{status:string;error?:string}>}>("/api/sync/ops",{method:"POST",expectedUser:userId,body:{ops:[{opId,kind:storeKinds[store],id:data.id,type:"put",baseVersion:0,data}]}});
      if(!["applied","unchanged"].includes(res.results[0]?.status)) throw new Error(res.results[0]?.error ?? "Import conflicts with cloud data. Your local backup is preserved.");
      uploaded.add(opId);
    }
    await db.put("meta",{key:"import-progress",value:[...uploaded]});
  }
  if(!records.every(({store,data})=>uploaded.has(`migration:${store}:${data.id}`))) throw new Error("Import is incomplete; retry to resume.");
  await db.put("meta",{key:"import-complete",value:true});
  await reconcile({force:true});
}
export async function downloadLocalBackup():Promise<void>{
  const backup=await getLocalBackup();
  const url=URL.createObjectURL(new Blob([JSON.stringify({app:"persona-studio",type:"local-workspace-backup",...backup})],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="persona-studio-local-backup.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
