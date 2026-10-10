import type { Prisma } from "@prisma/client";

export const freeLimits = { characters: 1, episodes: 1, prompts: 10, bulkScenes: 3 };
export function promptCount(data: any): number {
  return Array.isArray(data?.prompts) ? data.prompts.length
    : Array.isArray(data?.importedPrompts) ? data.importedPrompts.length : 0;
}
export async function getUsage(tx: Prisma.TransactionClient, userId: string) {
  // Count in PostgreSQL instead of transferring every prompt snapshot/image
  // to Node. Keep promptCount's array precedence, including empty arrays.
  const [usage] = await tx.$queryRaw<Array<{characters: bigint; episodes: bigint; prompts: bigint}>>`
    SELECT count(*) FILTER (WHERE kind = 'character') AS characters,
           count(*) FILTER (WHERE kind = 'episode') AS episodes,
           coalesce(sum(CASE WHEN kind = 'scene' THEN
             CASE WHEN jsonb_typeof(data->'prompts') = 'array' THEN jsonb_array_length(data->'prompts')
                  WHEN jsonb_typeof(data->'importedPrompts') = 'array' THEN jsonb_array_length(data->'importedPrompts')
                  ELSE 0 END
             ELSE 0 END), 0)::bigint AS prompts
    FROM "Entity"
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL
      AND kind IN ('character', 'episode', 'scene')
  `;
  return {
    characters: Number(usage.characters),
    episodes: Number(usage.episodes),
    prompts: Number(usage.prompts),
  };
}
