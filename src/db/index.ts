// ============================================================
// Persona Studio — IndexedDB layer (via idb)
// ============================================================
import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type {
  Character, Episode, Scene, Outfit, Location,
  ReferenceAsset, UsageRecord, ContinuityGroup, Project, AppSettings
} from "../types";

const DB_NAME = "PersonaStudio";
const DB_VERSION = 2;

type DB = IDBPDatabase<PersonaStudioSchema>;

interface PersonaStudioSchema {
  projects:         { key: string; value: Project };
  characters:       { key: string; value: Character };
  episodes:         { key: string; value: Episode };
  scenes:           { key: string; value: Scene };
  outfits:          { key: string; value: Outfit };
  locations:        { key: string; value: Location };
  referenceAssets:  { key: string; value: ReferenceAsset };
  usageRecords:     { key: string; value: UsageRecord };
  continuityGroups: { key: string; value: ContinuityGroup };
  settings:         { key: string; value: AppSettings };
  /** Sync bookkeeping: cursor, per-record server versions, conflicts */
  meta:             { key: string; value: { key: string; value: unknown } };
}

let activeAccount: string | null = null;
const databases = new Map<string, Promise<DB>>();
export function selectAccount(userId: string | null): void { activeAccount = userId; }
export function currentAccount(): string | null { return activeAccount; }
export function getDBForAccount(userId: string | null): Promise<DB> {
  const name = userId ? `${DB_NAME}_account_${userId}` : DB_NAME;
  let promise = databases.get(name);
  if (!promise) {
    promise = openDB<PersonaStudioSchema>(name, 3, {
      upgrade(db) {
        for (const store of DB_STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, {keyPath:"id"});
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", {keyPath:"key"});
        if (!(db as any).objectStoreNames.contains("ops")) (db as any).createObjectStore("ops", {keyPath:"key"});
      },
    });
    databases.set(name,promise);
  }
  return promise;
}
export function getDB(): Promise<DB> { return getDBForAccount(activeAccount); }
export const storeKinds: Partial<Record<StoreName, string>> = {projects:"project",characters:"character",episodes:"episode",scenes:"scene",outfits:"outfit",locations:"location",referenceAssets:"asset",usageRecords:"usageRecord",continuityGroups:"continuityGroup",settings:"settings"};
let onLocalMutation: (() => void) | null = null;
export function setMutationListener(cb: (() => void) | null) { onLocalMutation = cb; }
// Queue and optimistic cache commit in ONE IndexedDB transaction. A browser
// crash can never leave a saved edit without its corresponding pending op.
export async function localMutation(store: StoreName, type: "put" | "delete", value: any): Promise<void> {
  const userId = activeAccount;
  const db = await getDBForAccount(userId);
  const id = type === "put" ? value.id : value;
  const tx = (db as any).transaction([store,"ops","meta"], "readwrite");
  if (type === "put") await tx.objectStore(store).put(value); else await tx.objectStore(store).delete(id);
  const kind = storeKinds[store];
  if (userId && kind) {
    const key = `${userId}:${kind}:${id}`;
    const old = await tx.objectStore("ops").get(key);
    const version = await tx.objectStore("meta").get(`ver:${userId}:${kind}:${id}`);
    await tx.objectStore("ops").put({key,userId,kind,id,type,data:type === "put" ? value : undefined,revision:crypto.randomUUID(),baseVersion:old?.baseVersion ?? version?.value ?? 0,createdAt:old?.createdAt ?? new Date().toISOString(),attempts:0,lastAttempt:null,error:null});
  }
  await tx.done;
  onLocalMutation?.();
}

// ---- Sync metadata helpers ----
export async function metaGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const row = await (db as any).get("meta", key);
  return row?.value as T | undefined;
}
export async function metaPut(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await (db as any).put("meta", { key, value });
}

