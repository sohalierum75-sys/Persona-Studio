import { useEffect, useState } from "react";
import { getLocalBackup } from "../../lib/accounts";
import { getDBForAccount } from "../../db";
import { importLocalProjects, downloadLocalBackup } from "../../lib/migration";
export default function MigrationPrompt({userId,userEmail}:{userId:string;userEmail:string}){
  const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{let cancelled=false;void (async()=>{
    const db:any=await getDBForAccount(userId);
    const backup=await getLocalBackup();
    if(!cancelled)setShow(!(await db.get("meta","import-complete"))?.value && Object.values(backup.stores).some(rows=>rows.length>0));
  })();return ()=>{cancelled=true;};},[userId]);
  if(!show)return null;
  async function migrate(){setBusy(true);try{await downloadLocalBackup();await importLocalProjects(userId,setMessage);setMessage("Import complete. Your local backup is preserved.");setShow(false);}catch(e){setMessage(e instanceof Error?e.message:"Import failed. Retry to resume.");}finally{setBusy(false);}}
  return <div className="card" role="dialog" aria-label="Import local projects" style={{position:"fixed",bottom:20,right:16,zIndex:9999,width:"min(350px, calc(100vw - 32px))",padding:20,borderColor:"var(--accent)"}}>
    <h3>Import local projects</h3><p className="text-sm text-muted">Import this browser?s saved projects into {userEmail}. A recoverable backup is preserved before upload.</p>
    {message && <p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
    <div style={{display:"flex",gap:8,marginTop:14}}><button className="btn btn-primary" disabled={busy} onClick={()=>void migrate()}>{busy?"Importing?":"Back up & import"}</button><button className="btn btn-secondary" disabled={busy} onClick={()=>setShow(false)}>Later</button></div>
  </div>;
}
