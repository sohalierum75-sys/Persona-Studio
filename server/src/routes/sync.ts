import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { type AuthedRequest } from "../lib/sessions.js";
import { broadcastChange } from "../lib/events.js";
import { sha256 } from "../lib/tokens.js";
import { operationSchema, recordKinds, validateImage } from "../lib/images.js";
import { hasActiveSubscription } from "../lib/lemonsqueezy.js";
import { freeLimits, getUsage, promptCount } from "../lib/plans.js";

export const syncRouter = Router();
type Op = z.infer<typeof operationSchema>;
type Tx = Prisma.TransactionClient;
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

// A full reconciliation is deliberately used: no timestamp cursor can skip a
// transaction that started before a pull but committed after it.
syncRouter.get("/", async (req, res) => {
  const userId = (req as unknown as AuthedRequest).authUser.id;
  const rows = await prisma.entity.findMany({ where: { userId }, orderBy: { id: "asc" } });
  const records = rows.map(r => {
    const data = r.data as Record<string, unknown>;
    if (r.kind === "episode" && !r.deletedAt) {
      data.sceneIds = rows.filter(s => s.kind === "scene" && !s.deletedAt && (s.data as any).episodeId === r.id)
        .sort((a,b) => Number((a.data as any).order) - Number((b.data as any).order) || a.id.localeCompare(b.id)).map(s => s.id);
      data.continuityGroupIds = rows.filter(s => s.kind === "continuityGroup" && !s.deletedAt && (s.data as any).episodeId === r.id).map(s => s.id);
    }
    if (r.kind === "continuityGroup" && !r.deletedAt) data.sceneIds = rows.filter(s => s.kind === "scene" && !s.deletedAt && (s.data as any).continuityGroupId === r.id).map(s => s.id);
    return { id:r.id, kind:r.kind, data:r.deletedAt ? null : data, version:r.version, deleted:!!r.deletedAt, updatedAt:r.updatedAt.toISOString() };
  });
  res.json({ full:true, records, serverTime:new Date().toISOString() });
});

async function validate(op: Op, tx: Tx, userId: string): Promise<string | null> {
  if (op.type === "delete") return null;
  const d = op.data;
  if (!d || d.id !== op.id) return "Payload id must match record id";
  if (Buffer.byteLength(JSON.stringify(d)) > config.maxRecordBytes) return "Record too large";
  if (op.kind === "settings" && op.id !== "app") return "Invalid settings id";
  if (op.kind === "asset") return validateImage(d.dataUrl);
  const refs: Array<[string, unknown, boolean?]> = [];
  if (["episode", "outfit", "usageRecord"].includes(op.kind)) refs.push(["character", d.characterId, true]);
  if (["scene", "continuityGroup", "usageRecord"].includes(op.kind)) refs.push(["episode", d.episodeId, true]);
  if (op.kind === "usageRecord") refs.push(["scene", d.sceneId, true]);
  if (["scene", "usageRecord"].includes(op.kind)) refs.push(["outfit", d.outfitId], ["location", d.locationId]);
  if (op.kind === "scene") {
    for (const key of ["prompts", "importedPrompts"]) {
      if (d[key] !== undefined && !Array.isArray(d[key])) return `Invalid ${key}`;
    }
    refs.push(["continuityGroup", d.continuityGroupId]);
    if (d.referenceImages !== undefined && !Array.isArray(d.referenceImages)) return "Invalid referenceImages";
    for (const img of (d.referenceImages ?? []) as any[]) refs.push(["asset", img?.assetId, true]);
    for (const img of ((d.promptSnapshot as any)?.referenceImages ?? [])) {
      const err = validateImage(img?.dataUrl); if (err) return err;
    }
    if (!Number.isInteger(d.order) || Number(d.order) < 0) return "Scene order must be a nonnegative integer";
  }
  if (op.kind === "character") {
    refs.push(["asset", d.portraitAssetId]);
    if (!Array.isArray(d.referenceAssetIds)) return "referenceAssetIds must be an array";
    for (const id of d.referenceAssetIds) refs.push(["asset", id, true]);
  }
  if (["outfit", "location"].includes(op.kind)) refs.push(["asset", d.referenceAssetId]);
  for (const [kind, id, required] of refs) {
    if ((id === undefined || id === "" || id === null) && !required) continue;
    if (typeof id !== "string" || !id) return `Missing ${kind} reference`;
    const parent = await tx.entity.findUnique({ where:{userId_id:{userId,id}} });
    if (!parent || parent.deletedAt || parent.kind !== kind) return `Missing or foreign ${kind} reference`;
    if (op.kind === "scene" && kind === "continuityGroup" && (parent.data as any).episodeId !== d.episodeId) return "Continuity group belongs to another episode";
  }
  return null;
}

