// ============================================================
// Asset routes — private reference-image storage.
// Assets ride the sync API as kind:"asset" records (base64
// data URL inside `data`); these endpoints give direct
// ownership-checked retrieval for a single image.
// ============================================================
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/sessions.js";
import { applyOperations } from "./sync.js";
import { z } from "zod";

export const assetsRouter = Router();

// Same receipt/version protocol as sync. Stable IDs are durable private refs.
assetsRouter.post("/", async (req, res) => {
  try {
    const results = await applyOperations((req as AuthedRequest).authUser.id, {
      ops: [{ ...req.body, kind: "asset", type: "put" }],
    });
    res.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({error:"Invalid image upload"}); return; }
    throw error;
  }
});

assetsRouter.get("/:id", async (req: Request, res: Response) => {
  const auth = (req as AuthedRequest).authUser;
  const id = String(req.params.id);
  const entity = await prisma.entity.findUnique({
    where: { userId_id: { userId: auth.id, id } },
  });

  // Ownership: another user's asset id simply does not exist for you.
  if (!entity || entity.kind !== "asset" || entity.deletedAt) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const data = entity.data as { label?: string; dataUrl?: string; mimeType?: string };
  if (!data?.dataUrl) {
    res.status(404).json({ error: "Asset has no image data" });
    return;
  }

  const mimeMatch = /^data:([^;,]+)/.exec(data.dataUrl);
  res.json({
    id: entity.id,
    label: data.label ?? "",
    mimeType: data.mimeType ?? mimeMatch?.[1] ?? "application/octet-stream",
    dataUrl: data.dataUrl,
    version: entity.version,
    updatedAt: entity.updatedAt.toISOString(),
  });
});
