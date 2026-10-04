/**
 * Billing client — plan availability, entitlements and checkout.
 *
 * The server owns everything sensitive: the client only ever receives
 * a hosted Lemon Squeezy checkout URL from an authenticated call, and
 * paid access is granted server-side after webhook verification.
 */

import { API_URL, IS_EXTENSION } from "./config";
import { currentAccount } from "../db";
import { getPending } from "./queue";
import { apiFetch } from "./api";


export const UPGRADE_URL = `${IS_EXTENSION ? API_URL : ""}/?pricing=1#pricing`;

export type BillingPlan = "lifetime" | "monthly";

export interface BillingPlansInfo {
  configured: boolean;
  missingVariables?: string[];
  lifetime: {
    limit: number;
    claimed: number | null;
    remaining: number | null;
  };
}

export interface Entitlements {
  plan: "free" | "monthly" | "lifetime";
  limits: { characters: number | null; episodes: number | null; prompts: number | null; bulkScenes: number | null };
  usage: { characters: number; episodes: number; prompts: number };
  lifetime: { active: boolean; since: string | null };
  subscription: { active: boolean; status: string; renewsAt: string | null } | null;
}

/** Public plan info; null when the API is unreachable (local-only mode). */
export async function fetchBillingPlans(): Promise<BillingPlansInfo | null> {
  try {
    const res = await fetch(`${API_URL}/api/billing/config`);
    if (!res.ok) return null;
    return (await res.json()) as BillingPlansInfo;
  } catch {
    return null;
  }
}

/** Start checkout for a signed-in user; resolves to the Lemon Squeezy URL. */
export function startCheckout(plan: BillingPlan): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/api/billing/checkout", { method: "POST", body: { plan } });
}

export async function fetchEntitlements(): Promise<Entitlements> {
  const userId = currentAccount();
  const ent = await apiFetch<Entitlements>("/api/billing/entitlements", {expectedUser:userId ?? undefined});
  if (!userId) return ent;
  const pending = await getPending(userId);
  if (!pending.length) return ent;
  const {records} = await apiFetch<{records:any[]}>("/api/sync", {expectedUser:userId});
  const rows = new Map(records.filter(r => !r.deleted).map(r => [r.id,r]));
  for (const op of pending) {
    if (op.type === "delete") rows.delete(op.id);
    else rows.set(op.id,{kind:op.kind,data:op.data});
  }
  const live = [...rows.values()];
  const characters = live.filter(r => r.kind === "character");
  const episodes = live.filter(r => r.kind === "episode" && rows.get(r.data.characterId)?.kind === "character");
  const episodeIds = new Set(episodes.map(r => r.data.id));
  const scenes = live.filter(r => r.kind === "scene" && episodeIds.has(r.data.episodeId));
  return {...ent,usage:{characters:characters.length,episodes:episodes.length,prompts:scenes.reduce((n,r) => n + (r.data.prompts ?? r.data.importedPrompts ?? []).length,0)}};
}
