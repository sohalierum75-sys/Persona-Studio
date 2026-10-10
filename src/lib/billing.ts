/**
 * Billing client — plan availability, entitlements and checkout.
 *
 * The server owns everything sensitive: the client only ever receives
 * a hosted Paddle checkout URL from an authenticated call, and
 * paid access is granted server-side after webhook verification.
 */

import { API_URL, API_CONFIGURED, IS_EXTENSION } from "./config";
import { currentAccount } from "../db";
import { getPending } from "./queue";
import { apiFetch, ApiError } from "./api";


export const UPGRADE_URL = `${IS_EXTENSION ? API_URL : ""}/?pricing=1#pricing`;

export type BillingPlan = "lifetime" | "monthly";

const INTENT_KEY = "ps_billing_intent";

export function pendingCheckoutPlan(): BillingPlan | null {
  const params = new URL(window.location.href).searchParams;
  if (params.has("_ptxn")) return null;
  const marker = params.get("checkout");
  if (marker !== null) return marker === "lifetime" || marker === "monthly" ? marker : null;
  try {
    const stored = sessionStorage.getItem(INTENT_KEY);
    return stored === "lifetime" || stored === "monthly" ? stored : null;
  } catch { return null; }
}

export function saveCheckoutPlan(plan: BillingPlan | null): void {
  try {
    if (plan) sessionStorage.setItem(INTENT_KEY, plan);
    else sessionStorage.removeItem(INTENT_KEY);
  } catch { /* The OAuth return URL also carries the plan. */ }
}

export async function requireCheckoutConfiguration(): Promise<BillingPlansInfo> {
  if (!API_CONFIGURED) throw new Error("Checkout server is not configured. Set VITE_API_URL to the billing server URL.");
  const plans = await fetchBillingPlans();
  if (!plans || typeof plans.configured !== "boolean") {
    throw new Error("Checkout server is unavailable or its /api/billing/config endpoint is missing. Please check the billing server configuration and try again.");
  }
  if (!plans.configured || plans.missingVariables?.length) {
    throw new Error(plans.missingVariables?.length
      ? `Checkout setup incomplete. Set these server environment variables: ${plans.missingVariables.join(", ")}.`
      : "Paddle checkout is not configured. Please contact support or try again later.");
  }
  if (plans.environment && !plans.clientToken?.startsWith(plans.environment === "sandbox" ? "test_" : "live_")) {
    throw new Error("Paddle checkout is not configured. Set PADDLE_CLIENT_TOKEN to a client-side token for the selected Paddle environment.");
  }
  return plans;
}

export interface BillingPlansInfo {
  configured: boolean;
  environment?: "sandbox" | "production";
  clientToken?: string | null;
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
    const res = await fetch(`${API_URL}/api/billing/config`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return (await res.json()) as BillingPlansInfo;
  } catch {
    return null;
  }
}

/** Start checkout for a signed-in user; resolves to the Paddle checkout URL. */
export async function startCheckout(plan: BillingPlan): Promise<{ url: string }> {
  try {
    const result = await apiFetch<{ url?: unknown }>("/api/billing/checkout", { method: "POST", body: { plan } });
    if (typeof result?.url !== "string" || !/^https:\/\//i.test(result.url)) {
      throw new Error("Checkout server did not return a valid checkout URL. Please check the Paddle checkout configuration.");
    }
    try { new URL(result.url); } catch {
      throw new Error("Checkout server did not return a valid checkout URL. Please check the Paddle checkout configuration.");
    }
    return { url: result.url };
  } catch (err) {
    if (err instanceof SyntaxError || (err instanceof ApiError && [404, 405].includes(err.status))) {
      throw new Error("Checkout endpoint /api/billing/checkout is missing or returned an invalid response. Please check the billing server deployment.");
    }
    throw err;
  }
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
