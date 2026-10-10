import type { Entity } from '@prisma/client';

/** Rows are already scoped to one owner and ordered by id by the caller. */
export function syncRecords(rows: Entity[]) {
  const scenesByEpisode = new Map<unknown, Entity[]>();
  const groupsByEpisode = new Map<unknown, string[]>();
  const scenesByGroup = new Map<unknown, string[]>();
  function append<T>(map: Map<unknown, T[]>, key: unknown, value: T) {
    const values = map.get(key);
    if (values) values.push(value);
    else map.set(key, [value]);
  }
  for (const row of rows) {
    if (row.deletedAt) continue;
    const data = row.data as Record<string, unknown>;
    if (row.kind === 'scene') {
      append(scenesByEpisode, data.episodeId, row);
      append(scenesByGroup, data.continuityGroupId, row.id);
    } else if (row.kind === 'continuityGroup') append(groupsByEpisode, data.episodeId, row.id);
  }
  for (const scenes of scenesByEpisode.values()) scenes.sort((a,b) =>
    Number((a.data as any).order) - Number((b.data as any).order) || a.id.localeCompare(b.id));
  return rows.map(row => {
    let data = row.data;
    if (!row.deletedAt && row.kind === 'episode') data = {
      ...(data as Record<string, any>),
      sceneIds: (scenesByEpisode.get(row.id) ?? []).map(scene => scene.id),
      continuityGroupIds: groupsByEpisode.get(row.id) ?? [],
    };
    if (!row.deletedAt && row.kind === 'continuityGroup') data = {
      ...(data as Record<string, any>), sceneIds: scenesByGroup.get(row.id) ?? [],
    };
    return { id: row.id, kind: row.kind, data: row.deletedAt ? null : data,
      version: row.version, deleted: !!row.deletedAt, updatedAt: row.updatedAt.toISOString() };
  });
}
