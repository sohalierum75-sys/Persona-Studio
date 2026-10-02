import type { Prisma } from "@prisma/client";

export const freeLimits = { characters: 1, episodes: 1, prompts: 10, bulkScenes: 3 };
export function promptCount(data: any): number {
  return Array.isArray(data?.prompts) ? data.prompts.length
    : Array.isArray(data?.importedPrompts) ? data.importedPrompts.length : 0;
}
export async function getUsage(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.entity.findMany({ where: { userId, deletedAt: null, kind: { in: ["character", "episode", "scene"] } } });
  return {
    characters: rows.filter(r => r.kind === "character").length,
    episodes: rows.filter(r => r.kind === "episode").length,
    prompts: rows.filter(r => r.kind === "scene").reduce((n, r) => n + promptCount(r.data), 0),
  };
}