// ---- Generic helpers ----
export async function dbGet<T>(store: keyof PersonaStudioSchema, id: string): Promise<T | undefined> {
  const db = await getDB();
  return (db as any).get(store, id);
}
export async function dbPut<T>(store: keyof PersonaStudioSchema, value: T): Promise<void> {
  const db = await getDB();
  await (db as any).put(store, value);
}
export async function dbDelete(store: keyof PersonaStudioSchema, id: string): Promise<void> {
  const db = await getDB();
  await (db as any).delete(store, id);
}
export async function dbGetAll<T>(store: keyof PersonaStudioSchema): Promise<T[]> {
  const db = await getDB();
  return (db as any).getAll(store);
}
export async function dbClear(store: keyof PersonaStudioSchema): Promise<void> {
  const db = await getDB();
  await (db as any).clear(store);
}
export async function dbBulkPut<T>(store: keyof PersonaStudioSchema, values: T[]): Promise<void> {
  const db = await getDB();
  const tx = (db as any).transaction(store, "readwrite");
  await Promise.all(values.map((v) => tx.store.put(v)));
  await tx.done;
}
export const DB_STORES = [
  "projects", "characters", "episodes", "scenes",
  "outfits", "locations", "referenceAssets",
  "usageRecords", "continuityGroups", "settings",
] as const;
export type StoreName = (typeof DB_STORES)[number];

// ---- Typed helpers ----
export const characterDB = {
  get: (id: string) => dbGet<Character>("characters", id),
  put: (c: Character) => localMutation("characters", "put", c),
  delete: (id: string) => localMutation("characters", "delete", id),
  getAll: () => dbGetAll<Character>("characters"),
};
export const episodeDB = {
  get: (id: string) => dbGet<Episode>("episodes", id),
  put: (e: Episode) => localMutation("episodes", "put", e),
  delete: (id: string) => localMutation("episodes", "delete", id),
  getAll: () => dbGetAll<Episode>("episodes"),
};
export const sceneDB = {
  get: (id: string) => dbGet<Scene>("scenes", id),
  put: (s: Scene) => localMutation("scenes", "put", s),
  delete: (id: string) => localMutation("scenes", "delete", id),
  getAll: () => dbGetAll<Scene>("scenes"),
};
export const outfitDB = {
  get: (id: string) => dbGet<Outfit>("outfits", id),
  put: (o: Outfit) => localMutation("outfits", "put", o),
  delete: (id: string) => localMutation("outfits", "delete", id),
  getAll: () => dbGetAll<Outfit>("outfits"),
};
export const locationDB = {
  get: (id: string) => dbGet<Location>("locations", id),
  put: (l: Location) => localMutation("locations", "put", l),
  delete: (id: string) => localMutation("locations", "delete", id),
  getAll: () => dbGetAll<Location>("locations"),
};
export const referenceAssetDB = {
  get: (id: string) => dbGet<ReferenceAsset>("referenceAssets", id),
  put: (a: ReferenceAsset) => localMutation("referenceAssets", "put", a),
  delete: (id: string) => localMutation("referenceAssets", "delete", id),
  getAll: () => dbGetAll<ReferenceAsset>("referenceAssets"),
};
export const usageRecordDB = {
  put: (u: UsageRecord) => localMutation("usageRecords", "put", u),
  getAll: () => dbGetAll<UsageRecord>("usageRecords"),
};
export const continuityGroupDB = {
  get: (id: string) => dbGet<ContinuityGroup>("continuityGroups", id),
  put: (g: ContinuityGroup) => localMutation("continuityGroups", "put", g),
  delete: (id: string) => localMutation("continuityGroups", "delete", id),
  getAll: () => dbGetAll<ContinuityGroup>("continuityGroups"),
};
export const settingsDB = {
  get: () => dbGet<AppSettings>("settings", "app"),
  put: (s: AppSettings) => localMutation("settings", "put", { ...s, id: "app" } as AppSettings & { id: string }),
};
