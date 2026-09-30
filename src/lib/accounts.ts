import { DB_STORES, getDBForAccount, selectAccount, type StoreName } from "../db";
export interface LocalBackup { savedAt: string; stores: Partial<Record<StoreName, any[]>> }
// Original IndexedDB remains intact. Snapshot before ANY cloud pull.
export async function getLocalBackup(): Promise<LocalBackup> {
  const db = await getDBForAccount(null);
  const existing = await (db as any).get("meta", "pre-account-backup");
  if (existing) return existing.value;
  const tx = (db as any).transaction([...DB_STORES,"meta"], "readwrite");
  const stores: LocalBackup["stores"] = {};
  for (const store of DB_STORES) stores[store] = await tx.objectStore(store).getAll();
  const value = {savedAt:new Date().toISOString(),stores};
  await tx.objectStore("meta").put({key:"pre-account-backup",value});
  await tx.done;
  return value;
}
export async function ensureAccountCache(userId: string): Promise<void> {
  await getLocalBackup();
  selectAccount(userId);
}
