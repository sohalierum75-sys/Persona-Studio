import { create } from "zustand";
import { getDBForAccount, setMutationGuard } from "../db";
import { apiFetch } from "./api";
import { getPending } from "./queue";

export class PlanLimitError extends Error {}
export const useUpgradeDialog = create<{message: string | null; dismiss: () => void}>(set => ({
  message: null, dismiss: () => set({message:null}),
}));
export function showPlanLimit(message: string): never {
  useUpgradeDialog.setState({message});
  throw new PlanLimitError(message);
}
const count = (data: any) => (data?.prompts ?? data?.importedPrompts ?? []).length;
const priority: Record<string,number> = {asset:0,character:1,location:2,outfit:3,episode:4,continuityGroup:5,scene:6,usageRecord:7,settings:8,project:9};

// Quota-increasing actions must be accepted by the server before the local
// cache or queue changes. The same owner lock is used by background sync.
setMutationGuard(async (userId, mutations, candidates) => {
  const db: any = await getDBForAccount(userId);
  let increasing = false;
  for (const m of mutations) {
    if (m.type !== "put" || !["characters","episodes","scenes"].includes(m.store)) continue;
    const old = await db.get(m.store,m.value.id);
    if (m.store === "scenes" ? !old || count(m.value) > count(old) : !old) increasing = true;
  }
  if (!increasing) return;
  const pending = await getPending(userId);
  const replacements = new Set(candidates.map(op => op.key));
  const ops = [...pending.filter(op => !replacements.has(op.key)),...candidates]
    .sort((a,b) => priority[a.kind]-priority[b.kind]);
  if (ops.length > 200) throw new Error("Please let your pending changes sync before trying again.");
  const response = await apiFetch<{results: any[]}>("/api/sync/ops", {method:"POST",expectedUser:userId,body:{atomic:true,ops:ops.map(op => ({opId:op.revision,kind:op.kind,id:op.id,type:op.type,baseVersion:op.baseVersion,data:op.data}))}});
  const rejected = response.results.find(r => r.status !== "applied" && r.status !== "unchanged");
  if (rejected?.status === "limit_reached") showPlanLimit(rejected.error);
  if (rejected) throw new Error(rejected.error ?? "Your work changed on another device. Let sync finish and try again.");
  return {acknowledged: ops.map((op,i) => ({...op,version:response.results[i].version}))};
});
