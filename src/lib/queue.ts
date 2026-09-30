import { getDBForAccount } from "../db";
export type RecordKind = "character" | "episode" | "scene" | "outfit" | "location" | "asset" | "usageRecord" | "continuityGroup" | "settings" | "project";
export interface PendingOp {
  key:string; revision:string; userId:string; kind:RecordKind; id:string;
  type:"put" | "delete"; data?:Record<string,unknown>; baseVersion:number;
  createdAt:string; attempts:number; lastAttempt:string|null; error:string|null;
}
export async function getPending(userId:string): Promise<PendingOp[]> {
  const db = await getDBForAccount(userId);
  return ((await (db as any).getAll("ops")) as PendingOp[]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
export async function acknowledge(op:PendingOp, version:number): Promise<void> {
  const db = await getDBForAccount(op.userId);
  const tx = (db as any).transaction(["ops","meta"],"readwrite");
  const current = await tx.objectStore("ops").get(op.key);
  if (current?.revision === op.revision) await tx.objectStore("ops").delete(op.key);
  else if (current) await tx.objectStore("ops").put({...current,baseVersion:version});
  await tx.objectStore("meta").put({key:`ver:${op.userId}:${op.kind}:${op.id}`,value:version});
  await tx.done;
}
export async function markAttempt(op:PendingOp,error:string|null): Promise<void> {
  const db = await getDBForAccount(op.userId);
  const tx = (db as any).transaction("ops","readwrite");
  const current = await tx.store.get(op.key);
  if (current?.revision === op.revision) await tx.store.put({...current,attempts:current.attempts+1,lastAttempt:new Date().toISOString(),error});
  await tx.done;
}