class PlanLimitRollback extends Error { constructor(public result: Record<string, unknown>) { super("Plan limit reached"); } }

export async function applyOperations(userId: string, raw: unknown) {
  const { ops, atomic } = z.object({atomic:z.boolean().optional(),ops:z.array(operationSchema).min(1).max(200)}).parse(raw);
  // Per-owner transaction lock also protects related-record checks, creates,
  // receipt insertion and version history against concurrent API instances.
  try { return await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const unlimited = !!user.lifetimeAt || hasActiveSubscription(user);
    const initialUsage = unlimited ? null : await getUsage(tx,userId);
    let newScenes = 0;
    const results: any[] = [];
    for (const input of ops) {
      const op = structuredClone(input);
      // Child membership is derived from owned child records. Clients cannot
      // inject unrelated scene IDs into an episode or continuity group.
      if (op.data && ["episode", "continuityGroup"].includes(op.kind)) {
        delete op.data.sceneIds; delete op.data.continuityGroupIds;
      }
      const fingerprint = sha256(stable(op));
      const receipt = await tx.operationReceipt.findUnique({where:{userId_opId:{userId,opId:op.opId}}});
      if (receipt) {
        results.push(receipt.fingerprint === fingerprint ? receipt.result : {opId:op.opId,status:"invalid",error:"Operation key reused with different content"}); continue;
      }
      const existing = await tx.entity.findUnique({where:{userId_id:{userId,id:op.id}}});
      if (existing && existing.kind !== op.kind) { results.push({opId:op.opId,status:"invalid",error:"Record kind cannot change"}); continue; }
      if (existing && existing.version !== op.baseVersion) {
        results.push({opId:op.opId,status:"conflict",record:{id:existing.id,kind:existing.kind,version:existing.version,data:existing.deletedAt ? null : existing.data,deleted:!!existing.deletedAt,updatedAt:existing.updatedAt.toISOString()}}); continue;
      }
      if (!existing && op.baseVersion !== 0) { results.push({opId:op.opId,status:"invalid",error:"Record does not exist at this version"}); continue; }
      const error = await validate(op, tx, userId);
      if (error) { results.push({opId:op.opId,status:"invalid",error}); continue; }
      if (!unlimited && op.type === "put") {
        const usage = await getUsage(tx, userId);
        const adding = !existing || !!existing.deletedAt;
        let limitError: keyof typeof freeLimits | null = null;
        let used = 0;
        if (adding && op.kind === "character" && usage.characters >= freeLimits.characters) { limitError = "characters"; used = usage.characters; };
        if (adding && op.kind === "episode" && usage.episodes >= freeLimits.episodes) { limitError = "episodes"; used = usage.episodes; };
        if (op.kind === "scene") {
          const increase = promptCount(op.data) - (adding ? 0 : promptCount(existing?.data));
          if (increase > 0 && usage.prompts + increase > freeLimits.prompts) { limitError = "prompts"; used = usage.prompts; };
          const batchId = op.data?.bulkImportId;
          if (batchId !== undefined && (typeof batchId !== "string" || !batchId || batchId.length > 120)) { results.push({opId:op.opId,status:"invalid",error:"Invalid bulk import identifier"}); continue; }
          if (adding) {
            const batchCount = typeof batchId === "string" ? await tx.entity.count({where:{userId,kind:"scene",data:{path:["bulkImportId"],equals:batchId}}}) : 0;
            if (batchCount >= freeLimits.bulkScenes || (!batchId && newScenes >= freeLimits.bulkScenes)) { limitError = "bulkScenes"; used = batchId ? batchCount : newScenes; }
          } else if ((existing?.data as any)?.bulkImportId !== batchId) {
            results.push({opId:op.opId,status:"invalid",error:"Bulk import identifier cannot change"}); continue;
          }
        }
        if (limitError) {
          const limit = freeLimits[limitError];
          // Report committed usage, not intermediate rows that will roll back.
          if (limitError !== "bulkScenes") used = initialUsage![limitError];
          const message = limitError === "bulkScenes"
            ? `This import exceeds your Free plan limit: ${limit} scenes per bulk import. Upgrade to continue.`
            : used >= limit
              ? `You've reached your Free plan limit: ${used}/${limit} ${limitError}. Upgrade to continue.`
              : `This action would exceed your Free plan limit: ${used}/${limit} ${limitError} used. Upgrade to continue.`;
          throw new PlanLimitRollback({status:"limit_reached",resource:limitError,used,limit,
            error:message,upgradeUrl:"/?pricing=1#pricing"});
        }
      }
      if (op.kind === "scene" && op.type === "put" && (!existing || existing.deletedAt)) newScenes++;
      const version = (existing?.version ?? 0) + 1;
      const data = (op.data ?? existing?.data ?? {id:op.id}) as Prisma.InputJsonValue;
      await tx.entity.upsert({where:{userId_id:{userId,id:op.id}},create:{userId,id:op.id,kind:op.kind,data,version,deletedAt:op.type === "delete" ? new Date() : null},update:{data,version,deletedAt:op.type === "delete" ? new Date() : null,updatedAt:new Date()}});
      await tx.entityVersion.create({data:{userId,entityId:op.id,kind:op.kind,version,data:op.type === "delete" ? {id:op.id,deleted:true} : data}});
      if (op.type === "delete") await propagateDeletion(tx, userId, op.kind, op.id);
      const result = {opId:op.opId,status:"applied",version};
      await tx.operationReceipt.create({data:{userId,opId:op.opId,fingerprint,result}});
      results.push(result);
    }
    if (atomic) {
      const rejected = results.find(r => r.status !== "applied" && r.status !== "unchanged");
      if (rejected) throw new PlanLimitRollback(rejected);
    }
    return results;
  }, {timeout:30000});
  } catch (error) {
    if (error instanceof PlanLimitRollback) return ops.map(op => ({...error.result,opId:op.opId}));
    throw error;
  }
}

syncRouter.post("/ops", async (req,res) => {
  const userId = (req as unknown as AuthedRequest).authUser.id;
  try {
    const results = await applyOperations(userId, req.body);
    broadcastChange(userId, [...recordKinds]);
    res.json({results});
  } catch (e) {
    if (e instanceof z.ZodError) { res.status(400).json({error:"Invalid operations",details:e.issues}); return; }
    throw e;
  }
});
syncRouter.get("/history/:kind/:id", async (req,res) => {
  const versions = await prisma.entityVersion.findMany({where:{userId:(req as unknown as AuthedRequest).authUser.id,entityId:String(req.params.id),kind:String(req.params.kind)},orderBy:{version:"desc"},take:100});
  res.json({versions});
});
// Tombstones and receipts are retained so old offline clients cannot resurrect
// deletions or reapply acknowledged operations after a long absence.
export async function purgeOldTombstones(): Promise<void> {}

async function propagateDeletion(tx:Tx,userId:string,kind:string,id:string):Promise<void>{
  const rows=await tx.entity.findMany({where:{userId,deletedAt:null}});
  for(const snapshot of rows){
    const row=await tx.entity.findUnique({where:{userId_id:{userId,id:snapshot.id}}});
    if(!row || row.deletedAt)continue;
    const d=structuredClone(row.data) as any;
    const cascade=(kind==="character" && ["episode","outfit","usageRecord"].includes(row.kind) && d.characterId===id)
      || (kind==="episode" && ["scene","continuityGroup","usageRecord"].includes(row.kind) && d.episodeId===id)
      || (kind==="scene" && row.kind==="usageRecord" && d.sceneId===id);
    if(!cascade){
      if(kind==="asset"){
        if(d.portraitAssetId===id)delete d.portraitAssetId;
        if(d.referenceAssetId===id)delete d.referenceAssetId;
        if(Array.isArray(d.referenceAssetIds))d.referenceAssetIds=d.referenceAssetIds.filter((x:string)=>x!==id);
        if(Array.isArray(d.referenceImages))d.referenceImages=d.referenceImages.filter((x:any)=>x.assetId!==id);
      }
      if(kind==="outfit" && d.outfitId===id)delete d.outfitId;
      if(kind==="location" && d.locationId===id)delete d.locationId;
      if(kind==="continuityGroup" && d.continuityGroupId===id)delete d.continuityGroupId;
      if(stable(d)===stable(row.data))continue;
    }
    const version=row.version+1;
    await tx.entity.update({where:{userId_id:{userId,id:row.id}},data:{data:d,version,updatedAt:new Date(),deletedAt:cascade?new Date():null}});
    await tx.entityVersion.create({data:{userId,entityId:row.id,kind:row.kind,version,data:cascade?{id:row.id,deleted:true}:d}});
    if(cascade)await propagateDeletion(tx,userId,row.kind,row.id);
  }
}
